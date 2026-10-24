// TRACK B owns this file.
import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DAY_MS, localDate } from "./lib/time";

const appointmentDoc = v.object({
  _id: v.id("appointments"),
  _creationTime: v.number(),
  patientId: v.id("patients"),
  doctorName: v.string(),
  scheduledAt: v.number(),
  status: v.union(v.literal("upcoming"), v.literal("completed")),
  clinicName: v.optional(v.string()), // Schema v2
});

/** All of a patient's appointments, oldest first. */
async function appointmentsFor(ctx: QueryCtx, patientId: Id<"patients">) {
  const rows = await ctx.db
    .query("appointments")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(100);
  return rows.sort((a, b) => a.scheduledAt - b.scheduledAt);
}

/** A2 countdown: the patient's current cycle (latest appointment, upcoming or just completed). */
export const current = query({
  args: { patientId: v.id("patients") },
  returns: v.union(v.null(), appointmentDoc),
  handler: async (ctx, args): Promise<Infer<typeof appointmentDoc> | null> => {
    const all = await appointmentsFor(ctx, args.patientId);
    // The soonest upcoming appointment; otherwise the most recent completed one.
    return all.find((a) => a.status === "upcoming") ?? all[all.length - 1] ?? null;
  },
});

const cycleResult = v.object({
  /** none: no appointment; before: upcoming, not today; visit: today; after: no upcoming one. */
  stage: v.union(v.literal("none"), v.literal("before"), v.literal("visit"), v.literal("after")),
  appointment: v.union(v.null(), appointmentDoc),
  /** Calendar days in the patient's timezone from today to the appointment (0 = today). */
  daysUntil: v.union(v.null(), v.number()),
  /** The patient has had at least one visit (Home shows medications instead of the empty state). */
  hasPastVisit: v.boolean(),
});

/**
 * G2 cycle strip Before visit → Visit → After visit, with the countdown. Queries can't read the
 * clock, so pass `now` rounded to the minute.
 */
export const cycle = query({
  args: { patientId: v.id("patients"), now: v.number() },
  returns: cycleResult,
  handler: async (ctx, args): Promise<Infer<typeof cycleResult>> => {
    const patient = await ctx.db.get(args.patientId);
    const all = await appointmentsFor(ctx, args.patientId);
    const hasPastVisit = all.some((a) => a.status === "completed");
    const upcoming = all.find((a) => a.status === "upcoming");
    if (!patient || all.length === 0) {
      return { stage: "none", appointment: null, daysUntil: null, hasPastVisit };
    }
    if (!upcoming) {
      return { stage: "after", appointment: all[all.length - 1], daysUntil: null, hasPastVisit };
    }
    const day = (ms: number) => Date.parse(`${localDate(ms, patient.timezone)}T00:00:00Z`);
    const daysUntil = Math.round((day(upcoming.scheduledAt) - day(args.now)) / DAY_MS);
    return { stage: daysUntil <= 0 ? "visit" : "before", appointment: upcoming, daysUntil, hasPastVisit };
  },
});

export const listForPatient = query({
  args: { patientId: v.id("patients") },
  returns: v.array(appointmentDoc),
  handler: async (ctx, args): Promise<Infer<typeof appointmentDoc>[]> => {
    return await appointmentsFor(ctx, args.patientId);
  },
});

/** A2 / E4: a new appointment starts a new cycle; open questions from the last one carry over. */
export const create = mutation({
  args: {
    patientId: v.id("patients"),
    doctorName: v.string(),
    scheduledAt: v.number(),
  },
  returns: v.id("appointments"),
  handler: async (ctx, args) => {
    const previous = (await appointmentsFor(ctx, args.patientId)).at(-1);
    const appointmentId = await ctx.db.insert("appointments", { ...args, status: "upcoming" });
    if (previous) {
      const open = (
        await ctx.db
          .query("questions")
          .withIndex("by_appointment", (q) => q.eq("appointmentId", previous._id))
          .take(200)
      )
        .filter((q) => q.status === "open")
        .sort((a, b) => a.order - b.order);
      for (let i = 0; i < open.length; i++) {
        const { _id, _creationTime, ...question } = open[i];
        await ctx.db.patch(_id, { status: "carried_over" });
        await ctx.db.insert("questions", { ...question, appointmentId, order: i });
      }
    }
    return appointmentId;
  },
});

export const markCompleted = mutation({
  args: { appointmentId: v.id("appointments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.appointmentId, { status: "completed" });
    return null;
  },
});
