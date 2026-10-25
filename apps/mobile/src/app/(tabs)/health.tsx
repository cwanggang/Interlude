// My Health (Figma 4.1, G13). Time range; a plain summary that describes and never interprets; one
// bar chart per current symptom (visit line, word label, text version); a card per symptom with
// first/last/how often, the patient's words and "what your doctor will see"; the medication week
// grid; and the visits with their question outcomes.
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text as RNText } from '../../BiText';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { AskButton, Card, Divider, Icon, IconCircle, Link, Screen, ScreenTitle, SectionTitle, Segmented, StatusChip, Text } from '../../components';
import { formatShortDay, type Language, type Strings } from '../../i18n';
import { theme } from '../../theme';
import { useNow } from '../../useNow';
import { bi } from '../../showEnglish';
import { usePatient } from '../../usePatient';
import { summaryFor, todaysDoses } from '../../visitSummary';

/** Older users: at most 14 days visible per chart. */
const CHART_DAYS = 14;
const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;
const CHART_HEIGHT = 120;
const BEFORE_VISIT = 'rgba(8,125,141,0.45)';

type Range = 'visit' | '7' | '30';
type Symptom = FunctionReturnType<typeof api.health.overview>['symptoms'][number];
type Entry = FunctionReturnType<typeof api.patients.symptomEntries>[number];

const dayIn = (ms: number, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(ms));
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export default function MyHealth() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const [range, setRange] = useState<Range>('visit');
  const [showPast, setShowPast] = useState(false);
  const appointments = useQuery(api.appointments.listForPatient, patient ? { patientId: patient._id } : 'skip');

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text variant="title">{s.tabHealth}</Text>
      </View>
      <AskButton />
    </View>
  );

  if (!patient || appointments === undefined) {
    return (
      <Screen>
        <ScreenTitle title={s.tabHealth} />
        {header}
        <Text>{s.loading}</Text>
      </Screen>
    );
  }

  const today = dayIn(now, patient.timezone);
  const lastVisit = appointments.filter((a) => a.status === 'completed').at(-1);
  const visitDay = lastVisit ? dayIn(lastVisit.scheduledAt, patient.timezone) : null;
  const from = range === 'visit' && visitDay ? visitDay : addDays(today, -((range === '30' ? 30 : 7) - 1));

  return (
    <Screen>
      <ScreenTitle title={s.tabHealth} />
      {header}
      <Segmented
        value={lastVisit ? range : range === 'visit' ? '7' : range}
        onChange={setRange}
        options={[
          ...(lastVisit ? [{ value: 'visit' as const, label: s.sinceLastVisitLong }] : []),
          { value: '7', label: s.lastDays(7) },
          { value: '30', label: s.lastDays(30) },
        ]}
      />
      <HealthBody patientId={patient._id} from={from} today={today} visitDay={visitDay} showPast={showPast} onTogglePast={() => setShowPast(!showPast)} now={now} language={language} s={s} />
    </Screen>
  );
}

function HealthBody({ patientId, from, today, visitDay, showPast, onTogglePast, now, language, s }: { patientId: Id<'patients'>; from: string; today: string; visitDay: string | null; showPast: boolean; onTogglePast: () => void; now: number; language: Language; s: Strings }) {
  const overview = useQuery(api.health.overview, { patientId, from });
  const entries = useQuery(api.patients.symptomEntries, { patientId });
  if (overview === undefined || entries === undefined) return <Text>{s.loading}</Text>;

  const name = (sym: Symptom) => (language === 'en' ? capitalize(sym.symptom) : bi(capitalize(sym.symptomOriginal), capitalize(sym.symptom), language));
  // Current: mentioned in the last week. Older ones wait behind "Show past symptoms".
  const recent = addDays(today, -(WEEK_DAYS - 1));
  const current = overview.symptoms.filter((sym) => sym.lastDate >= recent);
  const past = overview.symptoms.filter((sym) => sym.lastDate < recent);
  const shown = [...current, ...(showPast ? past : [])];
  const top = [...overview.symptoms].sort((a, b) => b.daysReported - a.daysReported).slice(0, 2);

  return (
    <>
      <LinearGradient colors={['#e6f6f6', '#eef1ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: theme.radius.lg, padding: 22, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="mascot-hello-36" size={36} />
          <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.xs, color: theme.color.primary }}>{s.summaryLabel}</RNText>
        </View>
        <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: 19, lineHeight: 19 * 1.4, color: theme.color.text }}>
          {overview.checkins === 0 && overview.symptoms.length === 0
            ? s.noHealthData
            : s.healthSummary(overview.checkins, top.map((t) => ({ name: name(t).toLowerCase(), days: t.daysReported })), overview.medicationTaken, overview.medicationMissed)}
        </RNText>
        <Text variant="muted">{s.summaryFootnote}</Text>
      </LinearGradient>

      {shown.length > 0 && <SectionTitle title={s.symptomsTitle} />}
      {shown.map((sym) => (
        <SymptomChart key={sym.symptom} symptom={sym} name={name(sym)} entries={entries} today={today} from={from} visitDay={visitDay} language={language} s={s} />
      ))}
      {past.length > 0 && <Link label={showPast ? s.hidePastSymptoms : s.showPastSymptoms} onPress={onTogglePast} />}
      {shown.map((sym) => (
        <SymptomCard key={sym.symptom} symptom={sym} name={name(sym)} checkins={overview.checkins} today={today} language={language} s={s} />
      ))}

      <MedicationWeek patientId={patientId} now={now} today={today} language={language} s={s} />

      {overview.visits.length > 0 && (
        <>
          <SectionTitle title={s.visitsTitle} />
          <Card gap={0}>
            {overview.visits.map((visit, i) => (
              <View key={visit.appointmentId}>
                {i > 0 && <Divider />}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/summary/[appointmentId]', params: { appointmentId: visit.appointmentId } })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}
                >
                  <IconCircle name="file" size={40} iconSize={20} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="strong">{`${new Date(visit.scheduledAt).toLocaleDateString(language === 'es' ? 'es-US' : 'en-US', { month: 'long', day: 'numeric' })} · ${visit.doctorName}`}</Text>
                    <Text variant="muted">{s.questionsOutcome(visit.questionsAnswered, visit.questionsCarriedOver)}</Text>
                  </View>
                  <Icon name="chevron-right-22" size={22} />
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function TrendChip({ trend, s }: { trend: Symptom['trend']; s: Strings }) {
  if (!trend) return null;
  if (trend === 'worse') return <StatusChip label={s.trendWords.worse} icon="trend-up" color={theme.color.danger} bg={theme.color.coralBg} />;
  if (trend === 'same') return <StatusChip label={s.trendWords.same} icon="trend-same" color={theme.color.primary} bg={theme.color.primaryBg} />;
  // The design has no "better" arrow yet, so this chip is a word only.
  return <StatusChip label={s.trendWords.better} color={theme.color.primary} bg={theme.color.primaryBg} />;
}

/** 4.1 chart: severity 0–10 per day (last 14 days of the range), lighter before the visit, a periwinkle visit line. */
function SymptomChart({ symptom, name, entries, today, from, visitDay, language, s }: { symptom: Symptom; name: string; entries: Entry[]; today: string; from: string; visitDay: string | null; language: Language; s: Strings }) {
  const [asText, setAsText] = useState(false);
  const start = [from, addDays(today, -(CHART_DAYS - 1))].sort()[1];
  const days: string[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
  const max = new Map<string, number>();
  for (const e of entries) {
    if (e.symptom === symptom.symptom && e.severity !== undefined && e.date >= start) max.set(e.date, Math.max(max.get(e.date) ?? 0, e.severity));
  }
  const textVersion = days.filter((d) => max.has(d)).map((d) => `${formatShortDay(d, language)}: ${max.get(d)}/10`);
  const visitIndex = visitDay ? days.indexOf(visitDay) : -1;

  return (
    <Card gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <View style={{ flex: 1 }}>
          <RNText style={{ fontFamily: theme.font.heading, fontSize: 20, color: theme.color.text }}>{name}</RNText>
        </View>
        <TrendChip trend={symptom.trend} s={s} />
      </View>
      <View accessible accessibilityLabel={s.chartLabel(name, textVersion.join(', '))} style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <View style={{ height: CHART_HEIGHT, justifyContent: 'space-between' }}>
          {['10', '5', '0'].map((n) => (
            <RNText key={n} style={{ fontFamily: theme.font.body, fontSize: theme.font.size.xs, color: theme.color.textMuted }}>{n}</RNText>
          ))}
        </View>
        <View style={{ flex: 1, height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
          {days.map((d, i) => {
            const value = max.get(d);
            return (
              <View
                key={d}
                style={{
                  flex: 1,
                  height: value === undefined ? 4 : Math.max(4, (value / 10) * CHART_HEIGHT),
                  backgroundColor: value === undefined ? theme.color.border : visitIndex >= 0 && i < visitIndex ? BEFORE_VISIT : theme.color.primary,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  borderBottomLeftRadius: 2,
                  borderBottomRightRadius: 2,
                }}
              />
            );
          })}
          {visitIndex >= 0 && (
            <View style={{ position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: theme.color.periwinkle, left: `${((visitIndex + 0.5) / days.length) * 100}%` }} />
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 26 }}>
        <Text variant="muted">{formatShortDay(days[0], language)}</Text>
        {visitIndex > 0 && visitIndex < days.length - 1 && (
          <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.xs, color: theme.color.periwinkle }}>{s.visitAxis(formatShortDay(visitDay!, language))}</RNText>
        )}
        <Text variant="muted">{s.today}</Text>
      </View>
      {asText && textVersion.map((line) => <Text key={line}>{line}</Text>)}
      <Pressable accessibilityRole="button" onPress={() => setAsText(!asText)} hitSlop={8}>
        <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 15, color: theme.color.primary }}>{asText ? s.hideText : s.viewAsText}</RNText>
      </Pressable>
    </Card>
  );
}

/** 4.1 symptom card: how often, first and last reported, the patient's words, "what your doctor will see". */
function SymptomCard({ symptom, name, checkins, today, language, s }: { symptom: Symptom; name: string; checkins: number; today: string; language: Language; s: Strings }) {
  const relative = (day: string) => (day === today ? s.todayCap : day === addDays(today, -1) ? s.yesterday : formatShortDay(day, language));
  const quote = symptom.quotes[0];
  const missing = (['onset', 'timing', 'relieving'] as const).some((f) => !symptom.reported[f]);
  return (
    <Card gap={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="heading">{name}</Text>
        </View>
        <StatusChip label={s.daysOf(symptom.daysReported, Math.max(checkins, symptom.daysReported))} color={theme.color.primary} bg={theme.color.primaryBg} />
      </View>
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <Stat label={s.firstReported} value={relative(symptom.firstDate)} />
        <Stat label={s.lastReported} value={relative(symptom.lastDate)} />
        <Stat label={s.howOften} value={s.daysCount(symptom.daysReported)} />
      </View>
      {quote && (
        <View style={{ backgroundColor: theme.color.periwinkleBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 4 }}>
          <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: 17, lineHeight: 17 * 1.4, color: theme.color.text }}>
            {language === 'en' ? `“${quote.quoteEnglish}”` : bi(`“${quote.quoteOriginal}”`, `“${quote.quoteEnglish}”`, language)}
          </RNText>
          <RNText style={{ fontFamily: theme.font.body, fontSize: theme.font.size.xs, color: theme.color.textMuted }}>{s.callOn(formatShortDay(quote.date, language))}</RNText>
        </View>
      )}
      <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: 17, color: theme.color.text }}>{s.doctorWillSee}</RNText>
      {(['onset', 'timing', 'relieving'] as const).map((field) => (
        <View key={field} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {symptom.reported[field] ? (
            <IconCircle name="check-white-16" size={28} iconSize={16} bg={theme.color.primary} />
          ) : (
            <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#9ab0ba', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface }}>
              <Icon name="info-muted" size={16} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text variant="muted">{s.detailLabels[field]}</Text>
          </View>
          {symptom.reported[field] ? (
            <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: theme.font.size.sm, color: theme.color.text, maxWidth: 160 }} numberOfLines={2}>
              {symptom.details[field] ?? ''}
            </RNText>
          ) : (
            <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#9ab0ba', borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 14, color: theme.color.textMuted }}>{s.notReportedChip}</RNText>
            </View>
          )}
        </View>
      ))}
      {missing && <RNText style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.color.textMuted }}>{s.mentionNextCall}</RNText>}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
      <RNText style={{ fontFamily: theme.font.body, fontSize: theme.font.size.xs, color: theme.color.textMuted }}>{label}</RNText>
      <RNText style={{ fontFamily: theme.font.bodyBold, fontSize: 17, color: theme.color.text }}>{value}</RNText>
    </View>
  );
}

/** 4.1 week grid: one row per medicine and time of day; taken, missed or not reported. */
function MedicationWeek({ patientId, now, today, language, s }: { patientId: Id<'patients'>; now: number; today: string; language: Language; s: Strings }) {
  const events = useQuery(api.medications.week, { patientId, now, days: WEEK_DAYS });
  const released = useQuery(api.visits.latestReleasedSummary, { patientId });
  const summary = released ? summaryFor(released, language) : undefined;
  if (!events || (events.length === 0 && !summary)) return null;

  const days: string[] = [];
  for (let i = WEEK_DAYS - 1; i >= 0; i--) days.push(addDays(today, -i));
  const doses = summary ? todaysDoses(summary) : [];
  const names = new Map(doses.map((d) => [d.key, d.name]));
  // Rows: every dose in the latest summary, plus any other medicine mentioned this week.
  const rows = doses.map((d) => ({ key: d.key, slot: d.slot, label: d.slot ? `${d.name} ${s.slots[d.slot].toLowerCase()}` : d.name }));
  for (const e of events) {
    if (!rows.some((r) => r.key === e.medication)) rows.push({ key: e.medication, slot: null, label: capitalize(names.get(e.medication) ?? e.medication) });
  }
  const cell = (key: string, slot: string | null, day: string) => {
    const onDay = events.filter((e) => e.medication === key && e.date === day && (slot === null || e.slot === null || e.slot === slot));
    if (onDay.some((e) => e.action === 'missed')) return 'missed';
    if (onDay.some((e) => e.action === 'taken')) return 'taken';
    return 'none';
  };
  const letter = (day: string) =>
    new Date(Date.parse(`${day}T12:00:00Z`)).toLocaleDateString(language === 'es' ? 'es-US' : 'en-US', { weekday: 'narrow', timeZone: 'UTC' });

  return (
    <>
      <SectionTitle title={s.medicationsWeekTitle} />
      <Card gap={10}>
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          <View style={{ flex: 1 }} />
          {days.map((d) => (
            <View key={d} style={{ width: 28, alignItems: 'center' }}>
              <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.xs, color: theme.color.textMuted }}>{letter(d)}</RNText>
            </View>
          ))}
        </View>
        {rows.map((r) => (
          <View key={`${r.key}-${r.slot}`} style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: 14, color: theme.color.text }} numberOfLines={2}>{r.label}</RNText>
            </View>
            {days.map((d) => {
              const state = cell(r.key, r.slot, d);
              return state === 'taken' ? (
                <IconCircle key={d} name="check-white-15" size={28} iconSize={15} bg={theme.color.primary} />
              ) : state === 'missed' ? (
                <View key={d} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.color.coralBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x-coral-15" size={15} />
                </View>
              ) : (
                <View key={d} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9ab0ba', backgroundColor: theme.color.surface }} />
              );
            })}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' }}>
          <StatusChip label={s.taken} icon="check-teal-14" color={theme.color.primary} bg={theme.color.primaryBg} />
          <StatusChip label={s.missedChip} icon="x-coral-14" color={theme.color.danger} bg={theme.color.coralBg} />
          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#9ab0ba', borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.xs, color: theme.color.textMuted }}>{s.notReportedShort}</RNText>
          </View>
        </View>
        {summary?.medications?.length ? (
          <>
            <Divider />
            <RNText style={{ fontFamily: theme.font.body, fontSize: 14, lineHeight: 14 * 1.4, color: theme.color.textMuted }}>
              {s.currentMeds(summary.medications.filter((m) => m.change !== 'stopped').map((m) => `${m.name} ${m.dose} (${m.schedule})`).join(' · '))}
            </RNText>
          </>
        ) : null}
      </Card>
    </>
  );
}
