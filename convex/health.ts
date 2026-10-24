// TRACK B owns this file. G13 My Health: deterministic counts over data the app already has,
// no Claude, so it describes and never interprets (no scores, no "normal range").
import { v, type Infer } from "convex/values";
import { query } from "./_generated/server";
import { localDate } from "./lib/time";

const QUOTES_PER_SYMPTOM = 2;

const symptomSummary = v.object({
  symptom: v.string(),
  symptomOriginal: v.string(),
  daysReported: v.number(),
  firstDate: v.string(),
  lastDate: v.string(),
  /** Change from the first to the last reported severity in the range; null without two values. */
  trend: v.union(v.null(), v.literal("worse"), v.literal("better"), v.literal("same")),
  quotes: v.array(v.object({ date: v.string(), quoteOriginal: v.string(), quoteEnglish: v.string() })),
  /** "What your doctor will see": whether the patient has described each of these yet. */
  reported: v.object({ onset: v.boolean(), timing: v.boolean(), relieving: v.boolean() }),
  /** The most recent wording of each, in the patient's language as extracted ("2 weeks ago"). */
  details: v.object({
    onset: v.union(v.null(), v.string()),
    timing: v.union(v.null(), v.string()),
    relieving: v.union(v.null(), v.string()),
  }),
});

const overviewResult = v.object({
  checkins: v.number(),
  symptoms: v.array(symptomSummary),
  medicationTaken: v.number(),
  medicationMissed: v.number(),
  visits: v.array(
    v.object({
      appointmentId: v.id("appointments"),
      scheduledAt: v.number(),
      doctorName: v.string(),
      questionsAnswered: v.number(),
      questionsCarriedOver: v.number(),
    }),
  ),
});

/** My Health for one patient from `from` ("YYYY-MM-DD", patient's local day) through today. */
export const overview = query({
  args: { patientId: v.id("patients"), from: v.string() },
  returns: overviewResult,
  handler: async (ctx, args): Promise<Infer<typeof overviewResult>> => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) throw new Error("Patient not found");

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(200);
    const checkinDays = new Set(
      conversations
        .filter((c) => c.mode === "checkin" && c.status === "processed" && c.summaryEnglish)
        .map((c) => localDate(c.startedAt, patient.timezone))
        .filter((d) => d >= args.from),
    );

    // Oldest first within the range, so "first" and "last" read naturally.
    const entries = await ctx.db
      .query("symptomEntries")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId).gte("date", args.from))
      .take(1000);
    const bySymptom = new Map<string, typeof entries>();
    for (const e of entries) bySymptom.set(e.symptom, [...(bySymptom.get(e.symptom) ?? []), e]);
    const symptoms = [...bySymptom].map(([symptom, list]) => {
      const rated = list.filter((e) => e.severity !== undefined);
      const first = rated[0]?.severity;
      const last = rated.at(-1)?.severity;
      const trend =
        rated.length < 2 || first === undefined || last === undefined
          ? null
          : last > first
            ? ("worse" as const)
            : last < first
              ? ("better" as const)
              : ("same" as const);
      return {
        symptom,
        symptomOriginal: list.at(-1)!.symptomOriginal,
        daysReported: new Set(list.map((e) => e.date)).size,
        firstDate: list[0].date,
        lastDate: list.at(-1)!.date,
        trend,
        quotes: list
          .slice(-QUOTES_PER_SYMPTOM)
          .reverse()
          .map((e) => ({ date: e.date, quoteOriginal: e.quoteOriginal, quoteEnglish: e.quoteEnglish })),
        reported: {
          onset: list.some((e) => e.onset),
          timing: list.some((e) => e.timing),
          relieving: list.some((e) => e.relieving),
        },
        details: {
          onset: list.findLast((e) => e.onset)?.onset ?? null,
          timing: list.findLast((e) => e.timing)?.timing ?? null,
          relieving: list.findLast((e) => e.relieving)?.relieving ?? null,
        },
      };
    });
    symptoms.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.daysReported - a.daysReported);

    const medications = (
      await ctx.db
        .query("medicationEvents")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
        .take(500)
    ).filter((m) => m.date >= args.from);

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .take(100);
    const visits = [];
    for (const a of appointments.filter((a) => a.status === "completed").sort((x, y) => y.scheduledAt - x.scheduledAt)) {
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", a._id))
        .take(200);
      visits.push({
        appointmentId: a._id,
        scheduledAt: a.scheduledAt,
        doctorName: a.doctorName,
        questionsAnswered: questions.filter((q) => q.status === "answered").length,
        questionsCarriedOver: questions.filter((q) => q.status === "carried_over").length,
      });
    }

    return {
      checkins: checkinDays.size,
      symptoms,
      medicationTaken: medications.filter((m) => m.action === "taken").length,
      medicationMissed: medications.filter((m) => m.action === "missed").length,
      visits,
    };
  },
});
