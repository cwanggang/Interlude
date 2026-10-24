// TRACK B owns this file. STUB: validators are the contract; bodies are fake.
// Alerts are inserted by Track A (pipeline.ts) from the /cartesia/red-flag webhook.
import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";

const alertDoc = v.object({
  _id: v.id("alerts"),
  _creationTime: v.number(),
  patientId: v.id("patients"),
  conversationId: v.optional(v.id("conversations")),
  symptom: v.string(),
  quote: v.string(),
  createdAt: v.number(),
  acknowledged: v.boolean(),
});

/** C8 alerts panel for one patient, newest first. */
export const listForPatient = query({
  args: { patientId: v.id("patients") },
  returns: v.array(alertDoc),
  handler: async (): Promise<Infer<typeof alertDoc>[]> => {
    return [];
  },
});

/** Every unacknowledged alert across patients, for the dashboard banner. */
export const listOpen = query({
  args: {},
  returns: v.array(alertDoc),
  handler: async (): Promise<Infer<typeof alertDoc>[]> => {
    return [];
  },
});

export const acknowledge = mutation({
  args: { alertId: v.id("alerts") },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});
