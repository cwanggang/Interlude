// TRACK A owns this file. Cartesia webhook tools, served at https://<deployment>.convex.site.
// Every request must carry x-webhook-secret: $CARTESIA_WEBHOOK_SECRET.
// STUB: routes and auth are real; handlers call stubbed internals.
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

function authorized(request: Request): boolean {
  const secret = process.env.CARTESIA_WEBHOOK_SECRET;
  return !!secret && request.headers.get("x-webhook-secret") === secret;
}

const unauthorized = () => new Response("unauthorized", { status: 401 });

http.route({
  path: "/cartesia/red-flag",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return unauthorized();
    const body = (await request.json()) as { patient_id: string; symptom: string; quote: string };
    await ctx.runMutation(internal.pipeline.createAlert, {
      patientId: body.patient_id as Id<"patients">,
      symptom: body.symptom,
      quote: body.quote,
    });
    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/cartesia/add-question",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return unauthorized();
    const body = (await request.json()) as { patient_id: string; question: string };
    await ctx.runMutation(internal.pipeline.addVoiceQuestion, {
      patientId: body.patient_id as Id<"patients">,
      question: body.question,
    });
    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/cartesia/search-visit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return unauthorized();
    const body = (await request.json()) as {
      patient_id: string;
      appointment_id: string;
      query: string;
    };
    const passages = await ctx.runAction(internal.elastic.searchVisit, {
      appointmentId: body.appointment_id as Id<"appointments">,
      query: body.query,
    });
    return Response.json({ passages });
  }),
});

export default http;
