// TRACK B owns this file. STUB: validators are the contract; bodies are fake.
// Stub handlers annotate their return type from the validator so the generated
// API exposes the real shape; keep the annotations when implementing.
import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";

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
  conversationId: v.id("conversations"),
  date: v.string(),
  medication: v.string(),
  action: v.string(),
  note: v.optional(v.string()),
});

const conversationRow = v.object({
  _id: v.id("conversations"),
  mode: v.union(v.literal("checkin"), v.literal("explainer")),
  channel: v.union(v.literal("phone"), v.literal("app")),
  status: v.string(),
  startedAt: v.number(),
  summaryEnglish: v.optional(v.string()),
});

/** C1: patient list with next appointment and open alert count. */
export const list = query({
  args: {},
  returns: v.array(patientListRow),
  handler: async (): Promise<Infer<typeof patientListRow>[]> => {
    return [];
  },
});

export const get = query({
  args: { patientId: v.id("patients") },
  returns: maybePatient,
  handler: async (): Promise<Infer<typeof maybePatient>> => {
    return null;
  },
});

/** No real auth: the patient app uses the first seeded patient. */
export const getDemo = query({
  args: {},
  returns: maybePatient,
  handler: async (): Promise<Infer<typeof maybePatient>> => {
    return null;
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
  handler: async () => {
    return null;
  },
});

/** C3 history cards + C4 quotes: every symptom entry for a patient, newest first. */
export const symptomEntries = query({
  args: { patientId: v.id("patients") },
  returns: v.array(symptomEntryDoc),
  handler: async (): Promise<Infer<typeof symptomEntryDoc>[]> => {
    return [];
  },
});

/** C2 medication markers. */
export const medicationEvents = query({
  args: { patientId: v.id("patients") },
  returns: v.array(medicationEventDoc),
  handler: async (): Promise<Infer<typeof medicationEventDoc>[]> => {
    return [];
  },
});

/** B5 check-in history + patient home "today's check-in done or pending". Newest first. */
export const conversations = query({
  args: { patientId: v.id("patients") },
  returns: v.array(conversationRow),
  handler: async (): Promise<Infer<typeof conversationRow>[]> => {
    return [];
  },
});
