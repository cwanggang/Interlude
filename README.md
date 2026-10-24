# Patient Companion

A bilingual (English/Spanish) voice companion for Spanish-speaking older adults waiting for a specialist visit. See `SPEC.md` for the full product spec.

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

Set these as project default environment variables in the Convex dashboard so every dev deployment gets them. Never put them in the apps.

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
ELASTIC_AGENT_ID                Agent Builder agent ID
ELASTIC_WEBHOOK_SECRET          sent by the pre-visit-brief Workflow
DEMO_PHONE                      optional default phone for the seed
```

## Webhooks

Cartesia webhook tools point at `https://<deployment>.convex.site/cartesia/{red-flag,add-question,search-visit}` with header `x-webhook-secret: $CARTESIA_WEBHOOK_SECRET`.

The Elastic `pre-visit-brief` Workflow posts to `https://<deployment>.convex.site/elastic/previsit-brief` with header `x-webhook-secret: $ELASTIC_WEBHOOK_SECRET`. See `ELASTIC.md`.
