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
| Hybrid RRF + rerank syntax | TBD (task 2) | |
| Index Search tool limited to one patient | TBD (task 4) | |

Reseeding: two `npm run seed` runs in a row leave exactly 15 `checkins` docs (6 seeded days), so `reindexAll` doesn't duplicate.
