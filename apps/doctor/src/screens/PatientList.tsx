// Patients tab (C1 / H6): alerts pinned first, then soonest appointment. Live via Convex, so it
// updates when a call finishes. The dot marks a check-in since the doctor last opened the patient.
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Badge, Card, Dot, ListItem, Screen, Text } from '../components'
import { formatDateTime } from '../format'

export default function PatientList({ onSelect }: { onSelect: (patientId: Id<'patients'>) => void }) {
  const rows = useQuery(api.patients.list)
  return (
    <Screen title="Patients">
      <Card>
        {rows === undefined && <Text variant="muted">Loading…</Text>}
        {rows?.length === 0 && <Text variant="muted">No patients yet. Run `npm run seed`.</Text>}
        {rows?.map(({ patient, nextAppointment, openAlerts, lastCheckinAt }) => {
          const isNew = lastCheckinAt !== null && lastCheckinAt > (patient.doctorLastViewedAt ?? 0)
          return (
            <ListItem
              key={patient._id}
              onClick={() => onSelect(patient._id)}
              title={<>{isNew && <Dot title="New check-in since you last viewed" />} {patient.name}</>}
              subtitle={
                <>
                  {nextAppointment
                    ? `Next visit ${formatDateTime(nextAppointment.scheduledAt)} with ${nextAppointment.doctorName}`
                    : 'No upcoming visit'}
                  {lastCheckinAt !== null && ` · last check-in ${formatDateTime(lastCheckinAt)}`}
                </>
              }
              trailing={
                <>
                  <Badge>{patient.language.toUpperCase()}</Badge>
                  {openAlerts > 0 && <Badge tone="danger">{openAlerts} alert{openAlerts > 1 ? 's' : ''}</Badge>}
                </>
              }
            />
          )
        })}
      </Card>
    </Screen>
  )
}
