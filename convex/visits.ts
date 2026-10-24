// TRACK A owns this file. Visit recording → transcript → summaries → Elastic passages.
// STUB: validators are the contract; bodies are fake.
import { v, type Infer } from "convex/values";
import { internalAction, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const visitDoc = v.object({
  _id: v.id("visits"),
  _creationTime: v.number(),
  appointmentId: v.id("appointments"),
  audioStorageId: v.optional(v.id("_storage")),
  transcript: v.optional(
    v.array(v.object({ speaker: v.string(), textEnglish: v.string(), textPatientLang: v.string() })),
  ),
  summaryEnglish: v.optional(v.any()),
  summaryPatientLang: v.optional(v.any()),
  releasedToPatient: v.boolean(),
  status: v.string(),
});

// ---- Cross-track: called by Track B's apps ----

/** D1 step 1: upload URL for the recorded (or pre-recorded demo) visit audio. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** D1 step 2: register the uploaded file; processing starts automatically. */
export const create = mutation({
  args: { appointmentId: v.id("appointments"), storageId: v.id("_storage") },
  returns: v.union(v.null(), v.id("visits")),
  handler: async (_ctx, args): Promise<Id<"visits"> | null> => {
    console.log("[stub] visits.create", args.appointmentId);
    return null;
  },
});

/**
 * E1 + doctor visit view. summaryEnglish / summaryPatientLang follow the VisitSummary
 * type in claude.ts. The patient app shows the summary only when releasedToPatient is true.
 */
export const getByAppointment = query({
  args: { appointmentId: v.id("appointments") },
  returns: v.union(v.null(), visitDoc),
  handler: async (): Promise<Infer<typeof visitDoc> | null> => {
    return null;
  },
});

/** D6 "Release to patient". */
export const release = mutation({
  args: { visitId: v.id("visits") },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});

// ---- Track A internals ----

/** D2–D5: transcribe, clean and label speakers, summarize in both languages, index passages, check question coverage. */
export const processVisit = internalAction({
  args: { visitId: v.id("visits") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] visits.processVisit", args.visitId);
    return null;
  },
});
