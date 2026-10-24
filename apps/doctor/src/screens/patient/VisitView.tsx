// The visit view (H10–H13) inside the patient view: start (upload or record, D1), processing steps,
// attention cards (D4 questions answered, D5 symptoms not discussed), transcript with speakers (D2)
// beside the summary in both languages (D3), and the release confirm (D6). Processing is Track A's;
// this only reads visits and calls the contract.
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Badge, Button, Card, ListItem, Text } from '../../components'
import { formatDay, isoDay } from '../../format'
import { theme, type Tone } from '../../theme'

type Visit = NonNullable<FunctionReturnType<typeof api.visits.getByAppointment>>

/**
 * VisitSummary v2 (SPEC.md "Visit summary JSON v2"). Visits store it as v.any(), and summaries
 * written before block A2 use v1 (plain strings, no times_of_day), so every v2 field is optional
 * and list items may be strings.
 */
type Item = string | { text: string; source_turn?: number }
type VisitSummary = {
  assessment?: string
  medications?: {
    key?: string
    name: string
    dose: string
    schedule: string
    times_of_day?: string[]
    purpose: string
    change?: 'new' | 'changed' | 'same' | 'stopped'
    source_turn?: number
  }[]
  instructions?: Item[]
  tests_ordered?: Item[]
  follow_up?: string
  warning_signs?: string[]
}

const itemText = (item: Item) => (typeof item === 'string' ? item : item.text)
const itemTurn = (item: Item) => (typeof item === 'string' ? undefined : item.source_turn)

const STEPS = ['uploaded', 'transcribed', 'summarized'] as const

export default function VisitView({ appointmentId, patientName, patientLanguage }: { appointmentId: Id<'appointments'>; patientName: string; patientLanguage: 'en' | 'es' }) {
  const visit = useQuery(api.visits.getByAppointment, { appointmentId })
  const [highlight, setHighlight] = useState<number | null>(null)

  if (visit === undefined) return <Card title="Visit"><Text variant="muted">Loading…</Text></Card>
  if (visit === null) return <StartVisit appointmentId={appointmentId} />

  const showTurn = (turn: number | undefined) => {
    if (turn === undefined) return
    setHighlight(turn)
    document.getElementById(`turn-${turn}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const english = visit.summaryEnglish as VisitSummary | undefined
  const patientLang = visit.summaryPatientLang as VisitSummary | undefined
  const summarized = visit.status === 'summarized'

  return (
    <>
      <Processing visit={visit} appointmentId={appointmentId} />
      {summarized && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: theme.space.lg }}>
          <QuestionsCard appointmentId={appointmentId} />
          <UndiscussedCard visit={visit} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: theme.space.lg, alignItems: 'start' }}>
        <Transcript visit={visit} highlight={highlight} />
        {english && <Summary english={english} patientLang={patientLanguage === 'en' ? undefined : patientLang} onShowTurn={showTurn} />}
      </div>
      {summarized && <ReleaseBar visit={visit} appointmentId={appointmentId} patientName={patientName} patientLanguage={patientLanguage} />}
    </>
  )
}

/** Uploaded → Transcribed → Summarized, plus "upload a different recording". */
function Processing({ visit, appointmentId }: { visit: Visit; appointmentId: Id<'appointments'> }) {
  const reached = STEPS.indexOf(visit.status as (typeof STEPS)[number])
  return (
    <Card
      title="Visit recording"
      actions={!visit.releasedToPatient && <UploadButton appointmentId={appointmentId} label="Replace recording" variant="secondary" />}
    >
      <div style={{ display: 'flex', gap: theme.space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        {STEPS.map((step, i) => (
          <span key={step} style={{ display: 'flex', gap: theme.space.sm, alignItems: 'center' }}>
            {i > 0 && <Text variant="muted">→</Text>}
            <Badge tone={i <= reached ? 'success' : 'neutral'}>{i <= reached ? '✓ ' : ''}{step[0].toUpperCase() + step.slice(1)}</Badge>
          </span>
        ))}
        {visit.status === 'failed' && <Badge tone="danger">Failed: upload the recording again</Badge>}
        {reached >= 0 && reached < STEPS.length - 1 && <Text variant="muted">Working…</Text>}
      </div>
    </Card>
  )
}

/** D4: "2 of 3 questions answered", with transcript evidence for the answered ones. */
function QuestionsCard({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId })
  if (!questions) return null
  const answered = questions.filter((q) => q.status === 'answered')
  const unanswered = questions.filter((q) => q.status !== 'answered')
  return (
    <Card
      title={questions.length ? `${answered.length} of ${questions.length} questions answered` : 'No questions from the patient'}
      tone={unanswered.length ? 'danger' : 'neutral'}
    >
      {[...unanswered, ...answered].map((q) => (
        <ListItem
          key={q._id}
          title={q.textEnglish}
          subtitle={q.answerEvidence && `“${q.answerEvidence}”`}
          trailing={<Badge tone={q.status === 'answered' ? 'success' : 'danger'}>{q.status === 'answered' ? 'answered' : 'not answered'}</Badge>}
        />
      ))}
    </Card>
  )
}

/** D5: symptoms reported since the last visit that the visit never discussed (Track A computes it). */
function UndiscussedCard({ visit }: { visit: Visit }) {
  const list = visit.unaddressedSymptoms
  if (list === undefined) {
    return <Card title="Symptoms not discussed"><Text variant="muted">Not checked for this visit.</Text></Card>
  }
  return (
    <Card
      title={list.length ? `${list.length} symptom${list.length === 1 ? '' : 's'} not discussed: ${list.map((s) => s.symptom).join(', ')}` : 'Every reported symptom was discussed'}
      tone={list.length ? 'danger' : 'neutral'}
    >
      {list.map((s) => (
        <ListItem
          key={s.symptom}
          title={<>{s.symptom} <Text variant="muted">{s.symptomOriginal}</Text></>}
          subtitle={`Last reported ${formatDay(s.lastDate)}`}
          trailing={s.lastSeverity !== undefined && <Badge>{s.lastSeverity}/10</Badge>}
        />
      ))}
    </Card>
  )
}

/** D2: transcript with speaker labels; summary items scroll here (H13). */
function Transcript({ visit, highlight }: { visit: Visit; highlight: number | null }) {
  const turns = visit.transcript ?? []
  return (
    <Card title="Transcript">
      {turns.length === 0 && <Text variant="muted">The transcript appears once the recording is transcribed.</Text>}
      <div style={{ display: 'grid', maxHeight: 640, overflowY: 'auto' }}>
        {turns.map((turn, i) => (
          <div
            key={i}
            id={`turn-${i}`}
            style={{
              padding: theme.space.sm,
              borderBottom: `1px solid ${theme.color.border}`,
              background: i === highlight ? theme.color.neutralBg : undefined,
              display: 'grid',
              gap: theme.space.xs,
            }}
          >
            <span><Badge tone={turn.speaker === 'doctor' ? 'primary' : 'neutral'}>{turn.speaker}</Badge></span>
            <Text>{turn.textEnglish}</Text>
            {turn.textPatientLang !== turn.textEnglish && <Text variant="muted">{turn.textPatientLang}</Text>}
          </div>
        ))}
      </div>
    </Card>
  )
}

type SummaryMode = 'both' | 'en' | 'patient'

/** D3: medications first, English and the patient's language side by side (or one at a time). */
function Summary({ english, patientLang, onShowTurn }: { english: VisitSummary; patientLang?: VisitSummary; onShowTurn: (turn: number | undefined) => void }) {
  const [mode, setMode] = useState<SummaryMode>('both')
  const columns: [string, VisitSummary][] =
    !patientLang || mode === 'en' ? [['English', english]] : mode === 'patient' ? [['Spanish', patientLang]] : [['English', english], ['Spanish', patientLang]]
  return (
    <Card
      title="Summary"
      actions={
        patientLang && (
          <div style={{ display: 'flex', gap: theme.space.xs }}>
            {(['both', 'en', 'patient'] as const).map((m) => (
              <Button key={m} variant={mode === m ? 'primary' : 'secondary'} onClick={() => setMode(m)}>
                {m === 'both' ? 'Side by side' : m === 'en' ? 'English' : 'Spanish'}
              </Button>
            ))}
          </div>
        )
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, gap: theme.space.lg }}>
        {columns.map(([label, summary]) => (
          <div key={label} style={{ display: 'grid', gap: theme.space.md, alignContent: 'start' }}>
            {columns.length > 1 && <Text variant="muted">{label}</Text>}
            <SummaryColumn summary={summary} onShowTurn={onShowTurn} />
          </div>
        ))}
      </div>
    </Card>
  )
}

const CHANGE_TONE: Record<string, Tone> = { new: 'primary', changed: 'primary', stopped: 'danger', same: 'neutral' }

function SummaryColumn({ summary, onShowTurn }: { summary: VisitSummary; onShowTurn: (turn: number | undefined) => void }) {
  return (
    <>
      <div>
        <Text variant="heading">Medications</Text>
        {(summary.medications ?? []).length === 0 && <Text variant="muted">None</Text>}
        {(summary.medications ?? []).map((m, i) => (
          <ListItem
            key={m.key ?? i}
            onClick={m.source_turn !== undefined ? () => onShowTurn(m.source_turn) : undefined}
            title={<>{m.name} {m.dose} {m.change && m.change !== 'same' && <Badge tone={CHANGE_TONE[m.change]}>{m.change}</Badge>}</>}
            subtitle={[m.schedule, m.purpose].filter(Boolean).join(' · ')}
          />
        ))}
      </div>
      {summary.assessment && (
        <div>
          <Text variant="heading">Assessment</Text>
          <Text>{summary.assessment}</Text>
        </div>
      )}
      <Items title="Instructions" items={summary.instructions} onShowTurn={onShowTurn} />
      <Items title="Tests ordered" items={summary.tests_ordered} onShowTurn={onShowTurn} />
      {summary.follow_up && (
        <div>
          <Text variant="heading">Follow-up</Text>
          <Text>{summary.follow_up}</Text>
        </div>
      )}
      <Items title="Warning signs" items={summary.warning_signs} onShowTurn={onShowTurn} />
    </>
  )
}

function Items({ title, items, onShowTurn }: { title: string; items?: Item[]; onShowTurn: (turn: number | undefined) => void }) {
  if (!items?.length) return null
  return (
    <div>
      <Text variant="heading">{title}</Text>
      {items.map((item, i) => {
        const turn = itemTurn(item)
        return (
          <ListItem
            key={i}
            title={`• ${itemText(item)}`}
            onClick={turn !== undefined ? () => onShowTurn(turn) : undefined}
            trailing={turn !== undefined && <Text variant="muted">turn {turn + 1}</Text>}
          />
        )
      })}
    </div>
  )
}

/** D6: sticky release button with a short inline confirm; also marks the appointment completed. */
function ReleaseBar({ visit, appointmentId, patientName, patientLanguage }: { visit: Visit; appointmentId: Id<'appointments'>; patientName: string; patientLanguage: 'en' | 'es' }) {
  const release = useMutation(api.visits.release)
  const markCompleted = useMutation(api.appointments.markCompleted)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onRelease = async () => {
    setError(null)
    try {
      await release({ visitId: visit._id })
      await markCompleted({ appointmentId })
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 5,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: theme.space.md,
        padding: theme.space.md,
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.md,
      }}
    >
      {error && <Text variant="muted">{error}</Text>}
      {visit.releasedToPatient ? (
        <Badge tone="success">Released to patient{visit.releasedAt ? ` ${formatDay(isoDay(visit.releasedAt))}` : ''}</Badge>
      ) : confirming ? (
        <>
          <Text>{patientName.split(' ')[0]} will see this summary in {patientLanguage === 'es' ? 'Spanish' : 'English'}.</Text>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button onClick={() => void onRelease()}>Release</Button>
        </>
      ) : (
        <Button onClick={() => setConfirming(true)}>Release to patient</Button>
      )}
    </div>
  )
}

/** Uploads a file or recorded blob, then registers the visit; processing starts on create. */
function useUploadVisit(appointmentId: Id<'appointments'>) {
  const generateUploadUrl = useMutation(api.visits.generateUploadUrl)
  const create = useMutation(api.visits.create)
  const [status, setStatus] = useState<string | null>(null)
  const upload = async (blob: Blob) => {
    setStatus('Uploading…')
    try {
      const url = await generateUploadUrl()
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/mp4' }, body: blob })
      if (!res.ok) throw new Error(`upload failed (${res.status})`)
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
      await create({ appointmentId, storageId })
      setStatus(null)
    } catch (e) {
      setStatus(`Upload failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { upload, status }
}

function UploadButton({ appointmentId, label, variant = 'primary' }: { appointmentId: Id<'appointments'>; label: string; variant?: 'primary' | 'secondary' }) {
  const { upload, status } = useUploadVisit(appointmentId)
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
      <Button variant={variant} onClick={() => input.current?.click()}>{label}</Button>
      {status && <Text variant="muted">{status}</Text>}
    </>
  )
}

/** D1 / H11: record in the browser (MediaRecorder, webm) or upload the scripted recording. */
function StartVisit({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const { upload, status } = useUploadVisit(appointmentId)
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recording = recorder !== null

  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const r = new MediaRecorder(stream)
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void upload(new Blob(chunks, { type: r.mimeType || 'audio/webm' }))
      }
      r.start()
      setSeconds(0)
      setRecorder(r)
    } catch (e) {
      setError(`Can't record: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const stop = () => {
    recorder?.stop()
    setRecorder(null)
  }

  return (
    <Card title="Start visit">
      <Text variant="muted">Record the visit here, or upload the recording. Transcription and both summaries start automatically.</Text>
      <div style={{ display: 'flex', gap: theme.space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        {recording ? (
          <>
            <Badge tone="danger">● Recording {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Badge>
            <Button onClick={stop}>Stop and process</Button>
          </>
        ) : (
          <>
            <Button onClick={() => void start()}>Record visit</Button>
            <UploadButton appointmentId={appointmentId} label="Upload recording" variant="secondary" />
          </>
        )}
      </div>
      {(status ?? error) && <Text variant="muted">{status ?? error}</Text>}
    </Card>
  )
}
