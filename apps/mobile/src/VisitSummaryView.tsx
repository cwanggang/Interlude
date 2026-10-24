// E1 / G10 / G11 (Figma 3.3): one released visit in the patient's language. Medications first, then
// instructions, follow-up and tests, warning signs, how each question went, and the to-do list.
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { View } from 'react-native';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CheckRow, Divider, Icon, IconCircle, SectionTitle, StatusChip, Text } from './components';
import type { Language, Strings } from './i18n';
import { theme } from './theme';
import { itemText, summaryFor } from './visitSummary';

type Visit = NonNullable<FunctionReturnType<typeof api.visits.getByAppointment>>;

export function VisitSummaryView({ visit, language, s }: { visit: Visit; language: Language; s: Strings }) {
  const summary = summaryFor(visit, language);
  if (!summary) return null;
  const tests = summary.tests_ordered ?? [];
  return (
    <>
      <SectionTitle title={s.medicationsTitle} />
      {(summary.medications ?? []).map((m, i) => (
        <Card key={m.key ?? i} gap={10}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconCircle name="pill-teal" size={40} iconSize={20} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{`${m.name} ${m.dose}`}</Text>
            </View>
            {m.change && m.change !== 'same' && (
              <StatusChip label={s.changeLabels[m.change] ?? m.change} color={theme.color.danger} bg={theme.color.coralBg} />
            )}
          </View>
          <LabeledLine label={s.whenLabel} value={m.schedule} />
          {m.purpose ? <LabeledLine label={s.whatForLabel} value={m.purpose} /> : null}
        </Card>
      ))}

      {(summary.instructions ?? []).length > 0 && (
        <>
          <SectionTitle title={s.instructionsTitle} />
          <Card gap={10}>
            {(summary.instructions ?? []).map((item, i) => (
              <Text key={i}>{`•  ${itemText(item)}`}</Text>
            ))}
          </Card>
        </>
      )}

      {(summary.follow_up || tests.length > 0) && (
        <>
          <SectionTitle title={s.followUpTests} />
          <Card gap={12}>
            {summary.follow_up ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="cal-teal" size={20} />
                <View style={{ flex: 1 }}>
                  <Text>{summary.follow_up}</Text>
                </View>
              </View>
            ) : null}
            {tests.map((t, i) => (
              <View key={i} style={{ gap: 12 }}>
                {(summary.follow_up || i > 0) && <Divider />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="file" size={20} />
                  <View style={{ flex: 1 }}>
                    <Text>{itemText(t)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      {(summary.warning_signs ?? []).length > 0 && (
        <View style={{ backgroundColor: theme.color.coralBg, borderRadius: theme.radius.lg, padding: 20, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="alert-22" size={22} />
            <Text variant="heading" color={theme.color.danger}>{s.warningSignsTitle}</Text>
          </View>
          {(summary.warning_signs ?? []).map((w, i) => (
            <Text key={i}>{`•  ${w}`}</Text>
          ))}
        </View>
      )}

      <QuestionOutcomes appointmentId={visit.appointmentId} language={language} s={s} />
      <Checklist visitId={visit._id} language={language} s={s} />
    </>
  );
}

function LabeledLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'flex-start' }}>
      <Text variant="label">{label}</Text>
      <View style={{ flex: 1 }}>
        <Text>{value}</Text>
      </View>
    </View>
  );
}

/** G10 / D4: each question from the queue, answered or carried over to the next visit. */
function QuestionOutcomes({ appointmentId, language, s }: { appointmentId: Id<'appointments'>; language: Language; s: Strings }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId });
  if (!questions?.length) return null;
  return (
    <>
      <SectionTitle title={s.yourQuestions} />
      <Card gap={0}>
        {questions.map((q, i) => (
          <View key={q._id}>
            {i > 0 && <Divider />}
            <View style={{ gap: theme.space.sm, paddingVertical: 14 }}>
              <Text>{language === 'en' ? q.textEnglish : q.textOriginal}</Text>
              {q.status === 'answered' ? (
                <StatusChip label={s.answered} icon="check-green" color={theme.color.success} bg={theme.color.successBg} />
              ) : (
                <StatusChip label={s.carriedOverNext} icon="refresh-periwinkle" color={theme.color.periwinkle} bg={theme.color.periwinkleBg} />
              )}
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

/** G11: pick up the prescription, book the follow-up, get the tests. Ticks are saved. */
function Checklist({ visitId, language, s }: { visitId: Id<'visits'>; language: Language; s: Strings }) {
  const tasks = useQuery(api.tasks.listForVisit, { visitId });
  const setDone = useMutation(api.tasks.setDone);
  if (!tasks?.length) return null;
  return (
    <>
      <SectionTitle title={s.todoTitle} />
      <Card gap={0}>
        {tasks.map((task, i) => (
          <View key={task._id}>
            {i > 0 && <Divider />}
            <CheckRow
              label={language === 'en' ? task.textEnglish : task.textPatientLang}
              checked={task.done}
              onToggle={() => void setDone({ taskId: task._id, done: !task.done })}
            />
          </View>
        ))}
      </Card>
    </>
  );
}

/** 3.2 / 3.3: "Visit on October 20", doctor and clinic, and "Summary ready" once released. */
export function VisitHeaderCard({ title, doctor, clinic, ready, s }: { title: string; doctor: string; clinic?: string; ready: boolean; s: Strings }) {
  return (
    <View style={{ backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: 22, gap: 4 }}>
      <Text variant="pageTitle">{title}</Text>
      <Text variant="muted">{s.doctorAndClinic(doctor, clinic)}</Text>
      {ready && (
        <View style={{ paddingTop: 8 }}>
          <StatusChip label={s.summaryReady} icon="check-green" color={theme.color.success} bg={theme.color.successBg} />
        </View>
      )}
    </View>
  );
}
