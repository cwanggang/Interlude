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

const COLUMNS = [
  { label: 'NAME', width: undefined },
  { label: 'NEXT APPOINTMENT', width: 240 },
  { label: 'REASON', width: 280 },
  { label: 'LANGUAGE', width: 150 },
  { label: 'ALERT', width: 180 },
  { label: 'NEW', width: 60 },
]

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

      <div style={{ background: theme.color.surface, border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 24px', background: theme.color.bg }}>
          {COLUMNS.map((c) => (
            <Text key={c.label} variant="label" style={{ flex: c.width ? `0 0 ${c.width}px` : 1, minWidth: 0 }}>{c.label}</Text>
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
                style={{ display: 'flex', gap: 16, alignItems: 'center', width: '100%', padding: '16px 24px', border: 'none', background: openAlerts > 0 ? theme.color.dangerBg : 'transparent', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={patient.name} />
                  <Text variant="strong">{patient.name}</Text>
                </span>
                <Text style={{ flex: '0 0 240px', font: `400 15px/1.45 ${theme.font.body}` }}>{nextAppointment ? appointmentLabel(nextAppointment.scheduledAt, now) : '—'}</Text>
                <Text style={{ flex: '0 0 280px', font: `400 15px/1.45 ${theme.font.body}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{patient.reasonForVisit}</Text>
                <span style={{ flex: '0 0 150px' }}>
                  <Chip tone={patient.language === 'es' ? 'periwinkle' : 'neutral'} icon={patient.language === 'es' ? 'globe-periwinkle' : 'globe-muted-14'} size={12}>{patient.language === 'es' ? 'Spanish' : 'English'}</Chip>
                </span>
                <span style={{ flex: '0 0 180px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {openAlerts > 0 ? (
                    <>
                      <CountBadge count={openAlerts} />
                      <Text style={{ font: `600 13px/1.45 ${theme.font.body}` }} color={theme.color.dangerText}>{latestAlertSymptom ? latestAlertSymptom[0].toUpperCase() + latestAlertSymptom.slice(1) : ''}</Text>
                    </>
                  ) : (
                    <Text color={theme.color.placeholder} style={{ font: `400 15px ${theme.font.body}` }}>—</Text>
                  )}
                </span>
                <span style={{ flex: '0 0 60px' }}>{isNew && <Dot title="New check-in since you last viewed" />}</span>
              </button>
            </div>
          )
        })}
      </div>
    </Screen>
  )
}
