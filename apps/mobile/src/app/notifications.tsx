// Notifications (Figma 2.4): grouped Today / This week, an icon per kind, unread dot on today's.
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import { Card, Divider, Icon, IconCircle, PageHeader, Screen, ScreenTitle, Text } from '../components';
import type { IconName } from '../icons';
import { formatTime, type Language } from '../i18n';
import { theme } from '../theme';
import { useNow } from '../useNow';
import { usePatient } from '../usePatient';

type Item = FunctionReturnType<typeof api.notifications.list>[number];

const ICON: Record<Item['kind'], { name: IconName; bg: string }> = {
  summary_ready: { name: 'file', bg: theme.color.primaryBg },
  missed_call: { name: 'alert', bg: theme.color.coralBg },
  question_captured: { name: 'chat', bg: theme.color.primaryBg },
};

const TARGET: Record<Item['kind'], '/visit' | '/' | '/questions'> = {
  summary_ready: '/visit',
  missed_call: '/',
  question_captured: '/questions',
};

export default function Notifications() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const items = useQuery(api.notifications.list, patient ? { patientId: patient._id, now } : 'skip');
  const startOfToday = new Date(new Date(now).toDateString()).getTime();
  const today = items?.filter((n) => n.at >= startOfToday) ?? [];
  const earlier = items?.filter((n) => n.at < startOfToday) ?? [];

  return (
    <Screen header={<PageHeader title={s.notificationsTitle} />}>
      <ScreenTitle title={s.notificationsTitle} />
      {items === undefined && <Text>{s.loading}</Text>}
      {items?.length === 0 && <Text variant="muted">{s.noNotifications}</Text>}
      {today.length > 0 && <Group title={s.notifToday} items={today} unread language={language} />}
      {earlier.length > 0 && <Group title={s.notifEarlier} items={earlier} language={language} />}
    </Screen>
  );
}

function Group({ title, items, unread, language }: { title: string; items: Item[]; unread?: boolean; language: Language }) {
  const { s } = usePatient();
  return (
    <View style={{ gap: theme.space.lg }}>
      <Text variant="label">{title}</Text>
      <Card gap={0}>
        {items.map((n, i) => (
          <View key={n.id}>
            {i > 0 && <Divider />}
            <Pressable accessibilityRole="button" onPress={() => router.push(TARGET[n.kind])} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}>
              <IconCircle name={ICON[n.kind].name} size={40} iconSize={20} bg={ICON[n.kind].bg} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant={unread ? 'strong' : 'body'}>{s.notificationText[n.kind]}</Text>
                {n.text && <Text variant="muted">{`“${n.text}”`}</Text>}
                <Text variant="muted">{unread ? formatTime(n.at, language) : new Date(n.at).toLocaleDateString(language === 'es' ? 'es-US' : 'en-US', { weekday: 'long' })}</Text>
              </View>
              {unread && <Icon name="unread-dot" size={10} />}
            </Pressable>
          </View>
        ))}
      </Card>
    </View>
  );
}
