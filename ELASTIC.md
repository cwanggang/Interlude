# ELASTIC.md — Elastic guide for Track B

This file supplements `SPEC.md`. Track B reads both before any Elastic task. `SPEC.md` already reflects the decisions here (priorities, schema, contract, env vars); this file holds the implementation detail.

## 1. Why this file exists

We are targeting Elastic's sponsor track ("Find the Signal: Best use of Elasticsearch"). Its judging criteria, from the sign at Elastic's booth (the hacker guide still says "Coming soon"), are:

1. Depth and creativity of the Elasticsearch implementation
2. Use of Jina models for embeddings
3. Use of Elastic Agent Builder and Workflows
4. Use of Elastic Cloud Serverless (sign-up link: ela.st/calhacks)

## 2. Ownership

All Elastic work is Track B. Track B owns `convex/elastic.ts`, `convex/briefs.ts`, and `/elastic/` (`NOTES.md`). No Track A file is involved: the agent and Workflow definitions live in `convex/elastic.ts`, and the brief comes back without an HTTP route.

Rules (same as `CLAUDE.md`):
- Start every session with "I am Track B". Edit only Track B files.
- Need a schema change, a new HTTP route, an env var, or a change to another track's file? Stop and write the exact proposed change for the human to bring to the team.
- `convex/elastic.ts` starts with `"use node"`. Node files contain only actions (`action`, `internalAction`), never queries or mutations. To read or write Convex data from it, call a query or mutation in another Track B file (`patients.ts`, `briefs.ts`) through `ctx.runQuery` or `ctx.runMutation`.
- No Elastic key outside Convex env vars. Setup and smoke tests are Convex actions run with `npx convex run elastic:<name>`, not local scripts.

## 3. Verify, don't guess

Elastic's APIs changed a lot in 2025–2026. Use the installed Elastic agent skills (`elastic-elasticsearch`, `elastic-kibana`) and the Elastic docs for exact syntax. Never write Serverless, inference, retriever, Agent Builder, or Workflows syntax from memory. Before relying on each item below, confirm it on our Serverless project and record the answer in `/elastic/NOTES.md`:

- [ ] The exact inference endpoint ID for the Jina multilingual embedding model on Elastic Inference Service (EIS)
- [ ] The exact inference endpoint ID for a Jina reranker on EIS
- [ ] Whether `copy_to` into a `semantic_text` field works. If not, write the string to the semantic field directly.
- [ ] Hybrid search syntax: the RRF retriever combining a BM25 (`match`) query and a `semantic` query, plus a reranking step
- [ ] Whether Workflows is available and enabled on Serverless. It is a Technical Preview that is enabled in Advanced Settings; ask the Elastic booth if it's missing.
- [ ] Whether an Agent Builder Index Search tool can be restricted to one patient. If not, only ES|QL tools with a `?patient_id` parameter may read patient data.
- [ ] Whether `refresh: "wait_for"` works on Serverless

## 4. The contract (as stubbed in the repo)

Cross-track functions. Don't change their args or returns without Dev A:

| Function | Called by | Returns |
|---|---|---|
| `internal.elastic.indexCheckin` | A's pipeline, awaited, *before* it marks the conversation `processed` | `null` |
| `internal.elastic.indexVisitChunks` | A's visit processing | `null` |
| `internal.elastic.searchVisit` | A's `/cartesia/search-visit` | top 3 `{ chunkIndex, speakers, textEnglish, textPatientLang, score }` |
| `internal.elastic.reindexAll` | the seed, after it rewrites Convex | `null` |

Track B only (change freely, but keep the `Promise<Infer<...>>` annotation):

| Function | Used by | Returns |
|---|---|---|
| `api.elastic.timeline` | C2 chart | `{ symptom, points: { date, severity: number \| null }[] }[]` |
| `api.elastic.searchCheckins` | C6 search | `{ symptomEntryId, date, symptom, language, quoteOriginal, quoteEnglish, score }[]` |
| `api.elastic.askRecord` | C7 ask box | `{ answer, citations: { date?, conversationId?, quote }[], steps: string[] }` |
| `api.elastic.generateBrief` | C9 "Generate brief" button | `null`; the brief arrives through `api.briefs.getByAppointment` |
| `internal.elastic.ensureIndices` | `npx convex run elastic:ensureIndices '{"reset":true}'` | `null` |


**Live timeline.** Convex queries are reactive, but `timeline` is an action and doesn't re-run on its own. The dashboard subscribes to `api.patients.conversations` and re-calls `timeline` whenever it changes. That works because Track A indexes before marking the conversation `processed`, and `indexCheckin` indexes with `refresh: "wait_for"` (or an explicit refresh if Serverless rejects it).

**Reseeding.** `npm run seed` wipes Convex and schedules `reindexAll`, which empties both indices for this `ELASTIC_INDEX_PREFIX` and bulk-indexes every `symptomEntries` row (read through an internal query in `patients.ts`). Documents use `symptomEntryId` as `_id`, so indexing the same entry twice overwrites rather than duplicates.

## 5. Index design

Both indices are created by `ensureIndices` with `ELASTIC_INDEX_PREFIX`. It is idempotent: it skips an index that exists, and `reset: true` recreates it.

`checkins`: the mapping from `SPEC.md`, with these changes:
- The `semantic_text` field `quote_semantic` sets `inference_id` explicitly to the Jina embedding endpoint (section 3). Don't rely on the default; judges should see Jina in the code.
- Keep `quote_original` and `quote_english` as `text` for BM25. Hybrid search uses them.
- Add `symptom_entry_id` (keyword) and, if medication events get indexed for timeline markers, `medication` (keyword).

`visit_chunks`: the mapping from `SPEC.md`, with the same explicit Jina `inference_id` on `content`. Keep `text_english` and `text_patient_lang` as `text` for BM25.

Why hybrid matters here (use this in the README and pitch): semantic search matches meaning across languages ("dizziness" finds "mareado"). BM25 matches exact strings that embeddings can blur, such as drug names ("metformin") and doses ("500 mg"). In medicine, the exact name matters.

## 6. Queries

**6.1 Timeline (`timeline`).** Filter `patient_id` and the last `days` (default 14). Terms aggregation on `symptom`, then `date_histogram` with `calendar_interval: day` and `extended_bounds` over the whole window, then `max` of `severity`. Return days with no data as `null`, not 0, because 0 means "no symptom" and missing means "not reported."

**6.2 Cross-language search (`searchCheckins`).** Hybrid search: an RRF retriever over (a) a `semantic` query on `quote_semantic` and (b) a `multi_match` on `quote_original` and `quote_english`, filtered by `patient_id`, then reranked with the Jina reranker. Return the top 10.

**6.3 Visit passages (`searchVisit`).** The same hybrid-plus-rerank pattern on `visit_chunks`, filtered by `appointment_id`, top 3. This runs during a live phone call, so it must be fast. Do not route it through Agent Builder. Log latency, and if reranking adds too much, drop the reranker here only.

## 7. Agent Builder and Workflows

**7.1 Agent: `patient-record-agent`.** Defined in `convex/elastic.ts` (`agentTools`, `AGENT_INSTRUCTIONS`; the Convex tsconfig doesn't import JSON) and created or updated with `npx convex run elastic:syncAgent`, which calls the Agent Builder API on `KIBANA_URL`. Tool and agent IDs carry `ELASTIC_INDEX_PREFIX`, so `ELASTIC_AGENT_ID` isn't needed.

Instructions (draft):

```text
You answer a doctor's questions about one patient's pre-visit check-ins and visit records.
Always use your tools. Answer only from tool results, and cite the date and quote for every
claim. If the records don't contain the answer, say so. Never diagnose or give medical advice.
Patient quotes may be in Spanish; answer in English and include the original quote.
```

Tools:
- `symptom_trend` (ES|QL): max severity per symptom per day for `?patient_id` over `?days`.
- `symptom_quotes` (ES|QL): quotes (original and English) for `?patient_id`, optionally filtered by `?symptom`.
- `visit_passages` (Index Search on `visit_chunks`), only if section 3 confirms it can be limited to one patient. Otherwise use an ES|QL tool with `?appointment_id`.

ES|QL parameters keep the LLM from querying other patients. Every patient-data tool must require `patient_id` or `appointment_id`.

**7.2 `askRecord`.** Calls Agent Builder's converse API (`/api/agent_builder/converse`) with this deployment's agent ID. Prepend "Patient ID: <id>" to the message so the agent passes it to its tools. Return the answer, the citations, and the tool steps as one line each, which the UI shows as "how this was found."

**7.3 Workflow: `<prefix>pre-visit-brief`.** YAML generated by `workflowYaml()` in `convex/elastic.ts` and created or updated by `syncAgent`.
- Trigger: manual, with `patient_id`, `appointment_id` and `questions` inputs. `generateBrief` (the dashboard button) runs it through `POST /api/workflows/workflow/{id}/run`, polls `GET /api/workflows/executions/{id}?includeOutput=true`, and saves the `write_brief` step's message with `source: "elastic_workflow"`. No Convex HTTP route is involved.
- Step: one `ai.agent` step calling the patient-record agent, with the open questions from Convex passed in (the agent's tools can't see Convex).
- If the Workflow fails, `generateBrief` calls the agent directly and saves with `source: "fallback"`.
- Daily run (optional): `internal.elastic.generateBriefsForUpcoming` writes a brief for every appointment in the next 24 hours; it needs one `crons.cron(...)` line in Track A's `crons.ts`.

## 8. Task sequence

Run one task per Claude Code session. Each task ends with a command that proves it works.

| # | Task | Done when |
|---|---|---|
| 1 | Jina inference IDs, `ensureIndices`, `indexCheckin`, `reindexAll` | After `npm run seed`, `npx convex run elastic:searchCheckins` with query "dizziness" returns Spanish quotes, and a second seed doesn't double the hit count |
| 2 | `timeline` and `searchCheckins` with hybrid search and reranking | Timeline JSON shows the 6 seeded days (today is null until the live call); "metformina" and "mareo" both return correct hits |
| 3 | `indexVisitChunks`, `searchVisit` | Spanish question "¿Cuándo tomo la pastilla nueva?" returns the English passage about the new medication, with latency logged |
| 4 | Agent Builder agent, tools, `askRecord` | "When did the dizziness start?" returns an answer citing a dated quote |
| 5 | Workflow `pre-visit-brief`, `generateBrief` | The dashboard button produces a new `briefs` row with `source: "elastic_workflow"` |
| 6 | README section | Lists every Elastic feature used and where it lives in code |

If time runs short, cut in this order: scheduled trigger, reranker on `searchVisit`, then the Workflow (use the fallback). Never cut tasks 1, 2, or 4.

## 9. Demo moment (about 20 seconds, SPEC demo step 4)

1. Type "dizziness" in search. Spanish quotes come back, reranked. (Jina, hybrid)
2. Ask the record: "When did the dizziness start, and is it getting worse?" The answer cites dated quotes and shows its steps. (Agent Builder, ES|QL)
3. Point to the pre-visit brief card generated by the Workflow. (Workflows)
4. One line: "All on Elastic Cloud Serverless."

## 10. Safety rules for Elastic code

- Every query that reads patient data filters by `patient_id` or `appointment_id`.
- Never log full quotes or transcripts to the console in production paths. Use IDs in logs.
- Keys come only from Convex env vars. Never commit them, and never put them in the apps.
- The agent answers only from retrieved records and says when the answer isn't there.
