import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../../../convex/_generated/api'
import { formatDay, formatTime } from '../../format'

type SymptomEntry = FunctionReturnType<typeof api.patients.symptomEntries>[number]

/** A quote shown in the side column: original, English, and when. */
export type Quote = { key: string; original: string; english: string; language?: string; caption?: string }
/** What the side column shows: a timeline day or a brief line's sources. */
export type QuotePanel = { title: string; subtitle?: string; quotes: Quote[] }

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

/** The quotes for one symptom on one day, for the side column. */
export function dayPanel(entries: SymptomEntry[], conversations: { _id: string; startedAt: number }[] | undefined, symptom: string, date: string): QuotePanel {
  const list = entries.filter((e) => e.symptom === symptom && e.date === date)
  const severity = list.find((e) => e.severity !== undefined)?.severity
  const call = conversations?.find((c) => c._id === list[0]?.conversationId)
  return {
    title: `${capitalize(symptom)} · ${formatDay(date)}`,
    subtitle: [severity !== undefined ? `Severity ${severity}/10` : null, call ? `daily call ${formatTime(call.startedAt)}` : null].filter(Boolean).join(' · '),
    quotes: list.map((e) => ({ key: e._id, original: e.quoteOriginal, english: e.quoteEnglish, language: e.quoteOriginal !== e.quoteEnglish ? 'es' : undefined })),
  }
}

