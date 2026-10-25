// Home (Figma 2.1 before first visit, 2.2 post visit, 2.3 tile states). Greeting with the bell and
// Ask; the appointment tile (countdown, daily-call dots, care stages) or, around a call, its state;
// the call button; today's medicines with Take/Taken; the top instructions; the safety notice.
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { useCallMeNow } from '../../CallMeNow';
import { AskButton, Button, Card, Divider, Icon, IconCircle, Link, Screen, ScreenTitle, SafetyNotice, SectionTitle, Text, rowCard } from '../../components';
import type { IconName } from '../../icons';
import { formatDate, formatTime, type Language, type Strings } from '../../i18n';
import { theme } from '../../theme';
import { useNow } from '../../useNow';
import { bi } from '../../showEnglish';
import { usePatient } from '../../usePatient';
import { itemText, summaryFor, todaysDoses, type SummaryItem, type VisitSummary } from '../../visitSummary';

/** The check-in done tile stays this long, then the tile returns to the timeline. */
const DONE_SHOWN_MS = 3 * 60 * 60_000;
const TOP_INSTRUCTIONS = 3;
/** Daily-call dots on each side of the visit milestone. */
const DOTS_PER_SIDE = 6;
const DAY_MS = 86_400_000;

type Cycle = FunctionReturnType<typeof api.appointments.cycle>;
type Schedule = FunctionReturnType<typeof api.calls.callSchedule>;
type CallControl = ReturnType<typeof useCallMeNow>;

export default function Home() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const patientArgs = patient ? { patientId: patient._id, now } : 'skip';
  const cycle = useQuery(api.appointments.cycle, patientArgs);
  const schedule = useQuery(api.calls.callSchedule, patientArgs);
  const released = useQuery(api.visits.latestReleasedSummary, patient ? { patientId: patient._id } : 'skip');
  const call = useCallMeNow(patient?._id, s);

  if (patient === undefined) {
    return (
      <Screen>
        <Text>{s.loading}</Text>
      </Screen>
    );
  }
  if (patient === null) return <Redirect href="/onboarding" />;

  const summary = released ? summaryFor(released, language) : undefined;
  // In these states the tile carries the call action itself.
  const tileHasCall = schedule && ['soon', 'calling', 'missed'].includes(schedule.state);

  return (
    <Screen>
      <ScreenTitle title={s.tabHome} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="muted">{s.greeting(new Date(now).getHours())}</Text>
          <Text variant="title">{patient.name.split(' ')[0]}</Text>
        </View>
        <Bell patientId={patient._id} now={now} s={s} />
        <AskButton />
      </View>

      {cycle && schedule && <Tile cycle={cycle} schedule={schedule} patientId={patient._id} timezone={patient.timezone} now={now} call={call} language={language} s={s} />}

      {!tileHasCall && (
        <View style={{ gap: theme.space.sm }}>
          <Button big icon="phone-white" label={nextCallLabel(schedule?.nextCallAt ?? null, now, language, s)} onPress={() => void call.start()} disabled={call.busy || call.active || !patient.consentCalls} />
          {call.message && <Text variant={call.error ? 'error' : 'muted'} center>{call.message}</Text>}
        </View>
      )}

      {released === undefined ? null : summary ? (
        <>
          <Medicines summary={summary} patientId={patient._id} timezone={patient.timezone} now={now} s={s} />
          <Instructions items={summary.instructions ?? []} english={(released?.summaryEnglish as VisitSummary | undefined)?.instructions} language={language} s={s} />
        </>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <Icon name="pill" size={28} />
            <View style={{ flex: 1 }}>
              <Text color={theme.color.textMuted}>{s.emptyBeforeVisit}</Text>
            </View>
          </View>
        </Card>
      )}

      <SafetyNotice />
    </Screen>
  );
}

function nextCallLabel(nextCallAt: number | null, now: number, language: Language, s: Strings): string {
  if (nextCallAt === null) return s.callMeNow;
  const dayStart = (ms: number) => new Date(new Date(ms).toDateString()).getTime();
  const days = Math.round((dayStart(nextCallAt) - dayStart(now)) / DAY_MS);
  const day = days <= 0 ? s.today : days === 1 ? s.tomorrow : formatDate(nextCallAt, language);
  return s.nextCallButton(day, formatTime(nextCallAt, language));
}

/** 2.3: the timeline by default; around a call it shows the call's state instead. */
function Tile({ cycle, schedule, patientId, timezone, now, call, language, s }: { cycle: Cycle; schedule: Schedule; patientId: Id<'patients'>; timezone: string; now: number; call: CallControl; language: Language; s: Strings }) {
  const callButton = <Button big icon="phone-white" label={call.active ? s.calling : s.callMeNow} onPress={() => void call.start()} disabled={call.busy || call.active} />;

  if (schedule.state === 'calling') {
    return (
      <Card tone="primary">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(8,125,141,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <IconCircle name="phone-white-2" size={48} bg={theme.color.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{s.callingTitle}</Text>
            <Text color={theme.color.textMuted}>{s.callingHint}</Text>
          </View>
        </View>
      </Card>
    );
  }
  if (schedule.state === 'missed') {
    return (
      <Card tone="danger">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <Icon name="mascot-concern" size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{s.missedCall}</Text>
            <Text variant="muted">{s.missedCallDetail(schedule.nextCallAt ? formatTime(schedule.nextCallAt - DAY_MS, language) : '')}</Text>
          </View>
        </View>
        {callButton}
        {call.message && <Text variant={call.error ? 'error' : 'muted'} center>{call.message}</Text>}
      </Card>
    );
  }
  if (schedule.state === 'soon' && schedule.nextCallAt) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <IconCircle name="phone-teal" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{s.callSoon(formatTime(schedule.nextCallAt, language))}</Text>
            <Text variant="muted">{s.inMinutes(Math.round((schedule.nextCallAt - now) / 60_000))}</Text>
          </View>
        </View>
        {callButton}
        {call.message && <Text variant={call.error ? 'error' : 'muted'} center>{call.message}</Text>}
      </Card>
    );
  }
  const last = schedule.lastCheckin;
  if (schedule.state === 'done' && last && now - last.startedAt < DONE_SHOWN_MS) {
    const line = language === 'en' ? last.summaryEnglish : last.summaryPatientLang ? bi(last.summaryPatientLang, last.summaryEnglish, language) : last.summaryEnglish;
    return (
      <Card gap={10}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <IconCircle name="check-white-22" bg={theme.color.primary} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{s.checkinDoneShort}</Text>
          </View>
        </View>
        {line && <Text color={theme.color.textMuted}>{line}</Text>}
        <Link label={s.seeAllCheckins} onPress={() => router.push('/history')} />
      </Card>
    );
  }
  return <CycleTile cycle={cycle} patientId={patientId} timezone={timezone} now={now} language={language} s={s} />;
}

/** 2.3 A: countdown, the daily-call dots around the visit milestone, and the care stages. */
function CycleTile({ cycle, patientId, timezone, now, language, s }: { cycle: Cycle; patientId: Id<'patients'>; timezone: string; now: number; language: Language; s: Strings }) {
  const conversations = useQuery(api.patients.conversations, { patientId });
  const appointment = cycle.appointment;
  if (cycle.stage === 'none' || !appointment) {
    return (
      <Card elevated bordered={false}>
        <Text>{s.noVisit}</Text>
      </Card>
    );
  }

  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(ms));
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
  const today = day(now);
  const visitDay = day(appointment.scheduledAt);
  const done = new Set(
    (conversations ?? []).filter((c) => c.mode === 'checkin' && c.status === 'processed' && c.summaryEnglish).map((c) => day(c.startedAt)),
  );
  // Left of the milestone: the days just before the visit (or up to two days ahead of today when
  // the visit is far off); right: the days after it. Filled = a completed check-in that day.
  const leftEnd = [addDays(visitDay, -1), addDays(today, 2)].sort()[0];
  const left = Array.from({ length: DOTS_PER_SIDE }, (_, i) => addDays(leftEnd, i - DOTS_PER_SIDE + 1));
  const right = Array.from({ length: DOTS_PER_SIDE }, (_, i) => addDays(visitDay, i + 1));
  const dot = (d: string): IconName => (done.has(d) ? 'daily-call-done' : 'daily-call-upcoming');

  const big = cycle.stage === 'after' ? formatDate(appointment.scheduledAt, language) : s.countdownBig(cycle.daysUntil ?? 0);
  const line =
    cycle.stage === 'after'
      ? s.lastVisitWith(appointment.doctorName)
      : cycle.stage === 'visit'
        ? s.countdownToday(formatTime(appointment.scheduledAt, language), appointment.doctorName)
        : s.countdownUntil(appointment.doctorName);

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/visit')}>
      <Card elevated bordered={false} gap={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="hero">{big}</Text>
            <Text color={theme.color.textMuted}>{line}</Text>
          </View>
          <Icon name="chevron-right" size={24} />
        </View>
        <View style={{ gap: 10 }}>
          <View style={{ height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ position: 'absolute', left: 4, right: 4, top: 12, height: 2, backgroundColor: theme.color.border }} />
            {left.map((d) => (
              <Icon key={d} name={dot(d)} size={10} />
            ))}
            <Icon name="visit-milestone" size={22} />
            {right.map((d) => (
              <Icon key={d} name={dot(d)} size={10} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {(['before', 'visit', 'after'] as const).map((stage) =>
              stage === cycle.stage ? (
                <View key={stage} style={{ backgroundColor: theme.color.primaryBg, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text variant="strong" color={theme.color.primary}>{s.stages[stage]}</Text>
                </View>
              ) : (
                <Text key={stage} variant="muted">{s.stages[stage]}</Text>
              ),
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** 2.2: today's doses from the latest released summary, each with Take / Taken (G3, G4). */
function Medicines({ summary, patientId, timezone, now, s }: { summary: VisitSummary; patientId: Id<'patients'>; timezone: string; now: number; s: Strings }) {
  const events = useQuery(api.medications.week, { patientId, now, days: 1 });
  const markTaken = useMutation(api.medications.markTaken);
  const doses = todaysDoses(summary);
  if (doses.length === 0) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(now));
  const taken = new Set((events ?? []).filter((e) => e.date === today && e.action === 'taken' && e.slot).map((e) => `${e.medication}-${e.slot}`));

  return (
    <View style={{ gap: 18 }}>
      <SectionTitle title={s.todayMedications} />
      <View style={{ gap: 10 }}>
        {doses.map((d) => {
          const key = `${d.key}-${d.slot}`;
          const isTaken = taken.has(key);
          return (
            <View key={key} style={rowCard}>
              <IconCircle name={d.slot === 'evening' || d.slot === 'bedtime' ? 'moon' : 'sun'} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="strong">{d.name}</Text>
                <Text variant="muted">{`${d.dose} · ${d.slot ? s.slots[d.slot] : d.schedule}`}</Text>
              </View>
              {d.slot && (
                <Button
                  label={isTaken ? s.taken : s.take}
                  icon={isTaken ? 'check-white' : 'check-teal'}
                  variant={isTaken ? 'primary' : 'outline'}
                  onPress={() => void markTaken({ patientId, medication: d.key, slot: d.slot!, taken: !isTaken })}
                />
              )}
            </View>
          );
        })}
      </View>
      <Link label={s.seeAllMedicationsLink} onPress={() => router.push('/visit')} />
    </View>
  );
}

/** 2.2: the top instructions, numbered, with "See all". */
function Instructions({ items, english, language, s }: { items: SummaryItem[]; english?: SummaryItem[]; language: Language; s: Strings }) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionTitle title={s.instructionsTitle} action={s.seeAll} onAction={() => router.push('/visit')} />
      <Card>
        {items.slice(0, TOP_INSTRUCTIONS).map((item, i) => (
          <View key={i} style={{ gap: 14 }}>
            {i > 0 && <Divider />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.color.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="strong" color={theme.color.primary}>{String(i + 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text>{bi(itemText(item), english?.[i] !== undefined ? itemText(english[i]) : undefined, language)}</Text>
              </View>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

/** The bell (with its coral dot) opens Notifications. */
function Bell({ patientId, now, s }: { patientId: Id<'patients'>; now: number; s: Strings }) {
  const items = useQuery(api.notifications.list, { patientId, now });
  const fresh = items?.filter((n) => now - n.at < DAY_MS).length ?? 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={s.notificationsLabel(fresh)} onPress={() => router.push('/notifications')} hitSlop={8}>
      <Icon name="notifications" size={44} />
    </Pressable>
  );
}
