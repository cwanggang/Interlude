// TRACK A owns apps/mobile/src/voice/*. In-app voice (B4, P1): needs an Expo dev build
// with react-native-audio-api. Track B's screens import only this hook.
// STUB: no audio until the P1 block.
import { useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";

export type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "ended" | "error";

export type VoiceSession = {
  state: VoiceState;
  /** Live captions, newest last. */
  captions: { role: "agent" | "user"; text: string }[];
  start: () => Promise<void>;
  end: () => void;
  /** False in Expo Go: show the "Call me now" button instead. */
  supported: boolean;
};

export function useVoiceSession(_patientId: Id<"patients"> | undefined): VoiceSession {
  const [state, setState] = useState<VoiceState>("idle");
  return {
    state,
    captions: [],
    start: async () => setState("error"),
    end: () => setState("ended"),
    supported: false,
  };
}
