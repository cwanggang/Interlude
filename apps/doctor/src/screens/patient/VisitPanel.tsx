// Screen 7: the visit. D1 upload, D2 transcript with speakers, D3 summary, D4 question coverage,
// D6 release to patient. Processing is Track A's; this only reads visits and calls the contract.
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Badge, Button, Card, ListItem, Text } from '../../components'
import { theme } from '../../theme'

/** Mirrors VisitSummary in convex/claude.ts (Track A); visits store it as v.any(). */
type VisitSummary = {
  assessment: string
  medications: { name: string; dose: string; schedule: string; purpose: string }[]
  instructions: string[]
  tests_ordered: string[]
  follow_up: string
  warning_signs: string[]
}

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Processing: transcribing…',
  transcribed: 'Processing: summarizing…',
  summarized: 'Ready to review',
}

export default function VisitPanel({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const visit = useQuery(api.visits.getByAppointment, { appointmentId })
  const questions = useQuery(api.questions.listForAppointment, { appointmentId })
  const release = useMutation(api.visits.release)

  if (visit === undefined) return null
  if (visit === null) return <UploadVisit appointmentId={appointmentId} />

  const summary = visit.summaryEnglish as VisitSummary | undefined
  return (
    <Card
      title="Visit"
      actions={
        visit.releasedToPatient ? (
          <Badge tone="success">Released to patient</Badge>
        ) : (
          <Button disabled={!summary} onClick={() => void release({ visitId: visit._id })}>
            Release to patient
          </Button>
        )
      }
    >
      <Text variant="muted">{STATUS_LABEL[visit.status] ?? visit.status}</Text>

      {summary && (
        <div style={{ display: 'grid', gap: theme.space.sm }}>
          <Text variant="heading">Summary (patient sees it in Spanish after release)</Text>
          {summary.assessment && <Text>{summary.assessment}</Text>}
          {summary.medications.map((m) => (
            <ListItem key={m.name} title={`${m.name} ${m.dose}`} subtitle={`${m.schedule}${m.purpose ? ` · ${m.purpose}` : ''}`} />
          ))}
          <Bullets title="Instructions" items={summary.instructions} />
          <Bullets title="Tests ordered" items={summary.tests_ordered} />
          {summary.follow_up && <Text>Follow-up: {summary.follow_up}</Text>}
          <Bullets title="Warning signs" items={summary.warning_signs} />
        </div>
      )}

      {questions && questions.length > 0 && visit.status === 'summarized' && (
        <div style={{ display: 'grid', gap: theme.space.xs }}>
          <Text variant="heading">Question coverage</Text>
          {questions.map((q) => (
            <ListItem
              key={q._id}
              title={q.textEnglish}
              subtitle={q.answerEvidence && `“${q.answerEvidence}”`}
              trailing={<Badge tone={q.status === 'answered' ? 'success' : 'danger'}>{q.status === 'answered' ? 'answered' : 'not answered'}</Badge>}
            />
          ))}
        </div>
      )}

      {visit.transcript && visit.transcript.length > 0 && (
        <details>
          <summary>
            <Text variant="muted">Transcript ({visit.transcript.length} turns)</Text>
          </summary>
          {visit.transcript.map((turn, i) => (
            <ListItem
              key={i}
              title={<><Badge>{turn.speaker}</Badge> {turn.textEnglish}</>}
              subtitle={turn.textPatientLang !== turn.textEnglish ? turn.textPatientLang : undefined}
            />
          ))}
        </details>
      )}
    </Card>
  )
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <Text variant="muted">{title}</Text>
      {items.map((item) => (
        <Text key={item}>• {item}</Text>
      ))}
    </div>
  )
}

/** D1: upload the recorded (or pre-recorded demo) visit audio; processing starts on create. */
function UploadVisit({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const generateUploadUrl = useMutation(api.visits.generateUploadUrl)
  const create = useMutation(api.visits.create)
  const [status, setStatus] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setStatus('Uploading…')
    try {
      const url = await generateUploadUrl()
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type || 'audio/mp4' }, body: file })
      if (!res.ok) throw new Error(`upload failed (${res.status})`)
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
      const visitId = await create({ appointmentId, storageId })
      // While visits.create is a stub it returns null and no visit appears.
      setStatus(visitId ? 'Uploaded. Processing starts automatically.' : 'Uploaded, but visit processing is not available yet.')
    } catch (e) {
      setStatus(`Upload failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <Card title="Visit">
      <Text variant="muted">Upload the visit recording to transcribe it and write the summaries.</Text>
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
        }}
      />
      {status && <Text variant="muted">{status}</Text>}
    </Card>
  )
}
