// SHARED FILE. Exposes scripts/seed.ts as `npx convex run seed:run`.
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { seed } from "../scripts/seed";

export const run = internalMutation({
  args: { phone: v.optional(v.string()), visitInMinutes: v.optional(v.number()) },
  returns: v.object({ patientId: v.id("patients"), appointmentId: v.id("appointments") }),
  handler: async (ctx, args) => {
    return await seed(ctx, args);
  },
});

/** After a seed: empty and refill both Elastic indices, check-ins first, then visit passages. */
export const reindex = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runAction(internal.elastic.reindexAll, {});
    await ctx.runAction(internal.visits.reindexAllChunks, {});
    return null;
  },
});
