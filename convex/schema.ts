// SHARED FILE. Dev A approves every change. Matches SPEC.md "Data model" + "Schema v2" exactly.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const briefItem = v.object({
  text: v.string(),
  citations: v.array(
    v.object({
      symptomEntryId: v.optional(v.string()),
      date: v.string(),
      quoteOriginal: v.string(),
      quoteEnglish: v.string(),
    }),
  ),
});

export default defineSchema({
  patients: defineTable({
    name: v.string(),
    phone: v.string(), // E.164, e.g. +15025550123
    language: v.union(v.literal("en"), v.literal("es")),
    callTimeLocal: v.string(), // "18:30"
    timezone: v.string(), // "America/Los_Angeles"
    consentCalls: v.boolean(),
    reasonForVisit: v.string(),
    // v2
    dateOfBirth: v.optional(v.string()), // "1958-03-14", for the age in H7
    textSize: v.optional(v.union(v.literal("normal"), v.literal("large"), v.literal("xlarge"))),
    notificationsEnabled: v.optional(v.boolean()),
    doctorLastViewedAt: v.optional(v.number()), // H6 "new since last viewed"
  }),

  appointments: defineTable({
    patientId: v.id("patients"),
    doctorName: v.string(),
    scheduledAt: v.number(), // ms since epoch
    status: v.union(v.literal("upcoming"), v.literal("completed")),
    clinicName: v.optional(v.string()), // v2, G7
  })
    .index("by_patient", ["patientId"])
    .index("by_doctor_time", ["doctorName", "scheduledAt"]),

  // one row per Cartesia call (phone or app) or text chat session
  conversations: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    channel: v.union(v.literal("phone"), v.literal("app"), v.literal("chat")),
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
    // v2
    summaryPatientLang: v.optional(v.string()), // G1 done line, G18 history
    endReason: v.optional(v.string()), // Cartesia end_reason, e.g. "no_answer"; "error" for ours
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
    conversationId: v.optional(v.id("conversations")), // v2: optional, app taps have none
    date: v.string(),
    medication: v.string(), // normalized key, lowercase generic: "glipizide"
    action: v.string(), // started | stopped | taken | missed
    note: v.optional(v.string()),
    // v2
    source: v.optional(v.union(v.literal("voice"), v.literal("app"))),
    slot: v.optional(
      v.union(v.literal("morning"), v.literal("midday"), v.literal("evening"), v.literal("bedtime")),
    ),
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
    quote: v.string(), // as spoken, in the patient's language
    createdAt: v.number(),
    acknowledged: v.boolean(),
    quoteEnglish: v.optional(v.string()), // v2, H3
  }).index("by_patient", ["patientId"]),

  visits: defineTable({
    appointmentId: v.id("appointments"),
    audioStorageId: v.optional(v.id("_storage")),
    transcript: v.optional(
      v.array(
        v.object({ speaker: v.string(), textEnglish: v.string(), textPatientLang: v.string() }),
      ),
    ),
    summaryEnglish: v.optional(v.any()), // VisitSummary JSON (v2), see Voice agent design
    summaryPatientLang: v.optional(v.any()),
    releasedToPatient: v.boolean(),
    status: v.string(), // uploaded | transcribed | summarized | failed
    // v2
    releasedAt: v.optional(v.number()), // H10 "Released Oct 20"
    unaddressedSymptoms: v.optional(
      v.array(
        v.object({
          symptom: v.string(),
          symptomOriginal: v.string(),
          lastDate: v.string(),
          lastSeverity: v.optional(v.number()),
        }),
      ),
    ), // D5, H12
  }).index("by_appointment", ["appointmentId"]),

  // C9 pre-visit brief, written by elastic.generateBrief from the Elastic Workflow's output
  // (or the direct-agent fallback)
  briefs: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    textEnglish: v.string(),
    createdAt: v.number(),
    source: v.union(v.literal("elastic_workflow"), v.literal("fallback"), v.literal("seed")),
    // v2, H8; textEnglish stays as the plain version
    sections: v.optional(
      v.object({ overview: v.string(), concerns: v.array(briefItem), topics: v.array(briefItem) }),
    ),
  }).index("by_appointment", ["appointmentId"]),

  // v2, G11: after-visit checklist. Written by Track A when summarizing, ticked by Track B.
  visitTasks: defineTable({
    visitId: v.id("visits"),
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    kind: v.union(
      v.literal("prescription"),
      v.literal("follow_up"),
      v.literal("test"),
      v.literal("other"),
    ),
    textEnglish: v.string(),
    textPatientLang: v.string(),
    order: v.number(),
    done: v.boolean(),
    doneAt: v.optional(v.number()),
  })
    .index("by_visit", ["visitId"])
    .index("by_patient", ["patientId"]),

  // v2, G16: one conversations row (channel "chat") per chat session
  chatMessages: defineTable({
    conversationId: v.id("conversations"),
    patientId: v.id("patients"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(), // in the patient's language
    createdAt: v.number(),
    pending: v.optional(v.boolean()), // assistant reply still being written
    redFlag: v.optional(v.boolean()), // opens the "Call 911 now" screen (G17)
    citations: v.optional(
      v.array(v.object({ chunkIndex: v.number(), textPatientLang: v.string() })),
    ), // F2
  }).index("by_conversation", ["conversationId"]),

  // v2, P1: doctor glucose chart only. Written by Track A's extraction.
  glucoseReadings: defineTable({
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    conversationId: v.id("conversations"),
    date: v.string(),
    valueMgDl: v.number(),
    context: v.union(
      v.literal("fasting"),
      v.literal("before_meal"),
      v.literal("after_meal"),
      v.literal("bedtime"),
      v.literal("unknown"),
    ),
    quoteOriginal: v.string(),
    quoteEnglish: v.string(),
  }).index("by_patient_date", ["patientId", "date"]),
});
