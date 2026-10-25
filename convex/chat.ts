// TRACK A owns this file. G16 AI chat: one conversations row (channel "chat") per session,
// messages in chatMessages. Claude replies with the voice agents' tools (add_question,
// report_red_flag, search_visit); ending the session runs the same post-call pipeline as a
// phone call, so chat check-ins land on the timeline.
import { v, type Infer } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { agentVariables, currentAppointment, defaultMode } from "./calls";
import { transcribeFile } from "./cartesia";
import { chatReply, type ChatPassage } from "./claude";
import { startAfterCall } from "./pipeline";

/** A session with no new message for this long is ended and processed. */
const IDLE_MS = 10 * 60_000;

const FALLBACK_REPLY = {
  en: "Sorry, I couldn't answer just now. Please try again. If this is an emergency, call 911.",
  es: "Lo siento, no pude responder ahora. Intente otra vez. Si es una emergencia, llame al 911.",
};

const citation = v.object({ chunkIndex: v.number(), textPatientLang: v.string() });

// ---- Cross-track: called by Track B's chat screen ----

/** Opens a chat session. Mode follows triggerNow: explainer once the visit is released. */
export const start = mutation({
  args: { patientId: v.id("patients") },
  returns: v.object({ conversationId: v.id("conversations") }),
  handler: async (ctx, args): Promise<{ conversationId: Id<"conversations"> }> => {
    const patient = await ctx.db.get("patients", args.patientId);
    if (!patient) throw new Error("Patient not found");
    const appointment = await currentAppointment(ctx, patient._id);
    if (!appointment) throw new Error("Patient has no appointment");
    const conversationId = await ctx.db.insert("conversations", {
      patientId: patient._id,
      appointmentId: appointment._id,
      channel: "chat",
      mode: await defaultMode(ctx, appointment._id),
      status: "in_progress",
      language: patient.language,
      startedAt: Date.now(),
    });
    return { conversationId };
  },
});

/**
 * Adds the patient's message and a pending assistant message, which Claude fills in a few
 * seconds (watch it through `messages`). Rejected while the previous reply is still pending.
 */
export const send = mutation({
  args: { conversationId: v.id("conversations"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) throw new Error("Message is empty");
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.channel !== "chat") throw new Error("Chat not found");
    if (conversation.status !== "in_progress") throw new Error("This chat has ended");
    const last = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .first();
    if (last?.pending) throw new Error("Still answering the last message");

    const now = Date.now();
    const base = { conversationId: conversation._id, patientId: conversation.patientId };
    await ctx.db.insert("chatMessages", { ...base, role: "user", text, createdAt: now });
    const replyId = await ctx.db.insert("chatMessages", {
      ...base,
      role: "assistant",
      text: "",
      createdAt: now + 1,
      pending: true,
    });
    await ctx.scheduler.runAfter(0, internal.chat.reply, { messageId: replyId });
    await ctx.scheduler.runAfter(IDLE_MS, internal.chat.endIfIdle, {
      conversationId: conversation._id,
    });
    return null;
  },
});

const messageRow = v.object({
  _id: v.id("chatMessages"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  text: v.string(),
  createdAt: v.number(),
  pending: v.optional(v.boolean()),
  redFlag: v.optional(v.boolean()),
  citations: v.optional(v.array(citation)),
});

/** The chat log, oldest first. A pending assistant message has empty text until Claude replies. */
export const messages = query({
  args: { conversationId: v.id("conversations") },
  returns: v.array(messageRow),
  handler: async (ctx, args): Promise<Infer<typeof messageRow>[]> => {
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(500);
    return rows.map((m) => ({
      _id: m._id,
      role: m.role,
      text: m.text,
      createdAt: m.createdAt,
      pending: m.pending,
      redFlag: m.redFlag,
      citations: m.citations,
    }));
  },
});

/** Closes the session and runs the post-call pipeline on it (also runs after 10 idle minutes). */
export const end = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.channel !== "chat") throw new Error("Chat not found");
    await endSession(ctx, conversation);
    return null;
  },
});

/** Mic step 1: upload URL for a short recorded clip. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Mic step 2: speech to text for the uploaded clip (Ink batch). Deletes the clip afterward. */
export const transcribeClip = action({
  args: { storageId: v.id("_storage"), language: v.union(v.literal("en"), v.literal("es")) },
  returns: v.object({ text: v.string() }),
  handler: async (ctx, args): Promise<{ text: string }> => {
    const audio = await ctx.storage.get(args.storageId);
    if (!audio) throw new Error("Clip not found");
    try {
      return { text: (await transcribeFile(audio, args.language)).text.trim() };
    } finally {
      await ctx.storage.delete(args.storageId);
    }
  },
});

// ---- Track A internals ----

/**
 * Copies the messages into the conversation transcript and hands it to the same pipeline as a
 * phone call. A session where the patient never wrote is simply closed.
 */
async function endSession(ctx: MutationCtx, conversation: Doc<"conversations">) {
  if (conversation.status !== "in_progress") return;
  const rows = await ctx.db
    .query("chatMessages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
    .take(500);
  const transcript = rows
    .filter((m) => m.text)
    .map((m) => ({ role: m.role === "user" ? "user" : "agent", text: m.text }));
  if (!transcript.some((t) => t.role === "user")) {
    await ctx.db.patch("conversations", conversation._id, { status: "processed" });
    return;
  }
  await ctx.db.patch("conversations", conversation._id, { transcript, status: "ended" });
  await startAfterCall(ctx, conversation._id, false);
}

/** Scheduled IDLE_MS after each message; ends the session only if nothing came since. */
export const endIfIdle = internalMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.status !== "in_progress") return null;
    const last = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .first();
    if (last && Date.now() - last.createdAt < IDLE_MS - 1000) return null;
    await endSession(ctx, conversation);
    return null;
  },
});

/** Writes the assistant reply for one pending message. */
export const reply = internalAction({
  args: { messageId: v.id("chatMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.chat.getReplyContext, {
      messageId: args.messageId,
      now: Date.now(),
    });
    if (!context) return null;
    const { conversationId, patientId, appointmentId } = context;
    const started = Date.now();
    try {
      const result = await chatReply({
        mode: context.mode,
        vars: context.vars,
        history: context.history,
        tools: {
          addQuestion: async (question) => {
            await ctx.runMutation(internal.pipeline.addVoiceQuestion, { patientId, question });
          },
          reportRedFlag: async (symptom, quote) => {
            await ctx.runMutation(internal.pipeline.createAlert, {
              patientId,
              symptom,
              quote,
              conversationId,
            });
          },
          searchVisit:
            context.mode === "explainer"
              ? async (query): Promise<ChatPassage[]> =>
                  await ctx.runAction(internal.elastic.searchVisit, { appointmentId, query })
              : undefined,
        },
      });
      await ctx.runMutation(internal.chat.finishReply, {
        messageId: args.messageId,
        text: result.text || FALLBACK_REPLY[context.language],
        redFlag: result.redFlag || undefined,
        citations: result.citations.length
          ? result.citations.map((c) => ({ chunkIndex: c.chunkIndex, textPatientLang: c.textPatientLang }))
          : undefined,
      });
      console.log(
        `[chat] ${conversationId}: replied in ${Date.now() - started} ms` +
          (result.redFlag ? " (RED FLAG)" : "") +
          (result.citations.length ? `, ${result.citations.length} passage(s)` : ""),
      );
    } catch (error) {
      console.error(`[chat] reply failed for ${conversationId}:`, error);
      await ctx.runMutation(internal.chat.finishReply, {
        messageId: args.messageId,
        text: FALLBACK_REPLY[context.language],
      });
    }
    return null;
  },
});

export const getReplyContext = internalQuery({
  args: { messageId: v.id("chatMessages"), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      conversationId: v.id("conversations"),
      patientId: v.id("patients"),
      appointmentId: v.id("appointments"),
      mode: v.union(v.literal("checkin"), v.literal("explainer")),
      language: v.union(v.literal("en"), v.literal("es")),
      vars: v.record(v.string(), v.string()),
      history: v.array(
        v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string() }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("chatMessages", args.messageId);
    if (!message?.pending) return null;
    const conversation = await ctx.db.get("conversations", message.conversationId);
    if (!conversation) return null;
    const patient = await ctx.db.get("patients", conversation.patientId);
    const appointment = await ctx.db.get("appointments", conversation.appointmentId);
    if (!patient || !appointment) return null;
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .take(500);
    return {
      conversationId: conversation._id,
      patientId: patient._id,
      appointmentId: appointment._id,
      mode: conversation.mode,
      language: patient.language,
      vars: await agentVariables(ctx, conversation, patient, appointment, args.now),
      history: rows
        .filter((m) => m.createdAt < message.createdAt && m.text)
        .map((m) => ({ role: m.role, text: m.text })),
    };
  },
});

export const finishReply = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    text: v.string(),
    redFlag: v.optional(v.boolean()),
    citations: v.optional(v.array(citation)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("chatMessages", args.messageId, {
      text: args.text,
      pending: false,
      redFlag: args.redFlag,
      citations: args.citations,
    });
    return null;
  },
});
