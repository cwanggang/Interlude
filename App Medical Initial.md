# Patient App: Home & My Health Screens

Oct 24, 2026 · @David Lam

## Home screen layout

Home keeps "Call me now" above the fold, with the timeline and today's medications arranged around it. Top to bottom:

1. **Header.** "Buenos días, Mariela," with the notification bell on the right.
2. **Timeline tile (dynamic).** A three-step strip: Before visit → Visit → After visit, with the current step highlighted. This is the tile's main state; it changes around each daily call, then returns to the timeline. About a fifth of the screen.
   1. **Timeline (default):** the strip plus "12 días para su cita con Dr. Lee" (12 days until your appointment with Dr. Lee). Tapping it opens My Visit.
   2. **Call coming soon:** about 15 minutes before the scheduled call, "Llamada pronto: 6:30 PM" (Call coming soon: 6:30 PM), with a "Call me now" button.
   3. **Calling:** after "Call me now," "Le estamos llamando. Conteste su teléfono." (We're calling you now. Answer your phone.)
   4. **Missed call:** "Llamada perdida" (Missed call), with "Call me now" to try again. Stays until the next call or a completed check-in.
   5. **Check-in done:** a one-line summary of today's call and "See all check-ins," replacing the old Last check-in section. Back to the timeline after a few hours.
   6. Backend note for Dev A: the states follow the `conversations` status through a live query. A no-answer call should be stored as `failed` so the tile can show Missed call.
3. **"Call me now" button.** Full width and large, with the next call time under it: "Próxima llamada: hoy 6:30 PM" (Next call: today 6:30 PM).
4. **Today's medications.** One row per medication: name, dose, time, and a morning or evening icon.
   1. Only today's doses; "See all medications" links to My Visit.
   2. A "Taken" check button on each row answers Mariela's worry about her morning pill. Each tap writes a `medicationEvent`, which the doctor's chart already shows. Not in the spec yet: P1, and Dev B needs to add the mutation.
5. **Instructions.** The top two or three from the latest visit summary, in plain language ("Revise su azúcar antes del desayuno," Check your sugar before breakfast). "See all" links to My Visit.
6. **Safety line.** "Not for emergencies. Call 911." Required on Home (F3).

## Home before and after the first visit

Medications and instructions come from the visit summary, so Home needs two states.

| State | Sections 4 and 5 show | Timeline shows |
| --- | --- | --- |
| Before the first visit | Question queue preview ("You have 3 questions for Dr. Lee") and an empty state: "Your medications and instructions will appear here after your visit." | Before visit, with the countdown |
| After a visit | Today's medications and instructions from the latest summary | After visit; back to Before visit once the next appointment is booked, with medications and instructions still shown |

For the demo, seed Mariela with one past visit, so judges see the full Home with medications, instructions and a countdown to her next appointment.

On a phone screen, the header, timeline, button and first medication row fit without scrolling. Instructions sit below the fold.

## My Health (Mi salud) page

My Health is the analytics page for patient and symptom history. It fits as an optional fifth tab in place of the plain journal, and uses only data the spec already collects: symptom entries, medication events, check-ins, questions and visits. Top to bottom:

1. **Time range.** "Since my last visit" (default), 7 days, or 30 days.
2. **Summary card.** Three or four plain-language sentences, e.g. "You had 9 check-ins. You mentioned tiredness on 5 days and thirst on 3. You were unsure about your morning pill twice."
   1. Describes, never interprets: no "your symptoms are improving," no "this suggests."
   2. Built from the same check-in summaries the doctor sees, in the patient's language.
3. **Symptom trends.** One small chart per active symptom: severity 0–10 by day.
   1. A visit marker on each chart, and a word label per symptom ("Worse," "Better," "Same") with an arrow, not color alone.
   2. Current symptoms by default; "Show past symptoms" below.
4. **Symptom cards.** One per symptom:
   1. First reported, last reported, and how often.
   2. One or two of the patient's own quotes ("Hoy me sentí muy cansada…").
   3. "What your doctor will see": onset, timing, what helps, each marked filled or "not reported yet," nudging the patient to mention gaps on the next call.
5. **Medications.** A week grid of taken, missed and not reported, from medication events, with current medications from the last visit summary below.
6. **Visit history.** Past visits, each linking to its summary, with questions answered vs. carried over.

## My Health: limits, design notes, doctor side

**Leave out**

- Health scores, grades or "normal range" judgments. Mariela's 185 mg/dL reading shouldn't be labeled good or bad: that is interpretation, can alarm or falsely reassure, and moves the app toward regulated territory.
- Glucose charts, unless the team adds measurements to the data model. Today a reading is stored only as a quote.
- Red-flag history as a chart. If past alerts appear, use a simple list with the 911 guidance.

**Design notes for older users**

- One chart per row at full width, large axis labels, at most 14 days visible.
- A text version of every chart, for screen readers and patients who don't read charts easily.
- Test the x-axis with Spanish month and day labels, which run longer.

**Doctor-side version**

The doctor already sees this on the patient view (the hero screen). Analytics adds check-in completion rate, medication adherence rate, questions answered across visits, and symptoms never discussed at the visit (D5). Most of this is P1 or later.

## My Visit (Mi visita) tab

My Visit changes with the care cycle: it prepares the patient before the visit and explains it afterward, with past visits always at the bottom. Top to bottom:

1. **Visit card.** Doctor name, date, time and clinic, with the countdown ("12 días"). After the visit it reads "Visita del 20 de octubre" (Visit on October 20).
2. **Before the visit: prep list (B8).** What to bring and do, as a short checklist: medication bottles, glucose log or meter, ID and insurance card, arrive 15 minutes early.
3. **Before the visit: questions for the doctor.** The question queue shown in Spanish and English side by side, large enough to hand the phone to the doctor. Voice-captured questions keep their "voice" tag.
4. **After the visit: summary (E1).** Medications first (name, dose, when, what it's for), then instructions, follow-up, tests and warning signs, with the "Talk about my visit" button for the explainer call.
   1. Until the doctor releases it (D6), show "Su médico está revisando su resumen" (Your doctor is reviewing your summary).
   2. Each question from the queue is marked answered or carried over to the next visit (D4).
5. **After the visit: checklist.** One item per task from the summary: pick up a new prescription, book the follow-up, get ordered tests. Patients tick items off.
6. **Past visits.** A list below, newest first, each opening its summary.
7. **Safety line.** "Not for emergencies. Call 911." Required here (F3).

**Two decisions for the team**

- **Questions tab overlap.** Questions now appear here and in the Questions tab. Either drop the Questions tab and make this list editable, or keep the tab for editing and show this list read-only for the doctor.
- **Checklist data.** Items can come from the summary's `follow_up` and `tests_ordered` fields, but ticking them needs a new field in the schema. P1, and Dev A approves schema changes.

## Settings (Ajustes) / user page

Settings holds the profile fields from onboarding (A1) plus a few comfort options, each editable in one tap. Top to bottom:

1. **Profile.** Name and phone number (+1 format). Reason for visit, editable.
2. **Language.** English / Español as two large buttons. Switching changes every screen (A3) and the language of the next call.
3. **Daily call time.** A time picker: "¿A qué hora le llamamos?" (When should we call you?).
4. **Automated calls consent.** A toggle with one line explaining what it means. Turning it off stops daily calls; confirm before it takes effect (F4).
5. **Text size.** Normal / Large / Extra large, for older users.
6. **Notifications.** On or off for call reminders and "your summary is ready."
7. **My appointment.** Doctor, date and clinic, read-only: the clinic sets these.
8. **About and safety.** "Not medical advice. Not for emergencies: call 911," and the prototype notice.
9. **Sign out.** Demo accounts only.

Leave out government ID and healthcare number: the spec uses no real patient data. Caregiver contact for text summaries (E5) is P2, so mention it in the pitch only.

## AI chat

A floating chat button in the top right opens a full-screen chat log with a text box and a big mic button. It is new scope: the spec has voice calls but no text chat, so treat it as P1 once the P0 demo path works.

**Floating button**

- Persists on every screen and is not a tab of its own. At least 44 pt, with a chat icon and the label "Pregunte" (Ask) so older users know what it does.
- It collides with the notification bell in the Home header. Move the bell into the Home content, or make the chat button part of the header on every tab instead of floating.
- It opens the chat log over the current screen, and closing it returns the patient to where they were. Hide it on the chat log itself, the "Call 911 now" screen, and onboarding.

**Chat log screen**

1. **Header.** "Asistente" (Assistant), a close button, and one line: "No es consejo médico. Emergencias: 911" (Not medical advice. Emergencies: 911).
2. **Message history.** Newest at the bottom, large text, the patient's messages on the right. Answers about the visit show which passage they came from (F2).
3. **Suggested prompts** when the log is empty: "Tengo un síntoma nuevo" (I have a new symptom), "¿Cuándo tomo mi pastilla?" (When do I take my pill?), "Agregar pregunta para el doctor" (Add a question for the doctor).
4. **Bottom bar.** A text box with a send button, and a big round mic button beside it, the largest target on the screen. While listening, the mic shows a pulsing ring and live captions.

**What the chat can do (same rules as the voice agents)**

- Before the visit, it acts like the check-in agent: logs symptoms and adds questions. Its messages run through the same Claude extraction pipeline as calls.
- After the visit, it acts like the explainer: answers only from the visit record, otherwise "Please call your clinic."
- It never diagnoses or recommends medicine. A red flag opens the full-screen "Call 911 now" screen and alerts the doctor.

**Build notes**

- The mic in Expo Go can't stream live audio. For P1, record a short clip with `expo-audio`, transcribe it, and send the text, or have the mic trigger "Call me now." Live voice needs the dev build (B4).
- Chat messages need a home in the schema, such as a `conversations` row with channel `app` plus a messages array. Dev A approves the change.
