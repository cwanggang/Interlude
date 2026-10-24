// My Health (G13). Time range, a plain summary that describes and never interprets, one bar chart
// per symptom (with a visit marker, a word label and a text version), symptom cards with the
// patient's words and "what your doctor will see", the medicine week grid, and visit history.
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Badge, Button, Card, Choice, ListItem, Screen, ScreenTitle, Text } from '../../components';
import { formatDate, formatShortDay, type Language, type Strings } from '../../i18n';
import { theme } from '../../theme';
import { useNow } from '../../useNow';
import { usePatient } from '../../usePatient';

/** Older users: at most 14 days visible per chart. */
const CHART_DAYS = 14;
const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;
const CHART_HEIGHT = 96;

type Range = 'visit' | '7' | '30';
type Overview = FunctionReturnType<typeof api.health.overview>;
type Entry = FunctionReturnType<typeof api.patients.symptomEntries>[number];

/** Local calendar day in the patient's timezone. */
const dayIn = (ms: number, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(ms));
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export default function MyHealth() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const [range, setRange] = useState<Range>('visit');
  const [showPast, setShowPast] = useState(false);
  const appointments = useQuery(api.appointments.listForPatient, patient ? { patientId: patient._id } : 'skip');

  if (!patient || appointments === undefined) {
    return (
      <Screen>
        <ScreenTitle title={s.tabHealth} />
        <Text>{s.loading}</Text>
      </Screen>
    );
  }

  const today = dayIn(now, patient.timezone);
  const lastVisit = appointments.filter((a) => a.status === 'completed').at(-1);
  const from =
    range === 'visit' && lastVisit ? dayIn(lastVisit.scheduledAt, patient.timezone) : addDays(today, -((range === '30' ? 30 : 7) - 1));

  return (
    <Screen footer={<Text variant="muted">{s.disclaimer}</Text>}>
      <ScreenTitle title={s.tabHealth} />
      <Choice
        value={range}
        onChange={setRange}
        options={[
          ...(lastVisit ? [{ value: 'visit' as const, label: s.sinceLastVisit }] : []),
          { value: '7', label: s.lastDays(7) },
          { value: '30', label: s.lastDays(30) },
        ]}
      />
      <HealthBody
        patientId={patient._id}
        from={from}
        today={today}
        visitDay={lastVisit ? dayIn(lastVisit.scheduledAt, patient.timezone) : null}
        showPast={showPast}
        onTogglePast={() => setShowPast(!showPast)}
        now={now}
        language={language}
        s={s}
      />
    </Screen>
  );
}

function HealthBody({ patientId, from, today, visitDay, showPast, onTogglePast, now, language, s }: { patientId: Id<'patients'>; from: string; today: string; visitDay: string | null; showPast: boolean; onTogglePast: () => void; now: number; language: Language; s: Strings }) {
  const overview = useQuery(api.health.overview, { patientId, from });
  const entries = useQuery(api.patients.symptomEntries, { patientId });
  if (overview === undefined || entries === undefined) return <Text>{s.loading}</Text>;

  const name = (sym: Overview['symptoms'][number]) => (language === 'en' ? sym.symptom : sym.symptomOriginal);
  // Current: mentioned in the last week. Older ones wait behind "Show past symptoms".
  const recent = addDays(today, -(WEEK_DAYS - 1));
  const current = overview.symptoms.filter((sym) => sym.lastDate >= recent);
  const past = overview.symptoms.filter((sym) => sym.lastDate < recent);
  const top = [...overview.symptoms].sort((a, b) => b.daysReported - a.daysReported).slice(0, 2);

  return (
    <>
      <Card>
        {overview.checkins === 0 && overview.symptoms.length === 0 ? (
          <Text>{s.noHealthData}</Text>
        ) : (
          <Text>{s.healthSummary(overview.checkins, top.map((t) => ({ name: name(t), days: t.daysReported })), overview.medicationTaken, overview.medicationMissed)}</Text>
        )}
      </Card>

      {[...current, ...(showPast ? past : [])].map((sym) => (
        <SymptomCard key={sym.symptom} symptom={sym} name={name(sym)} entries={entries} today={today} from={from} visitDay={visitDay} language={language} s={s} />
      ))}
      {past.length > 0 && <Button label={showPast ? s.hidePastSymptoms : s.showPastSymptoms} variant="secondary" onPress={onTogglePast} />}

      <MedicationWeek patientId={patientId} now={now} today={today} language={language} s={s} />

      {overview.visits.length > 0 && (
        <Card title={s.visitHistory}>
          {overview.visits.map((visit) => (
            <ListItem
              key={visit.appointmentId}
              onPress={() => router.push({ pathname: '/summary/[appointmentId]', params: { appointmentId: visit.appointmentId } })}
              title={<Text variant="heading">{s.visitOn(formatDate(visit.scheduledAt, language))}</Text>}
              subtitle={s.questionsOutcome(visit.questionsAnswered, visit.questionsCarriedOver)}
              trailing={<Text variant="heading">›</Text>}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function SymptomCard({ symptom, name, entries, today, from, visitDay, language, s }: { symptom: Overview['symptoms'][number]; name: string; entries: Entry[]; today: string; from: string; visitDay: string | null; language: Language; s: Strings }) {
  // The last CHART_DAYS days of the range; the highest severity reported each day, or none.
  const start = [from, addDays(today, -(CHART_DAYS - 1))].sort()[1];
  const days: string[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
  const max = new Map<string, number>();
  for (const e of entries) {
    if (e.symptom === symptom.symptom && e.severity !== undefined && e.date >= start) {
      max.set(e.date, Math.max(max.get(e.date) ?? 0, e.severity));
    }
  }
  const textVersion = days.filter((d) => max.has(d)).map((d) => `${formatShortDay(d, language)} ${max.get(d)}`).join(', ');

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.space.sm }}>
        <Text variant="heading">{name}</Text>
        {symptom.trend && <Badge tone={symptom.trend === 'worse' ? 'danger' : 'neutral'} label={s.trend[symptom.trend]} />}
      </View>
      <View
        accessible
        accessibilityLabel={s.chartLabel(name, textVersion)}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: CHART_HEIGHT + 20 }}
      >
        {days.map((d) => {
          const value = max.get(d);
          const isVisit = d === visitDay;
          return (
            <View key={d} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {isVisit && <Text variant="muted">{s.visitMarker}</Text>}
              <View
                style={{
                  width: '100%',
                  height: value === undefined ? 2 : Math.max(4, (value / 10) * CHART_HEIGHT),
                  backgroundColor: value === undefined ? theme.color.border : theme.color.primary,
                  borderTopWidth: isVisit ? 3 : 0,
                  borderTopColor: theme.color.danger,
                  borderRadius: 2,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="muted">{formatShortDay(days[0], language)}</Text>
        <Text variant="muted">{formatShortDay(today, language)}</Text>
      </View>
      <Text variant="muted">{s.reportedRange(symptom.daysReported, formatShortDay(symptom.firstDate, language), formatShortDay(symptom.lastDate, language))}</Text>
      {symptom.quotes.map((q) => (
        <Text key={q.date + q.quoteOriginal} variant="quote">
          “{language === 'en' ? q.quoteEnglish : q.quoteOriginal}”
        </Text>
      ))}
      <Text variant="heading">{s.doctorWillSee}</Text>
      {(['onset', 'timing', 'relieving'] as const).map((field) => (
        <ListItem
          key={field}
          title={s.detailNames[field]}
          trailing={<Badge tone={symptom.reported[field] ? 'success' : 'neutral'} label={symptom.reported[field] ? `✓ ${s.reportedYes}` : s.notReportedYet} />}
        />
      ))}
    </Card>
  );
}

/** Week grid: one row per medicine, one column per day; taken, missed, or not reported. */
function MedicationWeek({ patientId, now, today, language, s }: { patientId: Id<'patients'>; now: number; today: string; language: Language; s: Strings }) {
  const events = useQuery(api.medications.week, { patientId, now, days: WEEK_DAYS });
  if (!events?.length) return null;
  const days: string[] = [];
  for (let i = WEEK_DAYS - 1; i >= 0; i--) days.push(addDays(today, -i));
  const medications = [...new Set(events.map((e) => e.medication))].sort();
  const cell = (medication: string, day: string) => {
    const onDay = events.filter((e) => e.medication === medication && e.date === day);
    if (onDay.some((e) => e.action === 'missed')) return '✗';
    if (onDay.some((e) => e.action === 'taken')) return '✓';
    return '–';
  };
  return (
    <Card title={s.medicationWeek}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 2 }} />
        {days.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="muted">{Number(d.slice(8))}</Text>
          </View>
        ))}
      </View>
      {medications.map((m) => (
        <View key={m} style={{ flexDirection: 'row', alignItems: 'center', minHeight: theme.minTap, borderBottomWidth: 1, borderBottomColor: theme.color.border }}>
          <View style={{ flex: 2 }}>
            <Text>{m}</Text>
          </View>
          {days.map((d) => (
            <View key={d} style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="heading">{cell(m, d)}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text variant="muted">{s.medicationLegend}</Text>
    </Card>
  );
}
