// G15: what happened lately, opened from the bell on Home. Each item goes where it points.
import { useQuery } from 'convex/react';
import { router } from 'expo-router';

import { api } from '../../../../convex/_generated/api';
import { ListItem, Screen, ScreenTitle, Text } from '../components';
import { formatDate } from '../i18n';
import { useNow } from '../useNow';
import { usePatient } from '../usePatient';

export default function Notifications() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const items = useQuery(api.notifications.list, patient ? { patientId: patient._id, now } : 'skip');

  return (
    <Screen>
      <ScreenTitle title={s.notificationsTitle} />
      {items === undefined && <Text>{s.loading}</Text>}
      {items?.length === 0 && <Text variant="muted">{s.noNotifications}</Text>}
      {items?.map((n) => (
        <ListItem
          key={n.id}
          onPress={() => router.push(n.kind === 'summary_ready' ? '/visit' : n.kind === 'missed_call' ? '/' : '/questions')}
          title={<Text variant="heading">{s.notificationText[n.kind]}</Text>}
          subtitle={
            <>
              {n.text && <Text variant="quote">“{n.text}”</Text>}
              <Text variant="muted">{formatDate(n.at, language, true)}</Text>
            </>
          }
          trailing={<Text variant="heading">›</Text>}
        />
      ))}
    </Screen>
  );
}
