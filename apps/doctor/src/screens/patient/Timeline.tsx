// C2 symptom timeline (Figma 6.3): one row of daily bars per symptom (max severity 0–10 from
// Elastic), a dot row per medicine (taken / missed), red-flag days in red, and the selected bar in
// ink. Clicking a bar opens that day's quotes in the side column (H9).
// elastic.timeline is an action (not reactive), so it is re-fetched whenever the patient's processed
// conversations change. Track A indexes before marking a call processed.
import { useEffect, useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Card, Chip, Text } from '../../components'
import { formatDay, isoDay } from '../../format'
import { theme } from '../../theme'
import { useNow } from '../../useNow'

type Result = FunctionReturnType<typeof api.elastic.timeline>
export type Selection = { symptom: string; date: string }

const BAR = 'rgba(8, 125, 141, 0.55)'
const BAR_HEIGHT = 80
const LABEL_WIDTH = 170
const AXIS_LABELS = 5

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

export default function Timeline({ patientId, selected, onSelect }: { patientId: Id<'patients'>; selected: Selection | null; onSelect: (selection: Selection) => void }) {
  const conversations = useQuery(api.patients.conversations, { patientId })
  const medications = useQuery(api.patients.medicationEvents, { patientId })
  const alerts = useQuery(api.alerts.listForPatient, { patientId })
  const fetchTimeline = useAction(api.elastic.timeline)
  const now = useNow()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshKey = conversations
    ?.filter((c) => c.status === 'processed')
    .map((c) => c._id)
    .join(',')

  useEffect(() => {
    if (refreshKey === undefined) return
    let cancelled = false
    fetchTimeline({ patientId, days: 14 })
      .then((r) => {
        if (!cancelled) {
          setResult(r)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, patientId, fetchTimeline])

  const days = useMemo(() => result?.series[0]?.points.map((p) => p.date) ?? [], [result])
  // A red-flag day for a symptom: an alert that day whose symptom names it (either way round).
  const alertDays = useMemo(() => (alerts ?? []).map((a) => ({ day: isoDay(a.createdAt), symptom: a.symptom.toLowerCase() })), [alerts])
  const isRedFlag = (symptom: string, day: string) =>
    alertDays.some((a) => a.day === day && (a.symptom.includes(symptom.toLowerCase()) || symptom.toLowerCase().includes(a.symptom)))

  // Medicine rows: each medicine (and time of day, when app taps give one) seen in the window.
  const medRows = useMemo(() => {
    const inWindow = (medications ?? []).filter((m) => days.includes(m.date) && (m.action === 'taken' || m.action === 'missed'))
    const keys = [...new Set(inWindow.map((m) => `${m.medication}|${m.slot ?? ''}`))]
    return keys.map((key) => {
      const [medication, slot] = key.split('|')
      const label = `${capitalize(medication)}${slot === 'morning' ? ' AM' : slot === 'evening' || slot === 'bedtime' ? ' PM' : ''}`
      const byDay = new Map<string, 'taken' | 'missed'>()
      for (const m of inWindow.filter((m) => m.medication === medication && (m.slot ?? '') === slot)) {
        if (m.action === 'missed' || !byDay.has(m.date)) byDay.set(m.date, m.action as 'taken' | 'missed')
      }
      return { key, label, byDay }
    })
  }, [medications, days])

  const today = isoDay(now)
  const axis = days.length ? Array.from({ length: AXIS_LABELS }, (_, i) => days[Math.round((i * (days.length - 1)) / (AXIS_LABELS - 1))]) : []

  return (
    <Card gap={16}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <Text variant="heading">Symptom timeline</Text>
        <Text variant="muted">Severity 0–10 · last 14 days</Text>
      </div>
      {error && <Text variant="muted">{`Timeline unavailable: ${error}`}</Text>}
      {!error && result === null && <Text variant="muted">Loading…</Text>}
      {result?.series.length === 0 && <Text variant="muted">No check-ins yet.</Text>}

      {result?.series.map((s) => {
        const rated = s.points.filter((p) => p.severity !== null)
        const first = rated[0]?.severity
        const last = rated.at(-1)?.severity
        const trend =
          rated.length < 2 || first == null || last == null ? `New · ${rated[0] ? formatDay(rated[0].date) : ''}` : last > first ? `Worse · ${first} → ${last}` : last < first ? `Better · ${first} → ${last}` : `Same · ~${last}`
        return (
          <div key={s.symptom} style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <div style={{ width: LABEL_WIDTH, flexShrink: 0, display: 'grid', gap: 2 }}>
              <Text style={{ font: `600 16px/1.45 ${theme.font.body}` }}>{capitalize(s.symptom)}</Text>
              <Text variant="muted" style={{ font: `400 13px/1.45 ${theme.font.body}` }}>{trend}</Text>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8, height: BAR_HEIGHT }}>
              {s.points.map((p) => {
                const isSelected = selected?.symptom === s.symptom && selected.date === p.date
                const color = p.severity === null ? theme.color.border : isSelected ? theme.color.text : isRedFlag(s.symptom, p.date) ? theme.color.danger : BAR
                return (
                  <button
                    key={p.date}
                    title={`${formatDay(p.date)}: ${p.severity === null ? 'not reported' : `${p.severity}/10`}`}
                    disabled={p.severity === null}
                    onClick={() => onSelect({ symptom: s.symptom, date: p.date })}
                    style={{ flex: 1, minWidth: 0, height: p.severity === null ? 4 : Math.max(8, (p.severity / 10) * BAR_HEIGHT), background: color, border: 'none', borderRadius: '4px 4px 0 0', padding: 0, cursor: p.severity === null ? 'default' : 'pointer' }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      {result && result.series.length > 0 &&
        medRows.map((row) => (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Text variant="muted" style={{ width: LABEL_WIDTH, flexShrink: 0, font: `500 14px/1.45 ${theme.font.body}` }}>{row.label}</Text>
            <div style={{ flex: 1, display: 'flex', gap: 8 }}>
              {days.map((d) => {
                const state = row.byDay.get(d)
                return (
                  <span key={d} title={`${formatDay(d)}: ${state ?? 'not reported'}`} style={{ flex: 1, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: state ? 12 : 6, height: state ? 12 : 6, borderRadius: '50%', boxSizing: 'border-box', background: state === 'taken' ? theme.color.primary : state ? theme.color.surface : theme.color.border, border: state === 'missed' ? '1.5px solid #ff8a73' : 'none' }} />
                  </span>
                )
              })}
            </div>
          </div>
        ))}

      {axis.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: LABEL_WIDTH + 16 }}>
          {axis.map((d, i) => (
            <Text key={`${d}-${i}`} variant="muted" style={{ font: `400 13px/1.45 ${theme.font.body}` }}>{d === today ? 'Today' : formatDay(d)}</Text>
          ))}
        </div>
      )}

      {result && result.series.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selected ? <Chip tone="ink" size={12}>{`Selected: ${capitalize(selected.symptom)} · ${formatDay(selected.date)}`}</Chip> : <Chip tone="neutral" size={12}>Click a bar to see the patient's words</Chip>}
          {alertDays.length > 0 && <Chip tone="danger" size={12}>Red-flag day</Chip>}
          {medRows.length > 0 && <Chip tone="primary" size={12}>{'●  taken   ○  missed'}</Chip>}
        </div>
      )}
    </Card>
  )
}
