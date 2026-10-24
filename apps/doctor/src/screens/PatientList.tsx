// Screen 6 / C1: patient list with next appointment and alert badge. Live via Convex.
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Badge, Card, ListItem, Screen, Text } from '../components'
import { formatDateTime } from '../format'

export default function PatientList({ onSelect }: { onSelect: (patientId: Id<'patients'>) => void }) {
  const rows = useQuery(api.patients.list)
  return (
    <Screen title="Patients">
      <Card>
        {rows === undefined && <Text variant="muted">Loading…</Text>}
        {rows?.length === 0 && <Text variant="muted">No patients yet. Run `npm run seed`.</Text>}
        {rows?.map(({ patient, nextAppointment, openAlerts }) => (
          <ListItem
            key={patient._id}
            onClick={() => onSelect(patient._id)}
            title={patient.name}
            subtitle={
              nextAppointment
                ? `Next visit ${formatDateTime(nextAppointment.scheduledAt)} with ${nextAppointment.doctorName}`
                : 'No upcoming visit'
            }
            trailing={
              <>
                <Badge>{patient.language.toUpperCase()}</Badge>
                {openAlerts > 0 && <Badge tone="danger">{openAlerts} alert{openAlerts > 1 ? 's' : ''}</Badge>}
              </>
            }
          />
        ))}
      </Card>
    </Screen>
  )
}
