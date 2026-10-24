// TRACK A owns this file. The one post-call pipeline (SPEC.md Key decision 2):
// poll Get Call → Claude extraction → write Convex → internal.elastic.indexCheckin → processed.
// Also the inserts behind the red-flag and add-question webhooks.
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getCall } from "./cartesia";
import { extractCheckin, type CheckinExtraction } from "./claude";
import { POLL_MS, currentAppointment } from "./calls";
import { localDate } from "./lib/time";

/** 15 s × 80 = 20 minutes, well past the 2-minute check-in. */
const MAX_POLLS = 80;

const conversationStatus = v.union(
  v.literal("dialing"),
  v.literal("in_progress"),
  v.literal("ended"),
  v.literal("processed"),
  v.literal("failed"),
);

const transcriptValidator = v.array(v.object({ role: v.string(), text: v.string() }));

/** Polls Cartesia every 15 s until the call ends, then schedules processConversation. */
export const pollCall = internalAction({
  args: { conversationId: v.id("conversations"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.runQuery(internal.pipeline.getConversation, {
      conversationId: args.conversationId,
    });
    if (!conversation?.cartesiaCallId) return null;
    if (conversation.status !== "dialing" && conversation.status !== "in_progress") return null;

    let call;
    try {
      call = await getCall(conversation.cartesiaCallId);
    } catch (error) {
      console.warn(`[pipeline] poll ${args.attempt} for ${args.conversationId} errored:`, error);
      call = null;
    }

    if (call?.status === "ended") {
      console.log(
        `[pipeline] call ended (${call.endReason}), ${call.transcript.length} turns; processing`,
      );
      await ctx.runMutation(internal.pipeline.saveTranscript, {
        conversationId: args.conversationId,
        transcript: call.transcript,
        endReason: call.endReason ?? undefined,
      });
      await ctx.scheduler.runAfter(0, internal.pipeline.processConversation, {
        conversationId: args.conversationId,
      });
      return null;
    }
    if (call?.status === "failed" || args.attempt + 1 >= MAX_POLLS) {
      console.warn(`[pipeline] call ${args.conversationId} failed: ${call?.endReason ?? "timeout"}`);
      await ctx.runMutation(internal.pipeline.setStatus, {
        conversationId: args.conversationId,
        status: "failed",
        endReason: call?.endReason ?? (call ? "failed" : "timeout"),
      });
      return null;
    }
    if (call?.status === "in_progress" && conversation.status === "dialing") {
      await ctx.runMutation(internal.pipeline.setStatus, {
        conversationId: args.conversationId,
        status: "in_progress",
      });
    }
    await ctx.scheduler.runAfter(POLL_MS, internal.pipeline.pollCall, {
      conversationId: args.conversationId,
      attempt: args.attempt + 1,
    });
    return null;
  },
});

/** Transcript → Claude extraction → saveExtraction → index each entry in Elastic → processed. */
export const processConversation = internalAction({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.runQuery(internal.pipeline.getConversation, args);
    if (!conversation || conversation.status !== "ended") return null;
    const transcript = conversation.transcript ?? [];

    // No patient turns (no answer, voicemail, busy): a missed call, so the Home tile can say so.
    if (!transcript.some((t) => t.role === "user")) {
      const endReason = conversation.endReason ?? "no_answer";
      console.log(`[pipeline] ${args.conversationId}: no patient turns (${endReason}); missed`);
      await ctx.runMutation(internal.pipeline.setStatus, { ...args, status: "failed", endReason });
      return null;
    }
    // An explainer call has nothing to extract.
    if (conversation.mode !== "checkin") {
      await ctx.runMutation(internal.pipeline.setStatus, { ...args, status: "processed" });
      return null;
    }

    const started = Date.now();
    let extraction: CheckinExtraction;
    try {
      extraction = await extractCheckin(
        transcript,
        conversation.language,
        conversation.activeSymptoms,
      );
    } catch (error) {
      console.error(`[pipeline] Claude extraction failed for ${args.conversationId}:`, error);
      // "error", not a missed call: the patient did talk (callSchedule shows the call as done).
      await ctx.runMutation(internal.pipeline.setStatus, {
        ...args,
        status: "failed",
        endReason: "error",
      });
      return null;
    }
    console.log(
      `[pipeline] Claude extracted ${extraction.symptoms.length} symptoms, ` +
        `${extraction.medications.length} medications, ` +
        `${extraction.questions_for_doctor.length} questions in ${Date.now() - started} ms`,
    );

    const entryIds = await ctx.runMutation(internal.pipeline.saveExtraction, {
      conversationId: args.conversationId,
      extraction,
    });

    // Index before marking processed: the dashboard refetches the timeline on that change.
    const entries = await ctx.runQuery(internal.pipeline.getEntries, { entryIds });
    for (const entry of entries) {
      try {
        await ctx.runAction(internal.elastic.indexCheckin, {
          symptomEntryId: entry._id,
          patientId: entry.patientId,
          appointmentId: entry.appointmentId,
          conversationId: entry.conversationId,
          date: entry.date,
          symptom: entry.symptom,
          severity: entry.severity,
          change: entry.change,
          language: conversation.language,
          quoteOriginal: entry.quoteOriginal,
          quoteEnglish: entry.quoteEnglish,
        });
      } catch (error) {
        // Convex stays the source of truth; elastic.reindexAll can repair the index later.
        console.error(`[pipeline] indexCheckin failed for ${entry._id}:`, error);
      }
    }
    console.log(`[pipeline] indexed ${entries.length} entries in Elastic`);

    await ctx.runMutation(internal.pipeline.setStatus, { ...args, status: "processed" });
    console.log(`[pipeline] ${args.conversationId} processed`);
    return null;
  },
});

/**
 * Writes symptomEntries, medicationEvents, questions and the summary. Does not mark the
 * conversation processed; processConversation does that after indexing in Elastic.
 */
export const saveExtraction = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    extraction: v.any(), // CheckinExtraction from claude.ts
  },
  returns: v.array(v.id("symptomEntries")),
  handler: async (ctx, args): Promise<Id<"symptomEntries">[]> => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const patient = await ctx.db.get("patients", conversation.patientId);
    if (!patient) throw new Error("Patient not found");
    const extraction = args.extraction as CheckinExtraction;
    const date = localDate(conversation.startedAt, patient.timezone);
    const opt = (s: string | null | undefined) => s ?? undefined;

    const ids: Id<"symptomEntries">[] = [];
    for (const s of extraction.symptoms) {
      const severity =
        typeof s.severity === "number" ? Math.min(10, Math.max(0, Math.round(s.severity))) : undefined;
      ids.push(
        await ctx.db.insert("symptomEntries", {
          patientId: conversation.patientId,
          appointmentId: conversation.appointmentId,
          conversationId: conversation._id,
          date,
          symptom: s.symptom.trim().toLowerCase(),
          symptomOriginal: s.symptom_original,
          severity,
          change: opt(s.change),
          onset: opt(s.onset),
          location: opt(s.location),
          duration: opt(s.duration),
          character: opt(s.character),
          aggravating: opt(s.aggravating),
          relieving: opt(s.relieving),
          timing: opt(s.timing),
          quoteOriginal: s.quote_original,
          quoteEnglish: s.quote_english,
        }),
      );
    }

    for (const m of extraction.medications) {
      await ctx.db.insert("medicationEvents", {
        patientId: conversation.patientId,
        conversationId: conversation._id,
        date,
        medication: m.medication.trim().toLowerCase(), // the key VisitSummary v2 also uses
        action: m.action,
        note: opt(m.note),
        source: "voice",
      });
    }

    // A6: glucose readings for the doctor's chart. Values outside 20-700 mg/dL are dropped as
    // mishearings (the number is still in summaryEnglish).
    for (const g of extraction.glucose_readings ?? []) {
      const value = Math.round(g.value_mg_dl);
      if (!(value >= 20 && value <= 700)) continue;
      await ctx.db.insert("glucoseReadings", {
        patientId: conversation.patientId,
        appointmentId: conversation.appointmentId,
        conversationId: conversation._id,
        date,
        valueMgDl: value,
        context: g.context,
        quoteOriginal: g.quote_original,
        quoteEnglish: g.quote_english,
      });
    }

    for (const q of extraction.questions_for_doctor) {
      await insertVoiceQuestion(ctx, conversation.patientId, conversation.appointmentId, {
        textOriginal: q.text_original,
        textEnglish: q.text_english,
      });
    }

    await ctx.db.patch("conversations", conversation._id, {
      summaryEnglish: extraction.summary_english,
      summaryPatientLang: extraction.summary_patient_lang || extraction.summary_english,
    });
    return ids;
  },
});

/**
 * Appends an open "voice" question unless the same text is already on the list (the
 * add-question webhook and post-call extraction often capture the same question).
 * Returns the new ID, or null for a duplicate.
 */
async function insertVoiceQuestion(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  appointmentId: Id<"appointments">,
  text: { textOriginal: string; textEnglish: string },
): Promise<Id<"questions"> | null> {
  const existing = await ctx.db
    .query("questions")
    .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
    .take(200);
  const norm = (s: string) => s.trim().toLowerCase().replace(/[¿?¡!.,]/g, "");
  if (existing.some((q) => norm(q.textOriginal) === norm(text.textOriginal))) return null;
  const order = existing.reduce((max, q) => Math.max(max, q.order), -1) + 1;
  return await ctx.db.insert("questions", {
    patientId,
    appointmentId,
    textOriginal: text.textOriginal,
    textEnglish: text.textEnglish,
    source: "voice",
    status: "open",
    order,
  });
}

/** B7: from POST /cartesia/red-flag, or the chat's report_red_flag tool (with conversationId). */
export const createAlert = internalMutation({
  args: {
    patientId: v.id("patients"),
    symptom: v.string(),
    quote: v.string(),
    cartesiaCallId: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Link the alert to the live call: given directly (chat), by call ID if Cartesia sent it,
    // else the patient's most recent call that hasn't finished.
    let conversationId: Id<"conversations"> | undefined = args.conversationId;
    if (!conversationId && args.cartesiaCallId) {
      const c = await ctx.db
        .query("conversations")
        .withIndex("by_call", (q) => q.eq("cartesiaCallId", args.cartesiaCallId))
        .first();
      conversationId = c?._id;
    }
    if (!conversationId) {
      const recent = await ctx.db
        .query("conversations")
        .withIndex("by_patient", (q) => q.eq("patientId", args.patientId))
        .order("desc")
        .take(5);
      conversationId = recent.find((c) => c.status === "dialing" || c.status === "in_progress")
        ?._id;
    }
    const patient = await ctx.db.get("patients", args.patientId);
    const english = !patient || patient.language === "en";
    const alertId = await ctx.db.insert("alerts", {
      patientId: args.patientId,
      conversationId,
      symptom: args.symptom,
      quote: args.quote,
      // H3: the doctor sees the quote in English. Non-English quotes are translated just after.
      quoteEnglish: english ? args.quote : undefined,
      createdAt: Date.now(),
      acknowledged: false,
    });
    if (!english) await ctx.scheduler.runAfter(0, internal.claude.translateAlert, { alertId });
    console.log(`[pipeline] RED FLAG for ${args.patientId}: ${args.symptom}`);
    return null;
  },
});

/** B6: from POST /cartesia/add-question. Tagged "voice", appended to the current appointment. */
export const addVoiceQuestion = internalMutation({
  args: { patientId: v.id("patients"), question: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patient = await ctx.db.get("patients", args.patientId);
    const appointment = await currentAppointment(ctx, args.patientId);
    if (!patient || !appointment) return null;
    const questionId = await insertVoiceQuestion(ctx, args.patientId, appointment._id, {
      textOriginal: args.question,
      textEnglish: args.question,
    });
    if (questionId && patient.language !== "en") {
      await ctx.scheduler.runAfter(0, internal.claude.translateQuestion, { questionId });
    }
    return null;
  },
});

/**
 * Dev: run a typed transcript through the real post-call pipeline, no phone needed.
 * An empty transcript tests the missed-call path.
 * `npx convex run pipeline:devProcessTranscript '{"transcript":[{"role":"user","text":"..."}]}'`
 */
export const devProcessTranscript = internalMutation({
  args: {
    transcript: transcriptValidator,
    patientId: v.optional(v.id("patients")),
    endReason: v.optional(v.string()),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const patient = args.patientId
      ? await ctx.db.get("patients", args.patientId)
      : await ctx.db.query("patients").first();
    if (!patient) throw new Error("No patient; run the seed first");
    const appointment = await currentAppointment(ctx, patient._id);
    if (!appointment) throw new Error("Patient has no appointment");
    const conversationId = await ctx.db.insert("conversations", {
      patientId: patient._id,
      appointmentId: appointment._id,
      channel: "phone",
      mode: "checkin",
      cartesiaCallId: `dev-${Date.now()}`,
      status: "ended",
      language: patient.language,
      transcript: args.transcript,
      endReason: args.endReason,
      startedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.processConversation, { conversationId });
    return conversationId;
  },
});

// ---- Small reads and writes for the actions above ----

export const getConversation = internalQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.union(
    v.null(),
    v.object({
      status: conversationStatus,
      mode: v.union(v.literal("checkin"), v.literal("explainer")),
      language: v.string(),
      cartesiaCallId: v.optional(v.string()),
      transcript: v.optional(transcriptValidator),
      endReason: v.optional(v.string()),
      activeSymptoms: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("conversations", args.conversationId);
    if (!c) return null;
    const recent = await ctx.db
      .query("symptomEntries")
      .withIndex("by_patient_date", (q) => q.eq("patientId", c.patientId))
      .order("desc")
      .take(50);
    return {
      status: c.status,
      mode: c.mode,
      language: c.language,
      cartesiaCallId: c.cartesiaCallId,
      transcript: c.transcript,
      endReason: c.endReason,
      // The patient's own words next to each key, so Claude maps "temblores" to the existing key.
      activeSymptoms: [...new Set(recent.map((e) => `${e.symptom} (patient's words: ${e.symptomOriginal})`))],
    };
  },
});

export const getEntries = internalQuery({
  args: { entryIds: v.array(v.id("symptomEntries")) },
  returns: v.array(
    v.object({
      _id: v.id("symptomEntries"),
      patientId: v.id("patients"),
      appointmentId: v.id("appointments"),
      conversationId: v.id("conversations"),
      date: v.string(),
      symptom: v.string(),
      severity: v.optional(v.number()),
      change: v.optional(v.string()),
      quoteOriginal: v.string(),
      quoteEnglish: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = [];
    for (const id of args.entryIds) {
      const e = await ctx.db.get("symptomEntries", id);
      if (!e) continue;
      rows.push({
        _id: e._id,
        patientId: e.patientId,
        appointmentId: e.appointmentId,
        conversationId: e.conversationId,
        date: e.date,
        symptom: e.symptom,
        severity: e.severity,
        change: e.change,
        quoteOriginal: e.quoteOriginal,
        quoteEnglish: e.quoteEnglish,
      });
    }
    return rows;
  },
});

export const saveTranscript = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    transcript: transcriptValidator,
    endReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("conversations", args.conversationId, {
      transcript: args.transcript,
      endReason: args.endReason,
      status: "ended",
    });
    return null;
  },
});

/** `endReason` on failure: Cartesia's end_reason, "no_answer", "timeout", or "error" (ours). */
export const setStatus = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    status: conversationStatus,
    endReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("conversations", args.conversationId, {
      status: args.status,
      ...(args.endReason !== undefined && { endReason: args.endReason }),
    });
    return null;
  },
});
