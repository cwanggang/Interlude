// The visit view (Figma 6.6 processing, 6.7 review, 6.8 release confirm; H10–H13). Processing steps;
// attention cards (D4 questions answered, D5 symptoms not discussed); the transcript with speakers
// (D2) beside the summary in English and Spanish (D3); the release bar and confirm (D6). Recording
// and upload (6.5, D1) live in LiveVisit.tsx. Processing is Track A's; this only reads visits and
// calls the contract.
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Button, Card, Chip, Icon, Link, Modal, Screen, Text } from '../../components'
import { formatDay, isoDay } from '../../format'
import { theme } from '../../theme'

type Visit = NonNullable<FunctionReturnType<typeof api.visits.getByAppointment>>
type Entry = FunctionReturnType<typeof api.patients.symptomEntries>[number]

/**
 * VisitSummary v2 (SPEC.md "Visit summary JSON v2"). Visits store it as v.any(), and summaries
 * written before block A2 use v1 (plain strings, no times_of_day), so every v2 field is optional
 * and list items may be strings.
 */
type Item = string | { text: string; source_turn?: number }
type VisitSummary = {
  assessment?: string
  medications?: { key?: string; name: string; dose: string; schedule: string; purpose: string; change?: 'new' | 'changed' | 'same' | 'stopped'; source_turn?: number }[]
  instructions?: Item[]
  tests_ordered?: Item[]
  follow_up?: string
  warning_signs?: string[]
}

const itemText = (item: Item) => (typeof item === 'string' ? item : item.text)
const itemTurn = (item: Item) => (typeof item === 'string' ? undefined : item.source_turn)

const STEPS = ['uploaded', 'transcribed', 'summarized'] as const

const LABELS = {
  en: { language: 'English', meds: 'MEDICATIONS', instructions: 'INSTRUCTIONS', followUp: 'FOLLOW-UP & TESTS', warnings: 'WARNING SIGNS', change: { new: 'New', changed: 'Changed', stopped: 'Stopped' } as Record<string, string> },
  es: { language: 'Spanish', meds: 'MEDICAMENTOS', instructions: 'INDICACIONES', followUp: 'SEGUIMIENTO Y EXÁMENES', warnings: 'SEÑALES DE ALERTA', change: { new: 'Nuevo', changed: 'Cambió', stopped: 'Suspendido' } as Record<string, string> },
}

export default function VisitView({ appointmentId, scheduledAt, patientName, patientLanguage, entries, onShowSymptom }: { appointmentId: Id<'appointments'>; scheduledAt: number; patientName: string; patientLanguage: 'en' | 'es'; entries: Entry[]; onShowSymptom: (symptom: string) => void }) {
  const visit = useQuery(api.visits.getByAppointment, { appointmentId })
  const [highlight, setHighlight] = useState<number | null>(null)

  if (visit === undefined) return <Screen><Text variant="muted">Loading…</Text></Screen>
  if (visit === null) return <Screen><Card><Text variant="muted">No visit recorded yet. Use Start visit or Upload recording above.</Text></Card></Screen>

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
      <Screen>
        {!summarized && <Processing visit={visit} scheduledAt={scheduledAt} />}
        {summarized && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <QuestionsCard appointmentId={appointmentId} />
            <UndiscussedCard visit={visit} entries={entries} onShowSymptom={onShowSymptom} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: summarized ? '0 1 560px' : '1 1 480px', minWidth: 320 }}>
            <Transcript visit={visit} highlight={highlight} />
          </div>
          <div style={{ flex: '1 1 480px', minWidth: 320, alignSelf: 'stretch' }}>
            {english ? (
              <Summary english={english} patientLang={patientLanguage === 'en' ? undefined : patientLang} onShowTurn={showTurn} />
            ) : (
              <div style={{ height: '100%', minHeight: 320, boxSizing: 'border-box', background: theme.color.bg, border: '1px dashed #9ab0ba', borderRadius: theme.radius.md, padding: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <span style={{ width: 64, height: 64, borderRadius: 32, background: theme.color.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="clock-teal-30" size={30} />
                </span>
                <Text variant="subheading" color={theme.color.textMuted}>Summary appears after transcription</Text>
                <Text color={theme.color.placeholder} style={{ font: `400 14px/1.45 ${theme.font.body}` }}>English and Spanish, medications first.</Text>
              </div>
            )}
          </div>
        </div>
      </Screen>
      {summarized && <ReleaseBar visit={visit} appointmentId={appointmentId} patientName={patientName} patientLanguage={patientLanguage} />}
    </>
  )
}

/** 6.6: "Visit on Nov 5 · processing" with Uploaded → Transcribed → Summarized. */
function Processing({ visit, scheduledAt }: { visit: Visit; scheduledAt: number }) {
  const reached = STEPS.indexOf(visit.status as (typeof STEPS)[number])
  return (
    <Card padding={26} gap={12}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Text variant="heading" style={{ flex: 1 }}>{`Visit on ${formatDay(isoDay(scheduledAt))} · ${visit.status === 'failed' ? 'processing failed' : 'processing'}`}</Text>
        <Steps reached={reached} failed={visit.status === 'failed'} />
      </div>
      <Text color={theme.color.textMuted} style={{ font: `400 15px/1.45 ${theme.font.body}` }}>
        {visit.status === 'failed' ? 'Processing failed. Upload the recording again from Start visit.' : "You can leave this page; we'll fill it in as each step finishes."}
      </Text>
    </Card>
  )
}

function Steps({ reached, failed }: { reached: number; failed: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {STEPS.map((step, i) => {
        const done = i <= reached
        const current = !failed && i === reached + 1
        return (
          <span key={step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {i > 0 && <span style={{ width: 40, height: 2, background: done || current ? theme.color.primary : theme.color.border }} />}
            {done ? (
              <span style={{ width: 28, height: 28, borderRadius: 14, background: theme.color.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check-white-14" size={14} /></span>
            ) : current ? (
              <span style={{ width: 28, height: 28, borderRadius: 14, boxSizing: 'border-box', background: theme.color.primaryBg, border: `2px solid ${theme.color.primary}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="loader-teal-14" size={14} /></span>
            ) : (
              <span style={{ width: 28, height: 28, borderRadius: 14, boxSizing: 'border-box', background: theme.color.surface, border: `2px solid ${theme.color.border}` }} />
            )}
            <Text style={{ font: `${done || current ? 600 : 400} 14px/1.45 ${theme.font.body}` }} color={done || current ? theme.color.text : theme.color.placeholder}>{step[0].toUpperCase() + step.slice(1)}</Text>
          </span>
        )
      })}
    </div>
  )
}

/** D4: "2 of 3 questions answered", the unanswered ones, and the evidence for the answered. */
function QuestionsCard({ appointmentId }: { appointmentId: Id<'appointments'> }) {
  const questions = useQuery(api.questions.listForAppointment, { appointmentId })
  const [showEvidence, setShowEvidence] = useState(false)
  if (!questions) return null
  const answered = questions.filter((q) => q.status === 'answered')
  const unanswered = questions.filter((q) => q.status !== 'answered')
  return (
    <Card tone="periwinkle" padding={22} gap={8} style={{ flex: '1 1 420px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: theme.color.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="chat-periwinkle-20" size={20} /></span>
        <Text variant="subheading" style={{ font: `600 20px/1.15 ${theme.font.heading}` }}>{questions.length ? `${answered.length} of ${questions.length} questions answered` : 'No questions from the patient'}</Text>
      </div>
      {unanswered.map((q) => (
        <Text key={q._id} style={{ font: `400 15px/1.45 ${theme.font.body}` }}>{`Not answered: “${q.textEnglish}” → carries over to the next visit.`}</Text>
      ))}
      {answered.length > 0 && <Link onClick={() => setShowEvidence(!showEvidence)}>{showEvidence ? 'Hide transcript evidence' : `See transcript evidence for the ${answered.length} answered`}</Link>}
      {showEvidence &&
        answered.map((q) => (
          <div key={q._id} style={{ background: theme.color.surface, borderRadius: 14, padding: '10px 14px', display: 'grid', gap: 2 }}>
            <Text variant="strong">{q.textEnglish}</Text>
            {q.answerEvidence && <Text variant="muted">{`“${q.answerEvidence}”`}</Text>}
          </div>
        ))}
    </Card>
  )
}

/** D5: symptoms reported since the last visit that the visit never discussed (Track A computes it). */
function UndiscussedCard({ visit, entries, onShowSymptom }: { visit: Visit; entries: Entry[]; onShowSymptom: (symptom: string) => void }) {
  const list = visit.unaddressedSymptoms
  if (list === undefined) {
    return (
      <Card tone="coral" padding={22} gap={8} style={{ flex: '1 1 420px' }}>
        <Text variant="subheading" style={{ font: `600 20px/1.15 ${theme.font.heading}` }}>Symptoms not discussed</Text>
        <Text variant="muted">Not checked for this visit.</Text>
      </Card>
    )
  }
  return (
    <Card tone="coral" padding={22} gap={8} style={{ flex: '1 1 420px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: theme.color.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="alert-coral-20" size={20} /></span>
        <Text variant="subheading" style={{ font: `600 20px/1.15 ${theme.font.heading}` }}>
          {list.length ? `${list.length} symptom${list.length === 1 ? '' : 's'} not discussed: ${list.map((s) => s.symptom).join(', ')}` : 'Every reported symptom was discussed'}
        </Text>
      </div>
      {list.map((s) => {
        const days = new Set(entries.filter((e) => e.symptom === s.symptom).map((e) => e.date)).size
        return (
          <div key={s.symptom} style={{ display: 'grid', gap: 4 }}>
            <Text style={{ font: `400 15px/1.45 ${theme.font.body}` }}>
              {`${s.symptom[0].toUpperCase()}${s.symptom.slice(1)}: reported on ${days} check-in${days === 1 ? '' : 's'}${s.lastSeverity !== undefined ? ` (last ${s.lastSeverity}/10, ${formatDay(s.lastDate)})` : ''}, not mentioned in the visit.`}
            </Text>
            <Link onClick={() => onShowSymptom(s.symptom)}>Show in timeline</Link>
          </div>
        )
      })}
    </Card>
  )
}

/** D2: transcript with speaker chips; the patient's own words first, English underneath. */
function Transcript({ visit, highlight }: { visit: Visit; highlight: number | null }) {
  const turns = visit.transcript ?? []
  const tone = (speaker: string) => (speaker === 'doctor' ? 'primary' : speaker === 'interpreter' ? 'periwinkle' : 'solid') as 'primary' | 'periwinkle' | 'solid'
  return (
    <Card padding={26} gap={14}>
      <Text variant="heading">Transcript</Text>
      {turns.length > 0 && <Text variant="muted" style={{ font: `400 13px/1.45 ${theme.font.body}` }}>{`${turns.length} turns · speakers labeled`}</Text>}
      <div style={{ display: 'grid', gap: 14, maxHeight: 640, overflowY: 'auto' }}>
        {turns.map((turn, i) => {
          const patientSide = turn.speaker !== 'doctor'
          const main = patientSide ? turn.textPatientLang : turn.textEnglish
          const second = patientSide ? turn.textEnglish : turn.textPatientLang
          return (
            <div key={i} id={`turn-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 4, borderRadius: 10, background: i === highlight ? theme.color.primaryBg : undefined }}>
              <span style={{ width: 96, flexShrink: 0 }}><Chip tone={tone(turn.speaker)} size={12}>{turn.speaker[0].toUpperCase() + turn.speaker.slice(1)}</Chip></span>
              <span style={{ flex: 1, display: 'grid', gap: 2 }}>
                <Text style={{ font: `400 15px/1.45 ${theme.font.body}` }}>{main}</Text>
                {turn.speaker === 'patient' && second !== main && <Text variant="muted">{second}</Text>}
              </span>
            </div>
          )
        })}
        {/* Skeleton rows while the transcript is still being written (6.6). */}
        {visit.status === 'uploaded' &&
          Array.from({ length: 5 }, (_, i) => (
            <div key={`s${i}`} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 90, height: 24, borderRadius: 12, background: theme.color.bg }} />
              <span style={{ flex: 1, height: 14, borderRadius: 7, background: theme.color.bg }} />
            </div>
          ))}
      </div>
    </Card>
  )
}

type SummaryMode = 'both' | 'en' | 'patient'

/** D3: medications first; English and Spanish side by side, or one at a time. */
function Summary({ english, patientLang, onShowTurn }: { english: VisitSummary; patientLang?: VisitSummary; onShowTurn: (turn: number | undefined) => void }) {
  const [mode, setMode] = useState<SummaryMode>('both')
  const columns: ['en' | 'es', VisitSummary][] = !patientLang || mode === 'en' ? [['en', english]] : mode === 'patient' ? [['es', patientLang]] : [['en', english], ['es', patientLang]]
  return (
    <Card padding={26} gap={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Text variant="heading" style={{ flex: 1 }}>Visit summary</Text>
        {patientLang && (
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: theme.radius.pill, background: theme.color.bg }}>
            {(['both', 'en', 'patient'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ height: 34, padding: '0 14px', borderRadius: theme.radius.pill, border: 'none', background: mode === m ? theme.color.primary : 'transparent', color: mode === m ? theme.color.primaryText : theme.color.textMuted, font: `${mode === m ? 700 : 500} 13px ${theme.font.body}`, cursor: 'pointer' }}>
                {m === 'both' ? 'Side by side' : m === 'en' ? 'English' : 'Spanish'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, gap: 20 }}>
        {columns.map(([lang, summary]) => (
          <SummaryColumn key={lang} lang={lang} summary={summary} onShowTurn={onShowTurn} />
        ))}
      </div>
    </Card>
  )
}

function SummaryColumn({ lang, summary, onShowTurn }: { lang: 'en' | 'es'; summary: VisitSummary; onShowTurn: (turn: number | undefined) => void }) {
  const l = LABELS[lang]
  const followUp = [summary.follow_up, ...(summary.tests_ordered ?? []).map(itemText)].filter(Boolean).join(' ')
  return (
    <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <span><Chip tone={lang === 'en' ? 'primary' : 'periwinkle'} icon={lang === 'en' ? 'globe-teal-14' : 'globe-periwinkle-14'} size={12}>{l.language}</Chip></span>
      <Text variant="label">{l.meds}</Text>
      {(summary.medications ?? []).map((m, i) => (
        <button key={m.key ?? i} onClick={() => onShowTurn(m.source_turn)} style={{ textAlign: 'left', border: 'none', cursor: m.source_turn !== undefined ? 'pointer' : 'default', background: theme.color.bg, borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 2 }}>
          <Text style={{ font: `700 15px/1.45 ${theme.font.body}` }}>{`${m.name} ${m.dose}${m.change && m.change !== 'same' ? ` · ${l.change[m.change] ?? m.change}` : ''}`}</Text>
          <Text variant="muted">{[m.schedule, m.purpose].filter(Boolean).join(' · ')}</Text>
        </button>
      ))}
      {(summary.instructions ?? []).length > 0 && <Text variant="label">{l.instructions}</Text>}
      {(summary.instructions ?? []).map((item, i) => (
        <Bullet key={i} text={itemText(item)} onClick={itemTurn(item) !== undefined ? () => onShowTurn(itemTurn(item)) : undefined} />
      ))}
      {followUp && (
        <>
          <Text variant="label">{l.followUp}</Text>
          <Text style={{ font: `400 14px/1.45 ${theme.font.body}` }}>{followUp}</Text>
        </>
      )}
      {(summary.warning_signs ?? []).length > 0 && <Text variant="label">{l.warnings}</Text>}
      {(summary.warning_signs ?? []).map((w, i) => (
        <Bullet key={i} text={w} color="#b4462f" />
      ))}
    </div>
  )
}

function Bullet({ text, color, onClick }: { text: string; color?: string; onClick?: () => void }) {
  return (
    <Text style={{ font: `400 14px/1.45 ${theme.font.body}`, whiteSpace: 'pre-wrap', cursor: onClick ? 'pointer' : 'default' }} color={color}>
      <span onClick={onClick}>{`•  ${text}`}</span>
    </Text>
  )
}

/** D6: sticky release bar and the 6.8 confirm; releasing also marks the appointment completed. */
function ReleaseBar({ visit, appointmentId, patientName, patientLanguage }: { visit: Visit; appointmentId: Id<'appointments'>; patientName: string; patientLanguage: 'en' | 'es' }) {
  const release = useMutation(api.visits.release)
  const markCompleted = useMutation(api.appointments.markCompleted)
  const questions = useQuery(api.questions.listForAppointment, { appointmentId })
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = patientName.split(' ')[0]
  const language = patientLanguage === 'es' ? 'Spanish' : 'English'
  const unanswered = questions?.filter((q) => q.status !== 'answered').length ?? 0

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
    <>
      <div style={{ position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 16, padding: `18px ${theme.space.xxl}px`, background: theme.color.surface, borderTop: `1px solid ${theme.color.border}` }}>
        <Icon name="globe-muted-20" size={20} />
        <Text color={theme.color.textMuted} style={{ flex: 1, font: `400 15px/1.45 ${theme.font.body}` }}>
          {visit.releasedToPatient ? `${first} can see this summary in ${language}.` : `${first} will see this summary in ${language}. Check the 2 cards above before releasing.`}
        </Text>
        {error && <Text variant="muted">{error}</Text>}
        {visit.releasedToPatient ? (
          <Chip tone="success" icon="check-green-14" size={14}>{`Released${visit.releasedAt ? ` ${formatDay(isoDay(visit.releasedAt))}` : ''}`}</Chip>
        ) : (
          <Button size="lg" icon="send-white" onClick={() => setConfirming(true)}>Release to patient</Button>
        )}
      </div>
      {confirming && (
        <Modal onClose={() => setConfirming(false)}>
          <span style={{ width: 56, height: 56, borderRadius: 28, background: theme.color.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="send-teal-26" size={26} /></span>
          <Text style={{ font: `600 26px/1.15 ${theme.font.heading}` }}>{`Release summary to ${first}?`}</Text>
          <Text color={theme.color.textMuted}>{`${first} will see this summary in ${language}. Their My Visit tab switches from "Your doctor is reviewing" to the summary, and they get a notification.`}</Text>
          {unanswered > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: theme.color.periwinkleBg }}>
              <Icon name="chat-periwinkle-18" size={18} />
              <Text style={{ font: `400 14px/1.45 ${theme.font.body}` }}>{`${unanswered} unanswered question${unanswered === 1 ? '' : 's'} will carry over to the next visit.`}</Text>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button icon="send-white" onClick={() => void onRelease()}>Release to patient</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
