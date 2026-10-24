// TRACK A owns this file. Plain helpers for the Cartesia REST API, called from
// Track A actions only. mintAccessToken and transcribeFile are still stubs (later blocks).

export type Language = "en" | "es";
export type AgentMode = "checkin" | "explainer";

const API = "https://api.cartesia.ai";
const VERSION = "2026-08-14";

/** Picks the agent ID from CARTESIA_{CHECKIN|EXPLAINER}_AGENT_ID_{EN|ES}. */
export function agentIdFor(mode: AgentMode, language: Language): string {
  const name = `CARTESIA_${mode.toUpperCase()}_AGENT_ID_${language.toUpperCase()}`;
  const id = process.env[name];
  if (!id) throw new Error(`${name} is not set`);
  return id;
}

function headers(): Record<string, string> {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) throw new Error("CARTESIA_API_KEY is not set");
  // The outbound-call docs use X-API-Key and the Get Call docs use Bearer; send both.
  return {
    "X-API-Key": key,
    Authorization: `Bearer ${key}`,
    "Cartesia-Version": VERSION,
    "Content-Type": "application/json",
  };
}

async function cartesia<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cartesia ${method} ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

/** POST /agents/calls. Returns the Cartesia call ID (agent_call_id). */
export async function startOutboundCall(args: {
  agentId: string;
  toPhone: string;
  dynamicVariables: Record<string, string>;
}): Promise<{ callId: string }> {
  const fromNumberId = process.env.CARTESIA_FROM_NUMBER_ID;
  if (!fromNumberId) throw new Error("CARTESIA_FROM_NUMBER_ID is not set");
  const res = await cartesia<{
    calls: { number: string; agent_call_id?: string; error?: unknown }[];
  }>("POST", "/agents/calls", {
    from_number_id: fromNumberId,
    agent_id: args.agentId,
    ringing_timeout_seconds: 30,
    outbound_calls: [{ to_number: args.toPhone, dynamic_variables: args.dynamicVariables }],
  });
  const call = res.calls?.[0];
  if (!call?.agent_call_id) {
    throw new Error(`Cartesia rejected the call: ${JSON.stringify(call?.error ?? res)}`);
  }
  return { callId: call.agent_call_id };
}

export type CartesiaCall = {
  status: "in_progress" | "ended" | "failed";
  endReason: string | null;
  transcript: { role: string; text: string }[];
};

/** Get Call: status plus transcript once ended. Cartesia's created/started map to in_progress. */
export async function getCall(callId: string): Promise<CartesiaCall> {
  const res = await cartesia<{
    status: "created" | "started" | "completed" | "failed";
    end_reason?: string | null;
    error_message?: string | null;
    transcript?: { role: string; text?: string | null }[] | null;
  }>("GET", `/agents/calls/${encodeURIComponent(callId)}`);
  const transcript = (res.transcript ?? [])
    .filter((t) => (t.role === "user" || t.role === "assistant") && t.text)
    .map((t) => ({ role: t.role === "assistant" ? "agent" : "user", text: t.text! }));
  const status =
    res.status === "completed" ? "ended" : res.status === "failed" ? "failed" : "in_progress";
  return { status, endReason: res.end_reason ?? res.error_message ?? null, transcript };
}

/** Short-lived access token for the in-app WebSocket (B4). Never ship the API key to the app. */
export async function mintAccessToken(): Promise<{ token: string; expiresAt: number }> {
  return { token: "stub-token", expiresAt: Date.now() + 60_000 };
}

/** Batch transcription of a recorded visit file. */
export async function transcribeFile(_audio: Blob): Promise<{ text: string }> {
  return { text: "" };
}
