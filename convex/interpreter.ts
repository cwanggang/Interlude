// Live interpreter for the doctor website's live visit (Figma 6.5b–d). Each spoken turn is
// uploaded as a short clip, transcribed in the speaker's language and translated for the other
// person. Clips are deleted right after; the saved recording of the visit goes through
// visits.create as before. Track B; uses Track A's speech-to-text and the shared model.
import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
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

/** One spoken turn: speech to text in `from`, then a translation into `to`. Empty if silent. */
export const translateTurn = action({
  args: { storageId: v.id("_storage"), from: language, to: language },
  returns: v.object({ original: v.string(), translated: v.string() }),
  handler: async (ctx, args): Promise<{ original: string; translated: string }> => {
    const audio = await ctx.storage.get(args.storageId);
    if (!audio) throw new Error("Clip not found");
    let original: string;
    try {
      original = (await transcribeFile(audio, args.from)).text.trim();
    } finally {
      await ctx.storage.delete(args.storageId);
    }
    if (!original || args.from === args.to) return { original, translated: original };
    return { original, translated: await translate(original, args.from, args.to) };
  },
});

async function translate(text: string, from: "en" | "es", to: "en" | "es"): Promise<string> {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1000,
    output_config: { effort: "low" },
    system:
      `You are a medical interpreter in a clinic visit. Translate the ${NAMES[from]} speech into ` +
      `${NAMES[to]}, as the speaker would say it: plain, warm and faithful. Keep medicine names, doses, ` +
      `numbers and times exactly. Do not add, explain or answer anything. Reply with the translation only.`,
    messages: [{ role: "user", content: text }],
  });
  if (message.stop_reason === "refusal") throw new Error("Claude declined the request");
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
