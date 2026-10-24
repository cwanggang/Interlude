"use node";
// TRACK B owns this file. Validators are the contract; functions still marked [stub] are fake.
// indexCheckin, indexVisitChunks and searchVisit are called by Track A; changing
// their args or returns needs agreement from both devs.
// Index names are prefixed with ELASTIC_INDEX_PREFIX (a_, b_, prod_).
// Read ELASTIC.md before implementing anything here (Jina, hybrid search, Agent Builder, Workflows).
import { Client } from "@elastic/elasticsearch";
import { v, type Infer } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

// Verified on our project with `npx convex run elastic:diagnose`; see elastic/NOTES.md.
const EMBEDDING_ID = ".jina-embeddings-v5-text-small";
// v3.5 on the bilingual field ranked best for English and Spanish queries; see elastic/NOTES.md.
const RERANK_ID = ".jina-reranker-v3.5";
// Reranker scores for unrelated queries stayed under 1.0 on the seed data; tune if results get thin.
const RERANK_MIN_SCORE = 1.0;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing Convex env var ${name}`);
  return value;
}

let client: Client | undefined;
function es(): Client {
  client ??= new Client({
    node: requireEnv("ELASTIC_URL"),
    auth: { apiKey: requireEnv("ELASTIC_API_KEY") },
  });
  return client;
}

/** Calls a Kibana API (Agent Builder, Workflows) with the same API key. */
async function kibana(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${requireEnv("KIBANA_URL")}${path}`, {
    ...init,
    headers: {
      Authorization: `ApiKey ${requireEnv("ELASTIC_API_KEY")}`,
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

function indexName(base: "checkins" | "visit_chunks"): string {
  return `${process.env.ELASTIC_INDEX_PREFIX ?? ""}${base}`;
}

const MAPPINGS = {
  checkins: {
    properties: {
      symptom_entry_id: { type: "keyword" },
      patient_id: { type: "keyword" },
      appointment_id: { type: "keyword" },
      conversation_id: { type: "keyword" },
      date: { type: "date" },
      symptom: { type: "keyword" },
      severity: { type: "integer" },
      change: { type: "keyword" },
      language: { type: "keyword" },
      quote_original: { type: "text", copy_to: "quote_semantic" },
      quote_english: { type: "text" },
      // Both languages in one string: the reranker scores best when the query's language is present
      quote_bilingual: { type: "text", index: false },
      quote_semantic: { type: "semantic_text", inference_id: EMBEDDING_ID },
    },
  },
  visit_chunks: {
    properties: {
      patient_id: { type: "keyword" },
      appointment_id: { type: "keyword" },
      chunk_index: { type: "integer" },
      speakers: { type: "keyword" },
      text_english: { type: "text", copy_to: "content" },
      text_patient_lang: { type: "text" },
      text_bilingual: { type: "text", index: false }, // rerank field, as quote_bilingual
      content: { type: "semantic_text", inference_id: EMBEDDING_ID },
    },
  },
} as const;

/** Creates missing indices; with reset, deletes and recreates them. */
async function ensure(reset = false): Promise<void> {
  for (const base of ["checkins", "visit_chunks"] as const) {
    const index = indexName(base);
    const exists = await es().indices.exists({ index });
    if (exists && !reset) continue;
    if (exists) await es().indices.delete({ index });
    await es().indices.create({ index, mappings: MAPPINGS[base] });
  }
}

// Actions reuse warm Node processes, so this skips the exists checks after the first call.
let ensured = false;
async function ensureOnce(): Promise<void> {
  if (ensured) return;
  await ensure();
  ensured = true;
}

type CheckinArgs = {
  symptomEntryId: string;
  patientId: string;
  appointmentId: string;
  conversationId: string;
  date: string;
  symptom: string;
  severity?: number;
  change?: string;
  language: string;
  quoteOriginal: string;
  quoteEnglish: string;
};

type CheckinSource = {
  symptom_entry_id: string;
  date: string;
  symptom: string;
  language: string;
  quote_original: string;
  quote_english: string;
};

type VisitChunkSource = {
  chunk_index: number;
  speakers: string[];
  text_english: string;
  text_patient_lang: string;
};

function checkinDoc(a: CheckinArgs) {
  return {
    symptom_entry_id: a.symptomEntryId,
    patient_id: a.patientId,
    appointment_id: a.appointmentId,
    conversation_id: a.conversationId,
    date: a.date,
    symptom: a.symptom,
    severity: a.severity ?? null,
    change: a.change ?? null,
    language: a.language,
    quote_original: a.quoteOriginal,
    quote_english: a.quoteEnglish,
    quote_bilingual: `${a.quoteOriginal}
${a.quoteEnglish}`,
  };
}

/** Setup check: cluster info, inference endpoints (for the Jina IDs), and Kibana reachability. */
export const diagnose = internalAction({
  args: { query: v.optional(v.string()) },
  returns: v.any(),
  handler: async (_ctx, args) => {
    if (args.query) {
      // Raw semantic query on checkins, to check embeddings independent of searchCheckins.
      const res = await es().search<{ quote_original: string; date: string }>({
        index: indexName("checkins"),
        size: 3,
        query: { semantic: { field: "quote_semantic", query: args.query } },
        _source: ["quote_original", "date"],
      });
      const counts = await Promise.all(
        (["checkins", "visit_chunks"] as const).map(async (b) => [b, (await es().count({ index: indexName(b) })).count]),
      );
      return { counts: Object.fromEntries(counts), hits: res.hits.hits.map((h) => ({ score: h._score, ...h._source })) };
    }
    const info = await es().info();
    const inference = (await es().transport.request({ method: "GET", path: "/_inference/_all" })) as {
      endpoints?: { inference_id: string; task_type: string; service: string; service_settings?: { model_id?: string } }[];
    };
    const agents = await kibana("/api/agent_builder/agents");
    return {
      cluster: { name: info.cluster_name, version: info.version.number, flavor: info.version.build_flavor },
      inference: (inference.endpoints ?? []).map((e) => ({
        id: e.inference_id,
        task: e.task_type,
        service: e.service,
        model: e.service_settings?.model_id,
      })),
      kibanaAgentBuilder: agents.status,
    };
  },
});

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
    await ensureOnce();
    await es().index({
      index: indexName("checkins"),
      id: args.symptomEntryId,
      document: checkinDoc(args),
      refresh: "wait_for",
    });
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
    await ensureOnce();
    const index = indexName("visit_chunks");
    // Reprocessing a visit may produce fewer chunks, so replace the appointment's set wholesale.
    await es().deleteByQuery({
      index,
      query: { term: { appointment_id: args.appointmentId } },
      refresh: true,
    });
    if (args.chunks.length === 0) return null;
    const response = await es().bulk({
      refresh: "wait_for",
      operations: args.chunks.flatMap((c) => [
        { index: { _index: index, _id: `${args.appointmentId}-${c.chunkIndex}` } },
        {
          patient_id: args.patientId,
          appointment_id: args.appointmentId,
          chunk_index: c.chunkIndex,
          speakers: c.speakers,
          text_english: c.textEnglish,
          text_patient_lang: c.textPatientLang,
          text_bilingual: `${c.textPatientLang}
${c.textEnglish}`,
        },
      ]),
    });
    if (response.errors) throw new Error(`indexVisitChunks: bulk errors for ${args.appointmentId}`);
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
  handler: async (_ctx, args): Promise<Infer<typeof visitPassage>[]> => {
    const query = args.query.trim();
    if (!query) return [];
    await ensureOnce();
    // Runs during a live phone call: log latency. If reranking is too slow, drop it here only.
    const started = Date.now();
    const appointmentFilter = { term: { appointment_id: args.appointmentId } };
    const res = await es().search<VisitChunkSource>({
      index: indexName("visit_chunks"),
      size: 3,
      _source: ["chunk_index", "speakers", "text_english", "text_patient_lang"],
      retriever: {
        text_similarity_reranker: {
          retriever: {
            rrf: {
              retrievers: [
                { standard: { query: { semantic: { field: "content", query } }, filter: appointmentFilter } },
                {
                  standard: {
                    query: { multi_match: { query, fields: ["text_english", "text_patient_lang"] } },
                    filter: appointmentFilter,
                  },
                },
              ],
              rank_window_size: 20,
            },
          },
          field: "text_bilingual",
          inference_id: RERANK_ID,
          inference_text: query,
          rank_window_size: 20,
        },
      },
    });
    console.log("elastic.searchVisit", args.appointmentId, `${Date.now() - started}ms`, res.hits.hits.length);
    // No score cutoff: the explainer must always get its best passages, and it says
    // "ask your clinic" when they don't answer the question.
    return res.hits.hits.flatMap((h) =>
      h._source
        ? [
            {
              chunkIndex: h._source.chunk_index,
              speakers: h._source.speakers,
              textEnglish: h._source.text_english,
              textPatientLang: h._source.text_patient_lang,
              score: h._score ?? 0,
            },
          ]
        : [],
    );
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
  handler: async (ctx, args): Promise<Infer<typeof timelineSeries>[]> => {
    const patient = await ctx.runQuery(api.patients.get, { patientId: args.patientId });
    if (!patient) return [];
    await ensureOnce();
    // Check-in dates are the patient's local calendar day, stored as UTC midnight. So bucket in
    // UTC, and compute the window's last day ("today") in the patient's own time zone.
    const days = args.days ?? 14;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: patient.timezone }).format(new Date());
    const from = new Date(Date.parse(today) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const res = await es().search({
      index: indexName("checkins"),
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { patient_id: args.patientId } },
            { range: { date: { gte: from, lte: today } } },
          ],
        },
      },
      aggs: {
        by_symptom: {
          terms: { field: "symptom", size: 20 },
          aggs: {
            by_day: {
              date_histogram: {
                field: "date",
                calendar_interval: "day",
                format: "yyyy-MM-dd",
                min_doc_count: 0,
                extended_bounds: { min: from, max: today },
              },
              aggs: { max_severity: { max: { field: "severity" } } },
            },
          },
        },
      },
    });
    type DayBucket = { key_as_string: string; max_severity: { value: number | null } };
    type SymptomBucket = { key: string; by_day: { buckets: DayBucket[] } };
    const buckets = (res.aggregations?.by_symptom as { buckets: SymptomBucket[] } | undefined)?.buckets ?? [];
    return buckets.map((b) => ({
      symptom: b.key,
      // max over no docs (or docs with no severity) is null: "not reported", not 0
      points: b.by_day.buckets.map((d) => ({ date: d.key_as_string, severity: d.max_severity.value })),
    }));
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
  handler: async (_ctx, args): Promise<Infer<typeof checkinHit>[]> => {
    const query = args.query.trim();
    if (!query) return [];
    await ensureOnce();
    const patientFilter = { term: { patient_id: args.patientId } };
    const res = await es().search<CheckinSource>({
      index: indexName("checkins"),
      size: 10,
      _source: ["symptom_entry_id", "date", "symptom", "language", "quote_original", "quote_english"],
      retriever: {
        text_similarity_reranker: {
          retriever: {
            rrf: {
              retrievers: [
                // Meaning across languages: "dizziness" finds "mareo"
                { standard: { query: { semantic: { field: "quote_semantic", query } }, filter: patientFilter } },
                // Exact strings embeddings blur: drug names, doses
                {
                  standard: {
                    query: { multi_match: { query, fields: ["quote_original", "quote_english"] } },
                    filter: patientFilter,
                  },
                },
              ],
              rank_window_size: 50,
            },
          },
          field: "quote_bilingual",
          inference_id: RERANK_ID,
          inference_text: query,
          rank_window_size: 50,
        },
      },
    });
    // Filtered here: the retriever's own min_score returned nothing at any threshold we tried.
    return res.hits.hits.flatMap((h) =>
      h._source && (h._score ?? 0) >= RERANK_MIN_SCORE
        ? [
            {
              symptomEntryId: h._source.symptom_entry_id,
              date: h._source.date,
              symptom: h._source.symptom,
              language: h._source.language,
              quoteOriginal: h._source.quote_original,
              quoteEnglish: h._source.quote_english,
              score: h._score ?? 0,
            },
          ]
        : [],
    );
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
    await ensure(args.reset ?? false);
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
  handler: async (ctx) => {
    await ensureOnce();
    for (const base of ["checkins", "visit_chunks"] as const) {
      await es().deleteByQuery({ index: indexName(base), query: { match_all: {} }, refresh: true });
    }
    const entries = await ctx.runQuery(internal.patients.symptomEntriesForIndex, {});
    if (entries.length === 0) return null;
    const index = indexName("checkins");
    const response = await es().bulk({
      refresh: "wait_for",
      operations: entries.flatMap((e) => [{ index: { _index: index, _id: e.symptomEntryId } }, checkinDoc(e)]),
    });
    if (response.errors) {
      const first = response.items.find((i) => i.index?.error)?.index?.error;
      throw new Error(`reindexAll: bulk errors, first: ${first?.type}: ${first?.reason}`);
    }
    console.log("elastic.reindexAll indexed", entries.length);
    return null;
  },
});

