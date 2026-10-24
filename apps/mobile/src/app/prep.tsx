// B8 visit prep: the open questions in both languages, large, to show the doctor.
import { useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { Card, PageHeader, Screen, ScreenTitle, Text } from '../components';
import { usePatient } from '../usePatient';

export default function Prep() {
  const { appointment, s } = usePatient();
  const questions = useQuery(api.questions.listForAppointment, appointment ? { appointmentId: appointment._id } : 'skip');
  const open = questions?.filter((q) => q.status === 'open') ?? [];

  return (
    <Screen header={<PageHeader title={s.prepTitle} />}>
      <ScreenTitle title={s.prepTitle} />
      <Text variant="muted">{s.prepHint}</Text>
      {questions === undefined && appointment !== null && <Text>{s.loading}</Text>}
      {questions && open.length === 0 && <Text variant="muted">{s.noQuestions}</Text>}
      {open.map((q, i) => (
        <Card key={q._id}>
          <Text variant="heading">
            {i + 1}. {q.textOriginal}
          </Text>
          {q.textEnglish !== q.textOriginal && <Text variant="title">{q.textEnglish}</Text>}
        </Card>
      ))}
    </Screen>
  );
}
