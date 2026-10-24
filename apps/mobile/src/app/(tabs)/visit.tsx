// My Visit (G7–G12). Changes with the care cycle: before the visit, the visit card, what to bring
// and the questions in both languages; after it, the summary (or "your doctor is reviewing").
// Past visits are always at the bottom, each opening its summary.
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { CallMeNow } from '../../CallMeNow';
import { Badge, Button, Card, ListItem, Screen, ScreenTitle, Text } from '../../components';
import { formatDate, type Language, type Strings } from '../../i18n';
import { theme } from '../../theme';
import { useNow } from '../../useNow';
import { usePatient } from '../../usePatient';
import { VisitSummaryView } from '../../VisitSummaryView';

export default function MyVisit() {
  const now = useNow();
  const { patient, language, s } = usePatient();
  const cycle = useQuery(api.appointments.cycle, patient ? { patientId: patient._id, now } : 'skip');
  const appointment = cycle?.appointment ?? null;
  const visit = useQuery(api.visits.getByAppointment, appointment ? { appointmentId: appointment._id } : 'skip');

  if (!patient || cycle === undefined) {
    return (
      <Screen>
        <ScreenTitle title={s.tabVisit} />
        <Text>{patient === null ? s.noVisit : s.loading}</Text>
      </Screen>
    );
  }

  // A visit recorded for this appointment means it happened: show its summary or "reviewing".
  const after = visit !== undefined && visit !== null;

  return (
    <Screen footer={<Text variant="muted">{s.disclaimer}</Text>}>
      <ScreenTitle title={s.tabVisit} />
      {appointment ? (
        <VisitCard
          doctor={appointment.doctorName}
          clinic={appointment.clinicName}
          scheduledAt={appointment.scheduledAt}
          daysUntil={after || cycle.stage === 'after' ? null : cycle.daysUntil}
          language={language}
          s={s}
        />
      ) : (
        <Card>
          <Text>{s.noVisit}</Text>
        </Card>
      )}

      {appointment && !after && cycle.stage !== 'after' && (
        <>
          <PrepChecklist s={s} />
          <BilingualQuestions appointmentId={appointment._id} s={s} />
        </>
      )}

      {after &&
        (visit.releasedToPatient ? (
          <>
            <VisitSummaryView visit={visit} language={language} s={s} />
            <CallMeNow patientId={patient._id} s={s} mode="explainer" label={s.talkAboutVisit} />
          </>
        ) : (
          <Card tone="primary">
            <Text variant="heading">{s.reviewing}</Text>
          </Card>
        ))}

      <PastVisits patientId={patient._id} currentAppointmentId={after ? appointment?._id : undefined} language={language} s={s} />
    </Screen>
  );
}

/** G7: doctor, date and time, clinic, and the countdown (none once the visit happened). */
function VisitCard({ doctor, clinic, scheduledAt, daysUntil, language, s }: { doctor: string; clinic?: string; scheduledAt: number; daysUntil: number | null; language: Language; s: Strings }) {
  return (
    <Card>
      {daysUntil !== null ? (
        <Text variant="title">{s.daysShort(daysUntil)}</Text>
      ) : (
        <Text variant="title">{s.visitOn(formatDate(scheduledAt, language))}</Text>
      )}
      <Text variant="heading">{doctor}</Text>
      {daysUntil !== null && <Text>{formatDate(scheduledAt, language, true)}</Text>}
      {clinic && <Text variant="muted">{clinic}</Text>}
    </Card>
  );
}

/** G8: what to bring. Static text; ticks stay on the device for this session. */
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
    <Card title={s.whatToBring}>
      {s.prepItems.map((item, i) => (
        <ListItem
          key={item}
          onPress={() => toggle(i)}
          title={
            <View style={{ flexDirection: 'row', gap: theme.space.md, alignItems: 'center' }}>
              <Text variant="heading">{ticked.has(i) ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text>{item}</Text>
              </View>
            </View>
          }
        />
      ))}
    </Card>
  );
}

/** G9: the open questions in the patient's words with English underneath, large for the doctor. */
function BilingualQuestions({ appointmentId, s }: { appointmentId: Id<'appointments'>; s: Strings }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId });
  const open = questions?.filter((q) => q.status === 'open') ?? [];
  return (
    <Card title={s.prepTitle}>
      {questions !== undefined && open.length === 0 && <Text variant="muted">{s.noQuestions}</Text>}
      {open.map((q, i) => (
        <ListItem
          key={q._id}
          title={<Text variant="heading">{`${i + 1}. ${q.textOriginal}`}</Text>}
          subtitle={
            <>
              {q.textEnglish !== q.textOriginal && <Text>{q.textEnglish}</Text>}
              {q.source === 'voice' && <Badge tone="primary" label={s.sourceVoice} />}
            </>
          }
        />
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        <Button label={s.editQuestions} variant="secondary" onPress={() => router.push('/questions')} />
        {open.length > 0 && <Button label={s.showToDoctor} variant="secondary" onPress={() => router.push('/prep')} />}
      </View>
    </Card>
  );
}

/** G12: earlier visits, newest first; the one shown above is left out. */
function PastVisits({ patientId, currentAppointmentId, language, s }: { patientId: Id<'patients'>; currentAppointmentId?: Id<'appointments'>; language: Language; s: Strings }) {
  const visits = useQuery(api.visits.listForPatient, { patientId });
  const past = visits?.filter((v) => v.appointmentId !== currentAppointmentId) ?? [];
  return (
    <Card title={s.pastVisits}>
      {visits !== undefined && past.length === 0 && <Text variant="muted">{s.noPastVisits}</Text>}
      {past.map((v) => (
        <ListItem
          key={v._id}
          onPress={v.releasedToPatient ? () => router.push({ pathname: '/summary/[appointmentId]', params: { appointmentId: v.appointmentId } }) : undefined}
          title={<Text variant="heading">{s.visitOn(formatDate(v.scheduledAt, language))}</Text>}
          subtitle={v.releasedToPatient ? v.doctorName : `${v.doctorName} · ${s.summaryNotShared}`}
          trailing={v.releasedToPatient ? <Text variant="heading">›</Text> : undefined}
        />
      ))}
    </Card>
  );
}
