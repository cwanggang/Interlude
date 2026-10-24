// G12: one past visit's summary, opened from My Visit → Past visits. Released visits only.
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Card, Screen, ScreenTitle, Text } from '../../components';
import { formatDate } from '../../i18n';
import { usePatient } from '../../usePatient';
import { VisitSummaryView } from '../../VisitSummaryView';

export default function PastVisitSummary() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: Id<'appointments'> }>();
  const { patient, language, s } = usePatient();
  const visit = useQuery(api.visits.getByAppointment, { appointmentId });
  const visits = useQuery(api.visits.listForPatient, patient ? { patientId: patient._id } : 'skip');
  const row = visits?.find((v) => v.appointmentId === appointmentId);

  return (
    <Screen footer={<Text variant="muted">{s.disclaimer}</Text>}>
      <ScreenTitle title={s.visitTitle} />
      {visit === undefined && <Text>{s.loading}</Text>}
      {visit && !visit.releasedToPatient && <Text>{s.reviewing}</Text>}
      {visit?.releasedToPatient && (
        <>
          {row && (
            <Card>
              <Text variant="title">{s.visitOn(formatDate(row.scheduledAt, language))}</Text>
              <Text variant="heading">{row.doctorName}</Text>
            </Card>
          )}
          <VisitSummaryView visit={visit} language={language} s={s} />
        </>
      )}
    </Screen>
  );
}
