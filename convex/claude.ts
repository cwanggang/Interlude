// TRACK A owns this file. Every Claude call goes through here (claude-sonnet-5-5,
// tool use for structured output). STUB: fake responses until the spine is built.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const MODEL = "claude-sonnet-5-5";

/** Output of the record_checkin tool (SPEC.md "Extraction tool"). */
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

export async function extractCheckin(
  _transcript: { role: string; text: string }[],
  _language: string,
): Promise<CheckinExtraction> {
  return { summary_english: "", symptoms: [], medications: [], questions_for_doctor: [] };
}

export async function translate(text: string, _to: "en" | "es"): Promise<string> {
  return text;
}

/** D2: label speakers (doctor, patient, interpreter), clean up, and translate each turn. */
export async function cleanVisitTranscript(
  _rawText: string,
  _patientLanguage: string,
): Promise<{ speaker: string; textEnglish: string; textPatientLang: string }[]> {
  return [];
}

/** D3: English summary, then a plain-reading-level patient-language version. */
export async function summarizeVisit(
  _transcript: { speaker: string; textEnglish: string }[],
  _patientLanguage: string,
): Promise<{ english: VisitSummary; patientLang: VisitSummary }> {
  const empty: VisitSummary = {
    assessment: "",
    medications: [],
    instructions: [],
    tests_ordered: [],
    follow_up: "",
    warning_signs: [],
  };
  return { english: empty, patientLang: empty };
}

// ---- Cross-track: scheduled by Track B's questions.add for non-English typed questions ----

/** Translates a question's textOriginal into English and patches textEnglish. */
export const translateQuestion = internalAction({
  args: { questionId: v.id("questions") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] claude.translateQuestion", args.questionId);
    return null;
  },
});
