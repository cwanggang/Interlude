// TRACK B owns this file.
// Handlers annotate their return type from the validator so the generated API
// exposes the real shape.
import { v, type Infer } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

const language = v.union(v.literal("en"), v.literal("es"));

const profileFields = {
  name: v.string(),
  phone: v.string(),
  language,
  callTimeLocal: v.string(),
  timezone: v.string(),
  consentCalls: v.boolean(),
  reasonForVisit: v.string(),
};

const patientDoc = v.object({
  _id: v.id("patients"),
  _creationTime: v.number(),
  ...profileFields,
  // Schema v2 (optional)
  dateOfBirth: v.optional(v.string()),
  textSize: v.optional(v.union(v.literal("normal"), v.literal("large"), v.literal("xlarge"))),
  notificationsEnabled: v.optional(v.boolean()),
  doctorLastViewedAt: v.optional(v.number()),
});
const maybePatient = v.union(v.null(), patientDoc);

const patientListRow = v.object({
  patient: patientDoc,
  nextAppointment: v.union(
    v.null(),
    v.object({
      _id: v.id("appointments"),
      doctorName: v.string(),
      scheduledAt: v.number(),
    }),
  ),
  openAlerts: v.number(),
  /** H6: newest processed check-in, for "new since last viewed". */
  lastCheckinAt: v.union(v.null(), v.number()),
});

const symptomEntryDoc = v.object({
  _id: v.id("symptomEntries"),
  _creationTime: v.number(),
  patientId: v.id("patients"),
  appointmentId: v.id("appointments"),
  conversationId: v.id("conversations"),
  date: v.string(),
  symptom: v.string(),
  symptomOriginal: v.string(),
  severity: v.optional(v.number()),
  change: v.optional(v.string()),
  onset: v.optional(v.string()),
  location: v.optional(v.string()),
  duration: v.optional(v.string()),
  character: v.optional(v.string()),
  aggravating: v.optional(v.string()),
  relieving: v.optional(v.string()),
  timing: v.optional(v.string()),
  quoteOriginal: v.string(),
  quoteEnglish: v.string(),
});

const medicationEventDoc = v.object({
  _id: v.id("medicationEvents"),
  _creationTime: v.number(),
  patientId: v.id("patients"),
  conversationId: v.optional(v.id("conversations")), // Schema v2: app taps have none
  date: v.string(),
  medication: v.string(),
  action: v.string(),
  note: v.optional(v.string()),
  source: v.optional(v.union(v.literal("voice"), v.literal("app"))),
  slot: v.optional(
    v.union(v.literal("morning"), v.literal("midday"), v.literal("evening"), v.literal("bedtime")),
  ),
});

const conversationRow = v.object({
  _id: v.id("conversations"),
  mode: v.union(v.literal("checkin"), v.literal("explainer")),
  channel: v.union(v.literal("phone"), v.literal("app"), v.literal("chat")),
  status: v.string(),
  startedAt: v.number(),
  summaryEnglish: v.optional(v.string()),
  summaryPatientLang: v.optional(v.string()), // v2, G18
});

/** C1 / H6: patient list, alerts pinned first, then soonest appointment. */
export const list = query({
  args: {},
  returns: v.array(patientListRow),
  handler: async (ctx): Promise<Infer<typeof patientListRow>[]> => {
    const patients = await ctx.db.query("patients").take(100);
    const rows = await Promise.all(
      patients.map(async (patient) => {
        const appointments = await ctx.db
          .query("appointments")
          .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
          .take(100);
        const next = appointments
          .filter((a) => a.status === "upcoming")
          .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
        const alerts = await ctx.db
          .query("alerts")
          .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
          .order("desc")
          .take(100);
        const conversations = await ctx.db
          .query("conversations")
          .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
          .order("desc")
          .take(30);
        const lastCheckin = conversations.find((c) => c.mode === "checkin" && c.status === "processed");
        return {
          patient,
          nextAppointment: next
            ? { _id: next._id, doctorName: next.doctorName, scheduledAt: next.scheduledAt }
            : null,
          openAlerts: alerts.filter((a) => !a.acknowledged).length,
          lastCheckinAt: lastCheckin?.startedAt ?? null,
        };
      }),
    );
    const soonest = (r: (typeof rows)[number]) => r.nextAppointment?.scheduledAt ?? Infinity;
    return rows.sort((a, b) => Number(b.openAlerts > 0) - Number(a.openAlerts > 0) || soonest(a) - soonest(b));
  },
});

export const get = query({
  args: { patientId: v.id("patients") },
  returns: maybePatient,
  handler: async (ctx, args): Promise<Infer<typeof maybePatient>> => {
    return await ctx.db.get(args.patientId);
  },
});

/** No real auth: the patient app uses the first seeded patient. */
export const getDemo = query({
  args: {},
  returns: maybePatient,
  handler: async (ctx): Promise<Infer<typeof maybePatient>> => {
    return await ctx.db.query("patients").first();
  },
});

/** A1 onboarding. */
export const create = mutation({
  args: profileFields,
  returns: v.id("patients"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("patients", args);
  },
});

export const update = mutation({
  args: {
    patientId: v.id("patients"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    language: v.optional(language),
    callTimeLocal: v.optional(v.string()),
    timezone: v.optional(v.string()),
    consentCalls: v.optional(v.boolean()),
    reasonForVisit: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { patientId, ...fields }) => {
    const changes = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch(patientId, changes);
    return null;
  },
});

/** H6: the doctor opened this patient; clears the "new since last viewed" dot. */
export const markViewed = mutation({
  args: { patientId: v.id("patients") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.patientId, { doctorLastViewedAt: Date.now() });
    return null;
  },
});

/** C3 history cards + C4 quotes: every symptom entry for a patient, newest first. */
export const symptomEntries = query({
  args: { patientId: v.id("patients") },
  returns: v.array(symptomEntryDoc),
  handler: async (ctx, args): Promise<Infer<typeof symptomEntryDoc>[]> => {
    return await ctx.db
      .query("symptomEntries")
      .withIndex("by_patient_date", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(500);
  },
});

/** C2 medication markers. */
export const medicationEvents = query({
  args: { patientId: v.id("patients") },
  returns: v.array(medicationEventDoc),
  handler: async (ctx, args): Promise<Infer<typeof medicationEventDoc>[]> => {
    return await ctx.db
      .query("medicationEvents")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(500);
  },
});

/** B5 check-in history + patient home "today's check-in done or pending". Newest first. */
export const conversations = query({
  args: { patientId: v.id("patients") },
  returns: v.array(conversationRow),
  handler: async (ctx, args): Promise<Infer<typeof conversationRow>[]> => {
    const rows = await ctx.db
      .query("conversations")
      .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(100);
    return rows.map((c) => ({
      _id: c._id,
      mode: c.mode,
      channel: c.channel,
      status: c.status,
      startedAt: c.startedAt,
      summaryEnglish: c.summaryEnglish,
      summaryPatientLang: c.summaryPatientLang,
    }));
  },
});

const checkinForIndex = v.object({
  symptomEntryId: v.id("symptomEntries"),
  patientId: v.id("patients"),
  appointmentId: v.id("appointments"),
  conversationId: v.id("conversations"),
  date: v.string(),
  symptom: v.string(),
  severity: v.optional(v.number()),
  change: v.optional(v.string()),
  language: v.string(),
  quoteOriginal: v.string(),
  quoteEnglish: v.string(),
});

/** For elastic.reindexAll: every symptom entry in indexCheckin's arg shape. Demo-sized data. */
export const symptomEntriesForIndex = internalQuery({
  args: {},
  returns: v.array(checkinForIndex),
  handler: async (ctx): Promise<Infer<typeof checkinForIndex>[]> => {
    const entries = await ctx.db.query("symptomEntries").take(5000);
    const languages = new Map<string, string>();
    const result: Infer<typeof checkinForIndex>[] = [];
    for (const e of entries) {
      let language = languages.get(e.conversationId);
      if (language === undefined) {
        language = (await ctx.db.get(e.conversationId))?.language ?? "en";
        languages.set(e.conversationId, language);
      }
      result.push({
        symptomEntryId: e._id,
        patientId: e.patientId,
        appointmentId: e.appointmentId,
        conversationId: e.conversationId,
        date: e.date,
        symptom: e.symptom,
        severity: e.severity,
        change: e.change,
        language,
        quoteOriginal: e.quoteOriginal,
        quoteEnglish: e.quoteEnglish,
      });
    }
    return result;
  },
});
