// Patient view sections (Figma 6.3): red-flag banner (C8), pre-visit summary with source links (H8,
// C9), the quotes column (C4, H9), history by symptom (C3), the patient's questions (C5), search (C6)
// and ask-the-record (C7). The timeline (C2) is Timeline.tsx.
import { useState, type ReactNode } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Blend, Button, Card, Chip, CloseButton, Divider, Icon, Text, TextField } from '../../components'
import { formatDateTime, formatDay, isoDay } from '../../format'
import { theme } from '../../theme'
import type { QuotePanel } from './quotes'

type SymptomEntry = FunctionReturnType<typeof api.patients.symptomEntries>[number]
type Brief = NonNullable<FunctionReturnType<typeof api.briefs.getByAppointment>>
type BriefItem = NonNullable<Brief['sections']>['concerns'][number]


const HISTORY_FIELDS = [
  ['onset', 'Onset'],
  ['location', 'Location'],
  ['duration', 'Duration'],
  ['character', 'Character'],
  ['aggravating', 'Aggravating'],
  ['relieving', 'Relieving'],
  ['timing', 'Timing'],
] as const

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

/** H7 / C8: full-width red-flag banner under the header, one per open alert. */
export function AlertBanner({ patientId }: { patientId: Id<'patients'> }) {
  const alerts = useQuery(api.alerts.listForPatient, { patientId })
  const acknowledge = useMutation(api.alerts.acknowledge)
  const open = alerts?.filter((a) => !a.acknowledged) ?? []
  return (
    <>
      {open.map((a) => (
        <div key={a._id} role="alert" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: `14px ${theme.space.xxl}px`, background: theme.color.dangerBg }}>
          <Icon name="alert-red-22" size={22} />
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
            <Text style={{ font: `700 15px/1.45 ${theme.font.body}` }} color={theme.color.dangerText}>{`Red flag · ${capitalize(a.symptom)} · ${formatDateTime(a.createdAt)}`}</Text>
            <Text style={{ font: `400 15px/1.45 ${theme.font.body}`, whiteSpace: 'pre-wrap' }}>
              {`“${a.quote}”${a.quoteEnglish && a.quoteEnglish !== a.quote ? `  —  ${a.quoteEnglish}` : ''}`}
            </Text>
          </div>
          <Button variant="secondary" style={{ height: 40 }} onClick={() => void acknowledge({ alertId: a._id })}>Acknowledge</Button>
        </div>
      ))}
    </>
  )
}

/** "Oct 23 → Nov 5", "Oct 31 call", or "9 calls" for a brief line's citations. */
function sourceLabel(item: BriefItem): string {
  const dates = [...new Set(item.citations.map((c) => c.date))].sort()
  if (dates.length === 0) return ''
  if (dates.length === 1) return `${formatDay(dates[0])} call`
  if (dates.length === 2) return `${formatDay(dates[0])}, ${formatDay(dates[1])}`
  if (item.citations.length > 4) return `${item.citations.length} calls`
  return `${formatDay(dates[0])} → ${formatDay(dates.at(-1)!)}`
}

/**
 * H8 / C9: the pre-visit summary written by the Elastic Workflow. Each line's source chip opens the
 * patient's own words in the side column. Without sections (older briefs), the plain paragraph.
 */
export function Brief({ patientId, appointmentId, checkinLine, onShowSources }: { patientId: Id<'patients'>; appointmentId: Id<'appointments'>; checkinLine: string | null; onShowSources: (panel: QuotePanel) => void }) {
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
  const showSources = (item: BriefItem) =>
    onShowSources({
      title: item.text,
      subtitle: sourceLabel(item),
      quotes: item.citations.map((c, i) => ({ key: `${c.date}-${i}`, original: c.quoteOriginal, english: c.quoteEnglish, caption: `${formatDay(c.date)} · daily call` })),
    })

  return (
    <Card
      bordered={false}
      decor={
        <>
          <Blend name="summary-blend-1" size={576} top={-318} right={-223} />
          <Blend name="summary-blend-2" size={448} top={-168} right={-272} />
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text variant="heading">Pre-visit summary</Text>
        <Chip tone="periwinkle" icon="link-periwinkle" size={12}>AI-written · each line links to its source</Chip>
        <span style={{ flex: 1 }} />
        {/* Not in the design yet: regenerate runs the Elastic Workflow (C9). */}
        <Button variant="secondary" style={{ height: 36, padding: '0 14px', fontSize: 13 }} disabled={busy} onClick={() => void onGenerate()}>
          {busy ? 'Generating…' : 'Regenerate'}
        </Button>
      </div>
      {checkinLine && <Text color={theme.color.textMuted}>{checkinLine}</Text>}
      {error && <Text variant="muted">{`Couldn't generate the brief: ${error}`}</Text>}
      {brief === undefined && <Text variant="muted">Loading…</Text>}
      {brief === null && <Text variant="muted">No brief yet. Regenerate writes one from the check-ins.</Text>}
      {brief && !brief.sections && <Text>{brief.textEnglish}</Text>}
      {brief?.sections && (
        <>
          {brief.sections.overview && <Text>{brief.sections.overview}</Text>}
          {brief.sections.concerns.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{`•  ${item.text}`}</Text>
              {item.citations.length > 0 && (
                <Chip tone="white" icon="link-teal" size={12} onClick={() => showSources(item)}>
                  {sourceLabel(item)}
                </Chip>
              )}
            </div>
          ))}
          {brief.sections.topics.length > 0 && (
            <>
              <Divider />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Text variant="strong">Topics for review</Text>
                {brief.sections.topics.map((topic, i) => (
                  <Chip key={i} tone="primary" onClick={topic.citations.length ? () => showSources(topic) : undefined}>
                    {topic.text}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {brief && <Text variant="muted" style={{ font: `400 12px/1.45 ${theme.font.body}` }}>{`${formatDateTime(brief.createdAt)} · ${brief.source === 'elastic_workflow' ? 'Elastic Workflow' : brief.source}`}</Text>}
    </Card>
  )
}

/** C4 / H9: the side column with the quotes for the selected day or brief line. */
export function QuotesColumn({ panel, onClose }: { panel: QuotePanel | null; onClose: () => void }) {
  return (
    <section style={{ background: theme.color.surface, border: `1.5px solid ${theme.color.primary}`, borderRadius: theme.radius.md, padding: 24, display: 'grid', gap: 14, alignContent: 'start' }}>
      {panel ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
              <Text variant="subheading" style={{ font: `600 20px/1.15 ${theme.font.heading}` }}>{panel.title}</Text>
              {panel.subtitle && <Text variant="muted" style={{ font: `400 13px/1.45 ${theme.font.body}` }}>{panel.subtitle}</Text>}
            </div>
            <CloseButton onClick={onClose} />
          </div>
          {panel.quotes.length === 0 && <Text variant="muted">No quotes for this.</Text>}
          {panel.quotes.map((q) => (
            <div key={q.key} style={{ background: theme.color.periwinkleBg, borderRadius: 16, padding: '14px 16px', display: 'grid', gap: 6 }}>
              {q.language && (
                <span>
                  <Chip tone="white" size={11}>{q.language.toUpperCase()}</Chip>
                </span>
              )}
              <Text variant="quote">{`“${q.original}”`}</Text>
              {q.english && q.english !== q.original && <Text color={theme.color.textMuted} style={{ font: `400 15px/1.45 ${theme.font.body}` }}>{q.english}</Text>}
              {q.caption && <Text color={theme.color.placeholder} style={{ font: `400 12px/1.45 ${theme.font.body}` }}>{q.caption}</Text>}
            </div>
          ))}
        </>
      ) : (
        <>
          <Text variant="subheading">The patient's words</Text>
          <Text variant="muted">Click a bar on the timeline, or a source on the summary, to see what the patient said.</Text>
        </>
      )}
    </section>
  )
}

/** C3: one card per symptom; each field is the latest reported value or "Not reported". */
export function HistoryCards({ entries }: { entries: SymptomEntry[] }) {
  const bySymptom = new Map<string, SymptomEntry[]>()
  for (const e of entries) bySymptom.set(e.symptom, [...(bySymptom.get(e.symptom) ?? []), e])
  return (
    <>
      <Text variant="heading">History by symptom</Text>
      {bySymptom.size === 0 && <Text variant="muted">No symptoms reported yet.</Text>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {[...bySymptom].map(([symptom, list]) => {
          const rated = list.filter((e) => e.severity !== undefined) // newest first
          const latest = rated[0]?.severity
          const earliest = rated.at(-1)?.severity
          const severity =
            latest === undefined ? null : earliest !== undefined && earliest !== latest ? `${latest}/10 (${latest > earliest ? 'up' : 'down'} from ${earliest})` : `${latest}/10, steady`
          return (
            <Card key={symptom} padding={20} gap={10}>
              <Text variant="subheading">{capitalize(symptom)}</Text>
              {HISTORY_FIELDS.map(([field, label]) => {
                const value = list.find((e) => e[field])?.[field]
                return <Field key={field} label={label} value={value ?? null} />
              })}
              <Field label="Severity" value={severity} />
            </Card>
          )
        })}
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value: ReactNode | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Text variant="muted" style={{ width: 96, flexShrink: 0, font: `400 13px/1.45 ${theme.font.body}` }}>{label}</Text>
      {value ? <Text style={{ flex: 1, font: `500 14px/1.45 ${theme.font.body}` }}>{value}</Text> : <Chip dashed size={12}>Not reported</Chip>}
    </div>
  )
}

/** C5: the patient's questions in English, numbered, with how each was captured. */
export function Questions({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId })
  return (
    <Card padding={22} gap={0} style={{ paddingLeft: 24, paddingRight: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8 }}>
        <Text variant="heading">Patient's questions</Text>
        {questions && <Chip tone="primary" size={12}>{`${questions.length} · matches patient app`}</Chip>}
      </div>
      {questions === undefined && <Text variant="muted">Loading…</Text>}
      {questions?.length === 0 && <Text variant="muted">No questions yet.</Text>}
      {questions?.map((q, i) => (
        <div key={q._id}>
          {i > 0 && <Divider />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0' }}>
            <span style={{ width: 28, height: 28, borderRadius: 14, background: theme.color.primaryBg, color: theme.color.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 13px ${theme.font.body}`, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
              <Text style={{ font: `500 16px/1.45 ${theme.font.body}` }}>{q.textEnglish}</Text>
              {q.textOriginal !== q.textEnglish && <Text variant="muted">{q.textOriginal}</Text>}
            </span>
            {q.status !== 'open' && <Chip tone={q.status === 'answered' ? 'success' : 'neutral'} size={12}>{q.status === 'answered' ? 'answered' : 'carried over'}</Chip>}
            <Chip tone="neutral" icon={q.source === 'voice' ? 'mic-muted-14' : undefined} size={12}>{`${q.source} · ${formatDay(isoDay(q._creationTime))}`}</Chip>
          </div>
        </div>
      ))}
    </Card>
  )
}

/** C6: cross-language search over this patient's check-in quotes (hybrid + rerank in Elastic). */
/** Lowercase without accents, so "mareada" matches "Mareada" and "presion" matches "presión". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * C6 + C7 in one box: Ask the record (Elastic Agent Builder writes an answer with cited quotes and
 * "how this was found") and the patient's matching quotes (Elastic hybrid search: meaning across
 * languages plus exact words). Each quote is tagged "Exact match" when it contains the words typed.
 */
export function AskRecord({ patientId }: { patientId: Id<'patients'> }) {
  const ask = useAction(api.elastic.askRecord)
  const search = useAction(api.elastic.searchCheckins)
  const entries = useQuery(api.patients.symptomEntries, { patientId })
  // The agent cites quotes in the patient's language only; find each one's English from the record.
  const englishFor = (quote: string): string | null => {
    const q = fold(quote).replace(/[^a-z0-9 ]/g, '').trim()
    if (!q) return null
    const hit = entries?.find((e) => {
      const original = fold(e.quoteOriginal).replace(/[^a-z0-9 ]/g, '').trim()
      return original === q || original.includes(q) || q.includes(original)
    })
    return hit && hit.quoteEnglish !== hit.quoteOriginal ? hit.quoteEnglish : null
  }
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState<FunctionReturnType<typeof api.elastic.askRecord> | null>(null)
  const [quotes, setQuotes] = useState<FunctionReturnType<typeof api.elastic.searchCheckins> | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [busy, setBusy] = useState({ answer: false, quotes: false })

  const onAsk = () => {
    const q = question.trim()
    if (!q) return
    setAsked(q)
    setAnswer(null)
    setQuotes(null)
    setAnswerError(null)
    setBusy({ answer: true, quotes: true })
    // Both run at once; the quotes usually come back first.
    void search({ patientId, query: q })
      .then(setQuotes)
      .catch(() => setQuotes([]))
      .finally(() => setBusy((b) => ({ ...b, quotes: false })))
    void ask({ patientId, question: q })
      .then(setAnswer)
      .catch((e: unknown) => setAnswerError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy((b) => ({ ...b, answer: false })))
  }

  const words = fold(asked).split(/\s+/).filter((w) => w.length > 2)
  const exact = (text: string) => words.length > 0 && words.every((w) => fold(text).includes(w))
  const sorted = quotes ? [...quotes].sort((a, b) => Number(exact(b.quoteOriginal) || exact(b.quoteEnglish)) - Number(exact(a.quoteOriginal) || exact(a.quoteEnglish))) : null

  return (
    <Card padding={24} gap={12}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text variant="heading">Ask the record</Text>
        <Chip tone="periwinkle" size={12}>Elastic</Chip>
      </div>
      <Text variant="muted">Ask a question or search a word, in English or Spanish.</Text>
      <TextField value={question} onChange={setQuestion} onSubmit={onAsk} busy={busy.answer && busy.quotes} placeholder='e.g. "When did the dizziness start?"' submitLabel="Ask" />

      {asked && (
        <>
          <Text variant="label">Answer</Text>
          {busy.answer && <Text variant="muted">Elastic agent is reading the record…</Text>}
          {answerError && <Text variant="muted">{`Could not get an answer: ${answerError}`}</Text>}
          {answer && (
            <>
              <Text>{answer.answer}</Text>
              {answer.citations.map((c, i) => (
                <div key={i} style={{ background: theme.color.bg, borderRadius: 14, padding: '12px 16px', display: 'grid', gap: 4 }}>
                  <Text variant="quote">{`“${c.quote}”`}</Text>
                  {englishFor(c.quote) && <Text variant="muted">{englishFor(c.quote)}</Text>}
                  {c.date && <Text color={theme.color.placeholder} style={{ font: `400 12px/1.45 ${theme.font.body}` }}>{formatDay(c.date)}</Text>}
                </div>
              ))}
              {answer.steps.length > 0 && (
                <details>
                  <summary style={{ cursor: 'pointer' }}><Text variant="link" style={{ display: 'inline' }}>How this was found</Text></summary>
                  {answer.steps.map((s, i) => <Text key={i} variant="muted">{s}</Text>)}
                </details>
              )}
            </>
          )}

          <Text variant="label" style={{ marginTop: 8 }}>{sorted ? `Matching quotes · ${sorted.length}` : 'Matching quotes'}</Text>
          {busy.quotes && <Text variant="muted">Searching…</Text>}
          {sorted?.length === 0 && <Text variant="muted">No quotes match.</Text>}
          {sorted?.map((r) => {
            const isExact = exact(r.quoteOriginal) || exact(r.quoteEnglish)
            return (
              <div key={r.symptomEntryId} style={{ background: theme.color.bg, borderRadius: 14, padding: '12px 16px', display: 'grid', gap: 4 }}>
                <span><Chip tone={isExact ? 'primary' : 'periwinkle'} size={11}>{isExact ? 'Exact match' : 'Similar meaning'}</Chip></span>
                <Text variant="quote">{`“${r.quoteOriginal}”`}</Text>
                {r.quoteEnglish !== r.quoteOriginal && <Text variant="muted">{r.quoteEnglish}</Text>}
                <Text color={theme.color.placeholder} style={{ font: `400 12px/1.45 ${theme.font.body}` }}>{`${formatDay(r.date)} · daily call · ${r.symptom}`}</Text>
              </div>
            )
          })}
        </>
      )}
    </Card>
  )
}
