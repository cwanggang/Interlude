"use node";
// TRACK B owns this file. STUB: validators are the contract; bodies are fake.
// indexCheckin, indexVisitChunks and searchVisit are called by Track A; changing
// their args or returns needs agreement from both devs.
// Index names are prefixed with ELASTIC_INDEX_PREFIX (a_, b_, prod_).
// Read ELASTIC.md before implementing anything here (Jina, hybrid search, Agent Builder, Workflows).
import { v, type Infer } from "convex/values";
import { action, internalAction } from "./_generated/server";

export const visitPassage = v.object({
  chunkIndex: v.number(),
  speakers: v.array(v.string()),
  textEnglish: v.string(),
  textPatientLang: v.string(),
  score: v.number(),
});

// ---- Cross-track: called by Track A ----

/**
 * Index one symptom entry into the `checkins` index, using symptomEntryId as the document _id
 * so re-indexing is idempotent. Called by Track A's pipeline after every call, before the
 * conversation is marked processed (so the dashboard's timeline refetch sees it).
 */
export const indexCheckin = internalAction({
  args: {
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
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] elastic.indexCheckin", args.symptomEntryId, args.symptom);
    return null;
  },
});

/** Index a visit transcript split into passages of 2 to 4 turns, into `visit_chunks`. */
export const indexVisitChunks = internalAction({
  args: {
    patientId: v.id("patients"),
    appointmentId: v.id("appointments"),
    chunks: v.array(
      v.object({
        chunkIndex: v.number(),
        speakers: v.array(v.string()),
        textEnglish: v.string(),
        textPatientLang: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] elastic.indexVisitChunks", args.appointmentId, args.chunks.length);
    return null;
  },
});

/** Top 3 visit passages for the explainer agent's search_visit tool. */
export const searchVisit = internalAction({
  args: {
    appointmentId: v.id("appointments"),
    query: v.string(),
  },
  returns: v.array(visitPassage),
  handler: async (_ctx, _args): Promise<Infer<typeof visitPassage>[]> => {
    return [
      {
        chunkIndex: 0,
        speakers: ["doctor", "interpreter"],
        textEnglish: "Take the new pill, meclizine 25 mg, once in the morning with food.",
        textPatientLang: "Tome la pastilla nueva, meclizina de 25 mg, una vez en la mañana con comida.",
        score: 1,
      },
    ];
  },
});

// ---- Track B only: used by the doctor dashboard ----

const timelineSeries = v.object({
  symptom: v.string(),
  points: v.array(v.object({ date: v.string(), severity: v.union(v.number(), v.null()) })),
});

/**
 * C2 timeline: max severity per symptom per day (terms → date_histogram → max), last `days`
 * (default 14). Days with no report are null, not 0. Actions aren't reactive: the dashboard
 * re-calls this whenever patients.conversations changes.
 */
export const timeline = action({
  args: { patientId: v.id("patients"), days: v.optional(v.number()) },
  returns: v.array(timelineSeries),
  handler: async (_ctx, _args): Promise<Infer<typeof timelineSeries>[]> => {
    return [
      {
        symptom: "dizziness",
        points: [
          { date: "2026-10-22", severity: 5 },
          { date: "2026-10-23", severity: 6 },
        ],
      },
    ];
  },
});

const checkinHit = v.object({
  symptomEntryId: v.string(),
  date: v.string(),
  symptom: v.string(),
  language: v.string(),
  quoteOriginal: v.string(),
  quoteEnglish: v.string(),
  score: v.number(),
});

/** C6 cross-language search: hybrid (RRF of semantic + BM25) then Jina rerank, filtered by patient. Top 10. */
export const searchCheckins = action({
  args: { patientId: v.id("patients"), query: v.string() },
  returns: v.array(checkinHit),
  handler: async (_ctx, _args): Promise<Infer<typeof checkinHit>[]> => {
    return [];
  },
});

const citation = v.object({
  date: v.optional(v.string()),
  conversationId: v.optional(v.string()),
  quote: v.string(),
});
const recordAnswer = v.object({
  answer: v.string(),
  citations: v.array(citation),
  steps: v.array(v.string()), // "how this was found", one line per agent tool call
});

/** C7 ask-the-record: Agent Builder converse API with patient-record-agent, scoped to one patient. */
export const askRecord = action({
  args: { patientId: v.id("patients"), question: v.string() },
  returns: recordAnswer,
  handler: async (_ctx, _args): Promise<Infer<typeof recordAnswer>> => {
    return {
      answer: "The dizziness started about two weeks before the first check-in and has worsened from 4 to 6.",
      citations: [{ quote: "Me mareo mucho cuando me levanto de la cama, como que todo da vueltas." }],
      steps: ["[stub] symptom_trend(patient_id, days=14)"],
    };
  },
});

/**
 * C9 "Generate brief" button: fires the pre-visit-brief Workflow for this appointment. The
 * Workflow posts back to /elastic/previsit-brief, so the result arrives through
 * briefs.getByAppointment. If Workflows is unavailable, calls the agent directly and writes
 * through internal.briefs.save with source "fallback".
 */
export const generateBrief = action({
  args: { patientId: v.id("patients"), appointmentId: v.id("appointments") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] elastic.generateBrief", args.appointmentId);
    return null;
  },
});

/** Create the `checkins` and `visit_chunks` indices if missing; `reset` deletes and recreates them. */
export const ensureIndices = internalAction({
  args: { reset: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] elastic.ensureIndices", args.reset ?? false);
    return null;
  },
});

/**
 * Called by the seed after it rewrites Convex: empties both indices for this prefix, then
 * bulk-indexes every symptomEntries row, so reseeding never leaves stale or duplicate docs.
 */
export const reindexAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    console.log("[stub] elastic.reindexAll");
    return null;
  },
});
