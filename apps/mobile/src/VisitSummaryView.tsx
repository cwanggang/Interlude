// E1 / G10 / G11: one released visit in the patient's language. Medicines first, then what to
// do, the after-visit checklist, tests, next steps, warning signs, and how each question went.
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { View } from 'react-native';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Badge, Card, ListItem, Text } from './components';
import type { Language, Strings } from './i18n';
import { theme } from './theme';
import { itemText, summaryFor, type SummaryItem } from './visitSummary';

type Visit = NonNullable<FunctionReturnType<typeof api.visits.getByAppointment>>;

export function VisitSummaryView({ visit, language, s }: { visit: Visit; language: Language; s: Strings }) {
  const summary = summaryFor(visit, language);
  if (!summary) return null;
  return (
    <>
      <Card title={s.medications}>
        {(summary.medications ?? []).map((m, i) => (
          <ListItem
            key={m.key ?? i}
            title={<Text variant="heading">{`${m.name} ${m.dose}`}</Text>}
            subtitle={
              <>
                <Text>{`${s.schedule}: ${m.schedule}`}</Text>
                {m.purpose ? <Text variant="muted">{`${s.purpose}: ${m.purpose}`}</Text> : null}
              </>
            }
          />
        ))}
      </Card>
      {summary.assessment ? (
        <Card>
          <Text>{summary.assessment}</Text>
        </Card>
      ) : null}
      <BulletCard title={s.instructions} items={summary.instructions ?? []} />
      <Checklist visitId={visit._id} language={language} s={s} />
      <BulletCard title={s.tests} items={summary.tests_ordered ?? []} />
      {summary.follow_up ? (
        <Card title={s.followUp}>
          <Text>{summary.follow_up}</Text>
        </Card>
      ) : null}
      <BulletCard title={s.warningSigns} items={summary.warning_signs ?? []} danger />
      <QuestionOutcomes appointmentId={visit.appointmentId} s={s} />
    </>
  );
}

function BulletCard({ title, items, danger }: { title: string; items: SummaryItem[]; danger?: boolean }) {
  if (!items.length) return null;
  return (
    <Card title={title} tone={danger ? 'danger' : 'neutral'}>
      {items.map((item, i) => (
        <Text key={i}>• {itemText(item)}</Text>
      ))}
    </Card>
  );
}

/** G11: pick up the prescription, book the follow-up, get the tests. Ticks are saved. */
function Checklist({ visitId, language, s }: { visitId: Id<'visits'>; language: Language; s: Strings }) {
  const tasks = useQuery(api.tasks.listForVisit, { visitId });
  const setDone = useMutation(api.tasks.setDone);
  if (!tasks?.length) return null;
  return (
    <Card title={s.afterVisitTasks}>
      {tasks.map((task) => (
        <ListItem
          key={task._id}
          onPress={() => void setDone({ taskId: task._id, done: !task.done })}
          title={
            <View style={{ flexDirection: 'row', gap: theme.space.md, alignItems: 'center' }}>
              <Text variant="heading">{task.done ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text>{language === 'en' ? task.textEnglish : task.textPatientLang}</Text>
              </View>
            </View>
          }
        />
      ))}
    </Card>
  );
}

/** G10 / D4: each question from the queue, answered or moved to the next visit. */
function QuestionOutcomes({ appointmentId, s }: { appointmentId: Id<'appointments'>; s: Strings }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId });
  if (!questions?.length) return null;
  return (
    <Card title={s.yourQuestions}>
      {questions.map((q) => (
        <ListItem
          key={q._id}
          title={q.textOriginal}
          trailing={
            <Badge
              tone={q.status === 'answered' ? 'success' : 'neutral'}
              label={q.status === 'answered' ? s.answered : q.status === 'carried_over' ? s.movedToNext : s.notAnswered}
            />
          }
        />
      ))}
    </Card>
  );
}
