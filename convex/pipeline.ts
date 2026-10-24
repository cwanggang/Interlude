// TRACK A owns this file. The one post-call pipeline (SPEC.md Key decision 2):
// poll Get Call → Claude record_checkin → write Convex → internal.elastic.indexCheckin.
// Also the inserts behind the red-flag and add-question webhooks.
// STUB: validators are the contract; bodies are fake.
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Polls Cartesia every 15 s until the call ends, then schedules processConversation. */
export const pollCall = internalAction({
  args: { conversationId: v.id("conversations"), attempt: v.number() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] pipeline.pollCall", args.conversationId, args.attempt);
    return null;
  },
});

/** Transcript → Claude extraction → saveExtraction → index each entry in Elastic. */
export const processConversation = internalAction({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] pipeline.processConversation", args.conversationId);
    return null;
  },
});

/** Writes symptomEntries, medicationEvents, questions; marks the conversation processed. */
export const saveExtraction = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    extraction: v.any(), // CheckinExtraction from claude.ts
  },
  returns: v.array(v.id("symptomEntries")),
  handler: async (): Promise<Id<"symptomEntries">[]> => {
    return [];
  },
});

/** B7: from POST /cartesia/red-flag. */
export const createAlert = internalMutation({
  args: {
    patientId: v.id("patients"),
    symptom: v.string(),
    quote: v.string(),
    cartesiaCallId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});

/** B6: from POST /cartesia/add-question. Tagged "voice", appended to the current appointment. */
export const addVoiceQuestion = internalMutation({
  args: { patientId: v.id("patients"), question: v.string() },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});
