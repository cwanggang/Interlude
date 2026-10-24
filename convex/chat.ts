// TRACK A owns this file. G16 AI chat: one conversations row (channel "chat") per session,
// messages in chatMessages. STUB: the assistant reply is canned until block A5, which adds
// Claude with add_question / report_red_flag / search_visit and runs the post-call pipeline
// on `end`. Sessions, messages, clip upload and transcription already work.
import { v, type Infer } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { currentAppointment, defaultMode } from "./calls";
import { transcribeFile } from "./cartesia";

const STUB_REPLY = {
  en: "(Chat is not connected yet.) Not medical advice. For emergencies, call 911.",
  es: "(El chat todavía no está conectado.) No es consejo médico. Emergencias: 911.",
};

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

/** Adds the patient's message and the assistant's reply (pending while Claude writes it). */
export const send = mutation({
  args: { conversationId: v.id("conversations"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) throw new Error("Message is empty");
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.channel !== "chat") throw new Error("Chat not found");
    if (conversation.status !== "in_progress") throw new Error("This chat has ended");
    const now = Date.now();
    const base = { conversationId: conversation._id, patientId: conversation.patientId };
    await ctx.db.insert("chatMessages", { ...base, role: "user", text, createdAt: now });
    await ctx.db.insert("chatMessages", {
      ...base,
      role: "assistant",
      text: conversation.language === "es" ? STUB_REPLY.es : STUB_REPLY.en,
      createdAt: now + 1,
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
  citations: v.optional(v.array(v.object({ chunkIndex: v.number(), textPatientLang: v.string() }))),
});

/** The chat log, oldest first. */
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

/** Closes the session. A5 will copy the messages into the transcript and run the pipeline. */
export const end = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.channel !== "chat") throw new Error("Chat not found");
    if (conversation.status === "in_progress") {
      await ctx.db.patch("conversations", conversation._id, { status: "processed" });
    }
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
