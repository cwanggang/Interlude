// TRACK B owns this file.
// Voice questions are inserted by Track A (pipeline.ts) with source "voice" and
// order = max(order) + 1 for the appointment.
// Typed questions in Spanish get textEnglish from Track A's
// internal.claude.translateQuestion: insert with textEnglish = textOriginal,
// then ctx.scheduler.runAfter(0, internal.claude.translateQuestion, { questionId }).
import { v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const questionDoc = v.object({
  _id: v.id("questions"),
  _creationTime: v.number(),
  patientId: v.id("patients"),
  appointmentId: v.id("appointments"),
  textOriginal: v.string(),
  textEnglish: v.string(),
  source: v.union(v.literal("typed"), v.literal("voice")),
  status: v.union(v.literal("open"), v.literal("answered"), v.literal("carried_over")),
  order: v.number(),
  answerEvidence: v.optional(v.string()),
});

const MAX_QUESTIONS = 200;

async function questionsFor(ctx: MutationCtx, appointmentId: Id<"appointments">) {
  return await ctx.db
    .query("questions")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .take(MAX_QUESTIONS);
}

async function translateIfNeeded(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  questionId: Id<"questions">,
) {
  const patient = await ctx.db.get(patientId);
  if (patient && patient.language !== "en") {
    await ctx.scheduler.runAfter(0, internal.claude.translateQuestion, { questionId });
  }
}

/** B6 / C5: questions for one appointment, sorted by order. */
export const listForAppointment = query({
  args: { appointmentId: v.id("appointments") },
  returns: v.array(questionDoc),
  handler: async (ctx, args): Promise<Infer<typeof questionDoc>[]> => {
    const rows = await ctx.db
      .query("questions")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .take(MAX_QUESTIONS);
    return rows.sort((a, b) => a.order - b.order);
  },
});

export const add = mutation({
  args: {
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    text: v.string(),
  },
  returns: v.id("questions"),
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) throw new Error("Question text is empty");
    const existing = await questionsFor(ctx, args.appointmentId);
    const order = existing.reduce((max, q) => Math.max(max, q.order), -1) + 1;
    const questionId = await ctx.db.insert("questions", {
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      textOriginal: text,
      textEnglish: text,
      source: "typed",
      status: "open",
      order,
    });
    await translateIfNeeded(ctx, args.patientId, questionId);
    return questionId;
  },
});

export const edit = mutation({
  args: { questionId: v.id("questions"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) throw new Error("Question text is empty");
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");
    await ctx.db.patch(args.questionId, { textOriginal: text, textEnglish: text });
    await translateIfNeeded(ctx, question.patientId, args.questionId);
    return null;
  },
});

export const remove = mutation({
  args: { questionId: v.id("questions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.questionId);
    return null;
  },
});

/** Pass every question id for the appointment in the new order. */
export const reorder = mutation({
  args: { appointmentId: v.id("appointments"), orderedIds: v.array(v.id("questions")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = new Set((await questionsFor(ctx, args.appointmentId)).map((q) => q._id));
    for (const id of args.orderedIds) {
      if (!existing.has(id)) throw new Error("Question does not belong to this appointment");
    }
    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch(args.orderedIds[i], { order: i });
    }
    return null;
  },
});
