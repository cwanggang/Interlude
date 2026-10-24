// TRACK B owns this file. H1, H3–H5: the doctor's Home tab in one reactive query.
import { v, type Infer } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DAY_MS, localDate } from "./lib/time";

const WEEK_MS = 7 * DAY_MS;
/** H4 "6 of 7 check-ins completed": local days counted, ending today. */
const COMPLETION_DAYS = 7;
const TOP_CONCERNS = 3;

const language = v.union(v.literal("en"), v.literal("es"));

const alertRow = v.object({
  alertId: v.id("alerts"),
  patientId: v.id("patients"),
  patientName: v.string(),
  symptom: v.string(),
  quote: v.string(),
  quoteEnglish: v.union(v.null(), v.string()),
  createdAt: v.number(),
});

const appointmentRow = v.object({
  appointmentId: v.id("appointments"),
  patientId: v.id("patients"),
  patientName: v.string(),
  scheduledAt: v.number(),
  reasonForVisit: v.string(),
  language,
  openAlerts: v.number(),
});

const nextAppointment = v.object({
  ...appointmentRow.fields,
  topConcerns: v.array(v.string()),
  openQuestions: v.number(),
  checkinsCompleted: v.number(),
  checkinDays: v.number(),
  /** One entry per day, oldest first: did the patient complete that day's check-in (the dots). */
  checkinPattern: v.array(v.boolean()),
});

const doctorHomeResult = v.object({
  doctorName: v.union(v.null(), v.string()),
  appointmentsThisWeek: v.number(),
  alerts: v.array(alertRow),
  next: v.union(v.null(), nextAppointment),
  /** Every upcoming appointment in the next 7 days after `next`; the client groups by day. */
  upcoming: v.array(appointmentRow),
});

/** Local days (patient timezone) in the last COMPLETION_DAYS with an answered check-in. */
async function checkinCompletion(ctx: QueryCtx, patient: Doc<"patients">, now: number) {
  const ordered: string[] = [];
  for (let i = COMPLETION_DAYS - 1; i >= 0; i--) ordered.push(localDate(now - i * DAY_MS, patient.timezone));
  const days = new Set(ordered);
  const since = now - (COMPLETION_DAYS + 1) * DAY_MS;
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
    .order("desc")
    .take(50);
  const completed = new Set<string>();
  for (const c of conversations) {
    if (c.startedAt < since) break;
    // A processed check-in with a summary had patient turns; no-answer calls have none.
    if (c.mode === "checkin" && c.status === "processed" && c.summaryEnglish) {
      const day = localDate(c.startedAt, patient.timezone);
      if (days.has(day)) completed.add(day);
    }
  }
  return {
    checkinsCompleted: completed.size,
    checkinDays: COMPLETION_DAYS,
    checkinPattern: ordered.map((day) => completed.has(day)),
  };
}

/** Brief concerns when the brief has sections, else the highest recent severities. */
async function topConcerns(ctx: QueryCtx, appointmentId: Id<"appointments">, patientId: Id<"patients">) {
  const brief = await ctx.db
    .query("briefs")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .order("desc")
    .first();
  if (brief?.sections?.concerns.length) {
    return brief.sections.concerns.slice(0, TOP_CONCERNS).map((c) => c.text);
  }
  const entries = await ctx.db
    .query("symptomEntries")
    .withIndex("by_patient_date", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(100);
  const worst = new Map<string, number>();
  for (const e of entries.filter((e) => e.appointmentId === appointmentId)) {
    worst.set(e.symptom, Math.max(worst.get(e.symptom) ?? -1, e.severity ?? -1));
  }
  return [...worst]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CONCERNS)
    .map(([symptom, severity]) => (severity >= 0 ? `${symptom} (up to ${severity}/10)` : symptom));
}

/**
 * Doctor Home. No auth: `doctorName` defaults to the demo patient's doctor. Queries can't read
 * the clock, so pass `now` rounded to the minute and re-render each minute.
 */
export const doctorHome = query({
  args: { doctorName: v.optional(v.string()), now: v.number() },
  returns: doctorHomeResult,
  handler: async (ctx, args): Promise<Infer<typeof doctorHomeResult>> => {
    let doctorName = args.doctorName ?? null;
    if (doctorName === null) {
      const demo = await ctx.db.query("patients").first();
      const appointment = demo
        ? await ctx.db
            .query("appointments")
            .withIndex("by_patient", (q) => q.eq("patientId", demo._id))
            .first()
        : null;
      doctorName = appointment?.doctorName ?? null;
    }
    if (doctorName === null) {
      return { doctorName, appointmentsThisWeek: 0, alerts: [], next: null, upcoming: [] };
    }
    const name = doctorName;

    // Upcoming in the next week, plus anything earlier today still marked upcoming.
    const appointments = (
      await ctx.db
        .query("appointments")
        .withIndex("by_doctor_time", (q) =>
          q.eq("doctorName", name).gte("scheduledAt", args.now - DAY_MS).lt("scheduledAt", args.now + WEEK_MS),
        )
        .take(200)
    ).filter((a) => a.status === "upcoming");

    const patients = new Map<Id<"patients">, Doc<"patients">>();
    const openAlerts = new Map<Id<"patients">, Doc<"alerts">[]>();
    for (const a of appointments) {
      if (patients.has(a.patientId)) continue;
      const patient = await ctx.db.get(a.patientId);
      if (!patient) continue;
      patients.set(a.patientId, patient);
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_patient", (q) => q.eq("patientId", a.patientId))
        .order("desc")
        .take(50);
      openAlerts.set(a.patientId, alerts.filter((al) => !al.acknowledged));
    }

    const rows = appointments
      .filter((a) => patients.has(a.patientId))
      .map((a) => {
        const patient = patients.get(a.patientId)!;
        return {
          appointmentId: a._id,
          patientId: a.patientId,
          patientName: patient.name,
          scheduledAt: a.scheduledAt,
          reasonForVisit: patient.reasonForVisit,
          language: patient.language,
          openAlerts: openAlerts.get(a.patientId)?.length ?? 0,
        };
      });

    const alerts = [...openAlerts]
      .flatMap(([patientId, list]) =>
        list.map((al) => ({
          alertId: al._id,
          patientId,
          patientName: patients.get(patientId)!.name,
          symptom: al.symptom,
          quote: al.quote,
          quoteEnglish: al.quoteEnglish ?? null,
          createdAt: al.createdAt,
        })),
      )
      .sort((a, b) => b.createdAt - a.createdAt);

    // The next appointment is the soonest one not more than an hour past its start.
    const [first, ...rest] = rows.filter((r) => r.scheduledAt >= args.now - 60 * 60_000);
    let next: Infer<typeof nextAppointment> | null = null;
    if (first) {
      const patient = patients.get(first.patientId)!;
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", first.appointmentId))
        .take(200);
      next = {
        ...first,
        topConcerns: await topConcerns(ctx, first.appointmentId, first.patientId),
        openQuestions: questions.filter((q) => q.status === "open").length,
        ...(await checkinCompletion(ctx, patient, args.now)),
      };
    }

    return {
      doctorName: name,
      appointmentsThisWeek: rows.length,
      alerts,
      next,
      upcoming: rest,
    };
  },
});
