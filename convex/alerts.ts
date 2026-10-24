// TRACK B owns this file.
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
  quoteEnglish: v.optional(v.string()), // Schema v2, filled by Track A after the webhook
});

/** C8 alerts panel for one patient, newest first. */
export const listForPatient = query({
  args: { patientId: v.id("patients") },
  returns: v.array(alertDoc),
  handler: async (ctx, args): Promise<Infer<typeof alertDoc>[]> => {
    return await ctx.db
      .query("alerts")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(100);
  },
});

/** Every unacknowledged alert across patients, for the dashboard banner. */
export const listOpen = query({
  args: {},
  returns: v.array(alertDoc),
  handler: async (ctx): Promise<Infer<typeof alertDoc>[]> => {
    // Demo-sized table: scan the newest alerts rather than adding an index to the shared schema.
    const recent = await ctx.db.query("alerts").order("desc").take(200);
    return recent.filter((a) => !a.acknowledged);
  },
});

export const acknowledge = mutation({
  args: { alertId: v.id("alerts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, { acknowledged: true });
    return null;
  },
});
