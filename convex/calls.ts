// TRACK A owns this file. Starting calls: cron, "Call me now", in-app voice tokens.
// getAccessToken is still a stub (B4 block).
// Time helpers live in lib/time.ts (shared with Track B).
import { v, type Infer } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { agentIdFor, startOutboundCall, type Language } from "./cartesia";
import { DAY_MS, localDate, nextDate, zonedTimeToMs } from "./lib/time";

const conversationStatus = v.union(
  v.literal("dialing"),
  v.literal("in_progress"),
  v.literal("ended"),
  v.literal("processed"),
  v.literal("failed"),
);

const modeValidator = v.union(v.literal("checkin"), v.literal("explainer"));
type Mode = Infer<typeof modeValidator>;

/** Polls start this long after dialing, then every POLL_MS (SPEC.md "After every call"). */
export const POLL_MS = 15_000;

// ---- Shared lookups ----

/** The appointment this cycle belongs to: the next upcoming one, else the most recent. */
export async function currentAppointment(
  ctx: QueryCtx,
  patientId: Id<"patients">,
): Promise<Doc<"appointments"> | null> {
  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(50);
  const upcoming = appointments
    .filter((a) => a.status === "upcoming")
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
  if (upcoming.length) return upcoming[0];
  return appointments.sort((a, b) => b.scheduledAt - a.scheduledAt)[0] ?? null;
}

async function releasedVisit(ctx: QueryCtx, appointmentId: Id<"appointments">) {
  const visit = await ctx.db
    .query("visits")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .first();
  return visit?.releasedToPatient ? visit : null;
}

/** "explainer" once this appointment's visit is released to the patient, else "checkin". */
export async function defaultMode(ctx: QueryCtx, appointmentId: Id<"appointments">): Promise<Mode> {
  return (await releasedVisit(ctx, appointmentId)) ? "explainer" : "checkin";
}

/** Calls (not chat sessions) count toward "called today". */
function isCall(c: Doc<"conversations">): boolean {
  return c.channel !== "chat";
}

/**
 * The one "due" rule, shared by the cron and the Home tile: one call per local day, at or
 * after callTimeLocal. `recentCalls` is newest first. nextCallAt is null without consent.
 */
function callTiming(
  patient: Doc<"patients">,
  recentCalls: Doc<"conversations">[],
  now: number,
): { latestToday: Doc<"conversations"> | null; nextCallAt: number | null } {
  const today = localDate(now, patient.timezone);
  // Any call today counts, even a missed one, so a missed call isn't redialed every 5 min.
  const latestToday =
    recentCalls.find((c) => isCall(c) && localDate(c.startedAt, patient.timezone) === today) ?? null;
  const callDay = latestToday ? nextDate(today) : today;
  return {
    latestToday,
    nextCallAt: patient.consentCalls
      ? zonedTimeToMs(callDay, patient.callTimeLocal, patient.timezone)
      : null,
  };
}

/** A finished call the patient talked on. A failure with endReason "error" was ours, after they spoke. */
function wasAnswered(c: Doc<"conversations">): boolean {
  if (c.status === "processed") return true;
  return (
    c.status === "failed" && c.endReason === "error" && !!c.transcript?.some((t) => t.role === "user")
  );
}

/** Inserts the conversation row and schedules startCall. Null if the patient has no appointment. */
async function createCall(
  ctx: MutationCtx,
  patient: Doc<"patients">,
  mode: Mode | undefined,
): Promise<Id<"conversations"> | null> {
  const appointment = await currentAppointment(ctx, patient._id);
  if (!appointment) {
    console.warn(`[calls] ${patient._id} has no appointment; not calling`);
    return null;
  }
  const resolvedMode = mode ?? (await defaultMode(ctx, appointment._id));
  const conversationId = await ctx.db.insert("conversations", {
    patientId: patient._id,
    appointmentId: appointment._id,
    channel: "phone",
    mode: resolvedMode,
    status: "dialing",
    language: patient.language,
    startedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.calls.startCall, { conversationId });
  console.log(`[calls] queued ${resolvedMode} call ${conversationId} for ${patient.name}`);
  return conversationId;
}

// ---- Cross-track: called by Track B's apps ----

/**
 * B3 "Call me now": places a call immediately. Mode defaults to "explainer" when the
 * current appointment has a visit released to the patient, otherwise "checkin".
 * Watch the call with api.calls.getConversation.
 */
export const triggerNow = mutation({
  args: {
    patientId: v.id("patients"),
    mode: v.optional(modeValidator),
  },
  returns: v.object({ conversationId: v.union(v.null(), v.id("conversations")) }),
  handler: async (ctx, args): Promise<{ conversationId: Id<"conversations"> | null }> => {
    const patient = await ctx.db.get("patients", args.patientId);
    if (!patient) throw new Error("Patient not found");
    if (!patient.consentCalls) throw new Error("Patient has not consented to calls");
    return { conversationId: await createCall(ctx, patient, args.mode) };
  },
});

const conversationStatusRow = v.union(
  v.null(),
  v.object({
    _id: v.id("conversations"),
    status: conversationStatus,
    mode: modeValidator,
    startedAt: v.number(),
  }),
);

/** Live status of one call, for the "Calling you now…" state. */
export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  returns: conversationStatusRow,
  handler: async (ctx, args): Promise<Infer<typeof conversationStatusRow>> => {
    const c = await ctx.db.get("conversations", args.conversationId);
    if (!c) return null;
    return { _id: c._id, status: c.status, mode: c.mode, startedAt: c.startedAt };
  },
});

/** Minutes before the scheduled call when the Home tile switches to "Call coming soon". */
const SOON_MS = 15 * 60_000;

const callScheduleResult = v.object({
  state: v.union(
    v.literal("off"),
    v.literal("scheduled"),
    v.literal("soon"),
    v.literal("calling"),
    v.literal("missed"),
    v.literal("done"),
  ),
  nextCallAt: v.union(v.null(), v.number()),
  conversationId: v.union(v.null(), v.id("conversations")),
  lastCheckin: v.union(
    v.null(),
    v.object({
      conversationId: v.id("conversations"),
      startedAt: v.number(),
      summaryPatientLang: v.union(v.null(), v.string()),
      summaryEnglish: v.union(v.null(), v.string()),
    }),
  ),
});

/**
 * G1 Home tile. Queries can't read the clock, so pass `now` rounded to the minute
 * (e.g. Math.floor(Date.now() / 60_000) * 60_000) and re-render each minute.
 * Same "due" rule as the cron: one call per local day at or after callTimeLocal.
 */
export const callSchedule = query({
  args: { patientId: v.id("patients"), now: v.number() },
  returns: callScheduleResult,
  handler: async (ctx, args): Promise<Infer<typeof callScheduleResult>> => {
    const patient = await ctx.db.get("patients", args.patientId);
    if (!patient) throw new Error("Patient not found");
    const recent = (
      await ctx.db
        .query("conversations")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .order("desc")
        .take(30)
    ).filter(isCall);

    const last = recent.find(
      (c) => c.mode === "checkin" && c.status === "processed" && c.summaryEnglish,
    );
    const lastCheckin = last
      ? {
          conversationId: last._id,
          startedAt: last.startedAt,
          summaryPatientLang: last.summaryPatientLang ?? null,
          summaryEnglish: last.summaryEnglish ?? null,
        }
      : null;

    const { latestToday, nextCallAt } = callTiming(patient, recent, args.now);
    const base = { nextCallAt, lastCheckin };

    if (latestToday) {
      const conversationId = latestToday._id;
      const s = latestToday.status;
      if (s === "dialing" || s === "in_progress" || s === "ended") {
        return { ...base, state: "calling", conversationId };
      }
      return { ...base, state: wasAnswered(latestToday) ? "done" : "missed", conversationId };
    }
    if (nextCallAt === null) return { ...base, state: "off", conversationId: null };
    return {
      ...base,
      state: args.now >= nextCallAt - SOON_MS ? "soon" : "scheduled",
      conversationId: null,
    };
  },
});

const accessTokenResult = v.object({
  accessToken: v.string(),
  websocketUrl: v.string(),
  expiresAt: v.number(),
  conversationId: v.union(v.null(), v.id("conversations")),
});

/** B4 in-app voice: short-lived Cartesia token plus the conversation row it will fill. */
export const getAccessToken = action({
  args: {
    patientId: v.id("patients"),
    mode: v.optional(modeValidator),
  },
  returns: accessTokenResult,
  handler: async (): Promise<Infer<typeof accessTokenResult>> => {
    return {
      accessToken: "stub-token",
      websocketUrl: "wss://api.cartesia.ai/v1/agents/websocket/stub-agent",
      expiresAt: Date.now() + 60_000,
      conversationId: null,
    };
  },
});

// ---- Track A internals ----

/** Cron target (every 5 min): dial every consenting patient whose call time has passed and who hasn't been called today. */
export const runDueCheckins = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const queued = await ctx.runMutation(internal.calls.queueDueCheckins, {});
    if (queued > 0) console.log(`[calls] cron queued ${queued} check-in call(s)`);
    return null;
  },
});

export const queueDueCheckins = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const patients = await ctx.db.query("patients").take(500);
    let queued = 0;
    for (const patient of patients) {
      if (!patient.consentCalls) continue;
      const recent = await ctx.db
        .query("conversations")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .order("desc")
        .take(20);
      const { latestToday, nextCallAt } = callTiming(patient, recent, now);
      if (latestToday || nextCallAt === null || now < nextCallAt) continue;
      if (await createCall(ctx, patient, "checkin")) queued++;
    }
    return queued;
  },
});

const callContext = v.union(
  v.null(),
  v.object({
    mode: modeValidator,
    language: v.union(v.literal("en"), v.literal("es")),
    toPhone: v.string(),
    dynamicVariables: v.record(v.string(), v.string()),
  }),
);

/** Everything startCall needs to dial: the number, the agent, and the per-call variables. */
export const getCallContext = internalQuery({
  args: { conversationId: v.id("conversations"), now: v.number() },
  returns: callContext,
  handler: async (ctx, args): Promise<Infer<typeof callContext>> => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.status !== "dialing") return null;
    const patient = await ctx.db.get("patients", conversation.patientId);
    const appointment = await ctx.db.get("appointments", conversation.appointmentId);
    if (!patient || !appointment) return null;

    const vars: Record<string, string> = {
      patient_id: patient._id,
      appointment_id: appointment._id,
      patient_name: patient.name,
      language: patient.language === "es" ? "Spanish" : "English",
      reason_for_visit: patient.reasonForVisit,
      days_until_visit: String(
        Math.max(0, Math.ceil((appointment.scheduledAt - args.now) / DAY_MS)),
      ),
    };

    if (conversation.mode === "checkin") {
      const recent = await ctx.db
        .query("conversations")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .order("desc")
        .take(20);
      const last = recent.find((c) => c.status === "processed" && c.summaryEnglish);
      vars.last_checkin_summary = last?.summaryEnglish ?? "No previous check-in.";

      // Active symptoms: anything reported in the last 3 days, latest severity first seen.
      const since = localDate(args.now - 3 * DAY_MS, patient.timezone);
      const entries = await ctx.db
        .query("symptomEntries")
        .withIndex("by_patient_date", (q) => q.eq("patientId", patient._id).gte("date", since))
        .order("desc")
        .take(100);
      const latest = new Map<string, Doc<"symptomEntries">>();
      for (const e of entries) if (!latest.has(e.symptom)) latest.set(e.symptom, e);
      vars.active_symptoms =
        [...latest.values()]
          .map((e) =>
            e.severity !== undefined
              ? `${e.symptomOriginal} (${e.symptom}, ${e.severity}/10 on ${e.date})`
              : `${e.symptomOriginal} (${e.symptom}, ${e.date})`,
          )
          .join("; ") || "None reported yet.";
    } else {
      const visit = await releasedVisit(ctx, appointment._id);
      const summary = visit?.summaryPatientLang as
        | { assessment?: string; medications?: { name: string; dose: string; schedule: string }[] }
        | undefined;
      vars.visit_summary_short = summary?.assessment ?? "";
      vars.medications =
        summary?.medications?.map((m) => `${m.name} ${m.dose}, ${m.schedule}`).join("; ") ?? "";
    }

    return {
      mode: conversation.mode,
      language: patient.language,
      toPhone: patient.phone,
      dynamicVariables: vars,
    };
  },
});

/** Builds dynamic variables, sends POST /agents/calls, stores the call ID, starts polling. */
export const startCall = internalAction({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.calls.getCallContext, {
      conversationId: args.conversationId,
      now: Date.now(),
    });
    if (!context) {
      console.warn(`[calls] ${args.conversationId} is not dialable; skipping`);
      return null;
    }
    try {
      const { callId } = await startOutboundCall({
        agentId: agentIdFor(context.mode, context.language as Language),
        toPhone: context.toPhone,
        dynamicVariables: context.dynamicVariables,
      });
      await ctx.runMutation(internal.calls.setCallId, {
        conversationId: args.conversationId,
        cartesiaCallId: callId,
      });
      console.log(`[calls] dialing ${context.toPhone}, Cartesia call ${callId}`);
      await ctx.scheduler.runAfter(POLL_MS, internal.pipeline.pollCall, {
        conversationId: args.conversationId,
        attempt: 0,
      });
    } catch (error) {
      console.error(`[calls] failed to start ${args.conversationId}:`, error);
      await ctx.runMutation(internal.pipeline.setStatus, {
        conversationId: args.conversationId,
        status: "failed",
        endReason: "error",
      });
    }
    return null;
  },
});

export const setCallId = internalMutation({
  args: { conversationId: v.id("conversations"), cartesiaCallId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("conversations", args.conversationId, {
      cartesiaCallId: args.cartesiaCallId,
    });
    return null;
  },
});

/** Dev/demo: `npx convex run calls:demoCall` calls the first seeded patient and logs each stage. */
export const demoCall = internalMutation({
  args: { patientId: v.optional(v.id("patients")), mode: v.optional(modeValidator) },
  returns: v.union(v.null(), v.id("conversations")),
  handler: async (ctx, args) => {
    const patient = args.patientId
      ? await ctx.db.get("patients", args.patientId)
      : await ctx.db.query("patients").first();
    if (!patient) throw new Error("No patient; run the seed first");
    return await createCall(ctx, patient, args.mode);
  },
});
