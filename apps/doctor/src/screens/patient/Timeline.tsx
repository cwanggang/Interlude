// C2: daily max severity per symptom from Elastic, with medication markers.
// elastic.timeline is an action (not reactive), so it is re-fetched whenever the patient's
// processed conversations change. Track A indexes before marking a call processed.
import { useEffect, useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { Card, Text } from '../../components'
import { formatDay } from '../../format'
import { theme } from '../../theme'

type Series = FunctionReturnType<typeof api.elastic.timeline>
type Row = { date: string } & Record<string, number | null | string>

export default function Timeline({ patientId, selectedDate, onSelectDate }: { patientId: Id<'patients'>; selectedDate: string | null; onSelectDate: (date: string | null) => void }) {
  const conversations = useQuery(api.patients.conversations, { patientId })
  const medications = useQuery(api.patients.medicationEvents, { patientId })
  const fetchTimeline = useAction(api.elastic.timeline)
  const [series, setSeries] = useState<Series | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshKey = conversations
    ?.filter((c) => c.status === 'processed')
    .map((c) => c._id)
    .join(',')

  useEffect(() => {
    if (refreshKey === undefined) return
    let cancelled = false
    fetchTimeline({ patientId, days: 14 })
      .then((s) => {
        if (!cancelled) {
          setSeries(s)
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

  const rows = useMemo<Row[]>(() => {
    if (!series) return []
    const byDate = new Map<string, Row>()
    for (const s of series) {
      for (const p of s.points) {
        const row = byDate.get(p.date) ?? { date: p.date }
        row[s.symptom] = p.severity
        byDate.set(p.date, row)
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [series])

  const dates = new Set(rows.map((r) => r.date))
  const markers = (medications ?? []).filter((m) => dates.has(m.date) && m.action !== 'taken')

  return (
    <Card
      title="Symptom timeline (0–10)"
      actions={selectedDate && <Text variant="muted">Showing quotes for {formatDay(selectedDate)} · <a href="#" onClick={(e) => { e.preventDefault(); onSelectDate(null) }}>clear</a></Text>}
    >
      {error && <Text variant="muted">Timeline unavailable: {error}</Text>}
      {!error && series === null && <Text variant="muted">Loading…</Text>}
      {series?.length === 0 && <Text variant="muted">No check-ins yet.</Text>}
      {rows.length > 0 && (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart
              data={rows}
              onClick={(state) => {
                const label = state?.activeLabel
                if (label != null) onSelectDate(String(label))
              }}
            >
              <CartesianGrid stroke={theme.color.border} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatDay} />
              <YAxis domain={[0, 10]} allowDecimals={false} />
              <Tooltip labelFormatter={(label) => formatDay(String(label))} />
              <Legend />
              {markers.map((m) => (
                <ReferenceLine
                  key={m._id}
                  x={m.date}
                  stroke={theme.color.textMuted}
                  strokeDasharray="4 4"
                  label={{ value: `${m.medication} ${m.action}`, position: 'insideTopLeft', fontSize: theme.font.size.sm }}
                />
              ))}
              {series?.map((s, i) => (
                <Line
                  key={s.symptom}
                  dataKey={s.symptom}
                  stroke={theme.chart[i % theme.chart.length]}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
