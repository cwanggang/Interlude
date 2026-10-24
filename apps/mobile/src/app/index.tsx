// Screen 2: patient home. A2 countdown, B3 "Call me now", today's check-in, last check-in.
import { useQuery } from 'convex/react';
import { Redirect, Stack, router } from 'expo-router';

import { api } from '../../../../convex/_generated/api';
import { CallMeNow } from '../CallMeNow';
import { Badge, Button, Card, ListItem, Screen, Text } from '../components';
import { formatDate, formatDay } from '../i18n';
import { usePatient } from '../usePatient';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from today to the visit, in the device's time zone. */
function daysUntil(ms: number): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(new Date(ms)) - start(new Date())) / DAY_MS);
}

function isToday(ms: number): boolean {
  return new Date(ms).toDateString() === new Date().toDateString();
}

export default function Home() {
  const { patient, appointment, language, s } = usePatient();
  const conversations = useQuery(api.patients.conversations, patient ? { patientId: patient._id } : 'skip');
  const entries = useQuery(api.patients.symptomEntries, patient ? { patientId: patient._id } : 'skip');

  if (patient === undefined) {
    return (
      <Screen>
        <Text>{s.loading}</Text>
      </Screen>
    );
  }
  if (patient === null) return <Redirect href="/profile" />;

  const checkinToday = conversations?.some(
    (c) => c.mode === 'checkin' && isToday(c.startedAt) && (c.status === 'processed' || c.status === 'ended'),
  );
  const lastDate = entries?.[0]?.date;
  const lastEntries = entries?.filter((e) => e.date === lastDate) ?? [];

  return (
    <Screen footer={<Text variant="muted">{s.disclaimer}</Text>}>
      <Stack.Screen options={{ title: s.hello(patient.name.split(' ')[0]) }} />

      <Card title={appointment?.status === 'completed' ? s.lastVisit : s.nextVisit}>
        {appointment ? (
          <>
            {appointment.status === 'upcoming' && <Text variant="title">{s.inDays(daysUntil(appointment.scheduledAt))}</Text>}
            <Text>{formatDate(appointment.scheduledAt, language, true)}</Text>
            <Text variant="muted">{s.withDoctor(appointment.doctorName)}</Text>
          </>
        ) : (
          <Text variant="muted">{s.noVisit}</Text>
        )}
      </Card>

      <CallMeNow patientId={patient._id} s={s} />

      <Card title={s.todayCheckin}>
        <ListItem
          title={checkinToday ? s.checkinDone : s.checkinPending}
          subtitle={checkinToday ? undefined : s.checkinPendingHint(patient.callTimeLocal)}
          trailing={<Badge tone={checkinToday ? 'success' : 'neutral'} label={checkinToday ? '✓' : '…'} />}
        />
      </Card>

      {lastDate && (
        <Card title={`${s.lastCheckin} · ${formatDay(lastDate, language)}`}>
          {lastEntries.map((e) => (
            <ListItem
              key={e._id}
              title={language === 'es' ? e.symptomOriginal : e.symptom}
              subtitle={e.change ? s.change[e.change] ?? e.change : undefined}
              trailing={e.severity !== undefined ? <Badge label={s.severity(e.severity)} /> : undefined}
            />
          ))}
        </Card>
      )}

      <Button label={s.myQuestions} variant="secondary" onPress={() => router.push('/questions')} />
      <Button label={s.visitSummary} variant="secondary" onPress={() => router.push('/visit')} />
      <Button label={s.visitPrep} variant="secondary" onPress={() => router.push('/prep')} />
      <Button label={s.history} variant="secondary" onPress={() => router.push('/history')} />
      <Button label={s.profile} variant="secondary" onPress={() => router.push('/profile')} />
    </Screen>
  );
}
