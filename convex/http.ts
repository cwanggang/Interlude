// TRACK A owns this file. Cartesia webhook tools, served at https://<deployment>.convex.site.
// Every request must carry x-webhook-secret: $CARTESIA_WEBHOOK_SECRET.
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
const badRequest = (message: string) => Response.json({ error: message }, { status: 400 });

/**
 * Reads the tool arguments. Accepts them at the top level or nested under
 * "arguments"/"args"/"parameters", whichever way the agent's webhook tool sends them.
 */
async function readArgs(request: Request): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  for (const key of ["arguments", "args", "parameters"]) {
    const nested = obj[key];
    if (typeof nested === "object" && nested !== null) return { ...obj, ...nested };
  }
  return obj;
}

function str(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

http.route({
  path: "/cartesia/red-flag",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return unauthorized();
    const args = await readArgs(request);
    const patientId = args && str(args, "patient_id");
    const symptom = args && str(args, "symptom");
    if (!args || !patientId || !symptom) return badRequest("patient_id and symptom are required");
    await ctx.runMutation(internal.pipeline.createAlert, {
      patientId: patientId as Id<"patients">,
      symptom,
      quote: str(args, "quote") ?? symptom,
      cartesiaCallId: str(args, "call_id") ?? undefined,
    });
    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/cartesia/add-question",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return unauthorized();
    const args = await readArgs(request);
    const patientId = args && str(args, "patient_id");
    const question = args && str(args, "question");
    if (!patientId || !question) return badRequest("patient_id and question are required");
    await ctx.runMutation(internal.pipeline.addVoiceQuestion, {
      patientId: patientId as Id<"patients">,
      question,
    });
    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/cartesia/search-visit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return unauthorized();
    const args = await readArgs(request);
    const appointmentId = args && str(args, "appointment_id");
    const query = args && str(args, "query");
    if (!appointmentId || !query) return badRequest("appointment_id and query are required");
    const passages = await ctx.runAction(internal.elastic.searchVisit, {
      appointmentId: appointmentId as Id<"appointments">,
      query,
    });
    return Response.json({ passages });
  }),
});

export default http;
