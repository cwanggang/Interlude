import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button, Card, Text } from './components';
import type { Strings } from './i18n';

/** B3: places the same outbound call as the daily check-in, then shows its live status. */
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

  const onPress = async () => {
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

  return (
    <Card>
      <Button big label={active ? s.calling : (label ?? s.callMeNow)} onPress={() => void onPress()} disabled={busy || active} />
      {message && <Text variant={status === 'failed' || unavailable ? 'error' : 'body'}>{message}</Text>}
    </Card>
  );
}
