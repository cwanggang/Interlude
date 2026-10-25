// Live interpreter for the doctor website's live visit (Figma 6.5b–d). Each spoken turn is
// uploaded as a short clip, transcribed in the speaker's language and translated for the other
// person, after fixing obvious mishearings. Clips are deleted right after; the saved recording of
// the visit goes through visits.create as before. Track B; uses Track A's speech-to-text and the
// shared model.
import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation } from "./_generated/server";
import { transcribeFile } from "./cartesia";
import { MODEL } from "./claude";

const language = v.union(v.literal("en"), v.literal("es"));
const NAMES = { en: "English", es: "Spanish" } as const;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Upload URL for one spoken turn. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Words this patient's visit is likely to contain: their reported symptoms (English key and their
 * own word), their medicines and the visit reason. Speech-to-text has no medical context, so it can
 * hear "tiredness" as "title"; this list lets the interpreter fix such slips.
 */
export const vocabulary = internalQuery({
  args: { appointmentId: v.id("appointments") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get("appointments", args.appointmentId);
    if (!appointment) return [];
    const patient = await ctx.db.get("patients", appointment.patientId);
    const symptoms = await ctx.db
      .query("symptomEntries")
      .withIndex("by_patient_date", (q) => q.eq("patientId", appointment.patientId))
      .order("desc")
      .take(200);
    const medications = await ctx.db
      .query("medicationEvents")
      .withIndex("by_patient", (q) => q.eq("patientId", appointment.patientId))
      .take(200);
    const words = new Set<string>();
    for (const e of symptoms) {
      words.add(e.symptom);
      words.add(e.symptomOriginal);
    }
    for (const m of medications) words.add(m.medication);
    if (patient?.reasonForVisit) words.add(patient.reasonForVisit);
    return [...words].slice(0, 60);
  },
});

/**
 * One spoken turn: speech to text in `from`, then Claude fixes obvious mishearings (using the
 * patient's vocabulary and the last few turns) and translates into `to`. Empty if silent.
 */
export const translateTurn = action({
  args: {
    storageId: v.id("_storage"),
    from: language,
    to: language,
    appointmentId: v.optional(v.id("appointments")),
    recent: v.optional(v.array(v.string())),
  },
  returns: v.object({ original: v.string(), translated: v.string() }),
  handler: async (ctx, args): Promise<{ original: string; translated: string }> => {
    const audio = await ctx.storage.get(args.storageId);
    if (!audio) throw new Error("Clip not found");
    let heard: string;
    try {
      heard = (await transcribeFile(audio, args.from)).text.trim();
    } finally {
      await ctx.storage.delete(args.storageId);
    }
    if (!heard) return { original: "", translated: "" };
    const words: string[] = args.appointmentId
      ? await ctx.runQuery(internal.interpreter.vocabulary, { appointmentId: args.appointmentId })
      : [];
    return await interpret(heard, args.from, args.to, words, args.recent ?? []);
  },
});

async function interpret(
  heard: string,
  from: "en" | "es",
  to: "en" | "es",
  words: string[],
  recent: string[],
): Promise<{ original: string; translated: string }> {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["original", "translated"],
          properties: { original: { type: "string" }, translated: { type: "string" } },
        },
      },
    },
    system:
      `You are a medical interpreter in a clinic visit. You get one turn of ${NAMES[from]} speech as ` +
      `heard by speech-to-text, which has no medical context and sometimes mishears words.\n` +
      `1. original: the turn in ${NAMES[from]}, with a word replaced only when it is clearly a ` +
      `mishearing of a similar-sounding word that fits the visit (for example "title" for "tiredness" ` +
      `when the patient reports fatigue, or "met for men" for "metformin"). Use the patient's words and ` +
      `the recent turns as context. Otherwise keep it exactly as heard.\n` +
      `2. translated: original in ${NAMES[to]}, as the speaker would say it: plain, warm and faithful. ` +
      `Keep medicine names, doses, numbers and times exactly. Do not add, explain or answer anything.` +
      (from === to ? ` Both languages are the same, so translated equals original.` : ""),
    messages: [
      {
        role: "user",
        content:
          `Patient's words and medicines: ${words.join(", ") || "none"}\n` +
          `Recent turns:\n${recent.slice(-4).join("\n") || "none"}\n\n` +
          `Heard: ${heard}`,
      },
    ],
  });
  if (message.stop_reason === "refusal") throw new Error("Claude declined the request");
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const out = JSON.parse(text) as { original: string; translated: string };
  return { original: out.original.trim() || heard, translated: out.translated.trim() };
}
