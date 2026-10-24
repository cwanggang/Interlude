// Patients (Figma 6.2; C1, H6): search, filter chips (All, Alerts, Today, Spanish), and the table:
// name, next appointment, reason, language, alert, and the "new since last viewed" dot. Alerts are
// pinned first, then soonest appointment. Live via Convex, so it updates when a call finishes.
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Avatar, Chip, CountBadge, Dot, Screen, SearchField, Text } from '../components'
import { daysFrom, formatTime } from '../format'
import { theme } from '../theme'
import { useNow } from '../useNow'

type Filter = 'all' | 'alerts' | 'today' | 'spanish'

const COLUMNS = ['NAME', 'NEXT APPOINTMENT', 'REASON', 'LANGUAGE', 'ALERT', 'NEW']
// Columns share the width and shrink together; below TABLE_MIN the table scrolls sideways
// inside its card instead of squeezing text on top of each other.
const GRID = 'minmax(190px, 1.3fr) minmax(140px, 1fr) minmax(170px, 1.6fr) 120px minmax(130px, 1fr) 44px'
const TABLE_MIN = 900
const cell = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const

function appointmentLabel(ms: number, now: number): string {
  const days = daysFrom(ms, now)
  if (days === 0) return `Today ${formatTime(ms)}`
  if (days === 1) return `Tomorrow ${formatTime(ms)}`
  if (days > 1 && days < 7) return `${new Date(ms).toLocaleDateString(undefined, { weekday: 'short' })} ${formatTime(ms)}`
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PatientList({ onSelect }: { onSelect: (patientId: Id<'patients'>) => void }) {
  const now = useNow()
  const rows = useQuery(api.patients.list)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const all = rows ?? []
  const counts: Record<Filter, number> = {
    all: all.length,
    alerts: all.filter((r) => r.openAlerts > 0).length,
    today: all.filter((r) => r.nextAppointment && daysFrom(r.nextAppointment.scheduledAt, now) === 0).length,
    spanish: all.filter((r) => r.patient.language === 'es').length,
  }
  const needle = query.trim().toLowerCase()
  const shown = all.filter((r) => {
    if (needle && !r.patient.name.toLowerCase().includes(needle)) return false
    if (filter === 'alerts') return r.openAlerts > 0
    if (filter === 'today') return !!r.nextAppointment && daysFrom(r.nextAppointment.scheduledAt, now) === 0
    if (filter === 'spanish') return r.patient.language === 'es'
    return true
  })

  return (
    <Screen gap={20}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Text variant="display" style={{ flex: 1 }}>Patients</Text>
        <SearchField value={query} onChange={setQuery} placeholder="Search patients…" width={420} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'alerts', 'today', 'spanish'] as const).map((f) => {
          const on = f === filter
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ height: 36, padding: '0 16px', borderRadius: theme.radius.pill, border: on ? 'none' : `1px solid ${theme.color.border}`, background: on ? theme.color.primary : theme.color.surface, color: on ? theme.color.primaryText : theme.color.text, font: `600 14px ${theme.font.body}`, cursor: 'pointer', whiteSpace: 'pre' }}
            >
              {`${f[0].toUpperCase()}${f.slice(1)}  ·  ${counts[f]}`}
            </button>
          )
        })}
      </div>

      <div style={{ background: theme.color.surface, border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md, overflowX: 'auto' }}>
        <div style={{ minWidth: TABLE_MIN }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, alignItems: 'center', padding: '16px 24px', background: theme.color.bg }}>
            {COLUMNS.map((label) => (
              <Text key={label} variant="label" style={cell}>{label}</Text>
            ))}
          </div>
          {rows === undefined && <Text variant="muted" style={{ padding: 24 }}>Loading…</Text>}
          {rows !== undefined && shown.length === 0 && <Text variant="muted" style={{ padding: 24 }}>{all.length === 0 ? 'No patients yet. Run `npm run seed`.' : 'No patients match.'}</Text>}
          {shown.map(({ patient, nextAppointment, openAlerts, lastCheckinAt, latestAlertSymptom }, i) => {
            const isNew = lastCheckinAt !== null && lastCheckinAt > (patient.doctorLastViewedAt ?? 0)
            return (
              <div key={patient._id}>
                {i > 0 && <div style={{ height: 1, background: theme.color.border }} />}
                <button
                  onClick={() => onSelect(patient._id)}
                  style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, alignItems: 'center', width: '100%', padding: '16px 24px', border: 'none', background: openAlerts > 0 ? theme.color.dangerBg : 'transparent', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={patient.name} />
                    <Text variant="strong" style={cell}>{patient.name}</Text>
                  </span>
                  <Text style={{ ...cell, font: `400 15px/1.45 ${theme.font.body}` }}>{nextAppointment ? appointmentLabel(nextAppointment.scheduledAt, now) : '—'}</Text>
                  <Text style={{ ...cell, font: `400 15px/1.45 ${theme.font.body}` }}>{patient.reasonForVisit}</Text>
                  <span style={{ minWidth: 0 }}>
                    <Chip tone={patient.language === 'es' ? 'periwinkle' : 'neutral'} icon={patient.language === 'es' ? 'globe-periwinkle' : 'globe-muted-14'} size={12}>{patient.language === 'es' ? 'Spanish' : 'English'}</Chip>
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {openAlerts > 0 ? (
                      <>
                        <CountBadge count={openAlerts} />
                        <Text style={{ ...cell, font: `600 13px/1.45 ${theme.font.body}` }} color={theme.color.dangerText}>{latestAlertSymptom ? latestAlertSymptom[0].toUpperCase() + latestAlertSymptom.slice(1) : ''}</Text>
                      </>
                    ) : (
                      <Text color={theme.color.placeholder} style={{ font: `400 15px ${theme.font.body}` }}>—</Text>
                    )}
                  </span>
                  <span>{isNew && <Dot title="New check-in since you last viewed" />}</span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Screen>
  )
}
