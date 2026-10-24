// Doctor patient view sections: C3–C9 (C2 is Timeline.tsx).
import { useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Badge, Button, Card, ListItem, Text, TextField } from '../../components'
import { formatDateTime, formatDay } from '../../format'

type SymptomEntry = FunctionReturnType<typeof api.patients.symptomEntries>[number]

const HISTORY_FIELDS = ['onset', 'location', 'duration', 'character', 'aggravating', 'relieving', 'timing'] as const

/** C8: unacknowledged red flags with an acknowledge button. Renders nothing when clear. */
export function Alerts({ patientId }: { patientId: Id<'patients'> }) {
  const alerts = useQuery(api.alerts.listForPatient, { patientId })
  const acknowledge = useMutation(api.alerts.acknowledge)
  const open = alerts?.filter((a) => !a.acknowledged) ?? []
  if (open.length === 0) return null
  return (
    <Card title="Red-flag alerts" tone="danger">
      {open.map((a) => (
        <ListItem
          key={a._id}
          title={<><Badge tone="danger">{a.symptom}</Badge> “{a.quote}”</>}
          subtitle={formatDateTime(a.createdAt)}
          trailing={<Button onClick={() => void acknowledge({ alertId: a._id })}>Acknowledge</Button>}
        />
      ))}
    </Card>
  )
}

/** C9: pre-visit brief from the Elastic Workflow, with a button to regenerate it. */
export function Brief({ patientId, appointmentId }: { patientId: Id<'patients'>; appointmentId: Id<'appointments'> }) {
  const brief = useQuery(api.briefs.getByAppointment, { appointmentId })
  const generate = useAction(api.elastic.generateBrief)
  const [busy, setBusy] = useState(false)
  const onGenerate = async () => {
    setBusy(true)
    try {
      await generate({ patientId, appointmentId })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card
      title="Pre-visit brief"
      actions={<Button variant="secondary" disabled={busy} onClick={() => void onGenerate()}>{busy ? 'Generating…' : 'Generate brief'}</Button>}
    >
      {brief === undefined && <Text variant="muted">Loading…</Text>}
      {brief === null && <Text variant="muted">No brief yet.</Text>}
      {brief && (
        <>
          <Text>{brief.textEnglish}</Text>
          <Text variant="muted">
            {formatDateTime(brief.createdAt)} · {brief.source === 'elastic_workflow' ? 'Elastic Workflow' : brief.source}
          </Text>
        </>
      )}
    </Card>
  )
}

/** C3: one card per symptom; each field is the latest reported value or "not reported". */
export function HistoryCards({ entries }: { entries: SymptomEntry[] }) {
  const bySymptom = new Map<string, SymptomEntry[]>()
  for (const e of entries) bySymptom.set(e.symptom, [...(bySymptom.get(e.symptom) ?? []), e])
  if (bySymptom.size === 0) return <Card title="History"><Text variant="muted">No symptoms reported yet.</Text></Card>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      {[...bySymptom].map(([symptom, list]) => {
        const latest = list[0] // entries arrive newest first
        const latestSeverity = list.find((e) => e.severity !== undefined)
        return (
          <Card key={symptom} title={<>{symptom} <Text variant="muted">{latest.symptomOriginal}</Text></>}>
            <ListItem
              title="Severity"
              trailing={
                latestSeverity ? (
                  <>
                    <Text>{latestSeverity.severity}/10</Text>
                    {latestSeverity.change && <Badge tone={latestSeverity.change === 'worse' ? 'danger' : 'neutral'}>{latestSeverity.change}</Badge>}
                  </>
                ) : (
                  <Text variant="muted">not reported</Text>
                )
              }
            />
            {HISTORY_FIELDS.map((field) => {
              const value = list.find((e) => e[field])?.[field]
              return (
                <ListItem
                  key={field}
                  title={field[0].toUpperCase() + field.slice(1)}
                  trailing={value ? <Text>{value}</Text> : <Text variant="muted">not reported</Text>}
                />
              )
            })}
          </Card>
        )
      })}
    </div>
  )
}

/** C4: patient quotes, original with English underneath; filtered to the clicked timeline day. */
export function Quotes({ entries, date }: { entries: SymptomEntry[]; date: string | null }) {
  const shown = date ? entries.filter((e) => e.date === date) : entries.slice(0, 10)
  return (
    <Card title={date ? `Quotes · ${formatDay(date)}` : 'Recent quotes'}>
      {shown.length === 0 && <Text variant="muted">No quotes{date ? ' for this day' : ''}.</Text>}
      {shown.map((e) => (
        <ListItem
          key={e._id}
          title={<Text variant="quote">“{e.quoteOriginal}”</Text>}
          subtitle={<>{e.quoteEnglish}<br />{formatDay(e.date)} · {e.symptom}</>}
          trailing={e.severity !== undefined && <Badge>{e.severity}/10</Badge>}
        />
      ))}
    </Card>
  )
}

/** C5: the patient's question list, in English with the original underneath. */
export function Questions({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId })
  return (
    <Card title="Patient's questions">
      {questions === undefined && <Text variant="muted">Loading…</Text>}
      {questions?.length === 0 && <Text variant="muted">No questions yet.</Text>}
      {questions?.map((q) => (
        <ListItem
          key={q._id}
          title={q.textEnglish}
          subtitle={q.textOriginal !== q.textEnglish ? q.textOriginal : undefined}
          trailing={
            <>
              <Badge tone={q.source === 'voice' ? 'primary' : 'neutral'}>{q.source}</Badge>
              {q.status !== 'open' && <Badge tone={q.status === 'answered' ? 'success' : 'neutral'}>{q.status.replace('_', ' ')}</Badge>}
            </>
          }
        />
      ))}
    </Card>
  )
}

/** C6: cross-language search over check-in quotes (hybrid + rerank in Elastic). */
export function Search({ patientId }: { patientId: Id<'patients'> }) {
  const search = useAction(api.elastic.searchCheckins)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FunctionReturnType<typeof api.elastic.searchCheckins> | null>(null)
  const [busy, setBusy] = useState(false)
  const onSearch = async () => {
    setBusy(true)
    try {
      setResults(await search({ patientId, query: query.trim() }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Search check-ins">
      <TextField value={query} onChange={setQuery} onSubmit={() => void onSearch()} busy={busy} placeholder='Try "dizziness"' submitLabel="Search" />
      {results?.length === 0 && <Text variant="muted">No matches.</Text>}
      {results?.map((r) => (
        <ListItem
          key={r.symptomEntryId}
          title={<Text variant="quote">“{r.quoteOriginal}”</Text>}
          subtitle={<>{r.quoteEnglish}<br />{formatDay(r.date)} · {r.symptom}</>}
          trailing={<Badge>{r.language.toUpperCase()}</Badge>}
        />
      ))}
    </Card>
  )
}

/** C7: ask-the-record via Elastic Agent Builder, with cited quotes and "how this was found". */
export function AskRecord({ patientId }: { patientId: Id<'patients'> }) {
  const ask = useAction(api.elastic.askRecord)
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<FunctionReturnType<typeof api.elastic.askRecord> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const onAsk = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await ask({ patientId, question: question.trim() }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Ask the record">
      <TextField value={question} onChange={setQuestion} onSubmit={() => void onAsk()} busy={busy} placeholder="When did the dizziness start?" submitLabel="Ask" />
      {error && <Text variant="muted">{error}</Text>}
      {result && (
        <>
          <Text>{result.answer}</Text>
          {result.citations.map((c, i) => (
            <ListItem key={i} title={<Text variant="quote">“{c.quote}”</Text>} subtitle={c.date && formatDay(c.date)} />
          ))}
          {result.steps.length > 0 && (
            <details>
              <summary><Text variant="muted">How this was found</Text></summary>
              {result.steps.map((s, i) => <Text key={i} variant="muted">{s}</Text>)}
            </details>
          )}
        </>
      )}
    </Card>
  )
}
