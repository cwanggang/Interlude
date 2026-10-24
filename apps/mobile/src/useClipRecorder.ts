// G16 mic: Expo Go can't stream live audio, so the chat records a short clip with expo-audio,
// uploads it, and Track A's chat.transcribeClip turns it into text (Ink batch).
import { useAction, useMutation } from 'convex/react';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { Language } from './i18n';

/** Long enough for a sentence or two; the clip stops itself after this. */
const MAX_SECONDS = 60;

export type MicState = 'idle' | 'recording' | 'transcribing';
export type MicError = 'unavailable' | 'empty' | null;

export function useClipRecorder(language: Language, onText: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const transcribeClip = useAction(api.chat.transcribeClip);
  const [state, setState] = useState<MicState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<MicError>(null);

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  const stop = async () => {
    if (state !== 'recording') return;
    setState('transcribing');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri) throw new Error('no recording');
      const clip = await (await fetch(recorder.uri)).blob();
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': clip.type || 'audio/mp4' }, body: clip });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      const { text } = await transcribeClip({ storageId, language });
      if (text) onText(text);
      else setError('empty');
    } catch {
      setError('unavailable');
    } finally {
      setState('idle');
    }
  };

  useEffect(() => {
    if (state === 'recording' && seconds >= MAX_SECONDS) void stop();
  }, [state, seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return setError('unavailable');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setSeconds(0);
      setState('recording');
    } catch {
      setError('unavailable');
    }
  };

  return { state, seconds, error, start, stop };
}
