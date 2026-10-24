// The patient view (Figma 6.3, the hero screen). Sticky header (H7: name, age, reason, appointment
// countdown, language, check-ins, the visit button from 6.4), red-flag banner, then the pre-visit
// summary, timeline, history, questions, search and ask-the-record, with the patient's words in the
// right column. The visit button opens the visit view (6.6–6.8) in place of the body.
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Avatar, Button, Chip, Screen, Text } from '../components'
import { age, daysFrom, formatCountdown, formatDay, formatTime, isoDay, languageLabel } from '../format'
import { theme } from '../theme'
import { useNow } from '../useNow'
import Timeline, { type Selection } from './patient/Timeline'
import StartVisitFlow from './patient/LiveVisit'
import VisitView from './patient/VisitView'
import { visitStage } from './patient/visitStage'
import { dayPanel, type QuotePanel } from './patient/quotes'
import { AlertBanner, AskRecord, Brief, HistoryCards, Questions, QuotesColumn, Search } from './patient/sections'

const COMPLETION_DAYS = 7
const DAY_MS = 86_400_000

export default function PatientView({ patientId, onBack }: { patientId: Id<'patients'>; onBack: () => void }) {
  const now = useNow()
  const patient = useQuery(api.patients.get, { patientId })
  const appointment = useQuery(api.appointments.current, { patientId })
  const appointments = useQuery(api.appointments.listForPatient, { patientId })
  const entries = useQuery(api.patients.symptomEntries, { patientId })
  const conversations = useQuery(api.patients.conversations, { patientId })
  const visit = useQuery(api.visits.getByAppointment, appointment ? { appointmentId: appointment._id } : 'skip')
  const [selected, setSelected] = useState<Selection | null>(null)
  const [panel, setPanel] = useState<QuotePanel | null>(null)
  const [showVisit, setShowVisit] = useState(false)
  const [starting, setStarting] = useState(false)
  const markViewed = useMutation(api.patients.markViewed)

  // H6: opening the patient clears the "new since last viewed" dot (once per open, not per update).
  const loaded = !!patient
  useEffect(() => {
    if (loaded) void markViewed({ patientId })
  }, [loaded, patientId, markViewed])

  if (patient === null) {
    return (
      <Screen>
        <Text variant="title">Patient not found</Text>
        <Text variant="muted">This patient no longer exists (the seed may have been re-run).</Text>
        <div><Button variant="secondary" onClick={onBack}>All patients</Button></div>
      </Screen>
    )
  }
  if (patient === undefined) return <Screen><Text variant="muted">Loading…</Text></Screen>

  // Check-ins: local days in the last week with an answered call, and all since the last visit.
  const answered = (conversations ?? []).filter((c) => c.mode === 'checkin' && c.status === 'processed' && c.summaryEnglish)
  const lastWeek = new Set(Array.from({ length: COMPLETION_DAYS }, (_, i) => isoDay(now - i * DAY_MS)))
  const doneDays = new Set(answered.map((c) => isoDay(c.startedAt)).filter((d) => lastWeek.has(d)))
  const lastVisit = appointments?.filter((a) => a.status === 'completed' && a._id !== appointment?._id).at(-1)
  const sinceVisit = answered.filter((c) => !lastVisit || c.startedAt > lastVisit.scheduledAt)
  const checkinLine = answered.length
    ? `${sinceVisit.length} daily check-ins${lastVisit ? ` since ${formatDay(isoDay(lastVisit.scheduledAt))}` : ''} (${doneDays.size} of the last ${COMPLETION_DAYS} completed).`
    : null

  const stage = visitStage(appointment ? visit : null)
  const upcoming = appointment?.status === 'upcoming'
  const when = appointment
    ? `${daysFrom(appointment.scheduledAt, now) === 0 ? 'Today' : formatDay(isoDay(appointment.scheduledAt))} ${formatTime(appointment.scheduledAt)}${upcoming && appointment.scheduledAt > now ? ` · ${formatCountdown(appointment.scheduledAt, now)}` : ''}`
    : null

  const selectDay = (s: Selection) => {
    setSelected(s)
    setPanel(dayPanel(entries ?? [], conversations, s.symptom, s.date))
  }

  return (
    <>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: theme.color.surface, borderBottom: `1px solid ${theme.color.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: `22px ${theme.space.xxl}px`, flexWrap: 'wrap' }}>
          <Avatar name={patient.name} size={56} gradient />
          <div style={{ flex: 1, minWidth: 320, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <Text variant="title">{patient.name}</Text>
              <Text color={theme.color.textMuted} style={{ whiteSpace: 'pre' }}>
                {[patient.dateOfBirth ? String(age(patient.dateOfBirth, now)) : null, patient.reasonForVisit].filter(Boolean).join('  ·  ')}
              </Text>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {when && <Chip tone="solid" icon="clock-white">{when}</Chip>}
              <Chip tone={patient.language === 'es' ? 'periwinkle' : 'neutral'} icon={patient.language === 'es' ? 'globe-periwinkle-14' : 'globe-muted-14'}>{languageLabel(patient.language)}</Chip>
              {stage.kind === 'none' && conversations && <Chip tone="primary" icon="phone-teal-14">{`${doneDays.size} of ${COMPLETION_DAYS} check-ins`}</Chip>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {appointment && <VisitButtons stage={stage} showVisit={showVisit} onToggle={() => setShowVisit(!showVisit)} onStart={() => setStarting(true)} />}
          </div>
        </div>
      </header>
      <AlertBanner patientId={patientId} />
      {starting && appointment && (
        <StartVisitFlow
          appointmentId={appointment._id}
          scheduledAt={appointment.scheduledAt}
          people={{ doctorName: appointment.doctorName, patientName: patient.name, patientLanguage: patient.language }}
          onClose={() => setStarting(false)}
          onUploaded={() => {
            setStarting(false)
            setShowVisit(true)
          }}
        />
      )}

      {showVisit && appointment ? (
        <VisitView
          appointmentId={appointment._id}
          scheduledAt={appointment.scheduledAt}
          patientName={patient.name}
          patientLanguage={patient.language}
          entries={entries ?? []}
          onShowSymptom={(symptom) => {
            const date = (entries ?? []).find((e) => e.symptom === symptom)?.date
            setShowVisit(false)
            if (date) selectDay({ symptom, date })
          }}
        />
      ) : (
        <Screen>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 640px', minWidth: 0, display: 'grid', gap: 24 }}>
              {appointment && <Brief patientId={patientId} appointmentId={appointment._id} checkinLine={checkinLine} onShowSources={(p) => { setSelected(null); setPanel(p) }} />}
              <Timeline patientId={patientId} selected={selected} onSelect={selectDay} />
              <HistoryCards entries={entries ?? []} />
              {appointment && <Questions appointmentId={appointment._id} />}
              <Search patientId={patientId} />
              <AskRecord patientId={patientId} />
            </div>
            <div style={{ flex: '0 0 400px', maxWidth: '100%' }}>
              <QuotesColumn panel={panel} onClose={() => { setPanel(null); setSelected(null) }} />
            </div>
          </div>
        </Screen>
      )}
    </>
  )
}

/**
 * Figma 6.4. No visit yet: "Start visit" and "Upload recording" are shown but switched off — the
 * recording flow (6.5) is still being designed. Otherwise the button opens the visit view.
 */
function VisitButtons({ stage, showVisit, onToggle, onStart }: { stage: ReturnType<typeof visitStage>; showVisit: boolean; onToggle: () => void; onStart: () => void }) {
  if (stage.kind === 'none') {
    // Both open the consent dialog (6.5a), which also offers the upload.
    return (
      <>
        <Button variant="secondary" icon="upload" onClick={onStart}>Upload recording</Button>
        <Button icon="mic-white-18" size="lg" style={{ height: 48 }} onClick={onStart}>Start visit</Button>
      </>
    )
  }
  return (
    <>
      {stage.chip && !showVisit && <Chip tone={stage.chip.tone} icon={stage.chip.icon} size={14}>{stage.chip.text}</Chip>}
      {stage.kind === 'failed' && !showVisit && <Button variant="secondary" icon="mic-ink-18" onClick={onStart}>Record again</Button>}
      <Button variant={showVisit ? 'secondary' : stage.variant} icon={showVisit ? undefined : stage.icon} style={{ height: 48 }} onClick={onToggle}>
        {showVisit ? 'Back to patient' : stage.label}
      </Button>
    </>
  )
}
