# Doctor Dashboard: Website Screens

Oct 24, 2026 · @David Lam

## Structure

The doctor website has two tabs, Home and Patients, built for a specialist prepping on a laptop in the minutes before an appointment. The goal is to understand a patient's last few weeks in about 60 seconds.

| Element | What it does |
| --- | --- |
| Home tab | Today at a glance: alerts, the next appointment, everything upcoming |
| Patients tab | The patient list and each patient's view, including the visit view |
| Find patient search bar | At the top of Home. Typing a name jumps straight to that patient's view |
| Alert badge on the Patients tab | Shows when any patient has an unacknowledged red flag |

## Home tab

Home gathers every upcoming appointment under the doctor's name, with the next one featured and alerts on top. Top to bottom:

1. **Welcome.** "Good morning, Dr. Lee," today's date, and one line of counts: "5 appointments this week · 1 alert."
2. **Find patient search bar.** Search by name; results jump to the patient view. A "See all patients" link opens the full list in the Patients tab.
3. **Alerts strip (C8, P0).** Red, shown only when there are unacknowledged alerts. Each alert shows patient, symptom, the patient's quote with its English translation, the time, and an "Open" button. It disappears when every alert is acknowledged.
4. **Next appointment card.** The large card:
   1. Patient name, time and countdown ("in 25 min"), reason for visit.
   2. Language badge ("Spanish — interpreter recommended").
   3. Two-line preview: top concerns, plus "3 questions from patient."
   4. Data indicator: "6 of 7 check-ins completed."
   5. **"Go to patient"** opens that patient's view directly.
5. **Upcoming list.** The other appointments grouped by Today, Tomorrow and This week. Each row: time, patient, reason, language, alert badge. Clicking a row opens that patient's view.

## Patients tab

The Patients tab holds the patient list and each patient's view, one scrolling page with click-to-open side panels rather than sub-tabs.

**Patient list (C1)**

A table: name, next appointment, language, alert badge, and a "new since last viewed" dot. Sorted by soonest appointment, alerts pinned to the top. Updates live when a call finishes.

**Patient view (the hero screen)**

A header strip stays visible while scrolling: name, age, reason for visit, appointment countdown, language badge, the **visit button**, and the red-flag banner if there is one. Below it, in priority order:

1. **Pre-visit summary.** Overview, reported concerns and topics for review, the first thing the doctor reads.
2. **Symptom timeline (C2).** Severity 0–10 per symptom over 14 days, with medication markers. Clicking a point opens a side panel with the patient's quotes, Spanish with English underneath (C4).
3. **History cards (C3).** One per symptom: onset, location, duration, character, aggravating and relieving factors, timing, severity, each filled or marked "not reported."
4. **Patient's questions (C5).** In English, matching the patient app.
5. **Cross-language search (C6, P1).** Within the patient: typing "dizziness" finds "mareado."

## Visit button and visit view

The visit view lives inside the patient view and opens from the visit button in the header strip. The button's label follows the visit's `status` field, which the spec already stores (uploaded, transcribed, summarized).

| Visit status | Button | Opens |
| --- | --- | --- |
| No visit yet | **Start visit**, with "Upload recording" as a second option | Record or upload the visit audio (D1) |
| Uploaded, processing | **Processing…** with steps Uploaded → Transcribed → Summarized | The visit view, filling in as each step finishes |
| Summary ready, not released | **Review visit**, with a "Needs review" badge | The full visit view, ready to release |
| Released | **View visit**, with "Released Oct 20" | The same view, read-only |

**Visit view layout**

1. **Top: two attention cards,** so the doctor sees gaps before releasing.
   1. "2 of 3 questions answered" (D4): opens the unanswered one, with transcript quotes as evidence for the answered ones.
   2. "1 symptom not discussed: thirst" (D5).
2. **Middle: two columns.**
   1. Left: transcript with speaker labels, doctor, patient and interpreter (D2).
   2. Right: summary in English and Spanish side by side, medications first (D3). If the laptop screen is too narrow, an English / Spanish toggle replaces side by side.
3. **Bottom: sticky "Release to patient" button (D6).** A short confirm: "Mariela will see this summary in Spanish." After release, the patient's My Visit tab switches from "Your doctor is reviewing" to the summary.

## Principles, demo setup and open decisions

**Every AI-written sentence links to its source.** Clicking "reported afternoon fatigue on Oct 12" shows Mariela's own words. It builds the doctor's trust, guards against made-up details, and lets the doctor see the basis for each topic for review.

**Demo setup**

- Seed the doctor with four to six patients, with Mariela as the next appointment. Appointments already store `doctorName`, so filtering by doctor needs no schema change.
- Demo path: the alert appears live on Home → "Go to patient" → timeline and quotes → "Start visit" → upload the scripted recording → watch the processing steps → review → release. The Spanish summary then appears on the patient's phone (demo script step 5).

**Open decisions**

- [ ] Clicking an appointment in the upcoming list: this doc assumes it opens the patient directly rather than swapping it into the large card.
- [ ] Can the doctor edit the summary before releasing it, or only approve it? Editing needs an editor.
- [ ] Glucose readings: add measurements to the data model so they can be charted, or keep them as quotes for now?
- [ ] A "during the visit" mode showing questions as a live checklist: P2, pitch only unless time allows.
