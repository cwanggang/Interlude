import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button, Text } from './components';
import type { Strings } from './i18n';
import { theme } from './theme';

/**
 * B3: places the same outbound call as the daily check-in and follows it. `message` is the live
 * status or an error to show under the button; `active` while dialing or on the call.
 */
export function useCallMeNow(patientId: Id<'patients'> | undefined, s: Strings, mode: 'checkin' | 'explainer' = 'checkin') {
  const triggerNow = useMutation(api.calls.triggerNow);
  const [conversationId, setConversationId] = useState<Id<'conversations'> | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const call = useQuery(api.calls.getConversation, conversationId ? { conversationId } : 'skip');

  const status = call?.status;
  const active = status === 'dialing' || status === 'in_progress';
  const message =
    status === 'dialing'
      ? s.calling
      : status === 'in_progress'
        ? s.onCall
        : status === 'ended' || status === 'processed'
          ? s.callEnded
          : status === 'failed'
            ? s.callFailed
            : unavailable
              ? s.callUnavailable
              : null;

  const start = async () => {
    if (!patientId) return;
    setBusy(true);
    try {
      const result = await triggerNow({ patientId, mode });
      setConversationId(result.conversationId);
      setUnavailable(result.conversationId === null);
    } catch {
      setUnavailable(true);
    } finally {
      setBusy(false);
    }
  };

  return { start, busy, active, message, error: status === 'failed' || unavailable };
}

/** The big lavender→periwinkle call button with its live status underneath ("Talk about my visit"). */
export function CallMeNow({
  patientId,
  s,
  mode = 'checkin',
  label,
}: {
  patientId: Id<'patients'>;
  s: Strings;
  mode?: 'checkin' | 'explainer';
  label?: string;
}) {
  const call = useCallMeNow(patientId, s, mode);
  return (
    <View style={{ gap: theme.space.sm }}>
      <Button big icon="phone-white" label={call.active ? s.calling : (label ?? s.callMeNow)} onPress={() => void call.start()} disabled={call.busy || call.active} />
      {call.message && <Text variant={call.error ? 'error' : 'muted'} center>{call.message}</Text>}
    </View>
  );
}
