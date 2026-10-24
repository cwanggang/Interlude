// TRACK A owns this file. Plain helpers for the Cartesia REST API, called from
// Track A actions only. STUB: fake responses until the spine is built.

export type Language = "en" | "es";
export type AgentMode = "checkin" | "explainer";

/** Picks the agent ID from CARTESIA_{CHECKIN|EXPLAINER}_AGENT_ID_{EN|ES}. */
export function agentIdFor(mode: AgentMode, language: Language): string {
  const name = `CARTESIA_${mode.toUpperCase()}_AGENT_ID_${language.toUpperCase()}`;
  return process.env[name] ?? `stub-${mode}-${language}`;
}

/** POST /agents/calls. Returns the Cartesia call ID. */
export async function startOutboundCall(_args: {
  agentId: string;
  toPhone: string;
  dynamicVariables: Record<string, string>;
}): Promise<{ callId: string }> {
  return { callId: `stub-call-${Date.now()}` };
}

export type CartesiaCall = {
  status: "in_progress" | "ended" | "failed";
  transcript: { role: string; text: string }[];
};

/** Get Call: status plus transcript once ended. */
export async function getCall(_callId: string): Promise<CartesiaCall> {
  return { status: "ended", transcript: [] };
}

/** Short-lived access token for the in-app WebSocket (B4). Never ship the API key to the app. */
export async function mintAccessToken(): Promise<{ token: string; expiresAt: number }> {
  return { token: "stub-token", expiresAt: Date.now() + 60_000 };
}

/** Batch transcription of a recorded visit file. */
export async function transcribeFile(_audio: Blob): Promise<{ text: string }> {
  return { text: "" };
}
