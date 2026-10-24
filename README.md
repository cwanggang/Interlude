# Patient Companion

A bilingual (English/Spanish) voice companion for Spanish-speaking older adults with metabolic disease (demo: type 2 diabetes) waiting for an endocrinology visit. See `SPEC.md` for the full product spec.

Prototype only: seeded demo accounts, not HIPAA-compliant, not medical advice, not for emergencies (call 911).

## Layout

```text
/convex          backend: schema, queries, mutations, actions, crons.ts, http.ts
/apps/mobile     Expo app (patient)
/apps/doctor     Vite + React app (doctor)
/scripts/seed.ts demo data (run through convex/seed.ts)
```

## Setup

```bash
npm install                      # once, from the repo root (npm workspaces)
npx convex dev                   # log in, pick the team project; keeps running and pushes on save
npm run seed                     # wipe and reseed demo data (in another terminal)
```

Each developer gets their own Convex dev deployment. Copy its URL from the root `.env.local` (`CONVEX_URL`) into:

- `apps/doctor/.env.local` as `VITE_CONVEX_URL=...`
- `apps/mobile/.env.local` as `EXPO_PUBLIC_CONVEX_URL=...`

Then:

```bash
npm run doctor                   # doctor dashboard at http://localhost:5173
npm run mobile                   # Expo dev server; scan the QR code with Expo Go
npm run typecheck                # convex + both apps
```

To seed with a real phone for live calls: `npx convex run seed:run '{"phone":"+15025550123"}'`.

## Convex environment variables

Set these as project default environment variables in the Convex dashboard. Defaults only reach deployments created afterwards, so on an existing deployment also run `npx convex env set NAME value`. Never put them in the apps.

```text
CARTESIA_API_KEY
CARTESIA_CHECKIN_AGENT_ID_EN   CARTESIA_CHECKIN_AGENT_ID_ES
CARTESIA_EXPLAINER_AGENT_ID_EN CARTESIA_EXPLAINER_AGENT_ID_ES
CARTESIA_FROM_NUMBER_ID
CARTESIA_WEBHOOK_SECRET
ANTHROPIC_API_KEY
ELASTIC_URL                     Serverless Elasticsearch endpoint
ELASTIC_API_KEY
KIBANA_URL                      Agent Builder and Workflows APIs
ELASTIC_INDEX_PREFIX            per deployment: a_, b_, prod_
DEMO_PHONE                      optional default phone for the seed
```

## Webhooks

Cartesia webhook tools point at `https://<deployment>.convex.site/cartesia/{red-flag,add-question,search-visit}` with header `x-webhook-secret: $CARTESIA_WEBHOOK_SECRET`.

## Elastic

Everything runs on **Elastic Cloud Serverless** (Elasticsearch 9.6 + Kibana), called only from Convex actions in [`convex/elastic.ts`](convex/elastic.ts). The apps never talk to Elastic directly.

Setup per deployment (after setting the `ELASTIC_*` vars):

```bash
npx convex run elastic:ensureIndices '{"reset":true}'
npm run seed                        # also reindexes Elastic from Convex
npx convex run elastic:syncAgent    # Agent Builder tools + agent, and the pre-visit-brief Workflow
npx convex run elastic:diagnose     # optional: lists inference endpoints, checks Kibana
```

| Feature | What it does for us | Where |
|---|---|---|
| **Jina embeddings** (`.jina-embeddings-v5-text-small` on Elastic Inference Service) | `semantic_text` fields embed every Spanish quote and visit passage, so an English query like "dizziness" finds "temblorosa y mareada" | `MAPPINGS`, `EMBEDDING_ID` |
| **Hybrid search** (RRF retriever: `semantic` + BM25 `multi_match`) | Meaning across languages, plus exact strings embeddings blur: drug names ("metformina"), doses, glucose numbers | `searchCheckins`, `searchVisit` |
| **Jina reranker** (`.jina-reranker-v3.5`, `text_similarity_reranker`) | Reranks on a stored bilingual field (original + English), which beat single-language reranking for both English and Spanish queries | `searchCheckins`, `searchVisit` |
| **Aggregations** (terms → daily `date_histogram` → `max`) | The doctor's symptom timeline; unreported days are `null`, not 0 | `timeline` |
| **Agent Builder** (custom agent + 3 ES\|QL tools) | "Ask the record": answers a doctor's question with cited, dated quotes and shows its tool steps. Every tool requires `?patient_id` or `?appointment_id`, so it can't read another patient | `syncAgent`, `agentTools`, `askRecord` |
| **Workflows** (manual trigger, `ai.agent` step) | Writes the pre-visit brief from the check-ins plus the patient's open questions; Convex runs it, waits, and saves the result | `workflowYaml`, `generateBrief` |
| **Live voice retrieval** | The explainer phone agent's `search_visit` tool answers Spanish questions from the English visit transcript in 200-270 ms | `searchVisit` (via `/cartesia/search-visit`) |

How it fits the product:

- **Convex is the source of truth; Elastic is the search and analytics copy.** Every symptom entry is indexed with its Convex id as the document id, so reindexing is idempotent and `npm run seed` never leaves duplicates (`reindexAll`).
- **Live timeline:** Elastic results aren't reactive, so the dashboard re-fetches the timeline whenever the patient's processed conversations change in Convex.
- **Safety:** every query filters by patient or appointment, the agent answers only from tool results and says when the records don't contain the answer, and no Elastic key leaves Convex.

What we verified and how (inference endpoint IDs, API shapes, the reranker comparison, test questions and answers) is in [`elastic/NOTES.md`](elastic/NOTES.md). Design detail: [`ELASTIC.md`](ELASTIC.md).

Known limitations: the reranker cutoff (score 1.0) was tuned on the seed data; the daily brief needs one cron line in `crons.ts` (`internal.elastic.generateBriefsForUpcoming`); visit passages are only as good as the transcript Track A produces.
