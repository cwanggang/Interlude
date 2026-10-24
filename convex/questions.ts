// TRACK B owns this file. STUB: validators are the contract; bodies are fake.
// Voice questions are inserted by Track A (pipeline.ts) with source "voice" and
// order = max(order) + 1 for the appointment.
// Typed questions in Spanish get textEnglish from Track A's
// internal.claude.translateQuestion: insert with textEnglish = textOriginal,
// then ctx.scheduler.runAfter(0, internal.claude.translateQuestion, { questionId }).
import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";

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

/** B6 / C5: questions for one appointment, sorted by order. */
export const listForAppointment = query({
  args: { appointmentId: v.id("appointments") },
  returns: v.array(questionDoc),
  handler: async (): Promise<Infer<typeof questionDoc>[]> => {
    return [];
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
    return await ctx.db.insert("questions", {
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      textOriginal: args.text,
      textEnglish: args.text,
      source: "typed",
      status: "open",
      order: Date.now(),
    });
  },
});

export const edit = mutation({
  args: { questionId: v.id("questions"), text: v.string() },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});

export const remove = mutation({
  args: { questionId: v.id("questions") },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});

/** Pass every question id for the appointment in the new order. */
export const reorder = mutation({
  args: { appointmentId: v.id("appointments"), orderedIds: v.array(v.id("questions")) },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});
