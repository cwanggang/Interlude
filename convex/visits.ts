// TRACK A owns this file. Visit recording → transcript → summaries → Elastic passages.
// D5 (unaddressed concerns) has its schema field (unaddressedSymptoms) but isn't computed yet (A2).
import { v, type Infer } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { transcribeFile, type Language } from "./cartesia";
import {
  checkQuestionCoverage,
  cleanVisitTranscript,
  summarizeVisit,
  type VisitTurn,
} from "./claude";

const visitDoc = v.object({
  _id: v.id("visits"),
  _creationTime: v.number(),
  appointmentId: v.id("appointments"),
  audioStorageId: v.optional(v.id("_storage")),
  transcript: v.optional(
    v.array(v.object({ speaker: v.string(), textEnglish: v.string(), textPatientLang: v.string() })),
  ),
  summaryEnglish: v.optional(v.any()),
  summaryPatientLang: v.optional(v.any()),
  releasedToPatient: v.boolean(),
  status: v.string(),
  releasedAt: v.optional(v.number()),
  unaddressedSymptoms: v.optional(
    v.array(
      v.object({
        symptom: v.string(),
        symptomOriginal: v.string(),
        lastDate: v.string(),
        lastSeverity: v.optional(v.number()),
      }),
    ),
  ),
});

const turnValidator = v.object({
  speaker: v.string(),
  textEnglish: v.string(),
  textPatientLang: v.string(),
});

/** Passages of TURNS_PER_CHUNK turns for the explainer's search (SPEC.md: 2 to 4 turns). */
const TURNS_PER_CHUNK = 3;

/** Splits a cleaned transcript into the passages indexed in Elastic's visit_chunks. */
function toChunks(transcript: VisitTurn[]) {
  const chunks = [];
  for (let i = 0; i < transcript.length; i += TURNS_PER_CHUNK) {
    const turns = transcript.slice(i, i + TURNS_PER_CHUNK);
    chunks.push({
      chunkIndex: chunks.length,
      speakers: [...new Set(turns.map((t) => t.speaker))],
      textEnglish: turns.map((t) => `${t.speaker}: ${t.textEnglish}`).join("\n"),
      textPatientLang: turns.map((t) => `${t.speaker}: ${t.textPatientLang}`).join("\n"),
    });
  }
  return chunks;
}

/** A patient's visits with their appointment, newest first. */
async function visitsForPatient(ctx: QueryCtx, patientId: Id<"patients">) {
  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(100);
  const rows: { visit: Doc<"visits">; appointment: Doc<"appointments"> }[] = [];
  for (const appointment of appointments) {
    const visit = await ctx.db
      .query("visits")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
      .first();
    if (visit) rows.push({ visit, appointment });
  }
  return rows.sort((a, b) => b.appointment.scheduledAt - a.appointment.scheduledAt);
}

// ---- Cross-track: called by Track B's apps ----

/** D1 step 1: upload URL for the recorded (or pre-recorded demo) visit audio. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** D1 step 2: register the uploaded file; processing starts automatically. */
export const create = mutation({
  args: { appointmentId: v.id("appointments"), storageId: v.id("_storage") },
  returns: v.union(v.null(), v.id("visits")),
  handler: async (ctx, args): Promise<Id<"visits"> | null> => {
    const appointment = await ctx.db.get("appointments", args.appointmentId);
    if (!appointment) throw new Error("Appointment not found");
    // One visit per appointment: a new upload replaces the old recording and reprocesses.
    const existing = await ctx.db
      .query("visits")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .first();
    let visitId: Id<"visits">;
    if (existing) {
      if (existing.audioStorageId && existing.audioStorageId !== args.storageId) {
        await ctx.storage.delete(existing.audioStorageId);
      }
      await ctx.db.replace("visits", existing._id, {
        appointmentId: args.appointmentId,
        audioStorageId: args.storageId,
        releasedToPatient: false,
        status: "uploaded",
      });
      visitId = existing._id;
    } else {
      visitId = await ctx.db.insert("visits", {
        appointmentId: args.appointmentId,
        audioStorageId: args.storageId,
        releasedToPatient: false,
        status: "uploaded",
      });
    }
    await ctx.scheduler.runAfter(0, internal.visits.processVisit, { visitId });
    return visitId;
  },
});

/**
 * E1 + doctor visit view. summaryEnglish / summaryPatientLang follow the VisitSummary
 * type in claude.ts. The patient app shows the summary only when releasedToPatient is true.
 */
export const getByAppointment = query({
  args: { appointmentId: v.id("appointments") },
  returns: v.union(v.null(), visitDoc),
  handler: async (ctx, args): Promise<Infer<typeof visitDoc> | null> => {
    return await ctx.db
      .query("visits")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .first();
  },
});

/** D6 "Release to patient". */
export const release = mutation({
  args: { visitId: v.id("visits") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get("visits", args.visitId);
    if (!visit) throw new Error("Visit not found");
    if (!visit.summaryPatientLang) throw new Error("The summary isn't ready yet");
    await ctx.db.patch("visits", args.visitId, { releasedToPatient: true, releasedAt: Date.now() });
    return null;
  },
});

const visitListRow = v.object({
  _id: v.id("visits"),
  appointmentId: v.id("appointments"),
  scheduledAt: v.number(),
  doctorName: v.string(),
  status: v.string(),
  releasedToPatient: v.boolean(),
  releasedAt: v.union(v.null(), v.number()),
});

/** G12 past visits, G13 visit history, H10: every visit for a patient, newest first, no transcript. */
export const listForPatient = query({
  args: { patientId: v.id("patients") },
  returns: v.array(visitListRow),
  handler: async (ctx, args): Promise<Infer<typeof visitListRow>[]> => {
    return (await visitsForPatient(ctx, args.patientId)).map(({ visit, appointment }) => ({
      _id: visit._id,
      appointmentId: appointment._id,
      scheduledAt: appointment.scheduledAt,
      doctorName: appointment.doctorName,
      status: visit.status,
      releasedToPatient: visit.releasedToPatient,
      releasedAt: visit.releasedAt ?? null,
    }));
  },
});

const releasedSummary = v.union(
  v.null(),
  v.object({
    visitId: v.id("visits"),
    appointmentId: v.id("appointments"),
    scheduledAt: v.number(),
    doctorName: v.string(),
    summaryEnglish: v.any(), // VisitSummary v2 (SPEC.md "Visit summary JSON v2")
    summaryPatientLang: v.any(),
  }),
);

/** G3 today's medications, G5 instructions: the newest visit released to the patient. */
export const latestReleasedSummary = query({
  args: { patientId: v.id("patients") },
  returns: releasedSummary,
  handler: async (ctx, args): Promise<Infer<typeof releasedSummary>> => {
    const row = (await visitsForPatient(ctx, args.patientId)).find(
      ({ visit }) => visit.releasedToPatient && visit.summaryPatientLang,
    );
    if (!row) return null;
    return {
      visitId: row.visit._id,
      appointmentId: row.appointment._id,
      scheduledAt: row.appointment.scheduledAt,
      doctorName: row.appointment.doctorName,
      summaryEnglish: row.visit.summaryEnglish,
      summaryPatientLang: row.visit.summaryPatientLang,
    };
  },
});

// ---- Track A internals ----

/**
 * D2–D4: transcribe, clean and label speakers, index passages, summarize in both languages,
 * check question coverage. `rawText` skips transcription (dev testing without audio).
 */
export const processVisit = internalAction({
  args: { visitId: v.id("visits"), rawText: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.visits.getProcessingContext, {
      visitId: args.visitId,
    });
    if (!context) return null;
    const { patientId, appointmentId, language } = context;
    const log = (msg: string) => console.log(`[visits] ${args.visitId}: ${msg}`);
    const fail = async (stage: string, error: unknown) => {
      console.error(`[visits] ${args.visitId}: ${stage} failed:`, error);
      await ctx.runMutation(internal.visits.setStatus, { visitId: args.visitId, status: "failed" });
    };

    // D2: speech to text, one pass per language spoken in the room.
    let passes: Record<string, string>;
    if (args.rawText !== undefined) {
      passes = { [language]: args.rawText };
    } else {
      const audio = context.audioStorageId ? await ctx.storage.get(context.audioStorageId) : null;
      if (!audio) return await fail("loading audio", "no audio file");
      const languages: Language[] = language === "en" ? ["en"] : ["en", language as Language];
      const started = Date.now();
      try {
        const results = await Promise.all(languages.map((l) => transcribeFile(audio, l)));
        passes = Object.fromEntries(languages.map((l, i) => [l, results[i].text]));
      } catch (error) {
        return await fail("transcription", error);
      }
      log(`transcribed ${languages.join("+")} in ${Date.now() - started} ms`);
    }

    let transcript: VisitTurn[];
    try {
      transcript = await cleanVisitTranscript(passes, language);
    } catch (error) {
      return await fail("transcript cleanup", error);
    }
    await ctx.runMutation(internal.visits.saveTranscript, { visitId: args.visitId, transcript });
    log(`cleaned transcript: ${transcript.length} turns`);

    // Index passages for the explainer agent before anything else, so it works as early as possible.
    const chunks = toChunks(transcript);
    try {
      await ctx.runAction(internal.elastic.indexVisitChunks, { patientId, appointmentId, chunks });
      log(`indexed ${chunks.length} passages in Elastic`);
    } catch (error) {
      // The summary is still useful without search; the explainer will just find nothing.
      console.error(`[visits] ${args.visitId}: indexVisitChunks failed:`, error);
    }

    // D3 summaries and D4 coverage run in parallel.
    let summary, coverage;
    try {
      [summary, coverage] = await Promise.all([
        summarizeVisit(transcript, language),
        checkQuestionCoverage(
          context.questions.map((q) => ({ id: q._id, textEnglish: q.textEnglish })),
          transcript,
        ),
      ]);
    } catch (error) {
      return await fail("summary", error);
    }
    await ctx.runMutation(internal.visits.saveSummary, {
      visitId: args.visitId,
      summaryEnglish: summary.english,
      summaryPatientLang: summary.patientLang,
      coverage: coverage
        .filter((c) => context.questions.some((q) => q._id === c.id))
        .map((c) => ({
          questionId: c.id as Id<"questions">,
          answered: c.answered,
          evidence: c.evidence ?? undefined,
        })),
    });
    log(
      `summarized: ${summary.english.medications.length} medications, ` +
        `${coverage.filter((c) => c.answered).length}/${coverage.length} questions answered`,
    );
    return null;
  },
});

export const getProcessingContext = internalQuery({
  args: { visitId: v.id("visits") },
  returns: v.union(
    v.null(),
    v.object({
      patientId: v.id("patients"),
      appointmentId: v.id("appointments"),
      language: v.string(),
      audioStorageId: v.optional(v.id("_storage")),
      questions: v.array(v.object({ _id: v.id("questions"), textEnglish: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const visit = await ctx.db.get("visits", args.visitId);
    if (!visit) return null;
    const appointment = await ctx.db.get("appointments", visit.appointmentId);
    if (!appointment) return null;
    const patient = await ctx.db.get("patients", appointment.patientId);
    if (!patient) return null;
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
      .take(200);
    return {
      patientId: patient._id,
      appointmentId: appointment._id,
      language: patient.language,
      audioStorageId: visit.audioStorageId,
      questions: questions
        .filter((q) => q.status !== "carried_over")
        .map((q) => ({ _id: q._id, textEnglish: q.textEnglish })),
    };
  },
});

export const saveTranscript = internalMutation({
  args: { visitId: v.id("visits"), transcript: v.array(turnValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("visits", args.visitId, { transcript: args.transcript, status: "transcribed" });
    return null;
  },
});

/** Saves both summaries and D4 coverage, then marks the visit summarized. */
export const saveSummary = internalMutation({
  args: {
    visitId: v.id("visits"),
    summaryEnglish: v.any(),
    summaryPatientLang: v.any(),
    coverage: v.array(
      v.object({
        questionId: v.id("questions"),
        answered: v.boolean(),
        evidence: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const c of args.coverage) {
      const question = await ctx.db.get("questions", c.questionId);
      if (!question || question.status === "carried_over") continue;
      await ctx.db.patch("questions", c.questionId, {
        status: c.answered ? "answered" : "open",
        answerEvidence: c.answered ? c.evidence : undefined,
      });
    }
    await ctx.db.patch("visits", args.visitId, {
      summaryEnglish: args.summaryEnglish,
      summaryPatientLang: args.summaryPatientLang,
      status: "summarized",
    });
    return null;
  },
});

/**
 * Re-indexes the passages of every visit that has a transcript. The seed runs it after
 * elastic.reindexAll (which empties visit_chunks), so seeded visits are searchable.
 */
export const reindexAllChunks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const visits = await ctx.runQuery(internal.visits.transcribedVisits, {});
    for (const visit of visits) {
      await ctx.runAction(internal.elastic.indexVisitChunks, {
        patientId: visit.patientId,
        appointmentId: visit.appointmentId,
        chunks: toChunks(visit.transcript),
      });
    }
    console.log(`[visits] re-indexed passages for ${visits.length} visit(s)`);
    return null;
  },
});

export const transcribedVisits = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      patientId: v.id("patients"),
      appointmentId: v.id("appointments"),
      transcript: v.array(turnValidator),
    }),
  ),
  handler: async (ctx) => {
    const rows = [];
    for (const visit of await ctx.db.query("visits").take(500)) {
      if (!visit.transcript?.length) continue;
      const appointment = await ctx.db.get("appointments", visit.appointmentId);
      if (!appointment) continue;
      rows.push({
        patientId: appointment.patientId,
        appointmentId: appointment._id,
        transcript: visit.transcript,
      });
    }
    return rows;
  },
});

export const setStatus = internalMutation({
  args: { visitId: v.id("visits"), status: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("visits", args.visitId, { status: args.status });
    return null;
  },
});

/**
 * Dev: process a visit from a typed transcript instead of audio.
 * `npx convex run visits:devCreateFromText '{"rawText":"Doctor: ... Paciente: ..."}'`
 */
export const devCreateFromText = internalMutation({
  args: { rawText: v.string(), appointmentId: v.optional(v.id("appointments")) },
  returns: v.id("visits"),
  handler: async (ctx, args) => {
    const appointment = args.appointmentId
      ? await ctx.db.get("appointments", args.appointmentId)
      : await ctx.db.query("appointments").first();
    if (!appointment) throw new Error("No appointment; run the seed first");
    const existing = await ctx.db
      .query("visits")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", appointment._id))
      .first();
    const fields = { appointmentId: appointment._id, releasedToPatient: false, status: "uploaded" };
    const visitId = existing
      ? (await ctx.db.replace("visits", existing._id, fields), existing._id)
      : await ctx.db.insert("visits", fields);
    await ctx.scheduler.runAfter(0, internal.visits.processVisit, {
      visitId,
      rawText: args.rawText,
    });
    return visitId;
  },
});
