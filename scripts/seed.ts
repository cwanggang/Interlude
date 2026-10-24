// SHARED FILE. Dev A approves changes.
// Demo data: one Spanish-speaking patient, one upcoming appointment, and SEED_DAYS
// days of processed check-in calls (today's comes from the live demo call).
// Run with `npm run seed` (wraps `npx convex run seed:run`). Wipes every table first, then
// schedules elastic.reindexAll so the Elastic indices match Convex (no stale duplicates).
// Pass a real US phone for live calls: npx convex run seed:run '{"phone":"+15025550123"}'
import type { MutationCtx } from "../convex/_generated/server";
import type { TableNames } from "../convex/_generated/dataModel";
import { internal } from "../convex/_generated/api";

const SEED_DAYS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEZONE = "America/Los_Angeles";

const TABLES: TableNames[] = [
  "briefs",
  "alerts",
  "questions",
  "medicationEvents",
  "symptomEntries",
  "visits",
  "conversations",
  "appointments",
  "patients",
];

type SeedSymptom = {
  symptom: string;
  symptomOriginal: string;
  severity?: number;
  change?: "new" | "better" | "worse" | "same";
  onset?: string;
  location?: string;
  duration?: string;
  character?: string;
  aggravating?: string;
  relieving?: string;
  timing?: string;
  quoteOriginal: string;
  quoteEnglish: string;
};

type SeedDay = {
  summaryEnglish: string;
  transcript: { role: string; text: string }[];
  symptoms: SeedSymptom[];
  medications: { medication: string; action: string; note?: string }[];
};

// Index 0 is the oldest day (SEED_DAYS days ago).
const DAYS: SeedDay[] = [
  {
    summaryEnglish:
      "Reports dizziness for about two weeks, worse when standing up, and a frontal headache.",
    transcript: [
      { role: "agent", text: "Hola María, ¿cómo se siente hoy?" },
      { role: "user", text: "Me mareo mucho cuando me levanto de la cama. Y me duele la frente." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo",
        severity: 4,
        change: "new",
        onset: "about two weeks ago",
        duration: "a few minutes each episode",
        character: "room spinning",
        aggravating: "standing up quickly, getting out of bed",
        relieving: "lying down",
        timing: "mostly in the morning",
        quoteOriginal: "Me mareo mucho cuando me levanto de la cama, como que todo da vueltas.",
        quoteEnglish: "I get very dizzy when I get out of bed, like everything is spinning.",
      },
      {
        symptom: "headache",
        symptomOriginal: "dolor de cabeza",
        severity: 6,
        change: "new",
        onset: "about one week ago",
        location: "forehead and temples",
        character: "pressure",
        timing: "afternoons",
        quoteOriginal: "Me duele la frente, como una presión, sobre todo en la tarde.",
        quoteEnglish: "My forehead hurts, like pressure, especially in the afternoon.",
      },
    ],
    medications: [],
  },
  {
    summaryEnglish: "Dizziness unchanged. Headache unchanged.",
    transcript: [
      { role: "agent", text: "¿El mareo está mejor, peor o igual que ayer?" },
      { role: "user", text: "Igual. Y la cabeza también igual." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo",
        severity: 4,
        change: "same",
        quoteOriginal: "Igual que ayer, me mareé otra vez en la mañana.",
        quoteEnglish: "Same as yesterday, I got dizzy again in the morning.",
      },
      {
        symptom: "headache",
        symptomOriginal: "dolor de cabeza",
        severity: 6,
        change: "same",
        quoteOriginal: "La cabeza también igual, un seis.",
        quoteEnglish: "My head is the same too, a six.",
      },
    ],
    medications: [],
  },
  {
    summaryEnglish:
      "Dizziness worse, nearly lost balance in the kitchen. Started ibuprofen for headache.",
    transcript: [
      { role: "agent", text: "¿El mareo está mejor, peor o igual?" },
      { role: "user", text: "Peor. Casi me caigo en la cocina. Empecé a tomar ibuprofeno para la cabeza." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo",
        severity: 5,
        change: "worse",
        aggravating: "turning head quickly",
        quoteOriginal: "Peor. Casi me caigo en la cocina cuando volteé rápido.",
        quoteEnglish: "Worse. I almost fell in the kitchen when I turned quickly.",
      },
      {
        symptom: "headache",
        symptomOriginal: "dolor de cabeza",
        severity: 5,
        change: "better",
        relieving: "ibuprofen",
        quoteOriginal: "La cabeza un poco mejor con el ibuprofeno.",
        quoteEnglish: "My head is a little better with the ibuprofen.",
      },
    ],
    medications: [{ medication: "ibuprofen", action: "started", note: "400 mg for headache" }],
  },
  {
    summaryEnglish: "Dizziness unchanged. Headache improving on ibuprofen. New mild nausea.",
    transcript: [
      { role: "agent", text: "¿Algo nuevo hoy?" },
      { role: "user", text: "Tengo un poco de náuseas cuando me mareo." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo",
        severity: 5,
        change: "same",
        quoteOriginal: "El mareo sigue igual.",
        quoteEnglish: "The dizziness is the same.",
      },
      {
        symptom: "headache",
        symptomOriginal: "dolor de cabeza",
        severity: 4,
        change: "better",
        quoteOriginal: "La cabeza está mejor, un cuatro.",
        quoteEnglish: "My head is better, a four.",
      },
      {
        symptom: "nausea",
        symptomOriginal: "náuseas",
        severity: 3,
        change: "new",
        onset: "today",
        aggravating: "during dizzy spells",
        quoteOriginal: "Tengo un poco de náuseas cuando me mareo.",
        quoteEnglish: "I feel a little nauseous when I get dizzy.",
      },
    ],
    medications: [{ medication: "ibuprofen", action: "taken" }],
  },
  {
    summaryEnglish: "Dizziness worse. Headache better. Nausea slightly worse. Missed ibuprofen.",
    transcript: [
      { role: "agent", text: "¿Tomó alguna medicina?" },
      { role: "user", text: "Hoy se me olvidó el ibuprofeno. El mareo está peor." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo",
        severity: 6,
        change: "worse",
        quoteOriginal: "El mareo está peor, tuve que sentarme en la ducha.",
        quoteEnglish: "The dizziness is worse, I had to sit down in the shower.",
      },
      {
        symptom: "headache",
        symptomOriginal: "dolor de cabeza",
        severity: 3,
        change: "better",
        quoteOriginal: "La cabeza casi no me duele.",
        quoteEnglish: "My head barely hurts.",
      },
      {
        symptom: "nausea",
        symptomOriginal: "náuseas",
        severity: 4,
        change: "worse",
        quoteOriginal: "Las náuseas un poquito más fuertes.",
        quoteEnglish: "The nausea is a little stronger.",
      },
    ],
    medications: [{ medication: "ibuprofen", action: "missed" }],
  },
  {
    summaryEnglish: "Dizziness unchanged at 6. Headache stable. Nausea unchanged.",
    transcript: [
      { role: "agent", text: "¿Hay algo que quiera preguntarle al doctor?" },
      { role: "user", text: "Sí, ¿puedo seguir tomando ibuprofeno?" },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo",
        severity: 6,
        change: "same",
        quoteOriginal: "Sigue igual, un seis.",
        quoteEnglish: "It's the same, a six.",
      },
      {
        symptom: "headache",
        symptomOriginal: "dolor de cabeza",
        severity: 3,
        change: "same",
        quoteOriginal: "La cabeza igual, no tan mal.",
        quoteEnglish: "My head is the same, not so bad.",
      },
      {
        symptom: "nausea",
        symptomOriginal: "náuseas",
        severity: 4,
        change: "same",
        quoteOriginal: "Las náuseas igual.",
        quoteEnglish: "The nausea is the same.",
      },
    ],
    medications: [{ medication: "ibuprofen", action: "taken" }],
  },
];

const QUESTIONS = [
  {
    textOriginal: "¿Por qué me mareo cuando me levanto?",
    textEnglish: "Why do I get dizzy when I stand up?",
    source: "typed" as const,
  },
  {
    textOriginal: "¿Puedo seguir tomando ibuprofeno?",
    textEnglish: "Can I keep taking ibuprofen?",
    source: "voice" as const,
  },
];

/** "YYYY-MM-DD" in the given IANA time zone. */
function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(ms));
}

export async function seed(ctx: MutationCtx, args: { phone?: string }) {
  for (const table of TABLES) {
    for (const doc of await ctx.db.query(table).collect()) {
      await ctx.db.delete(doc._id);
    }
  }

  const now = Date.now();
  const patientId = await ctx.db.insert("patients", {
    name: "María González",
    phone: args.phone ?? process.env.DEMO_PHONE ?? "+15555550100",
    language: "es",
    callTimeLocal: "18:30",
    timezone: TIMEZONE,
    consentCalls: true,
    reasonForVisit: "Dizziness and headaches",
  });

  const appointmentId = await ctx.db.insert("appointments", {
    patientId,
    doctorName: "Dr. Sarah Chen",
    scheduledAt: now + 5 * DAY_MS,
    status: "upcoming",
  });

  for (let i = 0; i < DAYS.length; i++) {
    const day = DAYS[i];
    const startedAt = now - (SEED_DAYS - i) * DAY_MS;
    const date = localDate(startedAt, TIMEZONE);

    const conversationId = await ctx.db.insert("conversations", {
      patientId,
      appointmentId,
      channel: "phone",
      mode: "checkin",
      cartesiaCallId: `seed-call-${i}`,
      status: "processed",
      language: "es",
      transcript: day.transcript,
      summaryEnglish: day.summaryEnglish,
      startedAt,
    });

    for (const s of day.symptoms) {
      await ctx.db.insert("symptomEntries", {
        patientId,
        appointmentId,
        conversationId,
        date,
        ...s,
      });
    }

    for (const m of day.medications) {
      await ctx.db.insert("medicationEvents", { patientId, conversationId, date, ...m });
    }
  }

  for (let i = 0; i < QUESTIONS.length; i++) {
    await ctx.db.insert("questions", {
      patientId,
      appointmentId,
      ...QUESTIONS[i],
      status: "open",
      order: i,
    });
  }

  // Placeholder so the brief card has data before the Workflow runs; "Generate brief" replaces it.
  await ctx.db.insert("briefs", {
    patientId,
    appointmentId,
    textEnglish:
      "Spanish-speaking patient with 2 weeks of positional dizziness, worsening from 4/10 to 6/10, " +
      "now with nausea during spells and a near-fall in the kitchen. Headache improved on ibuprofen " +
      "(one missed dose). Open questions: cause of dizziness on standing; whether to continue ibuprofen.",
    createdAt: now,
    source: "seed",
  });

  // Runs after this mutation commits, so it sees every row inserted above.
  await ctx.scheduler.runAfter(0, internal.elastic.reindexAll, {});

  return { patientId, appointmentId };
}
