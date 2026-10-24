# Elastic notes (verified on our Serverless project)

Re-check any time with `npx convex run elastic:diagnose`.

| Check (ELASTIC.md section 3) | Answer | How verified |
|---|---|---|
| Cluster | Serverless, Elasticsearch 9.6.0 | `diagnose` |
| Jina embedding endpoint | `.jina-embeddings-v5-text-small` (text_embedding, EIS). Fallback: `.jina-embeddings-v3` | `GET /_inference/_all` |
| Jina reranker endpoint | `.jina-reranker-v3` (rerank, EIS). Also available: `.jina-reranker-v2-base-multilingual`, `.jina-reranker-v3.5`, `.jina-reranker-m0` | `GET /_inference/_all` |
| Agent Builder API | Reachable: `GET {KIBANA_URL}/api/agent_builder/agents` returns 200 | `diagnose` |
| Workflows | Kibana UI lets us create one (2026-10-24). Confirm with the booth | manual |
| `copy_to` into `semantic_text` | Works. English "dizziness" finds Spanish "mareo" quotes via `quote_original` → `quote_semantic` | `diagnose '{"query":"dizziness"}'` after seed |
| `refresh: "wait_for"` | Works on `index` and `bulk` | `indexCheckin`, `reindexAll` |
| Hybrid RRF + rerank syntax | `text_similarity_reranker` wrapping `rrf` over two `standard` retrievers (semantic + `multi_match`), each with the `patient_id` filter. See `searchCheckins` | live queries |
| Retriever `min_score` | Returned zero hits at 1.0 even though returned scores were above it; we filter `_score >= 1.0` in code instead | live queries |
| Index Search tool limited to one patient | TBD (task 4) | |

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
