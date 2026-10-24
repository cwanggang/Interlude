"use node";
// TRACK B owns this file. STUB: validators are the contract; bodies are fake.
// indexCheckin, indexVisitChunks and searchVisit are called by Track A; changing
// their args or returns needs agreement from both devs.
// Index names are prefixed with ELASTIC_INDEX_PREFIX (a_, b_, prod_).
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

/** Index one symptom entry into the `checkins` index. Called after every processed call and by the seed. */
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

/** C2 timeline: max severity per symptom per day (terms → date_histogram → max). */
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

/** C6 cross-language search: semantic query on quote_semantic, filtered by patient. */
export const searchCheckins = action({
  args: { patientId: v.id("patients"), query: v.string() },
  returns: v.array(checkinHit),
  handler: async (_ctx, _args): Promise<Infer<typeof checkinHit>[]> => {
    return [];
  },
});

/** Create the `checkins` and `visit_chunks` indices if missing. Run once per prefix. */
export const ensureIndices = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    console.log("[stub] elastic.ensureIndices");
    return null;
  },
});
