// TRACK B owns this file. G4 "Taken" button on Home and the G13 week grid. App taps are
// medicationEvents with source "app" and a slot; calls write source "voice" (Track A).
import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DAY_MS, localDate } from "./lib/time";

const slot = v.union(v.literal("morning"), v.literal("midday"), v.literal("evening"), v.literal("bedtime"));

const weekEvent = v.object({
  _id: v.id("medicationEvents"),
  date: v.string(),
  medication: v.string(),
  action: v.string(),
  source: v.union(v.null(), v.literal("voice"), v.literal("app")),
  slot: v.union(v.null(), slot),
});

/**
 * G4: tick or untick one dose for today (the patient's local day). `medication` is the
 * normalized key from the visit summary ("glipizide"). Unticking removes today's app tap.
 */
export const markTaken = mutation({
  args: { patientId: v.id("patients"), medication: v.string(), slot, taken: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) throw new Error("Patient not found");
    const date = localDate(Date.now(), patient.timezone);
    const medication = args.medication.trim().toLowerCase();
    const existing = (
      await ctx.db
        .query("medicationEvents")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
        .order("desc")
        .take(100)
    ).find((e) => e.source === "app" && e.date === date && e.slot === args.slot && e.medication === medication);
    if (args.taken && !existing) {
      await ctx.db.insert("medicationEvents", {
        patientId: args.patientId,
        date,
        medication,
        action: "taken",
        source: "app",
        slot: args.slot,
      });
    } else if (!args.taken && existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/**
 * Medication events in the last `days` local days (default 7), newest first: Home's ticked doses
 * today and My Health's week grid. Pass `now` rounded to the minute.
 */
export const week = query({
  args: { patientId: v.id("patients"), now: v.number(), days: v.optional(v.number()) },
  returns: v.array(weekEvent),
  handler: async (ctx, args): Promise<Infer<typeof weekEvent>[]> => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return [];
    const from = localDate(args.now - ((args.days ?? 7) - 1) * DAY_MS, patient.timezone);
    const events = await ctx.db
      .query("medicationEvents")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(300);
    return events
      .filter((e) => e.date >= from)
      .map((e) => ({
        _id: e._id,
        date: e.date,
        medication: e.medication,
        action: e.action,
        source: e.source ?? null,
        slot: e.slot ?? null,
      }));
  },
});
