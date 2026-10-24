// TRACK A owns this file. Starting calls: cron, "Call me now", in-app voice tokens.
// STUB: validators are the contract; bodies are fake.
import { v, type Infer } from "convex/values";
import { action, internalAction, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const conversationStatus = v.union(
  v.literal("dialing"),
  v.literal("in_progress"),
  v.literal("ended"),
  v.literal("processed"),
  v.literal("failed"),
);

// ---- Cross-track: called by Track B's apps ----

/**
 * B3 "Call me now": places a call immediately. Mode defaults to "explainer" when the
 * current appointment has a visit released to the patient, otherwise "checkin".
 * Watch the call with api.calls.getConversation.
 */
export const triggerNow = mutation({
  args: {
    patientId: v.id("patients"),
    mode: v.optional(v.union(v.literal("checkin"), v.literal("explainer"))),
  },
  returns: v.object({ conversationId: v.union(v.null(), v.id("conversations")) }),
  handler: async (_ctx, args): Promise<{ conversationId: Id<"conversations"> | null }> => {
    console.log("[stub] calls.triggerNow", args.patientId);
    return { conversationId: null };
  },
});

const conversationStatusRow = v.union(
  v.null(),
  v.object({
    _id: v.id("conversations"),
    status: conversationStatus,
    mode: v.union(v.literal("checkin"), v.literal("explainer")),
    startedAt: v.number(),
  }),
);

/** Live status of one call, for the "Calling you now…" state. */
export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  returns: conversationStatusRow,
  handler: async (): Promise<Infer<typeof conversationStatusRow>> => {
    return null;
  },
});

const accessTokenResult = v.object({
  accessToken: v.string(),
  websocketUrl: v.string(),
  expiresAt: v.number(),
  conversationId: v.union(v.null(), v.id("conversations")),
});

/** B4 in-app voice: short-lived Cartesia token plus the conversation row it will fill. */
export const getAccessToken = action({
  args: {
    patientId: v.id("patients"),
    mode: v.optional(v.union(v.literal("checkin"), v.literal("explainer"))),
  },
  returns: accessTokenResult,
  handler: async (): Promise<Infer<typeof accessTokenResult>> => {
    return {
      accessToken: "stub-token",
      websocketUrl: "wss://api.cartesia.ai/v1/agents/websocket/stub-agent",
      expiresAt: Date.now() + 60_000,
      conversationId: null,
    };
  },
});

// ---- Track A internals ----

/** Cron target (every 5 min): dial every consenting patient whose call time has passed and who hasn't been called today. */
export const runDueCheckins = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    console.log("[stub] calls.runDueCheckins");
    return null;
  },
});

/** Builds dynamic variables, sends POST /agents/calls, stores the call ID, starts polling. */
export const startCall = internalAction({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log("[stub] calls.startCall", args.conversationId);
    return null;
  },
});
