// TRACK B owns this file. G11 after-visit checklist. Track A writes visitTasks when it
// summarizes a visit; the patient ticks them here.
import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";

const taskDoc = v.object({
  _id: v.id("visitTasks"),
  _creationTime: v.number(),
  visitId: v.id("visits"),
  appointmentId: v.id("appointments"),
  patientId: v.id("patients"),
  kind: v.union(v.literal("prescription"), v.literal("follow_up"), v.literal("test"), v.literal("other")),
  textEnglish: v.string(),
  textPatientLang: v.string(),
  order: v.number(),
  done: v.boolean(),
  doneAt: v.optional(v.number()),
});

/** A visit's checklist in order. */
export const listForVisit = query({
  args: { visitId: v.id("visits") },
  returns: v.array(taskDoc),
  handler: async (ctx, args): Promise<Infer<typeof taskDoc>[]> => {
    const tasks = await ctx.db
      .query("visitTasks")
      .withIndex("by_visit", (q) => q.eq("visitId", args.visitId))
      .take(50);
    return tasks.sort((a, b) => a.order - b.order);
  },
});

export const setDone = mutation({
  args: { taskId: v.id("visitTasks"), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, { done: args.done, doneAt: args.done ? Date.now() : undefined });
    return null;
  },
});
