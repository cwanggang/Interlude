// Home (G1–G6). Top to bottom: the dynamic tile (cycle strip and countdown, or the call state),
// "Call me now" with the next call time, today's medicines, the top instructions, and the
// safety line. Before the first visit, a question preview and an empty state replace medicines.
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { CallMeNow } from '../../CallMeNow';
import { Badge, Button, Card, ListItem, Screen, ScreenTitle, Text } from '../../components';
import { formatDate, formatTime, type Language, type Strings } from '../../i18n';
import { theme } from '../../theme';
import { useNow } from '../../useNow';
import { usePatient } from '../../usePatient';
import { itemText, todaysDoses, summaryFor, type SummaryItem, type VisitSummary } from '../../visitSummary';

/** The check-in done line stays on the tile this long, then the tile returns to the timeline. */
const DONE_SHOWN_MS = 3 * 60 * 60_000;
const TOP_INSTRUCTIONS = 3;

const SLOT_ICON: Record<string, string> = { morning: '☀️', midday: '🌤️', evening: '🌙', bedtime: '🛏️' };

export default function Home() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const patientArgs = patient ? { patientId: patient._id, now } : 'skip';
  const cycle = useQuery(api.appointments.cycle, patientArgs);
  const schedule = useQuery(api.calls.callSchedule, patientArgs);
  const released = useQuery(api.visits.latestReleasedSummary, patient ? { patientId: patient._id } : 'skip');

  if (patient === undefined) {
    return (
      <Screen>
        <Text>{s.loading}</Text>
      </Screen>
    );
  }
  if (patient === null) return <Redirect href="/settings" />;

  const summary = released ? summaryFor(released, language) : undefined;

  return (
    <Screen footer={<Text variant="muted">{s.disclaimer}</Text>}>
      <ScreenTitle title={s.hello(patient.name.split(' ')[0], new Date(now).getHours())} />

      {cycle && schedule && <Tile cycle={cycle} schedule={schedule} now={now} language={language} s={s} />}

      <CallMeNow patientId={patient._id} s={s} quiet hint={nextCallHint(schedule?.nextCallAt ?? null, now, language, s)} />

      {released === undefined ? null : summary ? (
        <>
          <Medicines summary={summary} patientId={patient._id} timezone={patient.timezone} now={now} s={s} />
          <Instructions items={summary.instructions ?? []} s={s} />
        </>
      ) : (
        <BeforeFirstVisit appointmentId={cycle?.appointment?._id} doctor={cycle?.appointment?.doctorName} s={s} />
      )}
    </Screen>
  );
}

type Cycle = FunctionReturnType<typeof api.appointments.cycle>;
type Schedule = FunctionReturnType<typeof api.calls.callSchedule>;

/** G1: the timeline by default; around a call it shows the call's state instead. */
function Tile({ cycle, schedule, now, language, s }: { cycle: Cycle; schedule: Schedule; now: number; language: Language; s: Strings }) {
  const doneRecently = schedule.state === 'done' && schedule.lastCheckin && now - schedule.lastCheckin.startedAt < DONE_SHOWN_MS;

  if (schedule.state === 'calling') {
    return (
      <Card tone="primary">
        <Text variant="title">{s.callingNow}</Text>
      </Card>
    );
  }
  if (schedule.state === 'missed') {
    return (
      <Card tone="danger">
        <Text variant="title">{s.missedCall}</Text>
        <Text>{s.missedHint}</Text>
      </Card>
    );
  }
  if (schedule.state === 'soon' && schedule.nextCallAt) {
    return (
      <Card tone="primary">
        <Text variant="title">{s.callSoon(formatTime(schedule.nextCallAt, language))}</Text>
      </Card>
    );
  }
  if (doneRecently && schedule.lastCheckin) {
    const line = language === 'en' ? schedule.lastCheckin.summaryEnglish : (schedule.lastCheckin.summaryPatientLang ?? schedule.lastCheckin.summaryEnglish);
    return (
      <Card>
        <Text variant="heading">✓ {s.checkinDoneTitle}</Text>
        {line && <Text>{line}</Text>}
        <Button label={s.seeAllCheckins} variant="secondary" onPress={() => router.push('/history')} />
      </Card>
    );
  }
  return <CycleTile cycle={cycle} language={language} s={s} />;
}

/** G2: Before visit → Visit → After visit, with the countdown. Tapping opens My Visit. */
function CycleTile({ cycle, language, s }: { cycle: Cycle; language: Language; s: Strings }) {
  const appointment = cycle.appointment;
  if (cycle.stage === 'none' || !appointment) {
    return (
      <Card>
        <Text>{s.noVisit}</Text>
      </Card>
    );
  }
  const line =
    cycle.stage === 'visit'
      ? s.visitToday(formatTime(appointment.scheduledAt, language), appointment.doctorName)
      : cycle.stage === 'before'
        ? s.countdown(cycle.daysUntil ?? 0, appointment.doctorName)
        : s.visitOn(formatDate(appointment.scheduledAt, language));
  return (
    <Card>
      <ListItem
      onPress={() => router.push('/visit')}
      title={
        <View style={{ gap: theme.space.md }}>
          <View style={{ flexDirection: 'row', gap: theme.space.xs, flexWrap: 'wrap' }}>
            {(['before', 'visit', 'after'] as const).map((stage) => (
              <Badge key={stage} tone={stage === cycle.stage ? 'primary' : 'neutral'} label={s.stages[stage]} />
            ))}
          </View>
          <Text variant="title">{line}</Text>
        </View>
      }
      trailing={<Text variant="heading">›</Text>}
      />
    </Card>
  );
}

function nextCallHint(nextCallAt: number | null, now: number, language: Language, s: Strings): string {
  if (nextCallAt === null) return s.callsOff;
  const dayStart = (ms: number) => new Date(new Date(ms).toDateString()).getTime();
  const days = Math.round((dayStart(nextCallAt) - dayStart(now)) / 86_400_000);
  const day = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : formatDate(nextCallAt, language);
  return s.nextCall(day, formatTime(nextCallAt, language));
}

/** G3 / G4: today's doses from the latest released summary, each with a "Taken" toggle. */
function Medicines({ summary, patientId, timezone, now, s }: { summary: VisitSummary; patientId: Id<'patients'>; timezone: string; now: number; s: Strings }) {
  const events = useQuery(api.medications.week, { patientId, now, days: 1 });
  const markTaken = useMutation(api.medications.markTaken);
  const doses = todaysDoses(summary);
  if (doses.length === 0) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(now));
  const taken = new Set(
    (events ?? []).filter((e) => e.date === today && e.action === 'taken' && e.slot).map((e) => `${e.medication}-${e.slot}`),
  );
  return (
    <Card title={s.todayMedications}>
      {doses.map((d) => (
        <ListItem
          key={`${d.key}-${d.slot}`}
          title={<Text variant="heading">{`${d.slot ? `${SLOT_ICON[d.slot]} ` : ''}${d.name} ${d.dose}`}</Text>}
          subtitle={d.slot ? s.slots[d.slot] : d.schedule}
          trailing={
            d.slot ? (
              <Button
                label={taken.has(`${d.key}-${d.slot}`) ? `✓ ${s.taken}` : s.markTaken}
                variant={taken.has(`${d.key}-${d.slot}`) ? 'primary' : 'secondary'}
                onPress={() => void markTaken({ patientId, medication: d.key, slot: d.slot!, taken: !taken.has(`${d.key}-${d.slot}`) })}
              />
            ) : undefined
          }
        />
      ))}
      <Button label={s.seeAllMedications} variant="secondary" onPress={() => router.push('/visit')} />
    </Card>
  );
}

/** G5: the top instructions from the latest summary, in plain language. */
function Instructions({ items, s }: { items: SummaryItem[]; s: Strings }) {
  if (items.length === 0) return null;
  return (
    <Card title={s.instructions}>
      {items.slice(0, TOP_INSTRUCTIONS).map((item, i) => (
        <Text key={i}>• {itemText(item)}</Text>
      ))}
      {items.length > TOP_INSTRUCTIONS && <Button label={s.seeAll} variant="secondary" onPress={() => router.push('/visit')} />}
    </Card>
  );
}

/** G6: before the first visit there are no medicines yet; preview the question queue instead. */
function BeforeFirstVisit({ appointmentId, doctor, s }: { appointmentId?: Id<'appointments'>; doctor?: string; s: Strings }) {
  const questions = useQuery(api.questions.listForAppointment, appointmentId ? { appointmentId } : 'skip');
  const open = questions?.filter((q) => q.status === 'open').length ?? 0;
  return (
    <>
      {doctor && (
        <ListItem
          onPress={() => router.push('/questions')}
          title={<Text variant="heading">{s.questionsPreview(open, doctor)}</Text>}
          trailing={<Text variant="heading">›</Text>}
        />
      )}
      <Card>
        <Text variant="muted">{s.emptyBeforeVisit}</Text>
      </Card>
    </>
  );
}
