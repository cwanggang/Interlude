# Elastic notes (verified on our Serverless project)

Re-check any time with `npx convex run elastic:diagnose`.

| Check (ELASTIC.md section 3) | Answer | How verified |
|---|---|---|
| Cluster | Serverless, Elasticsearch 9.6.0 | `diagnose` |
| Jina embedding endpoint | `.jina-embeddings-v5-text-small` (text_embedding, EIS). Fallback: `.jina-embeddings-v3` | `GET /_inference/_all` |
| Jina reranker endpoint | `.jina-reranker-v3` (rerank, EIS). Also available: `.jina-reranker-v2-base-multilingual`, `.jina-reranker-v3.5`, `.jina-reranker-m0` | `GET /_inference/_all` |
| Agent Builder API | Reachable: `GET {KIBANA_URL}/api/agent_builder/agents` returns 200 | `diagnose` |
| Workflows | Enabled: Kibana UI creates one, and Agent Builder lists built-in `platform.workflows.*` tools. Confirm hackathon support with the booth | manual + `GET /api/agent_builder/tools` |
| `copy_to` into `semantic_text` | Works. English "dizziness" finds Spanish "mareo" quotes via `quote_original` → `quote_semantic` | `diagnose '{"query":"dizziness"}'` after seed |
| `refresh: "wait_for"` | Works on `index` and `bulk` | `indexCheckin`, `reindexAll` |
| Hybrid RRF + rerank syntax | `text_similarity_reranker` wrapping `rrf` over two `standard` retrievers (semantic + `multi_match`), each with the `patient_id` filter. See `searchCheckins` | live queries |
| Retriever `min_score` | Returned zero hits at 1.0 even though returned scores were above it; we filter `_score >= 1.0` in code instead | live queries |
| Index Search tool limited to one patient | Not needed: all three tools are ES\|QL with a required `?patient_id` / `?appointment_id` string param | task 4 |

Reseeding: two `npm run seed` runs in a row leave exactly 15 `checkins` docs (6 seeded days), so `reindexAll` doesn't duplicate.

## Reranker choice (task 2)

Compared `.jina-reranker-v3`, `v3.5` and `v2-base-multilingual`, reranking on `quote_original`, `quote_english`, and a stored `quote_bilingual` (original + newline + English). Reranking on a single language failed for queries in the other one (e.g. "mareo" against English text ranked nausea first). `quote_bilingual` + `v3.5` ranked best for both languages:

| Query | Result (seed data) |
|---|---|
| dizziness | 5 hits, 4 dizziness quotes in Spanish first, then a nausea quote mentioning "mareo" |
| mareo | 7 hits, dizziness quotes first |
| ibuprofeno | exact drug mention first (score 1.48 vs ~1.05) |
| chest pain | 0 hits (top unrelated score 0.98, below the 1.0 cutoff) |

Timeline: dates are calendar days stored as UTC midnight, so the histogram buckets in UTC and "today" is computed in the patient's time zone in code. Bucketing with `time_zone` shifted every point a day early.

## Visit passages (task 3)

`searchVisit` uses the same hybrid + `.jina-reranker-v3.5` pattern on `visit_chunks` (rerank field `text_bilingual`), top 3, no score cutoff (the explainer always gets its best passages). Tested with five sample passages from a scripted endocrinology visit:

| Spanish question | Top passage | Score |
|---|---|---|
| ¿Cuándo tomo la pastilla nueva? | glipizide lowered to 2.5 mg with breakfast | 1.44 |
| ¿Qué hago si el azúcar me baja? | under 70: half a cup of juice, recheck in 15 min | 1.48 |
| ¿Sigo con la metformina? | keep metformin 500 mg twice a day | 1.41 |
| ¿Puedo comer pizza? (not in the visit) | weak match only | 1.03 |

Latency including the reranker: 200-270 ms warm, so the reranker stays on for live calls.

## Agent Builder (task 4)

API shapes, verified by probing validation errors:
- Tool: `POST /api/agent_builder/tools` `{ id, type: "esql", description, configuration: { query, params: { name: { type: "string"|"integer"|"float"|"boolean"|"date"|"array", description } } } }`; update with `PUT /api/agent_builder/tools/{id}` without `id`/`type`.
- Agent: `POST /api/agent_builder/agents` `{ id, name, description, configuration: { instructions, tools: [{ tool_ids: [...] }] } }`; update with `PUT .../agents/{id}`.
- Converse: `POST /api/agent_builder/converse` `{ agent_id, input }` returns `response.message` and `steps[]` (`reasoning` and `tool_call` with `tool_id`, `params`).

`npx convex run elastic:syncAgent` creates or updates `<prefix>symptom_trend`, `<prefix>symptom_quotes`, `<prefix>visit_passages` and `<prefix>patient-record-agent`. The agent ID comes from `ELASTIC_INDEX_PREFIX`, so the `ELASTIC_AGENT_ID` env var isn't needed. The agent ends its answer with a `CITATIONS: [...]` JSON line that `askRecord` parses.

| Question | Result |
|---|---|
| When did the shaky spells start, and are they getting worse? | Oct 20 (sugar 65), same on Oct 21, worse Oct 22 (58), held Oct 23; 4 dated citations |
| Is she still taking metformin? | Yes, visit says keep 500 mg twice a day; cites the check-in quote |
| What did the doctor change at the visit? | Glipizide lowered to 2.5 mg with breakfast, metformin unchanged, low-sugar plan, A1c + foot exam; undated visit citations |
| Does she have chest pain? | No mention in the records; no citations |

## Workflows (task 5)

API shapes, verified on our project:
- Validate YAML: Agent Builder built-in tool `platform.workflows.validate_workflow` via `POST /api/agent_builder/tools/_execute` `{ tool_id, tool_params: { yaml } }`
- Create: `POST /api/workflows` `{ workflows: [{ yaml }] }`; the id is derived from `name` (we keep names hyphenated: `b-pre-visit-brief`)
- Read / update: `GET` / `PUT /api/workflows/workflow/{id}` (`PUT` body `{ yaml }`)
- Run: `POST /api/workflows/workflow/{id}/run` `{ inputs }` returns `{ workflowExecutionId }`
- Status and output: `GET /api/workflows/executions/{executionId}?includeOutput=true`; the `ai.agent` step's text is `stepExecutions[].output.message`

The brief comes back through polling, so no Convex HTTP route or webhook secret is needed. Test run: "Generate brief" on the seeded patient took 18 s and saved a 111-word brief with `source: "elastic_workflow"`, covering the high-sugar start (250 → 180), the low-sugar spells (65, 70, 58 with dates), new foot tingling, red flags, and both open questions passed in from Convex.
