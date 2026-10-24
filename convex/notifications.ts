// TRACK B owns this file. G15 notification bell, derived from existing tables (no new table):
// a released summary, a missed call, a question captured on a call. Real push is P2.
import { v, type Infer } from "convex/values";
import { query } from "./_generated/server";
import { DAY_MS } from "./lib/time";

const WINDOW_MS = 14 * DAY_MS;

const notification = v.object({
  id: v.string(),
  kind: v.union(v.literal("summary_ready"), v.literal("missed_call"), v.literal("question_captured")),
  at: v.number(),
  /** The question's text for question_captured, in the patient's words. */
  text: v.union(v.null(), v.string()),
});

/** Newest first, last 14 days. Pass `now` rounded to the minute. */
export const list = query({
  args: { patientId: v.id("patients"), now: v.number() },
  returns: v.array(notification),
  handler: async (ctx, args): Promise<Infer<typeof notification>[]> => {
    const since = args.now - WINDOW_MS;
    const items: Infer<typeof notification>[] = [];

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .take(100);
    for (const a of appointments) {
      const visit = await ctx.db
        .query("visits")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", a._id))
        .first();
      if (visit?.releasedToPatient && visit.releasedAt && visit.releasedAt >= since) {
        items.push({ id: `visit-${visit._id}`, kind: "summary_ready", at: visit.releasedAt, text: null });
      }
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", a._id))
        .take(200);
      for (const q of questions) {
        if (q.source === "voice" && q.status === "open" && q._creationTime >= since) {
          items.push({ id: `question-${q._id}`, kind: "question_captured", at: q._creationTime, text: q.textOriginal });
        }
      }
    }

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(50);
    for (const c of conversations) {
      if (c.startedAt < since) break;
      // Track A stores an unanswered call as failed with Cartesia's end reason; "error" is ours.
      if (c.channel !== "chat" && c.status === "failed" && c.endReason !== "error") {
        items.push({ id: `call-${c._id}`, kind: "missed_call", at: c.startedAt, text: null });
      }
    }

    return items.sort((a, b) => b.at - a.at);
  },
});
