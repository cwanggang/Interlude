// TRACK A owns this file. Every Claude call goes through here (claude-sonnet-5-5).
// Extraction uses structured outputs (output_config.format) so the result always parses;
// Sonnet 5.5 rejects a forced tool_choice, so the spec's record_checkin schema is sent as
// the output format instead. Every structured call follows the same pattern.
import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function textOf(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") throw new Error("Claude declined the request");
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Output of the record_checkin schema (SPEC.md "Extraction tool"). */
export type CheckinExtraction = {
  summary_english: string;
  symptoms: {
    symptom: string;
    symptom_original: string;
    severity?: number | null;
    change?: "new" | "better" | "worse" | "same" | null;
    onset?: string | null;
    location?: string | null;
    duration?: string | null;
    character?: string | null;
    aggravating?: string | null;
    relieving?: string | null;
    timing?: string | null;
    quote_original: string;
    quote_english: string;
  }[];
  medications: {
    medication: string;
    action: "started" | "stopped" | "taken" | "missed";
    note?: string | null;
  }[];
  questions_for_doctor: { text_original: string; text_english: string }[];
};

/** SPEC.md "Visit summary JSON (D3)". */
export type VisitSummary = {
  assessment: string;
  medications: { name: string; dose: string; schedule: string; purpose: string }[];
  instructions: string[];
  tests_ordered: string[];
  follow_up: string;
  warning_signs: string[];
};

const nullableString = { type: ["string", "null"] };

// SPEC.md record_checkin, adapted for structured outputs: every property is required
// (nullable where the spec allows null) and objects are closed.
const checkinSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary_english", "symptoms", "medications", "questions_for_doctor"],
  properties: {
    summary_english: { type: "string" },
    symptoms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "symptom", "symptom_original", "severity", "change", "onset", "location",
          "duration", "character", "aggravating", "relieving", "timing",
          "quote_original", "quote_english",
        ],
        properties: {
          symptom: { type: "string", description: "normalized English, lowercase, e.g. dizziness" },
          symptom_original: { type: "string" },
          severity: { type: ["integer", "null"], description: "0-10, only if the patient gave it" },
          change: {
            anyOf: [{ type: "string", enum: ["new", "better", "worse", "same"] }, { type: "null" }],
          },
          onset: nullableString,
          location: nullableString,
          duration: nullableString,
          character: nullableString,
          aggravating: nullableString,
          relieving: nullableString,
          timing: nullableString,
          quote_original: { type: "string" },
          quote_english: { type: "string" },
        },
      },
    },
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["medication", "action", "note"],
        properties: {
          medication: { type: "string" },
          action: { type: "string", enum: ["started", "stopped", "taken", "missed"] },
          note: nullableString,
        },
      },
    },
    questions_for_doctor: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text_original", "text_english"],
        properties: { text_original: { type: "string" }, text_english: { type: "string" } },
      },
    },
  },
};

const EXTRACTION_PROMPT = `You turn a phone check-in between a health assistant ("agent") and a patient ("user") into a structured record for the patient's doctor.

Rules:
- Only record what the patient said. Never infer a severity number they did not give; use null.
- symptom is a normalized English key, lowercase, singular (e.g. "dizziness", "thirst", "fatigue", "frequent urination", "foot tingling", "shakiness"). Reuse the keys from the active symptoms list when the patient talks about the same thing.
- symptom_original is the patient's own word for it, in their language.
- quote_original is the patient's exact words about that symptom; quote_english is its English translation (identical if the call was in English).
- change is better/worse/same relative to the last check-in, "new" for a symptom not reported before, or null if unclear.
- A glucose reading goes in the timing or character field of the related symptom, or in summary_english if no symptom fits. Mention every number the patient gave in summary_english.
- medications: started/stopped/taken/missed, only when the patient said so.
- questions_for_doctor: questions the patient wants to ask their doctor, in their words and in English.
- summary_english: two or three plain sentences a doctor can read in ten seconds.`;

export async function extractCheckin(
  transcript: { role: string; text: string }[],
  language: string,
  activeSymptoms: string[] = [],
): Promise<CheckinExtraction> {
  const lines = transcript.map((t) => `${t.role}: ${t.text}`).join("\n");
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: checkinSchema } },
    system: EXTRACTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `Call language: ${language}\nActive symptoms: ${activeSymptoms.join(", ") || "none"}\n\nTranscript:\n${lines}`,
      },
    ],
  });
  return JSON.parse(textOf(message)) as CheckinExtraction;
}

export async function translate(text: string, to: "en" | "es"): Promise<string> {
  const target = to === "en" ? "English" : "Spanish";
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    system: `Translate the user's text into ${target}. It is a patient's note or question for their doctor. Reply with the translation only. If it is already in ${target}, reply with it unchanged.`,
    messages: [{ role: "user", content: text }],
  });
  return textOf(message);
}

async function structured<T>(args: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
}): Promise<T> {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: args.effort, format: { type: "json_schema", schema: args.schema } },
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  if (message.stop_reason === "max_tokens") throw new Error("Claude output was cut off");
  return JSON.parse(textOf(message)) as T;
}

const languageName = (code: string) => (code === "es" ? "Spanish" : "English");

export type VisitTurn = { speaker: string; textEnglish: string; textPatientLang: string };

const turnsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["turns"],
  properties: {
    turns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["speaker", "text_english", "text_patient_lang"],
        properties: {
          speaker: { type: "string", enum: ["doctor", "patient", "interpreter", "other"] },
          text_english: { type: "string" },
          text_patient_lang: { type: "string" },
        },
      },
    },
  },
};

/**
 * D2: label speakers (doctor, patient, interpreter), clean up, and translate each turn.
 * `passes` maps a language code to a raw speech-to-text pass run in that language; for a
 * mixed-language visit each pass is accurate for its own language and garbled for the other.
 */
export async function cleanVisitTranscript(
  passes: Record<string, string>,
  patientLanguage: string,
): Promise<VisitTurn[]> {
  const patientLang = languageName(patientLanguage);
  const raw = Object.entries(passes)
    .map(([lang, text]) => `=== Pass transcribed as ${languageName(lang)} ===\n${text}`)
    .join("\n\n");
  const result = await structured<{
    turns: { speaker: string; text_english: string; text_patient_lang: string }[];
  }>({
    effort: "medium",
    system: `You turn raw speech-to-text of a doctor visit into a clean transcript. The doctor usually speaks English; the patient speaks ${patientLang}; there may be an interpreter.

You may get more than one raw pass of the same audio, each run as a different language. Each pass is reliable for speech in its own language and unreliable for the other; combine them so every turn uses the pass that matches what was actually spoken.

Rules:
- Split the conversation into turns and label each speaker: doctor, patient, interpreter, or other. Infer speakers from content (the doctor examines, prescribes, explains; the patient describes symptoms).
- Clean up filler words, false starts and obvious recognition errors, but never change medical content. Keep every medication name, dose, number, and instruction exactly as spoken.
- text_english is the turn in English; text_patient_lang is the turn in ${patientLang}. Translate whichever one wasn't spoken. If the patient language is English, both fields are the same.
- Do not add, drop, or summarize anything that was said.`,
    user: raw,
    schema: turnsSchema,
  });
  return result.turns.map((t) => ({
    speaker: t.speaker,
    textEnglish: t.text_english,
    textPatientLang: t.text_patient_lang,
  }));
}

const summarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["assessment", "medications", "instructions", "tests_ordered", "follow_up", "warning_signs"],
  properties: {
    assessment: { type: "string" },
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "dose", "schedule", "purpose"],
        properties: {
          name: { type: "string" },
          dose: { type: "string" },
          schedule: { type: "string" },
          purpose: { type: "string" },
        },
      },
    },
    instructions: { type: "array", items: { type: "string" } },
    tests_ordered: { type: "array", items: { type: "string" } },
    follow_up: { type: "string" },
    warning_signs: { type: "array", items: { type: "string" } },
  },
};

const transcriptText = (turns: { speaker: string; textEnglish: string }[]) =>
  turns.map((t) => `${t.speaker}: ${t.textEnglish}`).join("\n");

/** D3: English summary, then a plain-reading-level patient-language version. */
export async function summarizeVisit(
  transcript: { speaker: string; textEnglish: string }[],
  patientLanguage: string,
): Promise<{ english: VisitSummary; patientLang: VisitSummary }> {
  const english = await structured<VisitSummary>({
    effort: "medium",
    system: `You summarize a doctor visit for the patient's record. Use only what the doctor said in the transcript; never add advice, doses, or tests that weren't stated. Leave a field empty ("" or []) if the visit didn't cover it.
- assessment: the doctor's assessment in two or three sentences.
- medications: every medication the patient should take after this visit, including unchanged ones the doctor mentioned. dose and schedule exactly as stated; purpose in a few words, only if the doctor gave it or it is unambiguous.
- instructions: what the patient should do, one item each.
- tests_ordered, follow_up, warning_signs: as stated by the doctor.`,
    user: transcriptText(transcript),
    schema: summarySchema,
  });
  const patientLang = await structured<VisitSummary>({
    effort: "low",
    system: `Rewrite this visit summary for the patient in ${languageName(patientLanguage)}, at a plain reading level (short sentences, everyday words, about a 5th-grade level). Keep every medication name, dose, number and schedule exactly; write schedules in everyday terms (for example "con el desayuno"). Do not add or drop anything. Keep the same JSON fields.`,
    user: JSON.stringify(english),
    schema: summarySchema,
  });
  return { english, patientLang };
}

export type QuestionCoverage = { id: string; answered: boolean; evidence: string | null };

/** D4: for each queued question, was it answered in the visit, and which line shows it. */
export async function checkQuestionCoverage(
  questions: { id: string; textEnglish: string }[],
  transcript: { speaker: string; textEnglish: string }[],
): Promise<QuestionCoverage[]> {
  if (questions.length === 0) return [];
  const result = await structured<{ results: QuestionCoverage[] }>({
    effort: "low",
    system: `You check which of a patient's prepared questions were answered during their doctor visit. A question counts as answered only if the doctor (or interpreter relaying the doctor) addressed it in the transcript. evidence is the shortest transcript quote, in English, that shows the answer, or null if unanswered. Return one result per question id.`,
    user: `Questions:\n${questions.map((q) => `${q.id}: ${q.textEnglish}`).join("\n")}\n\nTranscript:\n${transcriptText(transcript)}`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["results"],
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "answered", "evidence"],
            properties: {
              id: { type: "string" },
              answered: { type: "boolean" },
              evidence: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  });
  return result.results;
}

// ---- Cross-track: scheduled by Track B's questions.add for non-English typed questions ----

/** Translates a question's textOriginal into English and patches textEnglish. */
export const translateQuestion = internalAction({
  args: { questionId: v.id("questions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const question = await ctx.runQuery(internal.claude.getQuestionText, args);
    if (!question) return null;
    const textEnglish = await translate(question.textOriginal, "en");
    await ctx.runMutation(internal.claude.setQuestionEnglish, {
      questionId: args.questionId,
      textOriginal: question.textOriginal,
      textEnglish,
    });
    return null;
  },
});

export const getQuestionText = internalQuery({
  args: { questionId: v.id("questions") },
  returns: v.union(v.null(), v.object({ textOriginal: v.string() })),
  handler: async (ctx, args) => {
    const q = await ctx.db.get("questions", args.questionId);
    return q ? { textOriginal: q.textOriginal } : null;
  },
});

/** Skips the patch if the patient edited the question while it was being translated. */
export const setQuestionEnglish = internalMutation({
  args: { questionId: v.id("questions"), textOriginal: v.string(), textEnglish: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const q = await ctx.db.get("questions", args.questionId);
    if (q && q.textOriginal === args.textOriginal) {
      await ctx.db.patch("questions", args.questionId, { textEnglish: args.textEnglish });
    }
    return null;
  },
});
