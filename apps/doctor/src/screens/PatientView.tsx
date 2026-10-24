// Screen 1: doctor patient view (the hero screen). C2–C9 on one page.
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Badge, Button, Screen, Text } from '../components'
import { formatDateTime } from '../format'
import Timeline from './patient/Timeline'
import { Alerts, AskRecord, Brief, HistoryCards, Questions, Quotes, Search } from './patient/sections'

export default function PatientView({ patientId, onBack }: { patientId: Id<'patients'>; onBack: () => void }) {
  const patient = useQuery(api.patients.get, { patientId })
  const appointment = useQuery(api.appointments.current, { patientId })
  const entries = useQuery(api.patients.symptomEntries, { patientId })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (patient === null) {
    return (
      <Screen title="Patient not found" actions={<Button variant="secondary" onClick={onBack}>All patients</Button>}>
        <Text variant="muted">This patient no longer exists (the seed may have been re-run).</Text>
      </Screen>
    )
  }

  return (
    <Screen
      title={patient ? <>{patient.name} <Badge>{patient.language.toUpperCase()}</Badge></> : 'Loading…'}
      actions={<Button variant="secondary" onClick={onBack}>All patients</Button>}
    >
      {patient && (
        <Text variant="muted">
          Reason for visit: {patient.reasonForVisit}
          {appointment && ` · ${appointment.status === 'upcoming' ? 'Next visit' : 'Last visit'} ${formatDateTime(appointment.scheduledAt)} with ${appointment.doctorName}`}
        </Text>
      )}
      <Alerts patientId={patientId} />
      {appointment && <Brief patientId={patientId} appointmentId={appointment._id} />}
      <Timeline patientId={patientId} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        <Quotes entries={entries ?? []} date={selectedDate} />
        {appointment && <Questions appointmentId={appointment._id} />}
      </div>
      <HistoryCards entries={entries ?? []} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        <Search patientId={patientId} />
        <AskRecord patientId={patientId} />
      </div>
    </Screen>
  )
}
