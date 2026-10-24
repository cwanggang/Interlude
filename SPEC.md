# Patient Companion – Product Spec & Tech Stack

Oct 24, 2026 · @Caden

## Overview

We are building a bilingual (English and Spanish) voice companion. It checks in on patients by phone every day, turns those calls into a symptom timeline the doctor reads before the visit, and explains the visit afterward in the patient's language.

- **Who it serves:** Spanish-speaking older adults with metabolic disease (the demo patient has type 2 diabetes) waiting weeks for an endocrinology appointment. Name this community in the pitch; the Anthropic track rewards a specific community. The narrow focus keeps the vocabulary manageable: glucose readings, metformin and other diabetes medicines, thirst, urination, fatigue, low-sugar spells, foot tingling.
- **Demo storyline (seeded):** María has had high sugar (thirst, nighttime urination, fatigue, readings of 240-250) for three weeks on metformin. Her clinic added glipizide, and since then she has shaky, sweaty, dizzy spells before meals with readings of 58-70. The doctor sees that pattern on the timeline before the visit.
- **Two interfaces:** a patient mobile app (Expo) plus daily phone calls, and a doctor web dashboard.
- **The cycle:** before the visit (check-ins, questions) → the visit (recording, summary) → after the visit (explanation, follow-ups) → the next visit. Check-ins and the question queue keep running after every visit.

**How to use this doc with Claude Code**

1. Export this doc as Markdown and save it in the repo root as `SPEC.md`.
2. Add a `CLAUDE.md` that says: "Read SPEC.md before every task. Build only the phase you are asked for. Ask before changing the data model or the stack."
3. Each developer builds only their own track (see Team workflow), one block at a time from the Build plan section. Each block has a ready-to-paste prompt.
4. Priority labels used throughout: **P0** = must work live in the demo. **P1** = build once P0 works. **P2** = mention in the pitch only.

## Key decisions

These eight decisions set the stack. Several of them correct earlier assumptions.

1. **Elastic does not translate; Claude does.** Claude translates every check-in and visit into English and the patient's language. Elastic stores both versions, searches across languages, and computes the timeline. Its `semantic_text` fields use Jina's multilingual embedding model on Elastic Inference Service, so an English query finds Spanish text ([Elastic](https://www.elastic.co/search-labs/kr/author/ranjana-devaji)). Elastic also runs the doctor's ask-the-record agent (Agent Builder) and the pre-visit brief (Workflows). Full Elastic design: `ELASTIC.md`.
2. **One pipeline for every conversation.** Every conversation, phone call or in-app, ends with a Cartesia `call_id`. Convex then:
   1. fetches the transcript from Cartesia's Get Call endpoint,
   2. has Claude extract structured symptoms and questions,
   3. writes the result to Convex,
   4. indexes it in Elastic,
   5. marks the conversation `processed` (last, so the dashboard's timeline refetch finds the new point in Elastic).

   Build this once, in Phase 1.
3. **Autonomous calls are built into Cartesia.** One `POST /agents/calls` request takes the agent, the number to call from, the destination, and per-call `dynamic_variables` such as the patient's name ([Cartesia outbound calling](https://docs.cartesia.ai/line/integrations/telephony/outbound-dialing.md)). A Convex cron job decides who is due and sends that request. No Twilio needed.
4. **Cartesia numbers are US-only.** The free plan includes 1 number, and outbound calls only reach US numbers ([Cartesia numbers](https://docs.cartesia.ai/line/integrations/telephony/cartesia-numbers)). Calls cost $0.074 per minute with telephony ([pricing](https://docs.cartesia.ai/line/integrations/overview.md)). Use a teammate's US phone for the demo.
5. **Expo Go cannot stream live microphone audio.** Cartesia's in-app voice needs raw 16-bit PCM chunks sent over a WebSocket ([Cartesia WebSocket API](https://docs.cartesia.ai/line/integrations/websocket-api.md)). `expo-av` does not expose raw PCM, and the streaming libraries ship native code that needs an Expo dev build ([example](https://docs.smallest.ai/voice-agents/platform/agent-sdk/mobile-integrations/react-native.md)). So:
   - **P0 "Talk now" is "Call me now":** the button triggers the same outbound call to the patient's phone. It works in Expo Go with zero audio code.
   - **P1 in-app voice:** an Expo dev build with `react-native-audio-api`, connected to the Cartesia WebSocket. Needs a Mac with Xcode (iOS) or Android Studio.
   - **Visit recording:** record a file with `expo-audio` (works in Expo Go), upload it, and transcribe it in one batch.
6. **The doctor interface is a web app, not mobile.** Doctors read dashboards on a computer, and charts are easier to build on the web. It uses the same Convex backend.
7. **Convex is the source of truth; Elastic is the search and analytics copy.** Every write goes to Convex first, and a Convex action then indexes it in Elastic. The apps never call Elastic directly.
8. **No real auth or patient data.** Use seeded demo accounts. In the pitch, say it is a prototype and not HIPAA-compliant; production needs vendors covered by a business associate agreement (BAA) and human interpreter backup.
9. **Backend first, design second.** Engineers build working but unstyled screens from a shared component set while the designer works. The designs are applied in one pass Saturday evening (see Design integration).
10. **Two coding tracks, one contract.** Two developers each run Claude Code on separate files, after a contract (schema plus stub functions) is merged first (see Team workflow).

## Functional spec

The features are grouped by stage of the care cycle. The P0 rows are the demo; everything else waits until those work end to end.

### A. Setup

| ID | Feature | Interface | Priority | Done when |
| --- | --- | --- | --- | --- |
| A1 | Patient profile: name, phone number (+1 format), language (en/es), daily call time, consent to calls, reason for visit | Patient app | P0 | Profile saves to Convex and shows on the doctor dashboard |
| A2 | Appointment: date, time, doctor name | Doctor dashboard (or seed script) | P0 | Patient app shows a countdown to the visit |
| A3 | App text in English and Spanish, following the patient's language setting | Patient app | P0 | Switching language changes every screen |

### B. Before the visit (patient)

| ID | Feature | Interface | Priority | Done when |
| --- | --- | --- | --- | --- |
| B1 | Daily check-in call: a Convex cron job dials patients at their call time; the agent asks at most 5 questions in about 90 seconds | Phone | P0 | Phone rings, the agent speaks the patient's language, and the entry appears on the timeline within 1 minute of hang-up |
| B2 | Adaptive questions: the agent gets yesterday's summary and the active symptoms, and asks "better, worse, or the same?" | Phone | P0 | The agent names yesterday's symptoms without being told on the call |
| B3 | "Call me now" button: places the same call immediately | Patient app | P0 | Tap, and the phone rings within 10 seconds |
| B4 | In-app voice: talk to the same agent inside the app | Patient app (dev build) | P1 | A full conversation in the app produces a timeline entry |
| B5 | Check-in history: list of past check-ins, in the patient's language | Patient app | P1 | Each call shows date, symptoms, and severity |
| B6 | Question queue: add, edit, delete, and reorder by typing; the agent also captures "I want to ask the doctor…" during calls | Patient app + phone | P0 | A question spoken on a call appears in the list, tagged "voice" |
| B7 | Red-flag escalation: on emergency symptoms, the agent tells the patient to call 911 in their language and creates an alert | Phone + doctor dashboard | P0 | Saying "chest pain" triggers the 911 script and a red alert on the dashboard |
| B8 | Visit prep: the day before, the app shows the question list in both languages | Patient app | P1 | Patient can show the list to the doctor |

### C. Doctor dashboard (before the visit)

| ID | Feature | Interface | Priority | Done when |
| --- | --- | --- | --- | --- |
| C1 | Patient list with next appointment and an alert badge | Doctor dashboard | P0 | Updates live when a call finishes |
| C2 | Symptom timeline: daily severity (0–10) per symptom, plus medication events, from an Elastic date aggregation | Doctor dashboard | P0 | Chart shows 7 days of seeded data plus today's live call |
| C3 | Structured history card per symptom: onset, location, duration, character, aggravating and relieving factors, timing, severity | Doctor dashboard | P0 | Every field is filled from check-ins or marked "not reported" |
| C4 | Patient quotes: the original Spanish with the English translation underneath | Doctor dashboard | P0 | Every timeline point opens its quotes |
| C5 | The patient's question list, in English | Doctor dashboard | P0 | Matches the patient app |
| C6 | Cross-language search: typing "dizziness" finds "mareado" (hybrid semantic + keyword, Jina reranked) | Doctor dashboard | P0 | Spanish results for an English query; "metformin" finds the exact drug name |
| C7 | Ask-the-record Q&A ("When did the headaches start?") via Elastic Agent Builder | Doctor dashboard | P0 | Answer cites the dated check-in quote it came from and shows "how this was found" |
| C8 | Alerts panel for red flags | Doctor dashboard | P0 | Shows symptom, quote, time, and an acknowledge button |
| C9 | Pre-visit brief card: one paragraph of trends, red flags, and open questions, generated by an Elastic Workflow | Doctor dashboard | P1 | "Generate brief" (or the daily schedule) produces a new brief on the card |

### D. The visit

| ID | Feature | Interface | Priority | Done when |
| --- | --- | --- | --- | --- |
| D1 | Record the visit to an audio file (demo: upload a pre-recorded scripted visit) | Patient app or doctor dashboard | P0 | Audio file lands in Convex storage |
| D2 | Transcribe in one batch, then Claude labels speakers (doctor, patient, interpreter) and cleans up the text | Backend | P0 | Clean transcript with speaker labels |
| D3 | Visit summary in English and the patient's language: assessment, medications (name, dose, schedule), instructions, follow-up, tests | Backend | P0 | Both versions saved |
| D4 | Question coverage: each queued question marked answered or unanswered, with a transcript quote as evidence | Backend + doctor dashboard | P1 | Unanswered questions are flagged |
| D5 | Unaddressed concerns: timeline symptoms never discussed in the visit | Backend + doctor dashboard | P1 | Flag appears after the visit |
| D6 | Doctor reviews the summary before the patient sees it | Doctor dashboard | P1 | "Release to patient" button |

### E. After the visit (patient)

| ID | Feature | Interface | Priority | Done when |
| --- | --- | --- | --- | --- |
| E1 | Visit summary screen in the patient's language, written at a plain reading level | Patient app | P0 | Spanish summary renders with medications listed first |
| E2 | Visit explainer voice agent: answers only from this visit's record by searching it; otherwise says "ask your clinic" | Phone ("Call me now") or app (P1) | P0 | A Spanish question gets an answer that matches the English transcript |
| E3 | Teach-back: the agent asks the patient to repeat the medication schedule and corrects mistakes | Phone | P1 | A wrong answer gets corrected |
| E4 | The cycle continues: unanswered questions carry over to the next visit, check-ins resume, and the timeline shows a visit marker | Patient app + doctor dashboard | P0 data model, P1 UI | A new appointment starts a new cycle without losing history |
| E5 | Caregiver gets the summary by text message | Phone | P2 | Pitch only |

### F. Applies everywhere

| ID | Rule | Priority |
| --- | --- | --- |
| F1 | Every voice agent, screen, and summary works in English and Spanish | P0 |
| F2 | After the visit, the agent answers only from retrieved passages, and the app shows which passage was used | P1 |
| F3 | Disclaimers: not medical advice, not for emergencies (call 911) | P0 |
| F4 | The patient consents to automated calls during onboarding (the TCPA requires consent) | P0 |

## System architecture

Convex is the hub: the apps, Cartesia, Claude, and Elastic all connect through it, except the live audio between Cartesia and the patient.

&#91;embedded content: System architecture · 7 components\]

**Daily check-in call**

1. A Convex cron job runs every 5 minutes and finds patients whose call time has arrived and who haven't been called today.
2. A Convex action sends `POST /agents/calls` with the patient's dynamic variables and stores a `conversations` row.
3. Cartesia calls the phone. During the call the agent may hit Convex webhook tools (red flag, add question).
4. After hang-up, Convex fetches the transcript, Claude extracts the symptoms, Convex saves them, Elastic indexes them, and only then is the conversation marked `processed`. The dashboard updates by itself: Convex queries are live, and the timeline (an Elastic action) is re-fetched whenever the patient's conversations change.

**"Call me now"** is the same flow, triggered by a button instead of the cron job.

**In-app voice (P1):** the app asks Convex for a short-lived Cartesia access token, opens the WebSocket, and streams 16-bit PCM audio. The `call_id` from `session_ready` feeds the same post-call pipeline.

**Visit:** audio is uploaded to Convex storage → transcribed in one batch → Claude cleans it, labels speakers, and writes summaries in both languages → passages are indexed in Elastic for the explainer agent.

**Pre-visit brief (P1):** the doctor clicks "Generate brief" → `elastic.generateBrief` runs the `pre-visit-brief` Elastic Workflow with the patient's open questions → the Workflow's `ai.agent` step asks the Agent Builder agent for a brief → `generateBrief` waits for the run (about 20 seconds) and saves the text as a `briefs` row, which appears on the dashboard live. No Convex HTTP route is involved: `generateBrief` runs the Workflow through Kibana's API, waits for it, and saves the result itself. If the Workflow fails, `generateBrief` calls the agent directly. A daily run later is one cron line in `crons.ts` calling `internal.elastic.generateBriefsForUpcoming`.

The two architecture diagrams exist only in the original Google Doc; this Markdown copy shows placeholders.

## Tech stack

The stack has seven layers. Convex sits in the middle, and nothing else talks to Elastic or Claude directly.

| Layer | Choice | What it does | Notes |
| --- | --- | --- | --- |
| Patient app | Expo (React Native), TypeScript, Expo Router | Profile, question queue, visit summary, "Call me now" | Expo Go is enough for P0. In-app voice (P1) needs a dev build with `react-native-audio-api`. Visit recording uses `expo-audio`. |
| Doctor dashboard | Vite + React + TypeScript, Recharts | Patient list, timeline chart, history card, alerts, search | Run locally or deploy to Vercel. Uses the Convex React client for live updates. |
| Backend | Convex | Database, live queries, cron jobs, actions that call outside APIs, HTTP endpoints for Cartesia webhooks, file storage for visit audio | Cron jobs live in `convex/crons.ts`; HTTP endpoints live in `convex/http.ts` and are served at `https://<deployment>.convex.site` ([Convex scheduling](https://docs.convex.dev/scheduling/overview)) |
| Voice | Cartesia Line managed agents (Ink speech-to-text, Sonic speech output) | Daily calls, "Call me now", visit explainer, in-app voice | Calls start with `POST /agents/calls`. In-app voice uses `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}` with a short-lived access token minted by Convex; never put the API key in the app ([Cartesia WebSocket API](https://docs.cartesia.ai/line/integrations/websocket-api.md)). |
| Language model | Claude (Anthropic API), `claude-sonnet-5-5` | Extract symptoms into JSON, translate, summarize visits, check question coverage | Called only from Convex actions. Use tool use (a JSON schema) for extraction so the output always parses. |
| Search and analytics | Elastic Cloud Serverless (Elasticsearch + Kibana) | Stores check-ins and visit passages, hybrid multilingual search, daily timeline aggregations, ask-the-record agent, pre-visit brief workflow | Jina embeddings and reranker via Elastic Inference Service; Agent Builder; Workflows. Called only from Convex actions (`"use node"`) with `@elastic/elasticsearch` and `fetch` to Kibana APIs. Details in `ELASTIC.md`. |
| Phone numbers | A Cartesia-provisioned number | Caller ID for daily calls | US only, 1 free per account |

### Repo layout

```text
/convex            schema, queries, mutations, actions, crons.ts, http.ts
/apps/mobile       Expo app (patient)
/apps/doctor       Vite + React app (doctor)
/apps/mobile/src/theme.ts + src/components/   design tokens + 6 shared components
/apps/mobile/src/voice/   in-app voice client (Track A)
/apps/doctor/src/theme.ts + src/components/
/scripts/seed.ts   6 days of demo check-ins + one appointment + a placeholder brief
/elastic/          Agent Builder agent JSON, Workflow YAML, NOTES.md (Track B)
/assets/demo-visit.m4a   scripted visit recording
SPEC.md  ELASTIC.md  CLAUDE.md  README.md
```

Both apps import the generated API from `/convex/_generated`.

### Environment variables (set in the Convex dashboard, never in the apps)

```text
CARTESIA_API_KEY
CARTESIA_CHECKIN_AGENT_ID_EN / _ES
CARTESIA_EXPLAINER_AGENT_ID_EN / _ES
CARTESIA_FROM_NUMBER_ID
CARTESIA_WEBHOOK_SECRET       shared secret checked on every webhook
ANTHROPIC_API_KEY
ELASTIC_URL                   Serverless Elasticsearch endpoint (Serverless has no Cloud ID)
ELASTIC_API_KEY
KIBANA_URL                    Agent Builder and Workflows APIs
ELASTIC_INDEX_PREFIX          per deployment: a_, b_, prod_
DEMO_PHONE                    optional default phone for the seed
```

The apps only need `EXPO_PUBLIC_CONVEX_URL` and `VITE_CONVEX_URL`.

## Data model

Convex holds nine tables. Elastic holds two indices that copy what search and charts need. Every record carries `patientId` and `appointmentId`, so one patient can have many visit cycles.

### Convex schema (`convex/schema.ts`)

```ts
patients: defineTable({
  name: v.string(),
  phone: v.string(),                 // E.164, e.g. +15025550123
  language: v.union(v.literal("en"), v.literal("es")),
  callTimeLocal: v.string(),         // "18:30"
  timezone: v.string(),              // "America/Los_Angeles"
  consentCalls: v.boolean(),
  reasonForVisit: v.string(),
}),

appointments: defineTable({
  patientId: v.id("patients"),
  doctorName: v.string(),
  scheduledAt: v.number(),           // ms since epoch
  status: v.union(v.literal("upcoming"), v.literal("completed")),
}).index("by_patient", ["patientId"]),

conversations: defineTable({         // one row per Cartesia call, phone or app
  patientId: v.id("patients"),
  appointmentId: v.id("appointments"),
  channel: v.union(v.literal("phone"), v.literal("app")),
  mode: v.union(v.literal("checkin"), v.literal("explainer")),
  cartesiaCallId: v.optional(v.string()),
  status: v.union(v.literal("dialing"), v.literal("in_progress"), v.literal("ended"),
                  v.literal("processed"), v.literal("failed")),
  language: v.string(),
  transcript: v.optional(v.array(v.object({ role: v.string(), text: v.string() }))),
  summaryEnglish: v.optional(v.string()),
  startedAt: v.number(),
}).index("by_patient", ["patientId"]).index("by_call", ["cartesiaCallId"]),

symptomEntries: defineTable({
  patientId: v.id("patients"),
  appointmentId: v.id("appointments"),
  conversationId: v.id("conversations"),
  date: v.string(),                  // "2026-10-24"
  symptom: v.string(),               // normalized English key: "dizziness"
  symptomOriginal: v.string(),       // "mareo"
  severity: v.optional(v.number()),  // 0-10
  change: v.optional(v.string()),    // new | better | worse | same
  onset: v.optional(v.string()), location: v.optional(v.string()),
  duration: v.optional(v.string()), character: v.optional(v.string()),
  aggravating: v.optional(v.string()), relieving: v.optional(v.string()),
  timing: v.optional(v.string()),
  quoteOriginal: v.string(),
  quoteEnglish: v.string(),
}).index("by_patient_date", ["patientId", "date"]),

medicationEvents: defineTable({
  patientId: v.id("patients"), conversationId: v.id("conversations"),
  date: v.string(), medication: v.string(),
  action: v.string(),                // started | stopped | taken | missed
  note: v.optional(v.string()),
}).index("by_patient", ["patientId"]),

questions: defineTable({
  patientId: v.id("patients"), appointmentId: v.id("appointments"),
  textOriginal: v.string(), textEnglish: v.string(),
  source: v.union(v.literal("typed"), v.literal("voice")),
  status: v.union(v.literal("open"), v.literal("answered"), v.literal("carried_over")),
  order: v.number(),
  answerEvidence: v.optional(v.string()),
}).index("by_appointment", ["appointmentId"]),

alerts: defineTable({
  patientId: v.id("patients"), conversationId: v.optional(v.id("conversations")),
  symptom: v.string(), quote: v.string(),
  createdAt: v.number(), acknowledged: v.boolean(),
}).index("by_patient", ["patientId"]),

visits: defineTable({
  appointmentId: v.id("appointments"),
  audioStorageId: v.optional(v.id("_storage")),
  transcript: v.optional(v.array(v.object({
    speaker: v.string(), textEnglish: v.string(), textPatientLang: v.string() }))),
  summaryEnglish: v.optional(v.any()),       // VisitSummary JSON, see Voice agent design
  summaryPatientLang: v.optional(v.any()),
  releasedToPatient: v.boolean(),
  status: v.string(),                        // uploaded | transcribed | summarized
}).index("by_appointment", ["appointmentId"]),

briefs: defineTable({                // C9, written by elastic.generateBrief
  patientId: v.id("patients"),
  appointmentId: v.id("appointments"),
  textEnglish: v.string(),
  createdAt: v.number(),
  source: v.union(v.literal("elastic_workflow"), v.literal("fallback"), v.literal("seed")),
}).index("by_appointment", ["appointmentId"]),
```

### Elastic indices

Mappings below are the shape; `ELASTIC.md` section 5 adds the explicit Jina `inference_id` on each `semantic_text` field. Documents use the Convex `symptomEntryId` as `_id`, so re-indexing is idempotent. Index names carry `ELASTIC_INDEX_PREFIX`.

`checkins`: one document per symptom entry. It powers the timeline chart and cross-language search.

```json
PUT checkins
{ "mappings": { "properties": {
  "patient_id": { "type": "keyword" },
  "appointment_id": { "type": "keyword" },
  "conversation_id": { "type": "keyword" },
  "date": { "type": "date" },
  "symptom": { "type": "keyword" },
  "severity": { "type": "integer" },
  "change": { "type": "keyword" },
  "language": { "type": "keyword" },
  "quote_original": { "type": "text", "copy_to": "quote_semantic" },
  "quote_english": { "type": "text" },
  "quote_semantic": { "type": "semantic_text" }
}}}
```

`visit_chunks`: the visit transcript split into passages of 2 to 4 turns. The explainer agent searches it.

```json
PUT visit_chunks
{ "mappings": { "properties": {
  "patient_id": { "type": "keyword" },
  "appointment_id": { "type": "keyword" },
  "chunk_index": { "type": "integer" },
  "speakers": { "type": "keyword" },
  "text_english": { "type": "text", "copy_to": "content" },
  "text_patient_lang": { "type": "text" },
  "content": { "type": "semantic_text" }
}}}
```

Check that `copy_to` into a `semantic_text` field works on your Elastic version. If it does not, write the same string to the `semantic_text` field directly.

### The Elastic queries

1. **Timeline (C2):** filter on `patient_id` and the last 14 days; group by `symptom` (terms aggregation), then by day (`date_histogram`, `calendar_interval: day`), taking the `max` of `severity`. Days with no report are `null`, not 0.
2. **Cross-language search (C6):** hybrid search, an RRF retriever over a `semantic` query on `quote_semantic` and a keyword `multi_match` on `quote_original` and `quote_english`, filtered by `patient_id`, then reranked with the Jina reranker. Semantic catches "dizziness" → "mareado"; keyword catches exact drug names and doses.
3. **Visit passages (E2):** the same hybrid pattern on `visit_chunks`, filtered by `appointment_id`, top 3. It runs during a live call, so the reranker is dropped here if it's too slow.
4. **Ask the record (C7):** Agent Builder's `patient-record-agent` with ES|QL tools that require `?patient_id`, so it can only read one patient.

## Voice agent design

There are two agent roles, each in an English and a Spanish version: four Cartesia managed agents in total. The agents only talk; Convex and Claude do the record-keeping after each call.

### Agents

| Agent | Used for | Dynamic variables passed per call | Webhook tools |
| --- | --- | --- | --- |
| `checkin-en` / `checkin-es` | Daily calls, "Call me now" before a visit, in-app voice before a visit | `patient_id`, `patient_name`, `reason_for_visit`, `last_checkin_summary`, `active_symptoms`, `days_until_visit` | `report_red_flag`, `add_question` |
| `explainer-en` / `explainer-es` | "Call me now" and in-app voice after a visit | `patient_id`, `appointment_id`, `patient_name`, `visit_summary_short`, `medications` | `search_visit`, `report_red_flag` |

If one agent can switch its speech-to-text and voice language per call, drop to two agents and pass `language` as a variable instead. Check this in the Cartesia playground first.

Dynamic variables go in `outbound_calls[].dynamic_variables` for phone calls, and in `session_create` (sent by Convex) for WebSocket sessions ([Cartesia dynamic variables](https://docs.cartesia.ai/agents/dynamic-variables.md)). In the agent's language-model settings, pick Claude if it is offered; either way, Claude does all extraction after the call.

### Webhook tools (Convex HTTP endpoints)

Every request carries the header `x-webhook-secret: $CARTESIA_WEBHOOK_SECRET`, and Convex rejects anything without it.

| Path | Body | Returns | Effect |
| --- | --- | --- | --- |
| `POST /cartesia/red-flag` | `patient_id`, `symptom`, `quote` | `ok` | Creates an `alerts` row; the doctor dashboard shows it live |
| `POST /cartesia/add-question` | `patient_id`, `question` | `ok` | Adds an open question tagged `voice` (post-call extraction also catches questions, so this is a backup) |
| `POST /cartesia/search-visit` | `patient_id`, `appointment_id`, `query` | Top 3 passages, each in English and the patient's language | Elastic semantic search on `visit_chunks` |

### After every call

1. When Convex starts a call, it stores a `conversations` row with the returned `agent_call_id` and status `dialing`.
2. A scheduled Convex action calls Cartesia's Get Call endpoint every 15 seconds until the call has ended (confirm the status field name in the API reference). If Cartesia offers a call-ended webhook in the agent settings, use that instead of polling.
3. Fetch the transcript and send it to Claude with the extraction tool below.
4. Write `symptomEntries`, `medicationEvents`, and `questions` to Convex.
5. Index each symptom entry in Elastic's `checkins` index (`internal.elastic.indexCheckin`, awaited).
6. Then mark the conversation `processed`. This order matters: the dashboard re-fetches the timeline when the status changes, and the new point must already be in Elastic.

### Extraction tool (Claude tool use)

```json
{
  "name": "record_checkin",
  "input_schema": { "type": "object", "properties": {
    "summary_english": { "type": "string" },
    "symptoms": { "type": "array", "items": { "type": "object", "properties": {
      "symptom": { "type": "string", "description": "normalized English, lowercase, e.g. dizziness" },
      "symptom_original": { "type": "string" },
      "severity": { "type": ["integer", "null"], "minimum": 0, "maximum": 10 },
      "change": { "enum": ["new", "better", "worse", "same", null] },
      "onset": { "type": ["string", "null"] }, "location": { "type": ["string", "null"] },
      "duration": { "type": ["string", "null"] }, "character": { "type": ["string", "null"] },
      "aggravating": { "type": ["string", "null"] }, "relieving": { "type": ["string", "null"] },
      "timing": { "type": ["string", "null"] },
      "quote_original": { "type": "string" }, "quote_english": { "type": "string" }
    }, "required": ["symptom", "symptom_original", "quote_original", "quote_english"] } },
    "medications": { "type": "array", "items": { "type": "object", "properties": {
      "medication": { "type": "string" }, "action": { "enum": ["started", "stopped", "taken", "missed"] },
      "note": { "type": ["string", "null"] } }, "required": ["medication", "action"] } },
    "questions_for_doctor": { "type": "array", "items": { "type": "object", "properties": {
      "text_original": { "type": "string" }, "text_english": { "type": "string" } } } }
  }, "required": ["summary_english", "symptoms", "medications", "questions_for_doctor"] }
}
```

Extraction rule for Claude: only record what the patient said. Never infer a severity number they did not give.

### Check-in agent prompt (draft)

```text
You are a friendly health check-in assistant calling {{patient_name}}. Speak only
{{language}} unless the patient switches language; then follow them.
The patient has a doctor visit in {{days_until_visit}} days for: {{reason_for_visit}}.
Last check-in: {{last_checkin_summary}}. Active symptoms: {{active_symptoms}}.

Keep the call under 2 minutes. Ask one short question at a time:
1. How are you feeling today compared to yesterday?
2. For each active symptom: better, worse, or the same? How bad, 0 to 10?
3. Anything new? If yes, when did it start, where, and what makes it better or worse?
4. Did you take your medicines today? Did you check your sugar, and what was the number?
5. Is there anything you want to ask the doctor? (Repeat the question back to confirm.)
Then thank them and say you'll call tomorrow.

Never diagnose, never give medical advice, never recommend medicine.
RED FLAGS: if the patient mentions chest pain or pressure, trouble breathing,
face drooping, arm weakness, slurred speech, fainting, severe bleeding,
confusion or trouble staying awake (possible very low blood sugar), or
thoughts of harming themselves: call report_red_flag, then tell them clearly to
hang up and call 911 now (for thoughts of self-harm: call or text 988), and end the call.
```

### Explainer agent prompt (draft)

```text
You help {{patient_name}} understand their doctor visit. Speak only {{language}}.
Visit summary: {{visit_summary_short}}. Medications: {{medications}}.

Before answering any question about the visit, call search_visit with the question.
Answer ONLY from the passages it returns and the summary above. If the answer is
not there, say: "I don't see that in your visit. Please call your clinic to ask."
Use simple words. After explaining medications, ask the patient to say back when
they will take each one, and gently correct mistakes.
Never add medical advice beyond what the doctor said. Same red-flag rules as check-ins.
```

### Visit summary JSON (D3)

```json
{ "assessment": "string", "medications": [{ "name": "", "dose": "", "schedule": "", "purpose": "" }],
  "instructions": ["string"], "tests_ordered": ["string"], "follow_up": "string",
  "warning_signs": ["string"] }
```

Claude generates it in English, then a second pass writes the patient-language version at a plain reading level. Medications come first on the patient screen.

## Team workflow

Two developers each run their own Claude Code on one repo, split by file ownership. Before either starts, one of them writes a shared contract (schema plus stub functions). Merge conflicts come from two agents editing the same file; this split makes that rare, and the contract keeps the two halves matching.

### Who owns what

| Track | Person | Owns these files | Features |
| --- | --- | --- | --- |
| A: Voice + AI pipeline | Dev A | `convex/cartesia.ts`, `convex/calls.ts`, `convex/crons.ts`, `convex/pipeline.ts`, `convex/http.ts`, `convex/visits.ts`, `convex/claude.ts`, `apps/mobile/src/voice/*`, Cartesia agent configs | B1–B3, B4 voice client, B7, D1–D5 processing, E2, E3 |
| B: Data + apps | Dev B | `convex/elastic.ts`, `convex/briefs.ts`, `convex/patients.ts`, `convex/questions.ts`, `convex/alerts.ts`, `convex/appointments.ts`, `/elastic/*`, `apps/doctor/*`, `apps/mobile/*` (except `src/voice`), both `theme.ts` files | A1–A3, B5, B6, B8, C1–C9 (all Elastic work, see `ELASTIC.md`), E1, E4 UI, applying designs |
| Design | Designer | Figma file | Every screen in the Design integration section |
| Shared | Dev A approves changes | `convex/schema.ts`, `convex/seed.ts`, `scripts/seed.ts`, root `package.json`, `SPEC.md`, `ELASTIC.md`, `CLAUDE.md` | — |

The two tracks touch in only a few functions. The contract defines them on day one, so neither side waits for the other (`CLAUDE.md` has the full list):

| Function | Owner | Called by | Purpose |
| --- | --- | --- | --- |
| `internal.elastic.indexCheckin` | B | A's pipeline | Index one symptom entry |
| `internal.elastic.indexVisitChunks` | B | A's visit processing | Index visit passages |
| `internal.elastic.searchVisit` | B | A's `/cartesia/search-visit` | Top 3 visit passages |
| `api.calls.triggerNow` | A | B's "Call me now" button | Start a call right away |
| `api.calls.getAccessToken` | A | A's voice client in the app | Short-lived Cartesia token |

### Step 1: write the contract (Dev A, Sat 3–4:30 AM)

Dev A's Claude Code writes, and pushes to `main`:

1. The repo scaffold from the Tech stack section, as an npm workspace so each app has its own `package.json`.
2. The full `convex/schema.ts` from the Data model section.
3. Every file in the ownership table, with each exported function stubbed: real argument and return validators, fake return values.
4. `scripts/seed.ts`, so Dev B has data for screens from the first hour.
5. `CLAUDE.md` containing the ownership table and the rules below.

Dev B reviews the stubs before writing any code. A disagreement about a function's shape gets settled now, not at the first merge.

### Rules for both Claude Code sessions (put these in `CLAUDE.md`)

- Start every session with: "I am Track A" or "I am Track B". Only edit files your track owns.
- Need a schema change or a new cross-track function? Stop and tell your human. They agree with the other dev in chat, then Dev A makes the change on `main` in its own small commit.
- Never hand-merge `convex/_generated/`. On a conflict there, take either side and run `npx convex dev --once` to regenerate it.
- Lockfile conflict: take `main`'s version, then run `npm install`.

### Git

- Branches: `a/<feature>` and `b/<feature>`.
- Merge to `main` at least every 2 hours, and always at the four merge points in the Build plan.
- Pull `main` before giving Claude Code a new task.

### Keeping two backends from colliding

- **Convex:** each team member gets their own dev deployment when they run `npx convex dev`, plus one shared production deployment ([Convex](https://docs.convex.dev/production/overview)). Develop on your own; at each merge point, one person runs `npx convex deploy` from `main`. Set API keys as project default environment variables so both dev deployments get them.
- **Elastic:** one Serverless project, but each deployment writes to its own index names via `ELASTIC_INDEX_PREFIX` (`a_`, `b_`, `prod_`). Reseeding a deployment reindexes its prefix from Convex (`elastic.reindexAll`), so it never leaves duplicates.
- **Cartesia:** webhook tool URLs can only point at one backend. During the day they point at Dev A's dev deployment (`https://<a-dev>.convex.site`); switch them to production at the noon merge. Dev B builds against seed data and doesn't need live calls.

### Why two tracks instead of one agent

One agent working through the whole plan is safer but serial. Every phase waits on one person to test calls, review code, and restart the agent. The two tracks are mostly independent: the voice pipeline barely touches the UI. Splitting roughly halves the wall-clock time, and the contract plus file ownership keeps the merge risk small. Don't go beyond two coding tracks; a third agent would collide with these two.

## Design integration

Build the backend and plain, unstyled screens first, then apply the designs in one pass between 6 PM and midnight Saturday. The screens are built from a small shared component set that reads every color and font from one `theme.ts`, so most of the restyle happens in a few files instead of every screen.

### How the code is set up to receive the design

- Each app has one `theme.ts` (colors, type sizes, spacing, corner radius) and about six components: `Screen`, `Card`, `Button`, `Text`, `Badge`, `ListItem`. Screens use only these; no inline colors.
- Applying the design happens in three steps:
  1. Copy the designer's Figma variables into `theme.ts`.
  2. Restyle the six components.
  3. Adjust layouts screen by screen.
- Claude Code reads the Figma file through Figma's MCP server ([Figma](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)). In Claude Code, run `claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp` for the desktop app, or point it at the remote server `https://mcp.figma.com/mcp`.
- The MCP server needs a paid Figma plan with a Dev or Full seat. If the designer doesn't have one, he exports each frame as a PNG and Dev B gives the images to Claude Code with the exact values from Figma's Inspect panel.

### Screen inventory (designer builds these)

Design only data that exists. Each screen lists the fields the backend provides.

| # | Screen | App | Shows | Priority | Delivery |
| --- | --- | --- | --- | --- | --- |
| 1 | Doctor patient view (the hero screen) | Doctor web | 14-day severity chart per symptom (days with no report shown as gaps), medication markers, history card per symptom (onset, location, duration, character, aggravating, relieving, timing, severity), quotes in Spanish with English, question list, red-flag alert banner, search box, "Ask the record" box (answer, cited dated quotes, expandable "how this was found" steps), pre-visit brief card with "Generate brief" button (P1) | P0 | 1 |
| 2 | Patient home | Mobile | Next visit countdown, "Call me now" button, today's check-in done or pending, last check-in summary | P0 | 1 |
| 3 | Visit summary | Mobile | Medications first (name, dose, schedule, purpose), instructions, follow-up, warning signs, "Talk about my visit" button | P0 | 1 |
| 4 | Question queue | Mobile | List with source tag (typed or voice), add, edit, reorder, delete | P0 | 2 |
| 5 | Onboarding and profile | Mobile | Name, phone, language, daily call time, consent to calls, reason for visit | P0 | 2 |
| 6 | Patient list | Doctor web | Name, next appointment, alert badge | P0 | 2 |
| 7 | Visit view | Doctor web | Transcript with speaker labels, summary, question coverage, "Release to patient" button | P1 | 2 |
| 8 | Search results | Doctor web | Matching quotes with date, symptom, original language and English, ranked | P0 | 2 |
| 9 | Check-in history | Mobile | Date, symptoms, severity per call | P1 | 2 |
| 10 | In-app voice call | Mobile | Speaking or listening state, end button, live captions | P1 | 2 |

### Delivery schedule

| Delivery | Due | Contents |
| --- | --- | --- |
| 0 | Sat 9 AM | Rough wireframes for screens 1–3, shared in team chat so devs can match the layout |
| 1 | Sat 1 PM | Design tokens as Figma variables (colors, type, spacing, radius), and final screens 1–3 |
| 2 | Sat 6 PM | Screens 4–10, plus empty, loading, and error states |
| Freeze | Sat midnight | Only fixes after this |

### Notes for the designer

- **Older users:** body text at least 18 pt on mobile, tap targets at least 44 pt, high contrast, one main action per screen.
- **Two languages:** check every mobile screen with Spanish text, which usually runs longer than English. Leave room in buttons and headers.
- **Safety:** "Not for emergencies, call 911" appears on the patient home and the visit summary.
- **Figma sponsor track:** the hacker guide lists a Figma track (Amazon gift cards plus a session with Figma's early-career recruiting team) with a criteria doc, and Figma runs a workshop. The designer should read the criteria early; this project can enter it.

## Build plan

Dev A builds the voice pipeline, Dev B builds data and screens, and the designer delivers in two batches. The call-to-chart spine must work on production by the noon merge.

&#91;embedded content: Build plan · 3 people, 6 time blocks, 4 checkpoints\]

If the spine slips past noon, cut P1 items, never P0. At each merge, both devs merge to `main`, one runs `npx convex deploy`, and the team runs the demo path once on production.

### Contract + setup (Sat 3–5 AM)

- [ ] Dev A: Claude Code writes the contract (Team workflow, step 1) and pushes it to `main` by 4:30 AM
- [ ] Dev A: Cartesia API key, provision 1 number, create the 4 agents, test one call from the playground
- [ ] Dev B: Elastic Cloud Serverless project (ela.st/calhacks), API key, Kibana URL; accept the Convex team invite, Anthropic key; set project default environment variables
- [ ] Dev B: review the contract stubs, then run `npx convex dev` on your own dev deployment
- [ ] Designer: read the Functional spec and the screen inventory

```text
Dev A prompt: Read SPEC.md, especially Team workflow and Data model. Write the contract:
the npm-workspace scaffold, the full schema, every file in the ownership table with stubbed
exports (real validators, fake returns), scripts/seed.ts, and CLAUDE.md with the ownership
table and rules. Don't implement features.
```

### Track A: voice + AI pipeline (Dev A)

- [ ] **5 AM–12 PM, the spine:** `startCheckinCall`, the cron job, `triggerNow`, Get Call polling, Claude `record_checkin` extraction, mutations, an awaited call to `internal.elastic.indexCheckin` *before* marking the conversation `processed`, and the red-flag and add-question webhooks
- [ ] **12–6 PM:** visit processing: upload, batch transcription, Claude cleanup and speaker labels, summaries in both languages, `indexVisitChunks`; the `/cartesia/search-visit` webhook; explainer agents
- [ ] **6 PM–12 AM:** teach-back (E3), question coverage (D4), unaddressed concerns (D5), `getAccessToken`
- [ ] **12–6 AM:** in-app voice (B4): dev build, `react-native-audio-api`, WebSocket session in `apps/mobile/src/voice`

```text
Track A prompt: I am Track A. Read SPEC.md: Key decisions, Data model, Voice agent design,
Team workflow. Implement the check-in pipeline: startCheckinCall, the cron job, triggerNow,
post-call polling, Claude tool-use extraction (record_checkin), the mutations, and the red-flag
and add-question HTTP endpoints. Call internal.elastic.indexCheckin as stubbed; don't edit
Track B files. Add a script that calls DEMO_PHONE and logs each pipeline stage.
```

### Track B: data + apps (Dev B)

- [ ] **5 AM–12 PM:** `ELASTIC.md` tasks 1–3 (indices with Jina, `indexCheckin`, `reindexAll`, timeline, hybrid search, `searchVisit`); app queries and mutations; the unstyled doctor dashboard (C1–C6, C8) on seed data
- [ ] **12–6 PM:** the shared component set and `theme.ts`; unstyled patient app (A1–A3, B3 button, B6, E1); `ELASTIC.md` task 4 (Agent Builder, C7)
- [ ] **6 PM–12 AM:** apply the designs (Design integration); the doctor visit view (D6); `ELASTIC.md` task 5 (Workflow, C9)
- [ ] **12–6 AM:** empty and loading states, Spanish review by a fluent speaker, P1 screens

```text
Track B prompt: I am Track B. Read SPEC.md (Data model, Functional spec, Team workflow,
Design integration) and ELASTIC.md. Do ELASTIC.md task <n>, then the doctor dashboard
(C1–C6, C8) in apps/doctor using only the shared components and theme.ts. Use seed data.
Don't edit Track A files.
```

```text
Design prompt (Track B, after delivery 1): Using the Figma MCP server, read the design
variables and copy them into theme.ts for both apps. Restyle the shared components to
match. Then rebuild screens 1–3 from the screen inventory to match their Figma frames.
Keep all data wiring unchanged.
```

### Ship (Sun 6–9 AM, whole team)

- [ ] Rehearse the demo script 3 times with a real call
- [ ] Record a backup demo video in case the live call fails
- [ ] README: setup, Cartesia features used, known limitations, what is seeded (required by the Cartesia track)
- [ ] Scan the repo for API keys before making it public
- [ ] Final Devpost submission with all teammates added, before 9:00 AM

## Demo, sponsor tracks, and open questions

The demo runs in two minutes and opens with the phone ringing. Six days of check-ins are seeded; say so to the judges.

### Demo script (2 minutes)

1. **0:00** One sentence on the problem: patients forget when symptoms started, and language makes it worse.
2. **0:10** Tap "Call me now". A teammate's phone rings. The agent asks in Spanish how the shaky, dizzy spells are compared to yesterday and what her sugar was, and the teammate answers, including a question for the doctor.
3. **0:45** Doctor dashboard: today's point appears live on the 7-day timeline, with the Spanish quote and its English translation, the structured history card, and the new question in the list.
4. **1:05** The Elastic moment: type "dizziness" in search and Spanish check-ins come back, reranked. Ask the record "When did the dizziness start, and is it getting worse?"; the answer cites dated quotes. Point to the pre-visit brief card. "All on Elastic Cloud Serverless."
5. **1:25** Play 15 seconds of the scripted visit, then show the Spanish summary on the patient app, medications first.
6. **1:35** Call the explainer: "¿Cuándo tomo la pastilla nueva?" It answers from the visit and asks the patient to repeat the schedule back (teach-back).
7. **1:50** Close: what's real, what's seeded, and the red-flag safety rule.

### Sponsor tracks

| Track | What we show | Their criteria we hit |
| --- | --- | --- |
| Best Use of Cartesia | Outbound daily calls, managed agents in two languages, webhook tools, in-app WebSocket voice (P1) | Voice is core; accessibility and privacy considered. They require a working demo, a 2-minute demo-first presentation, a README listing the Cartesia features used and known limitations, and no API keys in the repo. |
| Elastic ("Find the Signal") | Hybrid multilingual search with Jina embeddings and reranker, timeline date aggregations, grounded passages for the explainer, Agent Builder ask-the-record, Workflow pre-visit brief, all on Serverless | From the booth sign: depth and creativity of the Elasticsearch implementation; Jina models for embeddings; Agent Builder and Workflows; Elastic Cloud Serverless |
| Convex | Live dashboard updates, cron jobs for calls, HTTP webhooks, file storage | Track criteria not published in the guide |
| Anthropic | Named community; Claude extracts, translates, summarizes; known failure points (hallucinated doses) handled by grounding and red flags | Named community, real problem, it works, thoughtful use of Claude |
| Microsoft: Built for the Real World | Healthcare agent with a path to production (EHR, BAA vendors, human interpreters) | Customer understanding, measurable usefulness, path to production, responsible design, end to end |
| Cal Hacks Best People-First Hack | The whole project | — |
| Figma | Designer's Figma file, built into the app through the Figma MCP server | Criteria are in the doc linked from the hacker guide; the designer reads them first |

Check Devpost for a limit on how many tracks one project can enter.

### Open questions (answer these first thing)

- [ ] Does someone on the team have a Mac with Xcode, or an Android phone, for the P1 dev build?
- [ ] Can one Cartesia agent switch language per call, or do we need separate English and Spanish agents?
- [ ] Does the Cartesia agent config let us choose Claude as the conversation model?
- [ ] Does Cartesia send a call-ended webhook, or do we poll Get Call?
- [ ] Which Cartesia endpoint handles batch transcription of a recorded file, and does it accept Spanish and mixed-language audio?
- [ ] Whose US phone number receives the demo calls?
- [x] Elastic: Cloud Serverless via ela.st/calhacks. Remaining checks (Jina endpoint IDs, Workflows enabled, `copy_to` into `semantic_text`) are in `ELASTIC.md` section 3.
- [ ] Does Cartesia batch transcription handle a mixed-language file (English doctor, Spanish patient)? If not, re-record with an interpreter so each turn is in one language.
- [ ] Who records the scripted visit audio (doctor in English, patient in Spanish)? Script it on the seed story: the endocrinologist lowers glipizide to 2.5 mg with breakfast, says not to skip meals, explains what to do when sugar is under 70, keeps metformin 500 mg twice a day, and orders an A1c and a foot exam.
- [ ] Does the designer have a Figma Dev or Full seat (needed for the Figma MCP server)?
- [ ] Is the contract merged to `main` before either track starts?

### Sources

- [Cartesia: Outbound calling](https://docs.cartesia.ai/line/integrations/telephony/outbound-dialing.md)
- [Cartesia: WebSocket API](https://docs.cartesia.ai/line/integrations/websocket-api.md)
- [Cartesia: Phone numbers](https://docs.cartesia.ai/line/integrations/telephony/cartesia-numbers)
- [Cartesia: Integrations overview and pricing](https://docs.cartesia.ai/line/integrations/overview.md)
- [Cartesia: Dynamic variables](https://docs.cartesia.ai/agents/dynamic-variables.md)
- [Convex: Scheduling](https://docs.convex.dev/scheduling/overview)
- [Elastic: Multilingual semantic search by default](https://www.elastic.co/search-labs/kr/author/ranjana-devaji)
- [Smallest.ai: React Native voice streaming needs a dev build](https://docs.smallest.ai/voice-agents/platform/agent-sdk/mobile-integrations/react-native.md)
- Cal Hacks 13.0 Hacker Guide (sponsor track criteria)
