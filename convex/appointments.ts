// TRACK B owns this file. STUB: validators are the contract; bodies are fake.
import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";

const appointmentDoc = v.object({
  _id: v.id("appointments"),
  _creationTime: v.number(),
  patientId: v.id("patients"),
  doctorName: v.string(),
  scheduledAt: v.number(),
  status: v.union(v.literal("upcoming"), v.literal("completed")),
});

/** A2 countdown: the patient's current cycle (latest appointment, upcoming or just completed). */
export const current = query({
  args: { patientId: v.id("patients") },
  returns: v.union(v.null(), appointmentDoc),
  handler: async (): Promise<Infer<typeof appointmentDoc> | null> => {
    return null;
  },
});

export const listForPatient = query({
  args: { patientId: v.id("patients") },
  returns: v.array(appointmentDoc),
  handler: async (): Promise<Infer<typeof appointmentDoc>[]> => {
    return [];
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
    return await ctx.db.insert("appointments", { ...args, status: "upcoming" });
  },
});

export const markCompleted = mutation({
  args: { appointmentId: v.id("appointments") },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});
