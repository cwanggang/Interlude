// Doctor patient view sections: C3–C9 (C2 is Timeline.tsx).
import { useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Badge, Banner, Button, Card, ListItem, SidePanel, Text, TextField } from '../../components'
import { formatDateTime, formatDay } from '../../format'

type SymptomEntry = FunctionReturnType<typeof api.patients.symptomEntries>[number]

const HISTORY_FIELDS = ['onset', 'location', 'duration', 'character', 'aggravating', 'relieving', 'timing'] as const

type Brief = NonNullable<FunctionReturnType<typeof api.briefs.getByAppointment>>
type BriefItem = NonNullable<Brief['sections']>['concerns'][number]

/** H7 / C8: red-flag banner for the sticky header strip. Renders nothing when clear. */
export function AlertBanner({ patientId }: { patientId: Id<'patients'> }) {
  const alerts = useQuery(api.alerts.listForPatient, { patientId })
  const acknowledge = useMutation(api.alerts.acknowledge)
  const open = alerts?.filter((a) => !a.acknowledged) ?? []
  return (
    <>
      {open.map((a) => (
        <Banner key={a._id} actions={<Button variant="secondary" onClick={() => void acknowledge({ alertId: a._id })}>Acknowledge</Button>}>
          <strong>Red flag: {a.symptom}</strong> · “{a.quote}”
          {a.quoteEnglish && a.quoteEnglish !== a.quote && <> ({a.quoteEnglish})</>} · {formatDateTime(a.createdAt)}
        </Banner>
      ))}
    </>
  )
}

/**
 * H8 / C9: the pre-visit summary from the Elastic Workflow. With `sections`, an overview plus
 * concerns and topics whose citations open the patient's own words; otherwise the paragraph.
 */
export function Brief({ patientId, appointmentId }: { patientId: Id<'patients'>; appointmentId: Id<'appointments'> }) {
  const brief = useQuery(api.briefs.getByAppointment, { appointmentId })
  const generate = useAction(api.elastic.generateBrief)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onGenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      await generate({ patientId, appointmentId })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card
      title="Pre-visit summary"
      actions={<Button variant="secondary" disabled={busy} onClick={() => void onGenerate()}>{busy ? 'Generating…' : 'Generate brief'}</Button>}
    >
      {brief === undefined && <Text variant="muted">Loading…</Text>}
      {brief === null && <Text variant="muted">No brief yet.</Text>}
      {error && <Text variant="muted">Couldn't generate the brief: {error}</Text>}
      {brief && (
        <>
          <Text>{brief.sections?.overview ?? brief.textEnglish}</Text>
          {brief.sections && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              <BriefItems title="Reported concerns" items={brief.sections.concerns} />
              <BriefItems title="Topics for review" items={brief.sections.topics} />
            </div>
          )}
          <Text variant="muted">
            {formatDateTime(brief.createdAt)} · {brief.source === 'elastic_workflow' ? 'Elastic Workflow' : brief.source}
          </Text>
        </>
      )}
    </Card>
  )
}

/** Each AI-written line links to its source: click to show the cited quotes. */
function BriefItems({ title, items }: { title: string; items: BriefItem[] }) {
  const [open, setOpen] = useState<number | null>(null)
  if (items.length === 0) return null
  return (
    <div>
      <Text variant="heading">{title}</Text>
      {items.map((item, i) => (
        <div key={i}>
          <ListItem
            title={item.text}
            onClick={item.citations.length ? () => setOpen(open === i ? null : i) : undefined}
            trailing={item.citations.length > 0 && <Badge>{item.citations.length} source{item.citations.length === 1 ? '' : 's'}</Badge>}
          />
          {open === i &&
            item.citations.map((c, j) => (
              <ListItem key={j} title={<Text variant="quote">“{c.quoteOriginal}”</Text>} subtitle={<>{c.quoteEnglish}<br />{formatDay(c.date)}</>} />
            ))}
        </div>
      ))}
    </div>
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

/** C4 / H9: side panel with the clicked timeline day's quotes, original with English underneath. */
export function QuotesPanel({ entries, date, onClose }: { entries: SymptomEntry[]; date: string; onClose: () => void }) {
  const shown = entries.filter((e) => e.date === date)
  return (
    <SidePanel title={`Quotes · ${formatDay(date)}`} onClose={onClose}>
      {shown.length === 0 && <Text variant="muted">No check-in this day.</Text>}
      {shown.map((e) => (
        <ListItem
          key={e._id}
          title={<Text variant="quote">“{e.quoteOriginal}”</Text>}
          subtitle={<>{e.quoteEnglish}<br />{e.symptom}{e.change && ` · ${e.change}`}</>}
          trailing={e.severity !== undefined && <Badge>{e.severity}/10</Badge>}
        />
      ))}
    </SidePanel>
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
