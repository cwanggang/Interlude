// SHARED FILE. Exposes scripts/seed.ts as `npx convex run seed:run`.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { seed } from "../scripts/seed";

export const run = internalMutation({
  args: { phone: v.optional(v.string()) },
  returns: v.object({ patientId: v.id("patients"), appointmentId: v.id("appointments") }),
  handler: async (ctx, args) => {
    return await seed(ctx, args);
  },
});
