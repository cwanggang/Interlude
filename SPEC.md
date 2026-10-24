# Patient Companion – Product Spec & Tech Stack

Oct 24, 2026 · @Caden

## Overview

We are building a bilingual (English and Spanish) voice companion. It checks in on patients by phone every day, turns those calls into a symptom timeline the doctor reads before the visit, and explains the visit afterward in the patient's language.

- **Who it serves:** Spanish-speaking older adults with metabolic disease (the demo patient has type 2 diabetes) waiting weeks for an endocrinology appointment. Name this community in the pitch; the Anthropic track rewards a specific community. The narrow focus keeps the vocabulary manageable: glucose readings, metformin and other diabetes medicines, thirst, urination, fatigue, low-sugar spells, foot tingling.
- **Demo storyline (seeded):** Mariela has had high sugar (thirst, nighttime urination, fatigue, readings of 240-250) for three weeks on metformin. At her first visit 12 days ago, Dr. Lee added glipizide, and since then she has shaky, sweaty, dizzy spells before meals with readings of 58-70. Dr. Lee sees that pattern on the timeline before today's follow-up.
- **Two interfaces:** a patient mobile app (Expo) plus daily phone calls, and a doctor web dashboard. The final screens come from the designer's Figma docs; see Figma scope (v2).
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

## Figma scope (v2)

The designer's two docs, `App Medical Initial.md` (patient app) and `Website Medical Initial.md` (doctor web), define the final screens. This section compares them with what is built, lists the new features (IDs **G** for the patient app, **H** for the doctor web), and says which backend piece each one needs. Existing IDs (A–F) keep their meaning. Schema changes are in Data model → Schema v2; new functions are in Team workflow → the contract; the work order is in Build plan v2.

### What is built (Oct 24)

| Area | Status |
| --- | --- |
| Check-in spine (B1–B3, B6 voice capture, B7) | Done: cron, "Call me now", Get Call polling, Claude extraction, Elastic indexing before `processed`, red-flag and add-question webhooks |
| Visit processing (D1–D4, D6) and explainer search (E2) | Done: upload, two-pass Ink transcription, Claude cleanup and speaker labels, summaries in both languages, question coverage, `indexVisitChunks`, `/cartesia/search-visit`, release |
| Elastic (C2, C6, C7, C9) | Done: timeline aggregation, hybrid search with rerank, ask-the-record agent, Workflow brief |
| App queries and mutations (A1–A3, B5, B6, C1, C3–C5, C8, E1, E4 carry-over) | Done, with unstyled screens in both apps |
| Not built | B4 in-app voice (`getAccessToken`, `mintAccessToken`, `useVoiceSession` are stubs), D5 unaddressed concerns, E3 teach-back (prompt only, untested), daily brief cron line |

The main gaps the designs expose: the backend has no notion of "the next call" or "a missed call", stores the check-in summary only in English, has visit summaries whose medications have no time of day, has one doctor and one patient in the seed, and has nothing for the after-visit checklist, the text chat, or source links on AI-written text.

### G. Patient app

| ID | Feature | Priority | Backend today | Needs |
| --- | --- | --- | --- | --- |
| G1 | Home tile states: timeline, call coming soon (15 min before), calling, missed call, check-in done | P0 | Conversation status only; a no-answer call is marked `processed` | A: `api.calls.callSchedule`; no-answer stored as `failed` with `endReason`; `conversations.summaryPatientLang` |
| G2 | Cycle strip Before visit → Visit → After visit, with countdown ("12 días", "Hoy") | P0 | `appointments.current`, `visits.getByAppointment` | B: one `appointments.cycle` query that derives the stage |
| G3 | Today's medications: name, dose, time, morning or evening icon | P0 | Summary `schedule` is free text | A: VisitSummary v2 (`times_of_day`, `key`, `change`); `api.visits.latestReleasedSummary`; seed a past released visit |
| G4 | "Taken" button per dose, writing a `medicationEvent` | P1 | `medicationEvents.conversationId` is required | Schema v2 (`conversationId` optional, `source`, `slot`); B: `medications.markTaken` |
| G5 | Top 2–3 instructions from the latest summary | P0 | In the summary | `latestReleasedSummary` (G3) |
| G6 | Home before the first visit: "You have 3 questions for Dr. Lee" and an empty state | P0 | Exists | — |
| G7 | My Visit card: doctor, date, time, clinic, countdown | P0 | No clinic | Schema v2 `appointments.clinicName` |
| G8 | Prep checklist (B8): bottles, glucose log, ID, arrive early | P1 | — | None: static text in `i18n.ts`, ticks kept on the device |
| G9 | Questions in Spanish and English side by side, voice tag kept | P0 | Exists | — |
| G10 | Summary, "Your doctor is reviewing" until release, each question answered or carried over | P0 | Exists (`releasedToPatient`, question `status`) | — |
| G11 | After-visit checklist: pick up prescription, book follow-up, get tests; patient ticks items | P1 | — | Schema v2 `visitTasks`; A writes rows when summarizing; B: `tasks.setDone` |
| G12 | Past visits list, newest first, each opening its summary | P0 | No per-patient visit query | A: `api.visits.listForPatient` |
| G13 | My Health: time range, plain summary card, one trend chart per symptom with visit markers and word labels, symptom cards with quotes and "what your doctor will see", medication week grid, visit history | P1 | Raw entries and events | B: `health.overview` (deterministic counts, no Claude, so it never interprets); `elastic.timeline` takes a `from` date; A: medication names normalized to one key |
| G14 | Settings: text size, notifications toggle, consent with confirm, appointment read-only, sign out | P0 for existing fields, P1 for the rest | Profile fields exist | Schema v2 `patients.textSize`, `patients.notificationsEnabled`; sign out = demo patient picker |
| G15 | Notification bell: summary ready, missed call, call soon, question captured | P1 | — | B: `notifications.list`, derived from existing tables, no new table. Real push is P2 (remote push needs a dev build) |
| G16 | AI chat: floating "Pregunte" button, chat log, suggested prompts, text box, mic | P1 | — | Schema v2 `chatMessages`, channel `chat`; A: `convex/chat.ts`; mic = record a clip with `expo-audio`, A transcribes |
| G17 | Full-screen "Call 911 now" | P1 | Agents say it on calls | Opened by a chat message with `redFlag: true` |
| G18 | Check-in done line and check-in history in the patient's language | P0 | `summaryEnglish` only | A: extraction adds `summary_patient_lang` |

### H. Doctor web

| ID | Feature | Priority | Backend today | Needs |
| --- | --- | --- | --- | --- |
| H1 | Home welcome: "Good morning, Dr. Lee", "5 appointments this week · 1 alert" | P0 | One doctor string per appointment | Schema v2 index `by_doctor_time`; B: `dashboard.doctorHome({ doctorName })` |
| H2 | Find patient by name | P0 | `patients.list` | None: filter on the client |
| H3 | Alerts strip: patient, symptom, quote with English, time, "Open" | P0 | `alerts.quote` in the patient's language only | Schema v2 `alerts.quoteEnglish`; A translates it after the webhook |
| H4 | Next appointment card: countdown, reason, language badge ("interpreter recommended"), top concerns, question count, "6 of 7 check-ins completed" | P0 | Pieces exist separately | B: `dashboard.doctorHome`; completion counts local days with a `processed` check-in that has patient turns; top concerns from the brief, else the highest recent severities |
| H5 | Upcoming list grouped Today, Tomorrow, This week, with alert badges | P0 | — | Same query |
| H6 | Patients table: language, alert badge, alerts pinned first, "new since last viewed" dot | P0 (dot P1) | `patients.list` | Schema v2 `patients.doctorLastViewedAt`; B: `patients.markViewed` |
| H7 | Patient header strip: name, age, reason, countdown, language, visit button, red-flag banner | P0 | No age | Schema v2 `patients.dateOfBirth` |
| H8 | Pre-visit summary: overview, reported concerns, topics for review, every sentence linked to the patient's words | P1 (P0 shows today's brief paragraph as the overview) | One `textEnglish` paragraph | Schema v2 `briefs.sections`; B: the agent returns JSON with `symptomEntryId` citations |
| H9 | Timeline point opens a side panel of quotes | P0 | Exists (`patients.symptomEntries`) | — |
| H10 | Visit button: Start visit → Processing (Uploaded → Transcribed → Summarized) → Review visit → View visit ("Released Oct 20") | P0 | Status exists, no release time | Schema v2 `visits.releasedAt` |
| H11 | Record the visit in the browser | P1 (upload is P0) | Upload exists; `transcribeFile` accepts webm | None: `MediaRecorder` in the doctor app |
| H12 | Attention cards: "2 of 3 questions answered" (D4), "1 symptom not discussed: thirst" (D5) | P0 | D4 exists, D5 does not | Schema v2 `visits.unaddressedSymptoms`; A computes it during processing |
| H13 | Visit summary items link to the transcript turn they came from | P1 | — | VisitSummary v2 `source_turn` |
| H14 | Analytics: check-in completion, adherence, questions answered across visits | P2 | — | Later |

**Not in the website doc, but keep:** C6 cross-language search and C7 ask-the-record, plus the "Generate brief" button (C9). The Elastic track is judged on Agent Builder and Workflows, so the designer must place them in the patient view.

### Demo data the designs assume (seed v2)

- The demo patient has one **past** completed appointment with a released visit (the one where glipizide was added), its `visitTasks`, and questions answered or carried over, so Home shows medications, instructions and a countdown.
- 14 days of check-ins (the chart shows 14), one of them missed, with `medicationEvents` marked taken and missed across the week.
- The current appointment with the doctor is **later today**, so the doctor's Home says "in 25 min" and the live visit runs in the demo.
- 4–6 more patients under the same doctor this week: at least one English speaker, one more with an open alert, one with no check-ins. Each has a date of birth, a clinic and 2–3 check-ins.
- The demo patient is inserted first, so `patients.getDemo` still returns them.

### Demo path v2

Tap "Call me now" → the agent asks about the dizzy spells in Spanish → the doctor's Home shows the new point and the question → "Go to patient": timeline, quotes, brief, search, ask-the-record → "Start visit", upload the scripted recording, watch the steps → review the attention cards → release → the Spanish summary appears on the phone, medications first → "Talk about my visit" calls the explainer.

### Decisions (taken in Phase 0; raise any disagreement in chat)

- [x] **Names.** The seed now uses the designer's names: Mariela González and Dr. Lee (Valley Endocrinology Clinic). Story change: Mariela's *first* visit with Dr. Lee, 12 days ago, added glipizide; today is the follow-up.
- [x] **When is the visit?** Later today (default 120 min after seeding; `npx convex run seed:run '{"visitInMinutes":25}'` matches the mock). "12 días" is the general countdown state.
- [ ] **Questions tab overlap.** Recommend keeping the Questions tab for editing and making the My Visit list read-only, bilingual and large for handing the phone to the doctor. The backend is the same either way; Dev B and the designer decide.
- [x] **Glucose readings.** Extraction writes `glucoseReadings` (mg/dL, context, quote) on every check-in, phone or chat; the seed backfills Mariela's 12 readings. Doctor chart only: Track B owns the read query and chart.
- [x] **Editing the summary before release.** Approve-only; editing is P2.
- [x] **Text size and notification settings** live on the patient record (`patients.textSize`, `patients.notificationsEnabled`).
- [x] **Chat** is P1. `convex/chat.ts` already stores sessions and messages and transcribes clips, but replies are a canned stub until block A5.

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

### Schema v2 (for the Figma screens)

Proposed; Dev A applies it in one commit on `main` after Dev B agrees. Every new field is optional, so existing rows stay valid. Two new tables (`visitTasks`, `chatMessages`) and one pending a decision (`glucoseReadings`).

```ts
patients: {
  ...,
  dateOfBirth: v.optional(v.string()),            // "1958-03-14", for the age in H7
  textSize: v.optional(v.union(v.literal("normal"), v.literal("large"), v.literal("xlarge"))),
  notificationsEnabled: v.optional(v.boolean()),
  doctorLastViewedAt: v.optional(v.number()),     // H6 "new since last viewed"
},

appointments: {
  ...,
  clinicName: v.optional(v.string()),             // G7
}.index("by_patient", ["patientId"])
 .index("by_doctor_time", ["doctorName", "scheduledAt"]),   // H1, H5

conversations: {
  ...,
  channel: v.union(v.literal("phone"), v.literal("app"), v.literal("chat")),  // + chat (G16)
  summaryPatientLang: v.optional(v.string()),     // G1 done line, G18 history
  endReason: v.optional(v.string()),              // Cartesia end_reason, e.g. "no_answer"
},

medicationEvents: {
  ...,
  conversationId: v.optional(v.id("conversations")),          // now optional: app taps have none
  medication: v.string(),                         // normalized key, lowercase generic: "glipizide"
  source: v.optional(v.union(v.literal("voice"), v.literal("app"))),
  slot: v.optional(v.union(v.literal("morning"), v.literal("midday"),
                           v.literal("evening"), v.literal("bedtime"))),  // G4 per-dose tap
},

alerts: {
  ...,
  quoteEnglish: v.optional(v.string()),           // H3; `quote` stays in the patient's words
},

visits: {
  ...,
  status: v.string(),                             // uploaded | transcribed | summarized | failed
  releasedAt: v.optional(v.number()),             // H10 "Released Oct 20"
  unaddressedSymptoms: v.optional(v.array(v.object({          // D5, H12
    symptom: v.string(), symptomOriginal: v.string(),
    lastDate: v.string(), lastSeverity: v.optional(v.number()),
  }))),
  consentId: v.optional(v.id("visitConsents")),   // 6.5a, who agreed to the recording
  liveTranscript: v.optional(v.array(liveTurn)),  // 6.5e "Attach the live translated transcript"
},
// liveTurn = { speaker: "doctor" | "patient", at: number (ms from start), original: string,
//              translated: string }. Only turns from speakers who agreed to be recorded are kept.

visitConsents: defineTable({                      // 6.5a, append-only: one row per confirmed dialog
  appointmentId: v.id("appointments"), patientId: v.id("patients"), doctorName: v.string(),
  recordDoctor: v.boolean(), recordPatient: v.boolean(),
  translate: v.boolean(),                         // live translation only; covers saving nothing
  givenAt: v.number(),
}).index("by_appointment", ["appointmentId"]),

briefs: {
  ...,
  sections: v.optional(v.object({                 // H8; textEnglish stays as the plain version
    overview: v.string(),
    concerns: v.array(briefItem),
    topics: v.array(briefItem),
  })),
},
// briefItem = { text: string, citations: [{ symptomEntryId?: string, date: string,
//               quoteOriginal: string, quoteEnglish: string }] }

visitTasks: defineTable({                         // G11, written by Track A, ticked by Track B
  visitId: v.id("visits"), appointmentId: v.id("appointments"), patientId: v.id("patients"),
  kind: v.union(v.literal("prescription"), v.literal("follow_up"), v.literal("test"), v.literal("other")),
  textEnglish: v.string(), textPatientLang: v.string(),
  order: v.number(), done: v.boolean(), doneAt: v.optional(v.number()),
}).index("by_visit", ["visitId"]).index("by_patient", ["patientId"]),

chatMessages: defineTable({                       // G16, one conversations row per chat session
  conversationId: v.id("conversations"), patientId: v.id("patients"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  text: v.string(),                               // in the patient's language
  createdAt: v.number(),
  pending: v.optional(v.boolean()),               // assistant reply still being written
  redFlag: v.optional(v.boolean()),               // opens the "Call 911 now" screen (G17)
  citations: v.optional(v.array(v.object({ chunkIndex: v.number(), textPatientLang: v.string() }))),  // F2
}).index("by_conversation", ["conversationId"]),

glucoseReadings: defineTable({                    // decision pending; P1 doctor chart only
  patientId: v.id("patients"), appointmentId: v.id("appointments"),
  conversationId: v.id("conversations"), date: v.string(),
  valueMgDl: v.number(),
  context: v.union(v.literal("fasting"), v.literal("before_meal"), v.literal("after_meal"),
                   v.literal("bedtime"), v.literal("unknown")),
  quoteOriginal: v.string(), quoteEnglish: v.string(),
}).index("by_patient_date", ["patientId", "date"]),
```

Who writes what: Track A writes `visitTasks`, `chatMessages`, `glucoseReadings`, `alerts.quoteEnglish`, and the new `conversations` and `visits` fields; Track B owns every read and every typed edit of them (the same rule as `alerts` and `questions`). Track B writes app `medicationEvents` (`source: "app"`) and the new `patients` fields. `visitConsents` rows are written only through Track A's `api.visits.recordConsent`.

**Live visit consent (6.5a–e).** The doctor web calls `api.visits.recordConsent` when the consent dialog is confirmed (both for a live visit and for "Upload a recording instead"), then passes the `consentId`, plus the live turns if the 6.5e box is ticked, to `api.visits.create`. If only one person agreed to be recorded, the server drops the other person's live turns, drops their turns from the processed transcript (speakers are labelled from content, not from the card the doctor tapped), and deletes the audio once it's transcribed. Each live turn goes through `transcribeLiveTurn` in `convex/claude.ts`, which identifies the speaker so the app can switch the speaker card automatically.

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

**v2 additions (Figma scope):**

- `summary_patient_lang`: the same two or three sentences in the patient's language, saved to `conversations.summaryPatientLang` (G1, G18).
- `medications[].medication` is a normalized key: lowercase English generic name ("metformina" → "metformin"), the same key as VisitSummary v2 `medications[].key`, so the app's "Taken" taps and the call's reports land in one row of the week grid (G13).
- `glucose_readings: [{ value_mg_dl, context, quote_original, quote_english }]` if the glucose decision is approved.
- A call that ends with no patient turns (no answer, voicemail, busy) is marked `failed` with Cartesia's `end_reason` in `conversations.endReason`, not `processed`. A Claude or Elastic error after a real conversation keeps `endReason: "error"`. `callSchedule` turns these into "missed" for the Home tile.
- The red-flag webhook stores `quote` as spoken, then schedules a Claude translation into `alerts.quoteEnglish` (H3).

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

### Visit summary JSON v2 (Figma scope)

Replaces the shape above. Both languages share the structure; `key`, `times_of_day`, `change` and `source_turn` are identical in both versions. `source_turn` is the index into `visits.transcript` (H13).

```jsonc
{ "assessment": "string",
  "medications": [{ "key": "glipizide", "name": "", "dose": "", "schedule": "",
                    "times_of_day": ["morning"],              // morning | midday | evening | bedtime
                    "purpose": "", "change": "changed",        // new | changed | same | stopped
                    "source_turn": 12 }],
  "instructions": [{ "text": "string", "source_turn": 14 }],
  "tests_ordered": [{ "text": "string", "source_turn": 15 }],
  "follow_up": "string",
  "warning_signs": ["string"] }
```

- G3 "Today's medications" lists every medication whose `change` is not `stopped`, one row per `times_of_day` entry.
- The same Claude call returns `tasks: [{ kind, text_english, text_patient_lang }]` (pick up the new prescription, book the follow-up, each ordered test). Track A writes them to `visitTasks`; they are not stored in the summary.
- D5: after summarizing, Claude gets the symptoms reported since the previous visit (latest entry per symptom) and the transcript, and returns those never discussed. Track A saves them as `visits.unaddressedSymptoms`.
- Breaking change: `instructions` and `tests_ordered` become objects. Track B's summary screens switch to `item.text` in the same merge as Track A's change; the seed writes v2.

## Team workflow

Two developers each run their own Claude Code on one repo, split by file ownership. Before either starts, one of them writes a shared contract (schema plus stub functions). Merge conflicts come from two agents editing the same file; this split makes that rare, and the contract keeps the two halves matching.

### Who owns what

| Track | Person | Owns these files | Features |
| --- | --- | --- | --- |
| A: Voice + AI pipeline | Dev A | `convex/cartesia.ts`, `convex/calls.ts`, `convex/crons.ts`, `convex/pipeline.ts`, `convex/http.ts`, `convex/visits.ts`, `convex/claude.ts`, `convex/chat.ts`, `convex/lib/time.ts`, `apps/mobile/src/voice/*`, Cartesia agent configs | B1–B3, B4 voice client, B7, D1–D5 processing, E2, E3; v2: G1 and G18 backend, G3 and G11–G12 data, G16 chat backend, H3 translation, H12 D5, H13 |
| B: Data + apps | Dev B | `convex/elastic.ts`, `convex/briefs.ts`, `convex/patients.ts`, `convex/questions.ts`, `convex/alerts.ts`, `convex/appointments.ts`, `convex/medications.ts`, `convex/tasks.ts`, `convex/dashboard.ts`, `convex/health.ts`, `convex/notifications.ts`, `/elastic/*`, `apps/doctor/*`, `apps/mobile/*` (except `src/voice`), both `theme.ts` files | A1–A3, B5, B6, B8, C1–C9 (all Elastic work, see `ELASTIC.md`), E1, E4 UI, applying designs; v2: every G and H screen, G2, G4, G13–G15 queries, H1–H8 queries, H8 structured brief |
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

**v2 additions (Figma scope).** Dev A stubs these in Phase 0 with real validators, so Track B builds screens against them on day one.

| Function | Owner | Called by | Args → returns |
| --- | --- | --- | --- |
| `api.calls.callSchedule` (query) | A | B's Home tile (G1) | `{ patientId, now }` (queries can't read the clock: pass `Date.now()` rounded to the minute and re-render each minute) → `{ state: "off" \| "scheduled" \| "soon" \| "calling" \| "missed" \| "done", nextCallAt: number \| null, conversationId: Id \| null, lastCheckin: null \| { conversationId, startedAt, summaryPatientLang: string \| null, summaryEnglish: string \| null } }`. `soon` = within 15 min of `nextCallAt`; `missed` = today's latest call failed with no patient turns; `done` = today's check-in processed. The cron uses the same rule, so the tile and the dialer always agree |
| `api.visits.listForPatient` (query) | A | B's past visits (G12, G13, H10) | `{ patientId }` → `[{ _id, appointmentId, scheduledAt, doctorName, status, releasedToPatient, releasedAt: number \| null }]`, newest first, no transcript |
| `api.visits.latestReleasedSummary` (query) | A | B's Home and My Visit (G3, G5) | `{ patientId }` → `null \| { visitId, appointmentId, scheduledAt, doctorName, summaryEnglish, summaryPatientLang }` (VisitSummary v2) |
| `internal.visits.reindexAllChunks` | A | the seed, after `elastic.reindexAll` | `{}` → `null`; re-indexes passages of every visit with a transcript |
| `api.chat.start` (mutation) | A | B's chat screen (G16) | `{ patientId }` → `{ conversationId }`; picks check-in or explainer mode like `triggerNow` |
| `api.chat.send` (mutation) | A | B's chat screen | `{ conversationId, text }` → `null`; inserts the user message and a `pending` assistant message, which Claude fills in a few seconds. Throws while the previous reply is still pending, so disable the send button until it arrives |
| `api.chat.messages` (query) | A | B's chat screen | `{ conversationId }` → `[{ _id, role, text, createdAt, pending?, redFlag?, citations? }]`, oldest first |
| `api.chat.end` (mutation) | A | B's chat close button | `{ conversationId }` → `null`; runs the post-call pipeline on the messages. Also runs after 10 idle minutes |
| `api.chat.generateUploadUrl`, `api.chat.transcribeClip` (action) | A | B's chat mic | `{ storageId, language }` → `{ text }`, via Ink batch transcription |

Track B's new functions (`medications.markTaken`, `medications.week`, `tasks.listForVisit`, `tasks.setDone`, `appointments.cycle`, `dashboard.doctorHome`, `health.overview`, `notifications.list`, `patients.markViewed`) are called only by Track B's apps, so they are not part of the contract. Two changes to existing functions keep their validators: `visits.release` also sets `releasedAt`, and Track B's visit upload calls `appointments.markCompleted` after `visits.create`.

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

### Screen inventory v2 (from the Figma docs)

Each Figma screen and the functions it reads and writes. When a frame is imported, wire it to exactly these; anything not listed here doesn't exist yet and needs a spec change first. "v2" marks functions added in the Figma scope.

**Patient app** (tabs: Home, My Visit, Questions, My Health, Settings; floating chat button)

| Screen | Priority | Reads | Writes |
| --- | --- | --- | --- |
| Home | P0 | `patients.getDemo`, `appointments.cycle` (v2), `calls.callSchedule` (v2), `visits.latestReleasedSummary` (v2), `questions.listForAppointment`, `medications.week` (v2, for ticked doses) | `calls.triggerNow`, `medications.markTaken` (v2, P1) |
| My Visit | P0 | `appointments.current`, `visits.getByAppointment`, `questions.listForAppointment`, `tasks.listForVisit` (v2), `visits.listForPatient` (v2) | `tasks.setDone` (v2, P1), `calls.triggerNow` ("Talk about my visit") |
| Questions | P0 | `questions.listForAppointment` | `questions.add`, `edit`, `remove`, `reorder` |
| My Health | P1 | `health.overview` (v2), `elastic.timeline` with `from`, `medications.week`, `visits.listForPatient` | — |
| Settings and onboarding | P0 | `patients.getDemo`, `appointments.current` | `patients.create`, `patients.update` (incl. `textSize`, `notificationsEnabled`) |
| Check-in history | P1 | `patients.conversations` (add `summaryPatientLang` to its row) | — |
| Notification bell | P1 | `notifications.list` (v2) | — |
| Chat log, "Call 911 now" | P1 | `chat.messages` (v2) | `chat.start`, `chat.send`, `chat.end`, `chat.transcribeClip` (v2) |
| In-app voice | P1 | `useVoiceSession` | — |

**Doctor web** (tabs: Home, Patients)

| Screen | Priority | Reads | Writes |
| --- | --- | --- | --- |
| Home | P0 | `dashboard.doctorHome` (v2: counts, alerts with patient names, next appointment card, upcoming groups), `patients.list` (find patient) | `alerts.acknowledge` |
| Patients table | P0 | `patients.list` (add language, last check-in time, `doctorLastViewedAt`) | `patients.markViewed` (v2, P1) |
| Patient view | P0 | `patients.get`, `appointments.current`, `alerts.listForPatient`, `briefs.getByAppointment` (with `sections`), `elastic.timeline`, `patients.symptomEntries`, `patients.medicationEvents`, `questions.listForAppointment`, `elastic.searchCheckins`, `elastic.askRecord`, `visits.getByAppointment` (visit button) | `elastic.generateBrief`, `alerts.acknowledge` |
| Visit view | P0 | `visits.getByAppointment` (transcript, summaries, `unaddressedSymptoms`, `releasedAt`), `questions.listForAppointment` (coverage) | `visits.generateUploadUrl`, `visits.create`, `appointments.markCompleted`, `visits.release` |

Every screen also needs its empty, loading and error states; ask the designer for them if the frames don't include them.

### Notes for the designer

- **Older users:** body text at least 18 pt on mobile, tap targets at least 44 pt, high contrast, one main action per screen.
- **Two languages:** check every mobile screen with Spanish text, which usually runs longer than English. Leave room in buttons and headers.
- **Safety:** "Not for emergencies, call 911" appears on the patient home and the visit summary.
- **Figma sponsor track:** the hacker guide lists a Figma track (Amazon gift cards plus a session with Figma's early-career recruiting team) with a criteria doc, and Figma runs a workshop. The designer should read the criteria early; this project can enter it.

## Build plan v2: UI integration

Build plan v1 (below) is done except B4, D5, E3 and the brief cron. v2 makes the backend serve every Figma screen before the frames are imported. Order: Phase 0 (contract), then both tracks in parallel, P0 blocks first. Cut P1 before P0, as before.

### Phase 0: contract v2 (Dev A first, Dev B reviews)

- [x] Decisions in Figma scope (one left for Dev B and the designer: the Questions tab)
- [x] `convex/schema.ts`: Schema v2 applied (all new fields optional)
- [x] v2 contract functions: `callSchedule`, `visits.listForPatient`, `visits.latestReleasedSummary` and `reindexAllChunks` are real; `convex/chat.ts` is real except Claude's reply (stub until A5)
- [x] `localDate`, `localTime`, `zonedTimeToMs`, `nextDate` in `convex/lib/time.ts`
- [x] Seed v2, with VisitSummary v2 for the past visit; `seed.reindex` runs `elastic.reindexAll`, then `visits.reindexAllChunks`
- [x] Track B validators widened for the new optional fields (`patients.ts`, `appointments.ts`, `alerts.ts`), validator-only, so seeded rows pass. `briefs.ts` still needs `sections` when B5 starts writing it
- [x] `CLAUDE.md` tables updated
- [ ] Merge to `main`; Dev B pulls and reseeds their deployment before starting

```text
Dev A prompt: I am Track A. Read SPEC.md: Figma scope (v2), Data model → Schema v2, Team
workflow → the v2 contract, Build plan v2 → Phase 0. Apply Schema v2 to convex/schema.ts,
stub every v2 contract function with real validators and fake returns (handlers annotated
from the returns validator), move the time helpers to convex/lib/time.ts, rewrite the seed
to the v2 demo data, and update CLAUDE.md's tables. Don't implement features. Typecheck.
```

### Track A (Dev A)

| Block | Priority | Work | Unblocks |
| --- | --- | --- | --- |
| A1 Call states ✅ | P0 | No-answer → `failed` + `endReason`; extraction adds `summary_patient_lang` and normalized medication keys; real `callSchedule`; the cron uses the same "due" rule. Test without a phone: `npx convex run pipeline:devProcessTranscript '{"transcript":[...]}'` (an empty transcript is a missed call) | G1, G18, H4 completion |
| A2 Visit v2 | P0 | `summarizeVisit` returns VisitSummary v2 plus tasks; write `visitTasks`; D5 `unaddressedSymptoms`; `release` sets `releasedAt`; `listForPatient`, `latestReleasedSummary`, `reindexAllChunks`; explainer `medications` variable built from v2 | G3, G5, G10–G12, H10, H12, H13 |
| A3 Alert translation ✅ | P0 | `createAlert` schedules Claude into `quoteEnglish` | H3 |
| A4 Brief cron ✅ | P1 | `crons.ts`: `internal.elastic.generateBriefsForUpcoming` daily at 14:00 UTC (7 AM Pacific). Needs `elastic:syncAgent` once per deployment | H8 freshness |
| A5 Chat backend ✅ | P1 | `convex/chat.ts`: Claude with tools (`add_question`, `report_red_flag`, `search_visit` via `internal.elastic.searchVisit`); before-visit replies act like the check-in agent, after-visit replies answer only from passages and return `citations`; red flags create an alert and set `redFlag`; `end` feeds the messages to `processConversation`; `transcribeClip` via `transcribeFile` | G16, G17, F2 |
| A6 Glucose ✅ | P1 | Extraction `glucose_readings` → `glucoseReadings` rows | Doctor glucose chart |
| A7 Voice + teach-back | P1 | Test E3 on a real explainer call; B4: `mintAccessToken`, `getAccessToken`, `useVoiceSession` on a dev build | B4 |

```text
Track A prompt: I am Track A. Read SPEC.md: Figma scope (v2), Schema v2, Voice agent design
(v2 additions and Visit summary JSON v2), and the v2 contract. Implement block <A1|A2|A3>
from Build plan v2. Keep every contract validator unchanged. Don't edit Track B files; if a
Track B screen breaks because of a v2 shape change, list the exact change for Dev B.
Run npm run typecheck, then test with npx convex run (calls:demoCall, visits:devCreateFromText).
```

### Track B (Dev B)

| Block | Priority | Work | Depends on |
| --- | --- | --- | --- |
| B1 Doctor Home + Patients tab | P0 | Two-tab layout; `dashboard.doctorHome` (welcome counts, alerts strip joined with patient names and `quoteEnglish`, next appointment card with check-in completion and top concerns, upcoming groups); find patient; patients table with language, alerts pinned | Phase 0 |
| B2 Patient view + visit view | P0 | Header strip with age, countdown, language badge, visit button state machine, red-flag banner; brief as overview; timeline side panel; keep C6, C7 and "Generate brief" in the layout; visit view with attention cards (D4, D5), side-by-side summary (v2 `item.text`), release confirm | Phase 0; A2 for live D5 |
| B3 Mobile navigation + Home | P0 | Tabs; `appointments.cycle`; Home tile from `callSchedule`; today's medications and instructions from `latestReleasedSummary`; before-first-visit empty state; safety line | Phase 0; A1, A2 for live data |
| B4 My Visit + Settings | P0 | Visit card with clinic; bilingual questions; summary or "reviewing"; answered and carried-over marks; past visits; Settings with consent confirm and read-only appointment | Phase 0 |
| B5 Elastic v2 | P1 | `timeline` takes `from` and returns visit dates for markers; brief returns `sections` with `symptomEntryId` citations (agent output schema in `/elastic`), source links in the overview | Phase 0 |
| B6 Patient P1 screens | P1 | "Taken" button + `medications.markTaken`/`week`; My Health with `health.overview`; after-visit checklist with `tasks.setDone`; bell with `notifications.list`; text size; demo sign-out picker; "new since viewed" dot | Phase 0; A2 for tasks |
| B7 Chat UI | P1 | Floating "Pregunte" button, chat log, suggested prompts, mic recording with `expo-audio`, "Call 911 now" screen | A5 |
| B8 Figma import | P0 when frames are final | Figma variables → both `theme.ts`; restyle the shared components; rebuild screens frame by frame, keeping the data wiring from the Screen inventory v2 | B1–B4 |

```text
Track B prompt: I am Track B. Read SPEC.md (Figma scope (v2), Schema v2, Screen inventory
v2, the v2 contract) and ELASTIC.md. Build block <B1..B7> from Build plan v2 as unstyled
screens from the shared components and theme.ts, against the v2 stubs and seed data. Use
only the functions the Screen inventory lists for each screen. Don't edit Track A files.
```

### Merge points

1. **Phase 0 merged:** both tracks pull, then work in parallel.
2. **P0 complete** (A1–A3, B1–B4): `npx convex deploy` from `main`, then on production run `elastic:syncAgent` once (the agent and Workflow are per `ELASTIC_INDEX_PREFIX`; without them briefs and ask-the-record return 404), reseed, and run Demo path v2 once.
3. **Figma import** (B8) on top of a working P0, then P1 blocks as time allows, re-running the demo path after each merge.

## Build plan v1 (done)

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
