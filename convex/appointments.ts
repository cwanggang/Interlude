// TRACK B owns this file.
import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const appointmentDoc = v.object({
  _id: v.id("appointments"),
  _creationTime: v.number(),
  patientId: v.id("patients"),
  doctorName: v.string(),
  scheduledAt: v.number(),
  status: v.union(v.literal("upcoming"), v.literal("completed")),
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
