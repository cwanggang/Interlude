// SHARED FILE. Dev A approves changes.
// Demo data v2 (SPEC.md "Figma scope (v2)" → Demo data). Mariela, a Spanish-speaking patient
// with type 2 diabetes, saw Dr. Lee 12 days ago (glipizide added; visit released, with tasks and
// answered/carried-over questions). Since then: 12 days of check-ins (one missed call) with
// low-sugar spells, and a follow-up with Dr. Lee later today, which the demo records live.
// Five more patients fill Dr. Lee's week for the doctor's Home.
// Run with `npm run seed` (wraps `npx convex run seed:run`). Wipes every table first, then
// schedules seed.reindex so the Elastic indices match Convex (no stale duplicates).
// Pass a real US phone for live calls: npx convex run seed:run '{"phone":"+15025550123"}'
// Move the visit: '{"visitInMinutes":25}' (default 120).
import type { MutationCtx } from "../convex/_generated/server";
import type { Id, TableNames } from "../convex/_generated/dataModel";
import { internal } from "../convex/_generated/api";
import { DAY_MS, localDate } from "../convex/lib/time";

const TIMEZONE = "America/Los_Angeles";
const DOCTOR = "Dr. Lee";
const CLINIC = "Valley Endocrinology Clinic";
const PAST_VISIT_DAYS_AGO = 12;

const TABLES: TableNames[] = [
  "chatMessages",
  "visitTasks",
  "glucoseReadings",
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
  daysAgo: number;
  /** No answer: stored as a failed call with no transcript (the Home tile's "missed" state). */
  missed?: boolean;
  summaryEnglish?: string;
  summaryPatientLang?: string;
  transcript?: { role: string; text: string }[];
  symptoms?: SeedSymptom[];
  medications?: { medication: string; action: string; note?: string }[];
};

// Story: high sugar (thirst, urination, fatigue) on metformin alone → Dr. Lee adds glipizide
// 12 days ago → low-sugar shaky, dizzy spells before meals (58-70). Glucose readings live in the
// quotes; "metformina" is there for exact-name search.
const MARIELA_DAYS: SeedDay[] = [
  {
    daysAgo: 14,
    summaryEnglish:
      "Reports three weeks of strong thirst, waking three times a night to urinate, and fatigue. Morning sugar 250.",
    summaryPatientLang:
      "Tiene mucha sed desde hace tres semanas, se levanta tres veces en la noche al baño y está cansada. Azúcar en la mañana: 250.",
    transcript: [
      { role: "agent", text: "Hola Mariela, ¿cómo se siente hoy?" },
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
    daysAgo: 13,
    summaryEnglish: "Thirst, urination and fatigue unchanged. Sugar 240. Wants to ask about another medicine.",
    summaryPatientLang:
      "La sed, el baño en la noche y el cansancio siguen igual. Azúcar: 240. Quiere preguntar por otra medicina.",
    transcript: [
      { role: "agent", text: "¿La sed está mejor, peor o igual que ayer?" },
      { role: "user", text: "Igual. El azúcar en 240. ¿Será que necesito otra medicina?" },
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
    medications: [{ medication: "metformin", action: "taken" }],
  },
  {
    daysAgo: 12,
    summaryEnglish:
      "Saw Dr. Lee today; started glipizide 5 mg in the morning. Thirst unchanged. Sugar 235.",
    summaryPatientLang:
      "Hoy vio al Dr. Lee y empezó la glipizida de 5 mg en la mañana. La sed sigue igual. Azúcar: 235.",
    transcript: [
      { role: "agent", text: "¿Cómo le fue hoy?" },
      { role: "user", text: "Fui con el Dr. Lee y me dio una pastilla nueva, la glipizida, para la mañana. La sed igual." },
    ],
    symptoms: [
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 6,
        change: "same",
        quoteOriginal: "La sed igual. Hoy el azúcar en 235.",
        quoteEnglish: "The thirst is the same. Sugar 235 today.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "started", note: "5 mg every morning, from Dr. Lee" },
    ],
  },
  {
    daysAgo: 11,
    summaryEnglish: "Thirst a little better, sugar 210. Took both medicines.",
    summaryPatientLang: "La sed un poco mejor, azúcar 210. Tomó las dos medicinas.",
    transcript: [
      { role: "agent", text: "¿Tomó sus medicinas hoy?" },
      { role: "user", text: "Sí, las dos. La sed un poquito mejor, el azúcar en 210." },
    ],
    symptoms: [
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 5,
        change: "better",
        quoteOriginal: "La sed un poquito mejor, el azúcar en 210.",
        quoteEnglish: "The thirst is a little better, sugar at 210.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  {
    daysAgo: 10,
    summaryEnglish:
      "New shaky, sweaty dizzy spell before lunch with sugar 65, relieved by juice. Thirst a little better.",
    summaryPatientLang:
      "Nuevo: antes del almuerzo se sintió temblorosa, sudada y mareada, con azúcar en 65; mejoró con jugo. La sed un poco mejor.",
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
        onset: "two days after starting glipizide",
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
        change: "same",
        quoteOriginal: "La sed más o menos igual.",
        quoteEnglish: "The thirst is about the same.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  { daysAgo: 9, missed: true },
  {
    daysAgo: 8,
    summaryEnglish:
      "Another shaky spell before dinner, sugar 70. New tingling in both feet at night. Missed evening metformin.",
    summaryPatientLang:
      "Otra vez temblorosa antes de la cena, azúcar 70. Nuevo hormigueo en los dos pies en la noche. Olvidó la metformina de la noche.",
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
    daysAgo: 7,
    summaryEnglish: "Shaky before lunch again, sugar 68. Thirst better.",
    summaryPatientLang: "Otra vez temblorosa antes del almuerzo, azúcar 68. La sed mejor.",
    transcript: [
      { role: "agent", text: "¿El mareo está mejor, peor o igual?" },
      { role: "user", text: "Igual. Antes del almuerzo me tembló todo, 68. La sed ya mejor." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 5,
        change: "same",
        timing: "before lunch",
        quoteOriginal: "Antes del almuerzo me tembló todo, el azúcar en 68.",
        quoteEnglish: "Before lunch I was shaking all over, sugar at 68.",
      },
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 4,
        change: "better",
        quoteOriginal: "La sed ya está mejor.",
        quoteEnglish: "The thirst is better now.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  {
    daysAgo: 6,
    summaryEnglish:
      "Worse low-sugar spell at the store, sugar 58, ate candy. Thirst improving, morning sugar 180. Tingling unchanged.",
    summaryPatientLang:
      "Peor: en la tienda se sintió muy débil y sudada, azúcar 58; comió dulces. La sed mejora, azúcar en la mañana 180. El hormigueo igual.",
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
    daysAgo: 5,
    summaryEnglish: "Shaky spells unchanged before meals. Thirst and tingling unchanged. Asked what to do when sugar drops.",
    summaryPatientLang:
      "Los temblores antes de comer siguen igual. La sed y el hormigueo igual. Preguntó qué hacer si el azúcar baja.",
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
  {
    daysAgo: 4,
    summaryEnglish: "Woke up sweaty and shaky at night, sugar 66. Fatigue a little better.",
    summaryPatientLang: "Se despertó sudada y temblorosa en la noche, azúcar 66. El cansancio un poco mejor.",
    transcript: [
      { role: "agent", text: "¿Algo nuevo desde ayer?" },
      { role: "user", text: "Me desperté en la noche sudando y temblando. El azúcar en 66." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 6,
        change: "same",
        timing: "before meals, and once at night",
        quoteOriginal: "Me desperté en la noche sudando y temblando. El azúcar en 66.",
        quoteEnglish: "I woke up at night sweating and shaking. Sugar at 66.",
      },
      {
        symptom: "fatigue",
        symptomOriginal: "cansancio",
        severity: 4,
        change: "better",
        quoteOriginal: "Menos cansada que antes.",
        quoteEnglish: "Less tired than before.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  {
    daysAgo: 3,
    summaryEnglish: "Worse dizzy spell, had to sit down, sugar 60, relieved by juice.",
    summaryPatientLang: "Mareo peor, tuvo que sentarse, azúcar 60; mejoró con jugo.",
    transcript: [
      { role: "agent", text: "¿El mareo está mejor, peor o igual?" },
      { role: "user", text: "Peor. Me sentí muy mareada y tuve que sentarme. El azúcar en 60. Me tomé un jugo." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 7,
        change: "worse",
        relieving: "juice and sitting down",
        quoteOriginal: "Me sentí muy mareada y tuve que sentarme. El azúcar en 60.",
        quoteEnglish: "I felt very dizzy and had to sit down. Sugar at 60.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
  {
    daysAgo: 2,
    summaryEnglish: "Shaky spells slightly less. Thirst mild. Tingling in feet unchanged.",
    summaryPatientLang: "Los temblores un poco menos. Poca sed. El hormigueo en los pies igual.",
    transcript: [
      { role: "agent", text: "¿Cómo están los temblores hoy?" },
      { role: "user", text: "Un poquito mejor. Casi no tengo sed. Los pies igual." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 6,
        change: "better",
        quoteOriginal: "Un poquito mejor los temblores.",
        quoteEnglish: "The shaking is a little better.",
      },
      {
        symptom: "thirst",
        symptomOriginal: "sed",
        severity: 3,
        change: "better",
        quoteOriginal: "Casi no tengo sed.",
        quoteEnglish: "I'm hardly thirsty.",
      },
      {
        symptom: "tingling",
        symptomOriginal: "hormigueo",
        severity: 3,
        change: "same",
        quoteOriginal: "Los pies igual.",
        quoteEnglish: "My feet are the same.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "missed", note: "morning dose, afraid of low sugar" },
    ],
  },
  {
    daysAgo: 1,
    summaryEnglish: "Shaky before breakfast, sugar 64. Asked whether the new pill is lowering her sugar too much.",
    summaryPatientLang:
      "Temblorosa antes del desayuno, azúcar 64. Preguntó si la pastilla nueva le está bajando mucho el azúcar.",
    transcript: [
      { role: "agent", text: "¿Hay algo que quiera preguntarle al doctor?" },
      { role: "user", text: "¿La pastilla nueva me está bajando mucho el azúcar? Hoy antes del desayuno estaba en 64." },
    ],
    symptoms: [
      {
        symptom: "dizziness",
        symptomOriginal: "mareo y temblores",
        severity: 6,
        change: "same",
        timing: "before breakfast",
        quoteOriginal: "Hoy antes del desayuno estaba temblorosa, el azúcar en 64.",
        quoteEnglish: "Today before breakfast I was shaky, sugar at 64.",
      },
    ],
    medications: [
      { medication: "metformin", action: "taken" },
      { medication: "glipizide", action: "taken" },
    ],
  },
];

// A6 glucose readings, keyed by daysAgo: [mg/dL, context, index of the symptom whose quote
// holds the number]. Same numbers as the quotes above, so the chart and the quotes agree.
type GlucoseContext = "fasting" | "before_meal" | "after_meal" | "bedtime" | "unknown";
const MARIELA_GLUCOSE: Record<number, [number, GlucoseContext, number][]> = {
  14: [[250, "fasting", 2]],
  13: [[240, "unknown", 0]],
  12: [[235, "unknown", 0]],
  11: [[210, "unknown", 0]],
  10: [[65, "before_meal", 0]],
  8: [[70, "before_meal", 0]],
  7: [[68, "before_meal", 0]],
  6: [[58, "unknown", 0], [180, "fasting", 1]],
  4: [[66, "bedtime", 0]],
  3: [[60, "unknown", 0]],
  1: [[64, "fasting", 0]],
};

// The past visit with Dr. Lee (VisitSummary v2). source_turn indexes PAST_TRANSCRIPT.
const PAST_TRANSCRIPT = [
  {
    speaker: "doctor",
    textEnglish: "Hi Mariela, I'm Dr. Lee. What brings you in today?",
    textPatientLang: "Hola Mariela, soy el Dr. Lee. ¿Qué la trae hoy?",
  },
  {
    speaker: "patient",
    textEnglish: "I've been very thirsty for weeks and I get up at night to urinate. My sugar is around 250.",
    textPatientLang: "Tengo mucha sed desde hace semanas y me levanto en la noche al baño. El azúcar me sale como en 250.",
  },
  {
    speaker: "doctor",
    textEnglish: "Are you taking your metformin?",
    textPatientLang: "¿Está tomando su metformina?",
  },
  {
    speaker: "patient",
    textEnglish: "Yes, 500 milligrams twice a day. Do I need another medicine?",
    textPatientLang: "Sí, 500 miligramos dos veces al día. ¿Necesito otra medicina?",
  },
  {
    speaker: "doctor",
    textEnglish:
      "Yes. Your sugar is too high on metformin alone. We'll add glipizide, 5 milligrams every morning with breakfast. Keep the metformin, 500 twice a day with breakfast and dinner.",
    textPatientLang:
      "Sí. Su azúcar está muy alta solo con metformina. Vamos a agregar glipizida, 5 miligramos cada mañana con el desayuno. Siga con la metformina, 500 dos veces al día con el desayuno y la cena.",
  },
  {
    speaker: "patient",
    textEnglish: "Why am I so thirsty?",
    textPatientLang: "¿Por qué tengo tanta sed?",
  },
  {
    speaker: "doctor",
    textEnglish: "The thirst comes from the high sugar. It should get better as your sugar comes down.",
    textPatientLang: "La sed viene del azúcar alta. Debe mejorar cuando le baje el azúcar.",
  },
  {
    speaker: "doctor",
    textEnglish: "Check your sugar every morning before breakfast and write it down.",
    textPatientLang: "Revise su azúcar cada mañana antes del desayuno y apúntelo.",
  },
  {
    speaker: "doctor",
    textEnglish:
      "If you feel shaky, sweaty or dizzy, check your sugar. If it is under 70, drink half a cup of juice.",
    textPatientLang:
      "Si se siente temblorosa, sudada o mareada, revise su azúcar. Si está debajo de 70, tome media taza de jugo.",
  },
  {
    speaker: "doctor",
    textEnglish: "Let's get a fasting blood test next week, and I'll see you again in two weeks.",
    textPatientLang: "Hagamos un análisis de sangre en ayunas la próxima semana, y la veo otra vez en dos semanas.",
  },
  { speaker: "patient", textEnglish: "Thank you, doctor.", textPatientLang: "Gracias, doctor." },
];

function pastSummary(lang: "en" | "es") {
  const es = lang === "es";
  return {
    assessment: es
      ? "Diabetes tipo 2 con el azúcar alta (alrededor de 250) solo con metformina. Se agrega una segunda medicina."
      : "Type 2 diabetes with high blood sugar (around 250) on metformin alone. Adding a second medicine.",
    medications: [
      {
        key: "glipizide",
        name: es ? "Glipizida" : "Glipizide",
        dose: "5 mg",
        schedule: es ? "Cada mañana con el desayuno" : "Every morning with breakfast",
        times_of_day: ["morning"],
        purpose: es ? "Baja el azúcar" : "Lowers blood sugar",
        change: "new",
        source_turn: 4,
      },
      {
        key: "metformin",
        name: es ? "Metformina" : "Metformin",
        dose: "500 mg",
        schedule: es ? "Dos veces al día, con el desayuno y la cena" : "Twice a day, with breakfast and dinner",
        times_of_day: ["morning", "evening"],
        purpose: es ? "Baja el azúcar" : "Lowers blood sugar",
        change: "same",
        source_turn: 4,
      },
    ],
    instructions: [
      {
        text: es
          ? "Revise su azúcar cada mañana antes del desayuno y apúntelo."
          : "Check your sugar every morning before breakfast and write it down.",
        source_turn: 7,
      },
      {
        text: es
          ? "Si se siente temblorosa, sudada o mareada, revise su azúcar. Si está debajo de 70, tome media taza de jugo."
          : "If you feel shaky, sweaty or dizzy, check your sugar. If it is under 70, drink half a cup of juice.",
        source_turn: 8,
      },
    ],
    tests_ordered: [
      { text: es ? "Análisis de sangre en ayunas la próxima semana" : "Fasting blood test next week", source_turn: 9 },
    ],
    follow_up: es ? "Regresar con el Dr. Lee en dos semanas" : "Return to see Dr. Lee in two weeks",
    warning_signs: es
      ? ["Azúcar debajo de 70 con temblores, sudor o mareo", "Confusión o mucho sueño: llame al 911"]
      : ["Sugar under 70 with shaking, sweating or dizziness", "Confusion or trouble staying awake: call 911"],
  };
}

const PAST_TASKS = [
  {
    kind: "prescription" as const,
    textEnglish: "Pick up glipizide at the pharmacy",
    textPatientLang: "Recoger la glipizida en la farmacia",
    done: true,
  },
  {
    kind: "test" as const,
    textEnglish: "Get the fasting blood test",
    textPatientLang: "Hacerse el análisis de sangre en ayunas",
    done: false,
  },
  {
    kind: "follow_up" as const,
    textEnglish: "Book your visit with Dr. Lee in two weeks",
    textPatientLang: "Hacer la cita con el Dr. Lee en dos semanas",
    done: true,
  },
];

// Other patients in Dr. Lee's week. consentCalls is false so the cron never dials their fake numbers.
type OtherPatient = {
  name: string;
  language: "en" | "es";
  dateOfBirth: string;
  reasonForVisit: string;
  /** Minutes from now (the seed adds visitInMinutes for "later today" entries). */
  appointmentInMinutes: number;
  checkins: { daysAgo: number; summaryEnglish: string; summaryPatientLang: string; symptoms: SeedSymptom[] }[];
  question?: { textOriginal: string; textEnglish: string };
  alert?: { symptom: string; quote: string; quoteEnglish: string; hoursAgo: number };
};

const OTHER_PATIENTS: OtherPatient[] = [
  {
    name: "Patricia Johnson",
    language: "en",
    dateOfBirth: "1958-06-15",
    reasonForVisit: "Type 2 diabetes: numbness in both feet",
    appointmentInMinutes: 90, // after Mariela, later today
    checkins: [
      {
        daysAgo: 2,
        summaryEnglish: "Numbness in both feet, worse at night.",
        summaryPatientLang: "Numbness in both feet, worse at night.",
        symptoms: [
          {
            symptom: "numbness",
            symptomOriginal: "numbness",
            severity: 4,
            change: "same",
            location: "both feet",
            timing: "at night",
            quoteOriginal: "My feet feel numb, especially at night.",
            quoteEnglish: "My feet feel numb, especially at night.",
          },
        ],
      },
    ],
  },
  {
    name: "Robert Miller",
    language: "en",
    dateOfBirth: "1961-08-02",
    reasonForVisit: "Type 2 diabetes follow-up: A1c 8.4",
    appointmentInMinutes: 24 * 60 + 60,
    checkins: [
      {
        daysAgo: 3,
        summaryEnglish: "Tired in the afternoons. Took metformin.",
        summaryPatientLang: "Tired in the afternoons. Took metformin.",
        symptoms: [
          {
            symptom: "fatigue",
            symptomOriginal: "fatigue",
            severity: 4,
            change: "new",
            timing: "afternoons",
            quoteOriginal: "I get really tired in the afternoons.",
            quoteEnglish: "I get really tired in the afternoons.",
          },
        ],
      },
      {
        daysAgo: 1,
        summaryEnglish: "Afternoon fatigue unchanged.",
        summaryPatientLang: "Afternoon fatigue unchanged.",
        symptoms: [
          {
            symptom: "fatigue",
            symptomOriginal: "fatigue",
            severity: 4,
            change: "same",
            quoteOriginal: "Still tired after lunch.",
            quoteEnglish: "Still tired after lunch.",
          },
        ],
      },
    ],
    question: { textOriginal: "Can I stop checking my sugar every day?", textEnglish: "Can I stop checking my sugar every day?" },
  },
  {
    name: "Rosa Hernández",
    language: "es",
    dateOfBirth: "1952-11-20",
    reasonForVisit: "Hyperthyroidism: palpitations and weight loss",
    appointmentInMinutes: 2 * 24 * 60 + 120,
    checkins: [
      {
        daysAgo: 1,
        summaryEnglish: "Racing heart most of the day. Chest pressure on the stairs (red flag).",
        summaryPatientLang: "El corazón acelerado casi todo el día. Presión en el pecho al subir escaleras (alerta).",
        symptoms: [
          {
            symptom: "palpitations",
            symptomOriginal: "corazón acelerado",
            severity: 5,
            change: "worse",
            timing: "most of the day",
            quoteOriginal: "Siento el corazón muy acelerado casi todo el día.",
            quoteEnglish: "I feel my heart racing most of the day.",
          },
        ],
      },
    ],
    alert: {
      symptom: "chest pressure",
      quote: "Siento presión en el pecho cuando subo las escaleras.",
      quoteEnglish: "I feel pressure in my chest when I climb the stairs.",
      hoursAgo: 20,
    },
  },
  {
    name: "Linh Nguyen",
    language: "en",
    dateOfBirth: "1970-04-09",
    reasonForVisit: "New patient: thyroid nodule",
    appointmentInMinutes: 3 * 24 * 60,
    checkins: [], // enrolled but no check-ins yet
  },
  {
    name: "Carlos Ramírez",
    language: "es",
    dateOfBirth: "1965-01-30",
    reasonForVisit: "Hypothyroidism: fatigue and weight gain",
    appointmentInMinutes: 4 * 24 * 60 + 180,
    checkins: [
      {
        daysAgo: 2,
        summaryEnglish: "Always cold and tired.",
        summaryPatientLang: "Siempre tiene frío y está cansado.",
        symptoms: [
          {
            symptom: "fatigue",
            symptomOriginal: "cansancio",
            severity: 5,
            change: "same",
            quoteOriginal: "Siempre tengo frío y estoy cansado.",
            quoteEnglish: "I'm always cold and tired.",
          },
        ],
      },
    ],
  },
];

export async function seed(ctx: MutationCtx, args: { phone?: string; visitInMinutes?: number }) {
  for (const table of TABLES) {
    for (const doc of await ctx.db.query(table).collect()) {
      await ctx.db.delete(doc._id);
    }
  }

  const now = Date.now();
  const visitAt = now + (args.visitInMinutes ?? 120) * 60_000;

  // ---- Mariela (inserted first: patients.getDemo returns her) ----
  const patientId = await ctx.db.insert("patients", {
    name: "Mariela González",
    phone: args.phone ?? process.env.DEMO_PHONE ?? "+15555550100",
    language: "es",
    callTimeLocal: "18:30",
    timezone: TIMEZONE,
    consentCalls: true,
    reasonForVisit: "Type 2 diabetes: high sugar, then low-sugar spells on a new medicine",
    dateOfBirth: "1957-05-12",
    textSize: "large",
    notificationsEnabled: true,
  });

  const pastAt = now - PAST_VISIT_DAYS_AGO * DAY_MS - 6 * 60 * 60_000;
  const pastAppointmentId = await ctx.db.insert("appointments", {
    patientId,
    doctorName: DOCTOR,
    scheduledAt: pastAt,
    status: "completed",
    clinicName: CLINIC,
  });
  const appointmentId = await ctx.db.insert("appointments", {
    patientId,
    doctorName: DOCTOR,
    scheduledAt: visitAt,
    status: "upcoming",
    clinicName: CLINIC,
  });

  for (const day of MARIELA_DAYS) {
    const startedAt = now - day.daysAgo * DAY_MS;
    const date = localDate(startedAt, TIMEZONE);
    const cycle = day.daysAgo > PAST_VISIT_DAYS_AGO ? pastAppointmentId : appointmentId;
    const conversationId = await ctx.db.insert("conversations", {
      patientId,
      appointmentId: cycle,
      channel: "phone",
      mode: "checkin",
      cartesiaCallId: `seed-call-${day.daysAgo}`,
      status: day.missed ? "failed" : "processed",
      endReason: day.missed ? "no_answer" : undefined,
      language: "es",
      transcript: day.transcript ?? [],
      summaryEnglish: day.summaryEnglish,
      summaryPatientLang: day.summaryPatientLang,
      startedAt,
    });
    for (const s of day.symptoms ?? []) {
      await ctx.db.insert("symptomEntries", { patientId, appointmentId: cycle, conversationId, date, ...s });
    }
    for (const m of day.medications ?? []) {
      await ctx.db.insert("medicationEvents", { patientId, conversationId, date, source: "voice", ...m });
    }
    for (const [valueMgDl, context, symptomIndex] of MARIELA_GLUCOSE[day.daysAgo] ?? []) {
      const s = day.symptoms![symptomIndex];
      await ctx.db.insert("glucoseReadings", {
        patientId,
        appointmentId: cycle,
        conversationId,
        date,
        valueMgDl,
        context,
        quoteOriginal: s.quoteOriginal,
        quoteEnglish: s.quoteEnglish,
      });
    }
  }

  // The past visit, released, with its tasks.
  const visitId = await ctx.db.insert("visits", {
    appointmentId: pastAppointmentId,
    transcript: PAST_TRANSCRIPT,
    summaryEnglish: pastSummary("en"),
    summaryPatientLang: pastSummary("es"),
    releasedToPatient: true,
    releasedAt: pastAt + 3 * 60 * 60_000,
    status: "summarized",
    unaddressedSymptoms: [
      { symptom: "fatigue", symptomOriginal: "cansancio", lastDate: localDate(now - 13 * DAY_MS, TIMEZONE), lastSeverity: 6 },
    ],
  });
  for (let i = 0; i < PAST_TASKS.length; i++) {
    const { done, ...task } = PAST_TASKS[i];
    await ctx.db.insert("visitTasks", {
      visitId,
      appointmentId: pastAppointmentId,
      patientId,
      ...task,
      order: i,
      done,
      doneAt: done ? pastAt + DAY_MS : undefined,
    });
  }

  // Questions: two answered at the past visit, one carried over into today's list.
  const pastQuestions = [
    {
      textOriginal: "¿Necesito otra medicina para el azúcar?",
      textEnglish: "Do I need another medicine for my sugar?",
      source: "voice" as const,
      status: "answered" as const,
      answerEvidence: PAST_TRANSCRIPT[4].textEnglish,
    },
    {
      textOriginal: "¿Por qué tengo tanta sed?",
      textEnglish: "Why am I so thirsty?",
      source: "typed" as const,
      status: "answered" as const,
      answerEvidence: PAST_TRANSCRIPT[6].textEnglish,
    },
    {
      textOriginal: "¿Puedo comer fruta?",
      textEnglish: "Can I eat fruit?",
      source: "typed" as const,
      status: "carried_over" as const,
    },
  ];
  for (let i = 0; i < pastQuestions.length; i++) {
    await ctx.db.insert("questions", { patientId, appointmentId: pastAppointmentId, ...pastQuestions[i], order: i });
  }
  const currentQuestions = [
    { textOriginal: "¿Puedo comer fruta?", textEnglish: "Can I eat fruit?", source: "typed" as const },
    {
      textOriginal: "¿La pastilla nueva me está bajando mucho el azúcar?",
      textEnglish: "Is the new pill lowering my sugar too much?",
      source: "voice" as const,
    },
    {
      textOriginal: "¿Qué hago si el azúcar me baja otra vez?",
      textEnglish: "What do I do if my sugar drops again?",
      source: "voice" as const,
    },
  ];
  for (let i = 0; i < currentQuestions.length; i++) {
    await ctx.db.insert("questions", { patientId, appointmentId, ...currentQuestions[i], status: "open", order: i });
  }

  // Placeholder so the brief card has data before the Workflow runs; "Generate brief" replaces it.
  await ctx.db.insert("briefs", {
    patientId,
    appointmentId,
    textEnglish:
      "Spanish-speaking patient with type 2 diabetes, seen 12 days ago for sugars of 240-250 on metformin; " +
      "glipizide 5 mg each morning was added. Thirst and nighttime urination have improved (thirst 6 → 3/10). " +
      "Since glipizide, repeated shaky, sweaty spells before meals and once at night with sugars of 58-70, " +
      "worst 7/10 three days ago, treated with juice or candy; she skipped one glipizide dose for fear of lows. " +
      "New tingling in both feet at night (3/10). One missed check-in. Open questions: whether the new pill is " +
      "lowering her sugar too much, what to do when it drops, and whether she can eat fruit.",
    createdAt: now,
    source: "seed",
  });

  // ---- The rest of Dr. Lee's week ----
  for (let p = 0; p < OTHER_PATIENTS.length; p++) {
    await seedOtherPatient(ctx, OTHER_PATIENTS[p], p, now, visitAt);
  }

  // Runs after this mutation commits, so it sees every row inserted above.
  await ctx.scheduler.runAfter(0, internal.seed.reindex, {});

  return { patientId, appointmentId };
}

async function seedOtherPatient(
  ctx: MutationCtx,
  other: OtherPatient,
  index: number,
  now: number,
  visitAt: number,
) {
  const patientId = await ctx.db.insert("patients", {
    name: other.name,
    phone: `+1555555011${index}`,
    language: other.language,
    callTimeLocal: "10:00",
    timezone: TIMEZONE,
    consentCalls: false,
    reasonForVisit: other.reasonForVisit,
    dateOfBirth: other.dateOfBirth,
  });
  const appointmentId = await ctx.db.insert("appointments", {
    patientId,
    doctorName: DOCTOR,
    // "Later today" entries are offset from Mariela's visit so they always follow it.
    scheduledAt: other.appointmentInMinutes < 24 * 60 ? visitAt + other.appointmentInMinutes * 60_000 : now + other.appointmentInMinutes * 60_000,
    status: "upcoming",
    clinicName: CLINIC,
  });
  let lastConversationId: Id<"conversations"> | undefined;
  for (const c of other.checkins) {
    const startedAt = now - c.daysAgo * DAY_MS;
    const date = localDate(startedAt, TIMEZONE);
    const conversationId = await ctx.db.insert("conversations", {
      patientId,
      appointmentId,
      channel: "phone",
      mode: "checkin",
      cartesiaCallId: `seed-call-${index}-${c.daysAgo}`,
      status: "processed",
      language: other.language,
      transcript: c.symptoms.map((s) => ({ role: "user", text: s.quoteOriginal })),
      summaryEnglish: c.summaryEnglish,
      summaryPatientLang: c.summaryPatientLang,
      startedAt,
    });
    for (const s of c.symptoms) {
      await ctx.db.insert("symptomEntries", { patientId, appointmentId, conversationId, date, ...s });
    }
    lastConversationId = conversationId;
  }
  if (other.question) {
    await ctx.db.insert("questions", {
      patientId,
      appointmentId,
      ...other.question,
      source: "typed",
      status: "open",
      order: 0,
    });
  }
  if (other.alert) {
    const { hoursAgo, ...alert } = other.alert;
    await ctx.db.insert("alerts", {
      patientId,
      conversationId: lastConversationId,
      ...alert,
      createdAt: now - hoursAgo * 60 * 60_000,
      acknowledged: false,
    });
  }
}
