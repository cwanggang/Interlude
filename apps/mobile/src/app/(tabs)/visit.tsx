// My Visit (Figma 3.1 before the visit, 3.2 summary in review, 3.3 after-visit summary). Before:
// the next-appointment card, the prepare checklist, the questions in English with the patient's
// words underneath. After: the summary or "your doctor is reviewing". Past visits always last.
import { useQuery } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { CallMeNow } from '../../CallMeNow';
import { AskButton, Card, CheckRow, Divider, Icon, IconCircle, SafetyNotice, Screen, ScreenTitle, SectionTitle, StatusChip, Text } from '../../components';
import { icons } from '../../icons';
import { formatDate, type Language, type Strings } from '../../i18n';
import { theme } from '../../theme';
import { useNow } from '../../useNow';
import { usePatient } from '../../usePatient';
import { VisitHeaderCard, VisitSummaryView } from '../../VisitSummaryView';

export default function MyVisit() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const cycle = useQuery(api.appointments.cycle, patient ? { patientId: patient._id, now } : 'skip');
  const appointment = cycle?.appointment ?? null;
  const visit = useQuery(api.visits.getByAppointment, appointment ? { appointmentId: appointment._id } : 'skip');

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text variant="title">{s.tabVisit}</Text>
      </View>
      <AskButton />
    </View>
  );

  if (!patient || cycle === undefined) {
    return (
      <Screen>
        <ScreenTitle title={s.tabVisit} />
        {header}
        <Text>{patient === null ? s.noVisit : s.loading}</Text>
      </Screen>
    );
  }

  // A visit recorded for this appointment means it happened: show its summary or "reviewing".
  const after = visit !== undefined && visit !== null;

  return (
    <Screen>
      <ScreenTitle title={s.tabVisit} />
      {header}

      {!appointment && (
        <Card>
          <Text>{s.noVisit}</Text>
        </Card>
      )}

      {appointment && !after && cycle.stage !== 'after' && (
        <>
          <NextAppointmentCard
            doctor={appointment.doctorName}
            clinic={appointment.clinicName}
            scheduledAt={appointment.scheduledAt}
            daysUntil={cycle.daysUntil ?? 0}
            language={language}
            s={s}
          />
          <PrepChecklist s={s} />
          <BilingualQuestions appointmentId={appointment._id} language={language} s={s} />
        </>
      )}

      {appointment && (after || cycle.stage === 'after') && (
        <>
          <VisitHeaderCard
            title={s.visitOn(formatDate(appointment.scheduledAt, language))}
            doctor={appointment.doctorName}
            clinic={appointment.clinicName}
            ready={!!visit?.releasedToPatient}
            s={s}
          />
          {visit?.releasedToPatient ? (
            <>
              <View style={{ gap: 10 }}>
                <CallMeNow patientId={patient._id} s={s} mode="explainer" label={s.talkAboutVisit} />
                <Text variant="muted" center>{s.talkAboutVisitHint}</Text>
              </View>
              <VisitSummaryView visit={visit} language={language} s={s} />
            </>
          ) : (
            <View style={{ backgroundColor: theme.color.reviewBg, borderRadius: theme.radius.lg, padding: 26, gap: 14, alignItems: 'center' }}>
              <IconCircle name="hourglass" size={72} iconSize={32} bg={theme.color.surface} />
              <Text variant="heading" center>{s.reviewingTitle}</Text>
              <Text variant="muted" center>{s.reviewingBody}</Text>
            </View>
          )}
        </>
      )}

      <PastVisits patientId={patient._id} currentAppointmentId={after ? appointment?._id : undefined} language={language} s={s} />
      <SafetyNotice />
    </Screen>
  );
}

/** 3.1: the teal-to-blue next-appointment card with the countdown chip. */
function NextAppointmentCard({ doctor, clinic, scheduledAt, daysUntil, language, s }: { doctor: string; clinic?: string; scheduledAt: number; daysUntil: number; language: Language; s: Strings }) {
  const white85 = 'rgba(255,255,255,0.85)';
  return (
    <View style={{ borderRadius: theme.radius.lg, overflow: 'hidden', ...theme.shadow.card }}>
      <LinearGradient colors={['#087d8d', '#3e7fd6']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ padding: 22, gap: 6 }}>
        <Image source={icons['visit-card-ellipse-1']} style={{ position: 'absolute', width: 360, height: 360, left: 204, top: -36 }} />
        <Image source={icons['visit-card-ellipse-2']} style={{ position: 'absolute', width: 420, height: 420, left: 131, top: -172 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="body" color={white85}>{s.nextAppointment}</Text>
          </View>
          <View style={{ backgroundColor: theme.color.surface, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text variant="link" color={theme.color.primary}>{s.daysShort(daysUntil)}</Text>
          </View>
        </View>
        <Text variant="title" color={theme.color.primaryText}>{doctor}</Text>
        <Text color={theme.color.primaryText}>{formatDate(scheduledAt, language, true)}</Text>
        {clinic && <Text variant="muted" color={white85}>{clinic}</Text>}
      </LinearGradient>
    </View>
  );
}

/** 3.1 "Prepare for your visit" (G8): static items; ticks stay on the device for this session. */
function PrepChecklist({ s }: { s: Strings }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <>
      <SectionTitle title={s.prepareTitle} />
      <Card gap={0}>
        {s.prepItems.map((item, i) => (
          <View key={item}>
            {i > 0 && <Divider />}
            <CheckRow label={item} checked={ticked.has(i)} onToggle={() => toggle(i)} />
          </View>
        ))}
      </Card>
    </>
  );
}

/** 3.1 (G9): open questions in English, the patient's words underneath, voice tag; Edit and Add go to Questions. */
function BilingualQuestions({ appointmentId, language, s }: { appointmentId: Id<'appointments'>; language: Language; s: Strings }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId });
  const open = questions?.filter((q) => q.status === 'open') ?? [];
  return (
    <>
      <SectionTitle title={s.prepTitle} action={s.edit} onAction={() => router.push('/questions')} />
      {questions !== undefined && open.length === 0 && <Text variant="muted">{s.noQuestions}</Text>}
      {open.length > 0 && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/prep')}>
          <Card gap={0}>
            {open.map((q, i) => (
              <View key={q._id}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: 'row', gap: theme.space.md, paddingVertical: 16, alignItems: 'flex-start' }}>
                  <Icon name="drag-handle" size={20} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="strong">{language === 'en' ? q.textOriginal : q.textEnglish}</Text>
                    {q.textEnglish !== q.textOriginal && language !== 'en' && <Text variant="muted">{q.textOriginal}</Text>}
                    {q.source === 'voice' && (
                      <View style={{ paddingTop: 4 }}>
                        <StatusChip label={s.voiceChip} icon="mic-teal" color={theme.color.primary} bg={theme.color.primaryBg} />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/questions')}
        style={{ height: 60, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        <Icon name="plus-teal" size={22} />
        <Text variant="strong" color={theme.color.primary}>{s.addQuestionButton}</Text>
      </Pressable>
    </>
  );
}

/** Past visits, newest first (G12); released ones open their summary. */
function PastVisits({ patientId, currentAppointmentId, language, s }: { patientId: Id<'patients'>; currentAppointmentId?: Id<'appointments'>; language: Language; s: Strings }) {
  const visits = useQuery(api.visits.listForPatient, { patientId });
  const appointments = useQuery(api.appointments.listForPatient, { patientId });
  const clinics = new Map((appointments ?? []).map((a) => [a._id, a.clinicName]));
  const past = visits?.filter((v) => v.appointmentId !== currentAppointmentId) ?? [];
  if (visits !== undefined && past.length === 0) return null;
  return (
    <>
      <SectionTitle title={s.pastVisits} />
      <Card gap={0}>
        {past.map((v, i) => (
          <View key={v._id}>
            {i > 0 && <Divider />}
            <Pressable
              accessibilityRole="button"
              disabled={!v.releasedToPatient}
              onPress={() => router.push({ pathname: '/summary/[appointmentId]', params: { appointmentId: v.appointmentId } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: 14 }}
            >
              <IconCircle name="file" size={40} iconSize={20} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="strong">{s.visitOn(formatDate(v.scheduledAt, language))}</Text>
                <Text variant="muted">{v.releasedToPatient ? s.doctorAndClinic(v.doctorName, clinics.get(v.appointmentId)) : `${v.doctorName} · ${s.summaryNotShared}`}</Text>
              </View>
              {v.releasedToPatient && <Icon name="chevron-right-22" size={22} />}
            </Pressable>
          </View>
        ))}
      </Card>
    </>
  );
}
