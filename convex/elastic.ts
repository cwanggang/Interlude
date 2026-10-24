"use node";
// TRACK B owns this file. Validators are the contract; functions still marked [stub] are fake.
// indexCheckin, indexVisitChunks and searchVisit are called by Track A; changing
// their args or returns needs agreement from both devs.
// Index names are prefixed with ELASTIC_INDEX_PREFIX (a_, b_, prod_).
// Read ELASTIC.md before implementing anything here (Jina, hybrid search, Agent Builder, Workflows).
import { Client } from "@elastic/elasticsearch";
import { v, type Infer } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { api, internal } from "./_generated/api";
import { briefSections } from "./briefs";

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

// ---- Agent Builder (C7) ----
// Every patient-data tool requires ?patient_id or ?appointment_id, so the LLM can't read other
// patients. Ids carry ELASTIC_INDEX_PREFIX so each deployment has its own tools and agent.

function agentId(): string {
  return `${process.env.ELASTIC_INDEX_PREFIX ?? ""}patient-record-agent`;
}

function agentTools() {
  const prefix = process.env.ELASTIC_INDEX_PREFIX ?? "";
  return [
    {
      id: `${prefix}symptom_trend`,
      type: "esql",
      description:
        "Daily maximum severity (0-10) per symptom for one patient, oldest first. Use for onset, trends, and 'is it getting worse'.",
      configuration: {
        query: `FROM ${indexName("checkins")}
| WHERE patient_id == ?patient_id
| STATS max_severity = MAX(severity) BY symptom, day = DATE_TRUNC(1 day, date)
| SORT symptom, day
| LIMIT 300`,
        params: { patient_id: { type: "string", description: "The patient ID given in the question" } },
      },
    },
    {
      id: `${prefix}symptom_quotes`,
      type: "esql",
      description:
        "Every check-in quote for one patient (original Spanish and English), with date, symptom, severity and change. Use to cite evidence, including glucose readings and medications the patient mentioned.",
      configuration: {
        query: `FROM ${indexName("checkins")}
| WHERE patient_id == ?patient_id
| KEEP symptom_entry_id, date, symptom, severity, change, quote_original, quote_english, conversation_id
| SORT date ASC
| LIMIT 200`,
        params: { patient_id: { type: "string", description: "The patient ID given in the question" } },
      },
    },
    {
      id: `${prefix}visit_passages`,
      type: "esql",
      description:
        "Transcript passages from the patient's most recent doctor visit, in order. Use for what the doctor said or prescribed.",
      configuration: {
        query: `FROM ${indexName("visit_chunks")}
| WHERE appointment_id == ?appointment_id
| KEEP chunk_index, speakers, text_english, text_patient_lang
| SORT chunk_index
| LIMIT 50`,
        params: { appointment_id: { type: "string", description: "The appointment ID given in the question" } },
      },
    },
  ];
}

const AGENT_INSTRUCTIONS = `You answer a doctor's questions about one patient's daily check-in calls and visit records.
The patient has a metabolic condition (for example type 2 diabetes); quotes may mention glucose readings and medications.
Always use your tools, passing the patient ID and appointment ID given at the start of the question.
Answer only from tool results, in English, in two to four sentences. If the records don't contain the answer, say so.
Never diagnose or give medical advice.
After the answer, add one line that starts with CITATIONS: followed by a JSON array of the quotes you relied on,
each {"date": "YYYY-MM-DD", "quote": "<quote_original exactly as returned>"} for check-in quotes,
or {"quote": "<text_english exactly as returned>"} with no date for visit passages. Use [] if none.`;

type ConverseStep = { type: string; reasoning?: string; tool_id?: string; params?: Record<string, unknown> };

/** One-shot Agent Builder conversation with this deployment's patient-record agent. */
async function converse(input: string): Promise<{ message: string; steps: ConverseStep[] }> {
  const res = await kibana("/api/agent_builder/converse", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId(), input }),
  });
  if (!res.ok) throw new Error(`Agent Builder converse: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { response?: { message?: string }; steps?: ConverseStep[] };
  return { message: body.response?.message ?? "", steps: body.steps ?? [] };
}

/** Splits the agent's trailing "CITATIONS: [...]" line (see AGENT_INSTRUCTIONS) from its answer. */
function splitCitations(message: string): { answer: string; citations: { date?: string; quote: string }[] } {
  const at = message.lastIndexOf("CITATIONS:");
  if (at === -1) return { answer: message.trim(), citations: [] };
  const answer = message.slice(0, at).replace(/\*\*/g, "").trim();
  try {
    const parsed = JSON.parse(message.slice(at + "CITATIONS:".length).trim()) as { date?: unknown; quote?: unknown }[];
    const citations = parsed.flatMap((c) =>
      typeof c.quote === "string" ? [{ quote: c.quote, date: typeof c.date === "string" ? c.date : undefined }] : [],
    );
    return { answer, citations };
  } catch {
    return { answer, citations: [] };
  }
}

// ---- Workflows (C9 pre-visit brief) ----
// generateBrief runs the Workflow and saves its output itself, so no Convex HTTP route is needed.

/** Kibana derives a workflow's id from its name; keep the name hyphenated so the id is predictable. */
function workflowId(): string {
  return `${(process.env.ELASTIC_INDEX_PREFIX ?? "").replace(/_/g, "-")}pre-visit-brief`;
}

/**
 * H8: the brief as JSON sections, each line citing check-in entries by symptom_entry_id. Shared by
 * the Workflow (with {{ inputs.* }} placeholders) and the fallback. No "{{" or "}}" in the JSON
 * example, so the Workflow's template engine leaves it alone.
 */
function briefPrompt(patientId: string, appointmentId: string, questions: string): string {
  return [
    `Patient ID: ${patientId}. Appointment ID: ${appointmentId}.`,
    "Write a pre-visit brief for the doctor using only the daily check-ins (not visit passages).",
    "Reply with only one JSON object, no markdown, in this shape:",
    '{"overview": "<at most 60 words: symptom trends with dates, glucose readings, medication changes or missed doses, red flags>",',
    '"concerns": [ {"text": "<one concern the patient reported, at most 20 words>", "citations": [ {"symptom_entry_id": "<symptom_entry_id exactly as returned>", "date": "YYYY-MM-DD", "quote": "<quote_original exactly as returned>"} ] } ],',
    '"topics": [ {"text": "<one topic for the doctor to review, at most 20 words>", "citations": [ ] } ] }.',
    "Give at most 4 concerns, each citing 1 or 2 quotes, and at most 4 topics; include the patient's open questions as topics.",
    `The patient's open questions are: ${questions}`,
  ].join(" ");
}

type BriefSections = Infer<typeof briefSections>;

/**
 * Parses briefPrompt's JSON (ignoring markdown fences and the CITATIONS line) and resolves each
 * citation to a real check-in entry of this patient, by id or else by exact quote. Citations that
 * match nothing are dropped, so every link shows the patient's actual words. Null if not JSON.
 */
function parseBrief(
  message: string,
  entries: { _id: string; date: string; quoteOriginal: string; quoteEnglish: string }[],
): BriefSections | null {
  const { answer } = splitCitations(message);
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  type RawItem = { text?: unknown; citations?: { symptom_entry_id?: unknown; quote?: unknown }[] };
  let raw: { overview?: unknown; concerns?: RawItem[]; topics?: RawItem[] };
  try {
    raw = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof raw.overview !== "string") return null;
  const byId = new Map(entries.map((e) => [e._id, e]));
  const byQuote = new Map(entries.map((e) => [e.quoteOriginal.trim(), e]));
  const items = (list: RawItem[] | undefined) =>
    (Array.isArray(list) ? list : []).flatMap((item) => {
      if (typeof item.text !== "string") return [];
      const seen = new Set<string>();
      const citations = (Array.isArray(item.citations) ? item.citations : []).flatMap((c) => {
        const entry =
          (typeof c.symptom_entry_id === "string" && byId.get(c.symptom_entry_id)) ||
          (typeof c.quote === "string" && byQuote.get(c.quote.trim()));
        if (!entry || seen.has(entry._id)) return [];
        seen.add(entry._id);
        return [{ symptomEntryId: entry._id, date: entry.date, quoteOriginal: entry.quoteOriginal, quoteEnglish: entry.quoteEnglish }];
      });
      return [{ text: item.text, citations }];
    });
  return { overview: raw.overview, concerns: items(raw.concerns), topics: items(raw.topics) };
}

/** The plain-text version kept in briefs.textEnglish. */
function briefText(sections: BriefSections): string {
  const lines = (title: string, list: { text: string }[]) => (list.length ? ` ${title}: ${list.map((i) => i.text).join("; ")}.` : "");
  return `${sections.overview}${lines("Concerns", sections.concerns)}${lines("To review", sections.topics)}`;
}

function workflowYaml(): string {
  return `version: "1"
name: ${workflowId()}
description: Writes a short pre-visit brief for one patient with the patient-record agent.
enabled: true
triggers:
  - type: manual
inputs:
  - name: patient_id
    type: string
    required: true
  - name: appointment_id
    type: string
    required: true
  - name: questions
    type: string
    required: false
steps:
  - name: write_brief
    type: ai.agent
    agent-id: ${agentId()}
    with:
      message: >-
        ${briefPrompt("{{ inputs.patient_id }}", "{{ inputs.appointment_id }}", "{{ inputs.questions }}")}
`;
}

async function syncWorkflow(): Promise<void> {
  const id = workflowId();
  const existing = await kibana(`/api/workflows/workflow/${id}`);
  const res = existing.ok
    ? await kibana(`/api/workflows/workflow/${id}`, { method: "PUT", body: JSON.stringify({ yaml: workflowYaml() }) })
    : await kibana("/api/workflows", { method: "POST", body: JSON.stringify({ workflows: [{ yaml: workflowYaml() }] }) });
  if (!res.ok) throw new Error(`syncWorkflow ${id}: ${res.status} ${await res.text()}`);
  if (!existing.ok) {
    const created = (await res.json()) as { created?: { id: string }[] };
    if (created.created?.[0]?.id !== id) {
      throw new Error(`syncWorkflow: Kibana created id ${created.created?.[0]?.id}, expected ${id}`);
    }
  }
}

/** Runs the Workflow and waits for the agent step's message (up to ~2 minutes). */
async function runBriefWorkflow(inputs: Record<string, string>): Promise<string> {
  const run = await kibana(`/api/workflows/workflow/${workflowId()}/run`, {
    method: "POST",
    body: JSON.stringify({ inputs }),
  });
  if (!run.ok) throw new Error(`workflow run: ${run.status} ${await run.text()}`);
  const { workflowExecutionId } = (await run.json()) as { workflowExecutionId: string };
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await kibana(`/api/workflows/executions/${workflowExecutionId}?includeOutput=true`);
    if (!res.ok) continue;
    const execution = (await res.json()) as {
      status: string;
      stepExecutions?: { stepId: string; output?: { message?: string } }[];
    };
    if (execution.status === "completed") {
      const message = execution.stepExecutions?.find((s) => s.stepId === "write_brief")?.output?.message;
      if (!message) throw new Error(`workflow ${workflowExecutionId} completed without a brief`);
      return message;
    }
    if (["failed", "cancelled", "timed_out"].includes(execution.status)) {
      throw new Error(`workflow ${workflowExecutionId} ${execution.status}`);
    }
  }
  throw new Error(`workflow ${workflowExecutionId} still running after 2 minutes`);
}

/** Writes and saves a brief for one appointment: the Workflow first, the agent directly as fallback. */
async function writeBrief(
  ctx: ActionCtx,
  patientId: Id<"patients">,
  appointmentId: Id<"appointments">,
): Promise<void> {
  const questions = await ctx.runQuery(api.questions.listForAppointment, { appointmentId });
  const openQuestions =
    questions
      .filter((q) => q.status === "open")
      .map((q) => q.textEnglish)
      .join("; ") || "none";
  let message: string;
  let source: "elastic_workflow" | "fallback" = "elastic_workflow";
  try {
    message = await runBriefWorkflow({
      patient_id: patientId,
      appointment_id: appointmentId,
      questions: openQuestions,
    });
  } catch (e) {
    console.warn("elastic.generateBrief: workflow failed, calling the agent directly", e);
    source = "fallback";
    ({ message } = await converse(briefPrompt(patientId, appointmentId, openQuestions)));
  }
  const entries = await ctx.runQuery(api.patients.symptomEntries, { patientId });
  const sections = parseBrief(message, entries);
  // An answer that isn't the requested JSON is still saved, as plain text without sections.
  const textEnglish = sections ? briefText(sections) : splitCitations(message).answer;
  await ctx.runMutation(internal.briefs.save, { patientId, appointmentId, textEnglish, source, sections: sections ?? undefined });
}

/** Creates or updates this deployment's Agent Builder tools, agent, and pre-visit-brief Workflow. */
export const syncAgent = internalAction({
  args: {},
  returns: v.object({ agentId: v.string(), tools: v.array(v.string()) }),
  handler: async () => {
    const tools = agentTools();
    for (const { id, ...tool } of tools) {
      const existing = await kibana(`/api/agent_builder/tools/${id}`);
      const { type: _type, ...updatable } = tool;
      const res = existing.ok
        ? await kibana(`/api/agent_builder/tools/${id}`, { method: "PUT", body: JSON.stringify(updatable) })
        : await kibana("/api/agent_builder/tools", { method: "POST", body: JSON.stringify({ id, ...tool }) });
      if (!res.ok) throw new Error(`syncAgent tool ${id}: ${res.status} ${await res.text()}`);
    }
    const agent = {
      name: "Patient record agent",
      description: "Answers a doctor's questions about one patient's check-ins and visits, with cited quotes.",
      configuration: { instructions: AGENT_INSTRUCTIONS, tools: [{ tool_ids: tools.map((t) => t.id) }] },
    };
    const id = agentId();
    const existing = await kibana(`/api/agent_builder/agents/${id}`);
    const res = existing.ok
      ? await kibana(`/api/agent_builder/agents/${id}`, { method: "PUT", body: JSON.stringify(agent) })
      : await kibana("/api/agent_builder/agents", { method: "POST", body: JSON.stringify({ id, ...agent }) });
    if (!res.ok) throw new Error(`syncAgent agent ${id}: ${res.status} ${await res.text()}`);
    await syncWorkflow();
    return { agentId: id, tools: tools.map((t) => t.id) };
  },
});

/** Dev helper: raw Kibana API call, e.g. to inspect Agent Builder shapes. Internal only. */
export const kibanaApi = internalAction({
  args: { method: v.string(), path: v.string(), body: v.optional(v.any()) },
  returns: v.any(),
  handler: async (_ctx, args) => {
    const res = await kibana(args.path, {
      method: args.method,
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
    });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text.slice(0, 2000) };
    }
  },
});

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

const timelineResult = v.object({
  series: v.array(timelineSeries),
  /** G13 / C2 visit markers: completed visit days in the window, in the patient's timezone. */
  visitDates: v.array(v.string()),
});

const MAX_TIMELINE_DAYS = 120;

/**
 * C2 / G13 timeline: max severity per symptom per day (terms → date_histogram → max), from `from`
 * ("YYYY-MM-DD", e.g. the last visit) or the last `days` (default 14), through today. Days with
 * no report are null, not 0. Actions aren't reactive: callers re-call this when
 * patients.conversations changes.
 */
export const timeline = action({
  args: { patientId: v.id("patients"), days: v.optional(v.number()), from: v.optional(v.string()) },
  returns: timelineResult,
  handler: async (ctx, args): Promise<Infer<typeof timelineResult>> => {
    const patient = await ctx.runQuery(api.patients.get, { patientId: args.patientId });
    if (!patient) return { series: [], visitDates: [] };
    await ensureOnce();
    // Check-in dates are the patient's local calendar day, stored as UTC midnight. So bucket in
    // UTC, and compute the window's last day ("today") in the patient's own time zone.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: patient.timezone }).format(new Date());
    const earliest = new Date(Date.parse(today) - (MAX_TIMELINE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
    const from =
      args.from && /^\d{4}-\d{2}-\d{2}$/.test(args.from)
        ? [args.from, earliest].sort()[1] // no earlier than MAX_TIMELINE_DAYS ago
        : new Date(Date.parse(today) - ((args.days ?? 14) - 1) * 86_400_000).toISOString().slice(0, 10);
    const appointments = await ctx.runQuery(api.appointments.listForPatient, { patientId: args.patientId });
    const visitDates = appointments
      .filter((a) => a.status === "completed")
      .map((a) => new Intl.DateTimeFormat("en-CA", { timeZone: patient.timezone }).format(new Date(a.scheduledAt)))
      .filter((d) => d >= from && d <= today);
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
    const series = buckets.map((b) => ({
      symptom: b.key,
      // max over no docs (or docs with no severity) is null: "not reported", not 0
      points: b.by_day.buckets.map((d) => ({ date: d.key_as_string, severity: d.max_severity.value })),
    }));
    return { series, visitDates };
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
  handler: async (ctx, args): Promise<Infer<typeof recordAnswer>> => {
    const appointment = await ctx.runQuery(api.appointments.current, { patientId: args.patientId });
    const { message, steps } = await converse(
      `Patient ID: ${args.patientId}. Appointment ID: ${appointment?._id ?? "none"}. Question: ${args.question.trim()}`,
    );
    const { answer, citations } = splitCitations(message);
    return {
      answer,
      citations,
      steps: steps.map((step) =>
        step.type === "tool_call"
          ? `Ran ${step.tool_id} for ${Object.keys(step.params ?? {}).join(", ") || "no parameters"}`
          : (step.reasoning ?? step.type),
      ),
    };
  },
});

/**
 * C9 "Generate brief" button: runs the pre-visit-brief Elastic Workflow for this appointment and
 * saves the result; the card updates through briefs.getByAppointment. Takes 20-40 seconds.
 */
export const generateBrief = action({
  args: { patientId: v.id("patients"), appointmentId: v.id("appointments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await writeBrief(ctx, args.patientId, args.appointmentId);
    return null;
  },
});

/**
 * For a daily cron (crons.ts is Track A's): a brief for every appointment in the next 24 hours.
 * crons.cron("pre-visit briefs", "0 14 * * *", internal.elastic.generateBriefsForUpcoming, {})
 */
export const generateBriefsForUpcoming = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const rows: FunctionReturnType<typeof api.patients.list> = await ctx.runQuery(api.patients.list, {});
    const due = rows.filter(
      (r) => r.nextAppointment && r.nextAppointment.scheduledAt - now < 24 * 60 * 60 * 1000,
    );
    for (const r of due) await writeBrief(ctx, r.patient._id, r.nextAppointment!._id);
    return due.length;
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
    const entries: FunctionReturnType<typeof internal.patients.symptomEntriesForIndex> = await ctx.runQuery(
      internal.patients.symptomEntriesForIndex,
      {},
    );
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

