# Patient Companion – Product Spec & Tech Stack

Oct 24, 2026 · @Caden

## Overview

We are building a bilingual (English and Spanish) voice companion. It checks in on patients by phone every day, turns those calls into a symptom timeline the doctor reads before the visit, and explains the visit afterward in the patient's language.

- **Who it serves:** Spanish-speaking older adults waiting weeks for a specialist appointment. Name this community in the pitch; the Anthropic track rewards a specific community.
- **Two interfaces:** a patient mobile app (Expo) plus daily phone calls, and a doctor web dashboard.
- **The cycle:** before the visit (check-ins, questions) → the visit (recording, summary) → after the visit (explanation, follow-ups) → the next visit. Check-ins and the question queue keep running after every visit.

**How to use this doc with Claude Code**

1. Export this doc as Markdown and save it in the repo root as `SPEC.md`.
2. Add a `CLAUDE.md` that says: "Read SPEC.md before every task. Build only the phase you are asked for. Ask before changing the data model or the stack."
3. Build one phase at a time from the Build plan section. Each phase has a ready-to-paste prompt.
4. Priority labels used throughout: **P0** = must work live in the demo. **P1** = build once P0 works. **P2** = mention in the pitch only.

## Key decisions

These eight decisions set the stack. Several of them correct earlier assumptions.

1. **Elastic does not translate; Claude does.** Claude translates every check-in and visit into English and the patient's language. Elastic stores both versions, searches across languages, and computes the timeline. Its `semantic_text` field now defaults to a multilingual embedding model, so an English query finds Spanish text ([Elastic](https://www.elastic.co/search-labs/kr/author/ranjana-devaji)).
2. **One pipeline for every conversation.** Every conversation, phone call or in-app, ends with a Cartesia `call_id`. Convex then:
   1. fetches the transcript from Cartesia's Get Call endpoint,
   2. has Claude extract structured symptoms and questions,
   3. writes the result to Convex,
   4. indexes it in Elastic.

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
| C6 | Cross-language search: typing "dizziness" finds "mareado" | Doctor dashboard | P1 | Spanish results for an English query |
| C7 | Ask-the-record Q&A ("When did the headaches start?") | Doctor dashboard | P2 | Answer cites the check-in it came from |
| C8 | Alerts panel for red flags | Doctor dashboard | P0 | Shows symptom, quote, time, and an acknowledge button |

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
4. After hang-up, Convex fetches the transcript, Claude extracts the symptoms, Convex saves them, and Elastic indexes them. The dashboard updates by itself.

**"Call me now"** is the same flow, triggered by a button instead of the cron job.

**In-app voice (P1):** the app asks Convex for a short-lived Cartesia access token, opens the WebSocket, and streams 16-bit PCM audio. The `call_id` from `session_ready` feeds the same post-call pipeline.

**Visit:** audio is uploaded to Convex storage → transcribed in one batch → Claude cleans it, labels speakers, and writes summaries in both languages → passages are indexed in Elastic for the explainer agent.

## Tech stack

The stack has seven layers. Convex sits in the middle, and nothing else talks to Elastic or Claude directly.

| Layer | Choice | What it does | Notes |
| --- | --- | --- | --- |
| Patient app | Expo (React Native), TypeScript, Expo Router | Profile, question queue, visit summary, "Call me now" | Expo Go is enough for P0. In-app voice (P1) needs a dev build with `react-native-audio-api`. Visit recording uses `expo-audio`. |
| Doctor dashboard | Vite + React + TypeScript, Recharts | Patient list, timeline chart, history card, alerts, search | Run locally or deploy to Vercel. Uses the Convex React client for live updates. |
| Backend | Convex | Database, live queries, cron jobs, actions that call outside APIs, HTTP endpoints for Cartesia webhooks, file storage for visit audio | Cron jobs live in `convex/crons.ts`; HTTP endpoints live in `convex/http.ts` and are served at `https://<deployment>.convex.site` ([Convex scheduling](https://docs.convex.dev/scheduling/overview)) |
| Voice | Cartesia Line managed agents (Ink speech-to-text, Sonic speech output) | Daily calls, "Call me now", visit explainer, in-app voice | Calls start with `POST /agents/calls`. In-app voice uses `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}` with a short-lived access token minted by Convex; never put the API key in the app ([Cartesia WebSocket API](https://docs.cartesia.ai/line/integrations/websocket-api.md)). |
| Language model | Claude (Anthropic API), `claude-sonnet-5-5` | Extract symptoms into JSON, translate, summarize visits, check question coverage | Called only from Convex actions. Use tool use (a JSON schema) for extraction so the output always parses. |
| Search and analytics | Elastic Cloud (Elasticsearch) | Stores check-ins and visit passages, multilingual search, daily timeline aggregations | Called from Convex actions (`"use node"`) with `@elastic/elasticsearch`. Agent Builder is P2. |
| Phone numbers | A Cartesia-provisioned number | Caller ID for daily calls | US only, 1 free per account |

### Repo layout

```text
/convex            schema, queries, mutations, actions, crons.ts, http.ts
/apps/mobile       Expo app (patient)
/apps/doctor       Vite + React app (doctor)
/scripts/seed.ts   7 days of demo check-ins + one appointment
/assets/demo-visit.m4a   scripted visit recording
SPEC.md  CLAUDE.md  README.md
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
ELASTIC_CLOUD_ID   ELASTIC_API_KEY
```

The apps only need `EXPO_PUBLIC_CONVEX_URL` and `VITE_CONVEX_URL`.

## Data model

Convex holds eight tables. Elastic holds two indices that copy what search and charts need. Every record carries `patientId` and `appointmentId`, so one patient can have many visit cycles.

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
```

### Elastic indices

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

### The three Elastic queries

1. **Timeline (C2):** filter on `patient_id` and the last 14 days; group by `symptom` (terms aggregation), then by day (`date_histogram`, `calendar_interval: day`), taking the `max` of `severity`.
2. **Cross-language search (C6):** a `semantic` query on `quote_semantic`, filtered by `patient_id`.
3. **Visit passages (E2):** a `semantic` query on `content`, filtered by `appointment_id`, returning the top 3 passages.

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
4. Write `symptomEntries`, `medicationEvents`, and `questions` to Convex, and mark the conversation `processed`.
5. Index each symptom entry in Elastic's `checkins` index.

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
4. Did you take any medicine for it?
5. Is there anything you want to ask the doctor? (Repeat the question back to confirm.)
Then thank them and say you'll call tomorrow.

Never diagnose, never give medical advice, never recommend medicine.
RED FLAGS: if the patient mentions chest pain or pressure, trouble breathing,
face drooping, arm weakness, slurred speech, fainting, severe bleeding, or
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

## Build plan

The phone-call-to-timeline spine must work by noon Saturday. Everything after it is features hung on that spine.

&#91;embedded content: Build phases · 6 phases, 3 gates\]

If the spine slips past noon, cut P1 items, not P0. The hacker guide recommends a first Devpost draft on Saturday night.

### Phase 0: Setup (Sat 3–5 AM)

- [ ] Cartesia: API key, provision 1 phone number, create `checkin-en`, `checkin-es`, `explainer-en`, `explainer-es` in the playground, and test one call from the playground
- [ ] Elastic Cloud deployment and API key; create both indices from the Data model section
- [ ] Convex project (`npx convex dev`); set all environment variables
- [ ] Anthropic API key
- [ ] Repo scaffold with `SPEC.md` and `CLAUDE.md`

```text
Prompt: Read SPEC.md. Scaffold the monorepo from the Repo layout section: Convex at the root,
an Expo Router app in /apps/mobile, a Vite React TS app in /apps/doctor. Add the full Convex
schema from the Data model section. Both apps connect to Convex with a hardcoded demo patient.
Don't build features yet.
```

### Phase 1: Spine (Sat 5 AM–12 PM)

- [ ] `startCheckinCall` action: builds the dynamic variables from the latest check-ins, calls `POST /agents/calls`, inserts the conversation
- [ ] Cron job every 5 minutes that calls `startCheckinCall` for due patients; a `triggerNow` mutation for the button
- [ ] Polling action: Get Call until ended → transcript → Claude `record_checkin` → mutations → Elastic index
- [ ] HTTP endpoints: `/cartesia/red-flag`, `/cartesia/add-question` with the shared-secret check
- [ ] Seed script: 1 patient (Spanish), 1 appointment 2 days out, 6 days of check-ins for dizziness and knee pain

```text
Prompt: Read SPEC.md sections Key decisions, Data model, Voice agent design. Implement Phase 1:
the outbound check-in call, the cron job, post-call processing with Claude tool use (record_checkin),
indexing into the Elastic checkins index, the red-flag and add-question HTTP endpoints, and the seed
script. Write a test command that starts a call to DEMO_PHONE and logs each pipeline stage.
```

### Phase 2: Screens (Sat 12–6 PM)

- [ ] Doctor: patient list, timeline chart (Elastic aggregation through a Convex action), history card, quotes, question list, alerts
- [ ] Patient app: onboarding/profile with consent, "Call me now", question queue, English/Spanish strings
- [ ] Cross-language search box (C6)

```text
Prompt: Implement Phase 2 from SPEC.md: features A1–A3, B3, B6, C1–C5, C8, and C6.
The timeline uses the Elastic date_histogram query from the Data model section, served by a Convex action.
Use Recharts on the doctor app. All patient-facing strings in en.json and es.json.
```

### Phase 3: Visit loop (Sat 6 PM–12 AM)

- [ ] Record the scripted visit audio (English doctor, Spanish patient)
- [ ] Upload → batch transcription → Claude cleanup and speaker labels → summaries in English and Spanish → `visit_chunks` index
- [ ] Patient summary screen (E1); explainer agent with the `/cartesia/search-visit` endpoint (E2)
- [ ] Mark the appointment completed and start the next cycle (E4 data model)
- [ ] Devpost draft submitted

```text
Prompt: Implement Phase 3 from SPEC.md: D1–D3, E1, E2, and the E4 data changes.
The explainer agent's search_visit tool calls POST /cartesia/search-visit, which runs the
semantic query on visit_chunks and returns the top 3 passages in both languages.
```

### Phase 4: Stretch (Sun 12–6 AM)

Pick from the top of this list down, in order.

- [ ] Teach-back (E3): prompt change only, cheap
- [ ] Question coverage and unaddressed concerns (D4, D5)
- [ ] In-app voice (B4): dev build, `react-native-audio-api`, Cartesia access token from Convex, WebSocket session
- [ ] Polish: loading states, empty states, Spanish text review by a fluent speaker

### Phase 5: Ship (Sun 6–9 AM)

- [ ] Rehearse the demo script 3 times with a real call
- [ ] Record a backup demo video in case the live call fails
- [ ] README: setup, Cartesia features used, known limitations, what is seeded (required by the Cartesia track)
- [ ] Scan the repo for API keys before making it public
- [ ] Final Devpost submission with all teammates added, before 9:00 AM

## Demo, sponsor tracks, and open questions

The demo runs in two minutes and opens with the phone ringing. Six days of check-ins are seeded; say so to the judges.

### Demo script (2 minutes)

1. **0:00** One sentence on the problem: patients forget when symptoms started, and language makes it worse.
2. **0:10** Tap "Call me now". A teammate's phone rings. The agent asks in Spanish how the dizziness is compared to yesterday, and the teammate answers, including a question for the doctor.
3. **0:45** Doctor dashboard: today's point appears live on the 7-day timeline, with the Spanish quote and its English translation, the structured history card, and the new question in the list.
4. **1:05** Type "dizziness" in search; Spanish check-ins come back (the Elastic moment).
5. **1:15** Play 20 seconds of the scripted visit, then show the Spanish summary on the patient app, medications first.
6. **1:30** Call the explainer: "¿Cuándo tomo la pastilla nueva?" It answers from the visit and asks the patient to repeat the schedule back (teach-back).
7. **1:50** Close: what's real, what's seeded, and the red-flag safety rule.

### Sponsor tracks

| Track | What we show | Their criteria we hit |
| --- | --- | --- |
| Best Use of Cartesia | Outbound daily calls, managed agents in two languages, webhook tools, in-app WebSocket voice (P1) | Voice is core; accessibility and privacy considered. They require a working demo, a 2-minute demo-first presentation, a README listing the Cartesia features used and known limitations, and no API keys in the repo. |
| Elastic | Multilingual semantic search, timeline date aggregations, grounded passages for the explainer | Track criteria not published in the guide; ask their reps on Saturday morning |
| Convex | Live dashboard updates, cron jobs for calls, HTTP webhooks, file storage | Track criteria not published in the guide |
| Anthropic | Named community; Claude extracts, translates, summarizes; known failure points (hallucinated doses) handled by grounding and red flags | Named community, real problem, it works, thoughtful use of Claude |
| Microsoft: Built for the Real World | Healthcare agent with a path to production (EHR, BAA vendors, human interpreters) | Customer understanding, measurable usefulness, path to production, responsible design, end to end |
| Cal Hacks Best People-First Hack | The whole project | — |

Check Devpost for a limit on how many tracks one project can enter.

### Open questions (answer these first thing)

- [ ] Does someone on the team have a Mac with Xcode, or an Android phone, for the P1 dev build?
- [ ] Can one Cartesia agent switch language per call, or do we need separate English and Spanish agents?
- [ ] Does the Cartesia agent config let us choose Claude as the conversation model?
- [ ] Does Cartesia send a call-ended webhook, or do we poll Get Call?
- [ ] Which Cartesia endpoint handles batch transcription of a recorded file, and does it accept Spanish and mixed-language audio?
- [ ] Whose US phone number receives the demo calls?
- [ ] Elastic Cloud trial or the sponsor's provided cluster? Does `semantic_text` work out of the box there?
- [ ] Who records the scripted visit audio (doctor in English, patient in Spanish)?

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
