// G12: one past visit's summary, opened from My Visit → Past visits (layout of Figma 3.3).
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';

import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { PageHeader, SafetyNotice, Screen, ScreenTitle, Text } from '../../components';
import { formatDate } from '../../i18n';
import { usePatient } from '../../usePatient';
import { VisitHeaderCard, VisitSummaryView } from '../../VisitSummaryView';

export default function PastVisitSummary() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: Id<'appointments'> }>();
  const { patient, language, s } = usePatient();
  const visit = useQuery(api.visits.getByAppointment, { appointmentId });
  const appointments = useQuery(api.appointments.listForPatient, patient ? { patientId: patient._id } : 'skip');
  const appointment = appointments?.find((a) => a._id === appointmentId);

  return (
    <Screen header={<PageHeader title={s.visitTitle} />}>
      <ScreenTitle title={s.visitTitle} />
      {visit === undefined && <Text>{s.loading}</Text>}
      {appointment && (
        <VisitHeaderCard
          title={s.visitOn(formatDate(appointment.scheduledAt, language))}
          doctor={appointment.doctorName}
          clinic={appointment.clinicName}
          ready={!!visit?.releasedToPatient}
          s={s}
        />
      )}
      {visit && !visit.releasedToPatient && <Text>{s.reviewingTitle}</Text>}
      {visit?.releasedToPatient && <VisitSummaryView visit={visit} language={language} s={s} />}
      <SafetyNotice />
    </Screen>
  );
}
