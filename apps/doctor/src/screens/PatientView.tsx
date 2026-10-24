// The patient view (the hero screen). A sticky header strip (H7: name, age, reason, countdown,
// language, the visit button, red-flag banner), then either the patient sections in priority order
// (brief, timeline, history cards, questions, search, ask-the-record) or the visit view (H10).
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Badge, Button, Screen, Text } from '../components'
import { age, formatCountdown, formatDateTime, languageLabel } from '../format'
import { useNow } from '../useNow'
import Timeline from './patient/Timeline'
import VisitView from './patient/VisitView'
import { visitStage } from './patient/visitStage'
import { AlertBanner, AskRecord, Brief, HistoryCards, Questions, QuotesPanel, Search } from './patient/sections'

const twoColumns = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 } as const

export default function PatientView({ patientId, onBack }: { patientId: Id<'patients'>; onBack: () => void }) {
  const now = useNow()
  const patient = useQuery(api.patients.get, { patientId })
  const appointment = useQuery(api.appointments.current, { patientId })
  const entries = useQuery(api.patients.symptomEntries, { patientId })
  const visit = useQuery(api.visits.getByAppointment, appointment ? { appointmentId: appointment._id } : 'skip')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showVisit, setShowVisit] = useState(false)
  const markViewed = useMutation(api.patients.markViewed)

  // H6: opening the patient clears the "new since last viewed" dot (once per open, not per update).
  const loaded = !!patient
  useEffect(() => {
    if (loaded) void markViewed({ patientId })
  }, [loaded, patientId, markViewed])

  const back = <Button variant="secondary" onClick={onBack}>All patients</Button>
  if (patient === null) {
    return (
      <Screen title="Patient not found" actions={back}>
        <Text variant="muted">This patient no longer exists (the seed may have been re-run).</Text>
      </Screen>
    )
  }
  if (patient === undefined) return <Screen title="Loading…" actions={back}><span /></Screen>

  const stage = visitStage(appointment ? visit : null)
  const subtitle = [
    patient.reasonForVisit,
    appointment &&
      (appointment.status === 'upcoming'
        ? `Visit ${formatDateTime(appointment.scheduledAt)} (${formatCountdown(appointment.scheduledAt, now)}) with ${appointment.doctorName}`
        : `Last visit ${formatDateTime(appointment.scheduledAt)} with ${appointment.doctorName}`),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Screen
      title={<>{patient.name}{patient.dateOfBirth && <>, {age(patient.dateOfBirth, now)}</>}</>}
      subtitle={subtitle}
      banner={<AlertBanner patientId={patientId} />}
      actions={
        <>
          <Badge tone={patient.language === 'es' ? 'primary' : 'neutral'}>{languageLabel(patient.language)}</Badge>
          {appointment && (
            <>
              {stage.badge && !showVisit && <Badge tone={stage.badge.tone}>{stage.badge.text}</Badge>}
              <Button onClick={() => setShowVisit(!showVisit)}>{showVisit ? 'Back to patient' : stage.label}</Button>
            </>
          )}
          {back}
        </>
      }
    >
      {showVisit && appointment ? (
        <VisitView appointmentId={appointment._id} patientName={patient.name} patientLanguage={patient.language} />
      ) : (
        <>
          {appointment && <Brief patientId={patientId} appointmentId={appointment._id} />}
          <Timeline patientId={patientId} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          <HistoryCards entries={entries ?? []} />
          {appointment && <Questions appointmentId={appointment._id} />}
          <div style={twoColumns}>
            <Search patientId={patientId} />
            <AskRecord patientId={patientId} />
          </div>
        </>
      )}
      {selectedDate && !showVisit && <QuotesPanel entries={entries ?? []} date={selectedDate} onClose={() => setSelectedDate(null)} />}
    </Screen>
  )
}
