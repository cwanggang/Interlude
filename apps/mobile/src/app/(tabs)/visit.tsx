// Screen 3: visit summary (E1) in the patient's language, medicines first, once the doctor releases it.
import { useQuery } from 'convex/react';

import { api } from '../../../../../convex/_generated/api';
import { CallMeNow } from '../../CallMeNow';
import { Card, ListItem, Screen, ScreenTitle, Text } from '../../components';
import { usePatient } from '../../usePatient';
import { itemText, summaryFor, type SummaryItem } from '../../visitSummary';

export default function Visit() {
  const { patient, appointment, language, s } = usePatient();
  const visit = useQuery(api.visits.getByAppointment, appointment ? { appointmentId: appointment._id } : 'skip');

  const summary = visit?.releasedToPatient ? summaryFor(visit, language) : undefined;

  return (
    <Screen footer={<Text variant="muted">{s.disclaimer}</Text>}>
      <ScreenTitle title={s.visitTitle} />
      {visit === undefined && appointment !== null && <Text>{s.loading}</Text>}
      {visit !== undefined && !summary && <Text>{s.visitNotReady}</Text>}
      {summary && (
        <>
          <Card title={s.medications}>
            {(summary.medications ?? []).map((m) => (
              <ListItem
                key={m.name}
                title={<Text variant="heading">{m.name}</Text>}
                subtitle={
                  <>
                    <Text>{`${s.dose}: ${m.dose}`}</Text>
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
          <BulletCard title={s.tests} items={summary.tests_ordered ?? []} />
          {summary.follow_up ? (
            <Card title={s.followUp}>
              <Text>{summary.follow_up}</Text>
            </Card>
          ) : null}
          <BulletCard title={s.warningSigns} items={summary.warning_signs ?? []} danger />
          {patient && <CallMeNow patientId={patient._id} s={s} mode="explainer" label={s.talkAboutVisit} />}
        </>
      )}
    </Screen>
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
