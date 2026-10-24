// SHARED FILE. Dev A approves changes.
// Demo data: one Spanish-speaking patient with type 2 diabetes, one upcoming appointment, and SEED_DAYS
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
// Story: type 2 diabetes waiting for endocrinology. High sugar (thirst, urination, fatigue) at
// first; her clinic adds glipizide on day 1, and from day 2 she has low-sugar shaky, dizzy spells.
// Glucose readings live in the quotes (no schema field); "metformina" is there for exact search.
const DAYS: SeedDay[] = [
  {
    summaryEnglish:
      "Reports three weeks of strong thirst, waking three times a night to urinate, and fatigue. Morning sugar 250.",
    transcript: [
      { role: "agent", text: "Hola María, ¿cómo se siente hoy?" },
      {
        role: "user",
        text: "Muy cansada. Tengo mucha sed todo el día y me levanto tres veces en la noche al baño. El azúcar me salió en 250.",
      },
    ],
    symptoms: [
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 6,
        change: "new",
        onset: "about three weeks ago",
        timing: "all day",
        quoteOriginal: "Tengo mucha sed todo el día, tomo y tomo agua y no se me quita.",
        quoteEnglish: "I'm very thirsty all day, I drink and drink water and it doesn't go away.",
      },
      {
        symptom: "frequent urination",
        symptomOriginal: "orinar mucho",
        severity: 5,
        change: "new",
        onset: "about three weeks ago",
        timing: "at night, about three times",
        quoteOriginal: "Me levanto como tres veces cada noche para ir al baño.",
        quoteEnglish: "I get up about three times every night to go to the bathroom.",
      },
      {
        symptom: "fatigue",
        symptomOriginal: "cansancio",
        severity: 6,
        change: "new",
        character: "tired all day, even after sleeping",
        quoteOriginal: "Estoy muy cansada todo el día. En la mañana el azúcar me salió en 250.",
        quoteEnglish: "I'm very tired all day. This morning my sugar was 250.",
      },
    ],
    medications: [{ medication: "metformin", action: "taken", note: "500 mg twice a day" }],
  },
  {
    summaryEnglish:
      "Thirst and urination unchanged, sugar 240. Clinic started glipizide 5 mg in the morning.",
    transcript: [
      { role: "agent", text: "¿La sed está mejor, peor o igual que ayer?" },
      { role: "user", text: "Igual. La clínica me dio una pastilla nueva, glipizida, para tomar en la mañana." },
    ],
    symptoms: [
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 6,
        change: "same",
        quoteOriginal: "Igual de sed que ayer. El azúcar en 240.",
        quoteEnglish: "Same thirst as yesterday. Sugar at 240.",
      },
      {
        symptom: "frequent urination",
        symptomOriginal: "orinar mucho",
        severity: 5,
        change: "same",
        quoteOriginal: "Me levanté tres veces otra vez.",
        quoteEnglish: "I got up three times again.",
      },
      {
        symptom: "fatigue",
        symptomOriginal: "cansancio",
        severity: 6,
        change: "same",
        quoteOriginal: "Igual de cansada.",
        quoteEnglish: "Just as tired.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "started", note: "5 mg every morning, from her clinic" },
    ],
  },
  {
    summaryEnglish:
      "New shaky, sweaty dizzy spell before lunch with sugar 65, relieved by juice. Thirst a little better.",
    transcript: [
      { role: "agent", text: "¿Algo nuevo hoy?" },
      { role: "user", text: "Antes de comer me puse temblorosa y mareada. El azúcar me salió en 65. Me tomé un jugo." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 5,
        change: "new",
        onset: "today, after starting glipizide",
        duration: "about 15 minutes",
        character: "shaky, sweaty, lightheaded",
        relieving: "drinking juice",
        timing: "before meals",
        quoteOriginal: "Antes de comer me puse temblorosa y mareada, y sudando. El azúcar me salió en 65.",
        quoteEnglish: "Before eating I got shaky and dizzy, and sweaty. My sugar was 65.",
      },
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 5,
        change: "better",
        quoteOriginal: "La sed un poquito mejor.",
        quoteEnglish: "The thirst is a little better.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  {
    summaryEnglish:
      "Another shaky spell before dinner, sugar 70. New tingling in both feet at night. Missed evening metformin.",
    transcript: [
      { role: "agent", text: "¿Tomó sus medicinas?" },
      { role: "user", text: "Se me olvidó la metformina en la noche. Y otra vez me temblé antes de la cena." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 5,
        change: "same",
        quoteOriginal: "Otra vez me puse temblorosa antes de la cena, el azúcar en 70.",
        quoteEnglish: "I got shaky again before dinner, sugar at 70.",
      },
      {
        symptom: "tingling",
        symptomOriginal: "hormigueo",
        severity: 3,
        change: "new",
        onset: "this week",
        location: "both feet",
        character: "pins and needles",
        timing: "at night",
        quoteOriginal: "Siento hormigueo en los dos pies en la noche, como agujitas.",
        quoteEnglish: "I feel tingling in both feet at night, like little needles.",
      },
      {
        symptom: "fatigue",
        symptomOriginal: "cansancio",
        severity: 5,
        change: "better",
        quoteOriginal: "Un poco menos cansada.",
        quoteEnglish: "A little less tired.",
      },
    ],
    medications: [
      { medication: "metformin", action: "missed", note: "evening dose" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  {
    summaryEnglish:
      "Worse low-sugar spell at the store, sugar 58, ate candy. Thirst improving, morning sugar 180. Tingling unchanged.",
    transcript: [
      { role: "agent", text: "¿El mareo está mejor, peor o igual?" },
      { role: "user", text: "Peor. En la tienda me sentí muy débil y sudando, el azúcar estaba en 58." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 6,
        change: "worse",
        aggravating: "skipping lunch",
        relieving: "eating candy",
        quoteOriginal: "En la tienda me sentí muy débil y sudando, el azúcar estaba en 58. Me comí unos dulces.",
        quoteEnglish: "At the store I felt very weak and sweaty, my sugar was 58. I ate some candy.",
      },
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 4,
        change: "better",
        quoteOriginal: "Ya no tengo tanta sed desde que tomo bien la metformina. En la mañana, 180.",
        quoteEnglish: "I'm not as thirsty since I've been taking the metformin properly. In the morning, 180.",
      },
      {
        symptom: "tingling",
        symptomOriginal: "hormigueo",
        severity: 3,
        change: "same",
        quoteOriginal: "El hormigueo en los pies igual.",
        quoteEnglish: "The tingling in my feet is the same.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  {
    summaryEnglish: "Shaky spells unchanged before meals. Thirst and tingling unchanged.",
    transcript: [
      { role: "agent", text: "¿Hay algo que quiera preguntarle al doctor?" },
      { role: "user", text: "Sí, ¿qué hago si el azúcar me baja otra vez?" },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 6,
        change: "same",
        quoteOriginal: "Sigue igual, me tiembla todo antes de comer.",
        quoteEnglish: "It's the same, I shake all over before eating.",
      },
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 4,
        change: "same",
        quoteOriginal: "La sed igual, no tan mal.",
        quoteEnglish: "The thirst is the same, not so bad.",
      },
      {
        symptom: "tingling",
        symptomOriginal: "hormigueo",
        severity: 3,
        change: "same",
        quoteOriginal: "Los pies igual, con hormigueo en la noche.",
        quoteEnglish: "My feet are the same, tingling at night.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
];

const QUESTIONS = [
  {
    textOriginal: "¿La pastilla nueva me está bajando mucho el azúcar?",
    textEnglish: "Is the new pill lowering my sugar too much?",
    source: "typed" as const,
  },
  {
    textOriginal: "¿Qué hago si el azúcar me baja otra vez?",
    textEnglish: "What do I do if my sugar drops again?",
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
    reasonForVisit: "Type 2 diabetes: high sugar, then low-sugar spells on a new medicine",
  });

  const appointmentId = await ctx.db.insert("appointments", {
    patientId,
    doctorName: "Dr. Sarah Chen (Endocrinology)",
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
      "Spanish-speaking patient with type 2 diabetes. Three weeks of thirst, nighttime urination and " +
      "fatigue with morning sugars of 240-250, improving on metformin (one missed evening dose). Since " +
      "glipizide 5 mg was added, repeated shaky, sweaty spells before meals with sugars of 58-70, " +
      "worsening (6/10), treated with juice or candy. New tingling in both feet at night. Open " +
      "questions: whether the new pill is lowering her sugar too much; what to do when it drops.",
    createdAt: now,
    source: "seed",
  });

  // Runs after this mutation commits, so it sees every row inserted above.
  await ctx.scheduler.runAfter(0, internal.elastic.reindexAll, {});

  return { patientId, appointmentId };
}
