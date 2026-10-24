// SHARED FILE. Dev A approves every change. Matches SPEC.md "Data model" exactly.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  patients: defineTable({
    name: v.string(),
    phone: v.string(), // E.164, e.g. +15025550123
    language: v.union(v.literal("en"), v.literal("es")),
    callTimeLocal: v.string(), // "18:30"
    timezone: v.string(), // "America/Los_Angeles"
    consentCalls: v.boolean(),
    reasonForVisit: v.string(),
  }),

  appointments: defineTable({
    patientId: v.id("patients"),
    doctorName: v.string(),
    scheduledAt: v.number(), // ms since epoch
    status: v.union(v.literal("upcoming"), v.literal("completed")),
  }).index("by_patient", ["patientId"]),

  // one row per Cartesia call, phone or app
  conversations: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    channel: v.union(v.literal("phone"), v.literal("app")),
    mode: v.union(v.literal("checkin"), v.literal("explainer")),
    cartesiaCallId: v.optional(v.string()),
    status: v.union(
      v.literal("dialing"),
      v.literal("in_progress"),
      v.literal("ended"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    language: v.string(),
    transcript: v.optional(v.array(v.object({ role: v.string(), text: v.string() }))),
    summaryEnglish: v.optional(v.string()),
    startedAt: v.number(),
  })
    .index("by_patient", ["patientId"])
    .index("by_call", ["cartesiaCallId"]),

  symptomEntries: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    conversationId: v.id("conversations"),
    date: v.string(), // "2026-10-24"
    symptom: v.string(), // normalized English key: "dizziness"
    symptomOriginal: v.string(), // "mareo"
    severity: v.optional(v.number()), // 0-10
    change: v.optional(v.string()), // new | better | worse | same
    onset: v.optional(v.string()),
    location: v.optional(v.string()),
    duration: v.optional(v.string()),
    character: v.optional(v.string()),
    aggravating: v.optional(v.string()),
    relieving: v.optional(v.string()),
    timing: v.optional(v.string()),
    quoteOriginal: v.string(),
    quoteEnglish: v.string(),
  }).index("by_patient_date", ["patientId", "date"]),

  medicationEvents: defineTable({
    patientId: v.id("patients"),
    conversationId: v.id("conversations"),
    date: v.string(),
    medication: v.string(),
    action: v.string(), // started | stopped | taken | missed
    note: v.optional(v.string()),
  }).index("by_patient", ["patientId"]),

  questions: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    textOriginal: v.string(),
    textEnglish: v.string(),
    source: v.union(v.literal("typed"), v.literal("voice")),
    status: v.union(v.literal("open"), v.literal("answered"), v.literal("carried_over")),
    order: v.number(),
    answerEvidence: v.optional(v.string()),
  }).index("by_appointment", ["appointmentId"]),

  alerts: defineTable({
    patientId: v.id("patients"),
    conversationId: v.optional(v.id("conversations")),
    symptom: v.string(),
    quote: v.string(),
    createdAt: v.number(),
    acknowledged: v.boolean(),
  }).index("by_patient", ["patientId"]),

  visits: defineTable({
    appointmentId: v.id("appointments"),
    audioStorageId: v.optional(v.id("_storage")),
    transcript: v.optional(
      v.array(
        v.object({ speaker: v.string(), textEnglish: v.string(), textPatientLang: v.string() }),
      ),
    ),
    summaryEnglish: v.optional(v.any()), // VisitSummary JSON, see Voice agent design
    summaryPatientLang: v.optional(v.any()),
    releasedToPatient: v.boolean(),
    status: v.string(), // uploaded | transcribed | summarized
  }).index("by_appointment", ["appointmentId"]),

  // C9 pre-visit brief, written by elastic.generateBrief from the Elastic Workflow's output
  // (or the direct-agent fallback)
  briefs: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    textEnglish: v.string(),
    createdAt: v.number(),
    source: v.union(v.literal("elastic_workflow"), v.literal("fallback"), v.literal("seed")),
  }).index("by_appointment", ["appointmentId"]),
});
