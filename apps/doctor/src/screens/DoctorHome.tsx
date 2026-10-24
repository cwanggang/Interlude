// Doctor Home (Figma 6.1; H1–H5): welcome with counts and find patient, the red-flag strip, the
// next-appointment card, and the upcoming list grouped Today / Tomorrow / This week. One reactive
// query: dashboard.doctorHome.
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Blend, Button, Card, Chip, CountBadge, Divider, Icon, Link, Screen, SearchField, Text } from '../components'
import { age, daysFrom, formatCountdown, formatDateTime, formatTime, greeting, languageLabel } from '../format'
import { theme } from '../theme'
import { useNow } from '../useNow'

type Home = FunctionReturnType<typeof api.dashboard.doctorHome>
type Row = Home['upcoming'][number]
type OpenPatient = (id: Id<'patients'>) => void

export default function DoctorHome({ onOpenPatient, onSeeAllPatients }: { onOpenPatient: OpenPatient; onSeeAllPatients: () => void }) {
  const now = useNow()
  const home = useQuery(api.dashboard.doctorHome, { now })

  if (home === undefined) return <Screen><Text variant="muted">Loading…</Text></Screen>
  if (home.doctorName === null) return <Screen><Text variant="muted">No appointments yet. Run `npm run seed`.</Text></Screen>

  const alertCount = home.alerts.length
  return (
    <Screen>
      <Card
        bordered={false}
        padding={28}
        decor={
          <>
            <Blend name="welcome-blend-1" size={672} top={-318} right={-143} />
            <Blend name="welcome-blend-2" size={576} top={-204} right={-280} />
            <Blend name="welcome-blend-3" size={480} top={-250} right={-323} />
          </>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', padding: '0 4px' }}>
          <div style={{ flex: 1, minWidth: 280, display: 'grid', gap: 4 }}>
            <Text variant="display">{`${greeting(now)}, ${home.doctorName}`}</Text>
            <Text color={theme.color.textMuted} style={{ whiteSpace: 'pre-wrap' }}>
              {`${new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}  ·  ${home.appointmentsThisWeek} appointment${home.appointmentsThisWeek === 1 ? '' : 's'} this week  ·  ${alertCount} alert${alertCount === 1 ? '' : 's'}`}
            </Text>
          </div>
          <FindPatient onOpenPatient={onOpenPatient} onSeeAll={onSeeAllPatients} />
        </div>
      </Card>

      {home.alerts.map((a) => (
        <AlertStrip key={a.alertId} alert={a} onOpen={() => onOpenPatient(a.patientId)} />
      ))}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 560px', minWidth: 0 }}>
          {home.next ? <NextAppointment next={home.next} now={now} onOpenPatient={onOpenPatient} /> : <Card title="Next appointment"><Text variant="muted">No upcoming appointments this week.</Text></Card>}
        </div>
        <div style={{ flex: '0 1 540px', minWidth: 320 }}>
          <Upcoming next={home.next} rows={home.upcoming} now={now} onOpenPatient={onOpenPatient} />
        </div>
      </div>
    </Screen>
  )
}

/** H2: type a name; Enter or a click opens that patient. Filters patients.list on the client. */
function FindPatient({ onOpenPatient, onSeeAll }: { onOpenPatient: OpenPatient; onSeeAll: () => void }) {
  const rows = useQuery(api.patients.list)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matches = needle ? (rows ?? []).filter((r) => r.patient.name.toLowerCase().includes(needle)).slice(0, 5) : []
  return (
    <div style={{ position: 'relative', display: 'grid', gap: 8, justifyItems: 'end' }}>
      <SearchField value={query} onChange={setQuery} onSubmit={() => matches[0] && onOpenPatient(matches[0].patient._id)} placeholder="Find patient by name…" width={420} />
      <Link onClick={onSeeAll}>See all patients</Link>
      {needle && (
        <div style={{ position: 'absolute', top: 54, left: 0, right: 0, zIndex: 5, background: theme.color.surface, border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.sm, boxShadow: '0 12px 28px rgba(13,42,58,0.12)', padding: 8 }}>
          {matches.length === 0 && <Text variant="muted" style={{ padding: 8 }}>{`No patient matches “${query.trim()}”.`}</Text>}
          {matches.map(({ patient, nextAppointment }) => (
            <button key={patient._id} onClick={() => onOpenPatient(patient._id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '10px 12px', borderRadius: 10, cursor: 'pointer' }}>
              <Text variant="strong">{patient.name}</Text>
              <Text variant="muted">{nextAppointment ? `Next visit ${formatDateTime(nextAppointment.scheduledAt)}` : 'No upcoming visit'}</Text>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** H3 / C8: one red strip per unacknowledged alert. */
function AlertStrip({ alert, onOpen }: { alert: Home['alerts'][number]; onOpen: () => void }) {
  const acknowledge = useMutation(api.alerts.acknowledge)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', borderRadius: theme.radius.md, background: theme.color.dangerBg, border: `1px solid ${theme.color.dangerBorder}` }}>
      <span style={{ width: 48, height: 48, borderRadius: 24, background: theme.color.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name="alert-white-24" size={24} />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
        <Text style={{ font: `700 17px/1.45 ${theme.font.body}`, whiteSpace: 'pre-wrap' }} color={theme.color.dangerText}>{`Red flag  ·  ${alert.patientName}  ·  ${capitalize(alert.symptom)}`}</Text>
        <Text variant="quote">{`“${alert.quote}”`}</Text>
        <Text variant="muted" style={{ whiteSpace: 'pre-wrap' }}>{`${alert.quoteEnglish && alert.quoteEnglish !== alert.quote ? `${alert.quoteEnglish}  ·  ` : ''}${formatDateTime(alert.createdAt)}`}</Text>
      </div>
      <Button variant="secondary" onClick={() => void acknowledge({ alertId: alert.alertId })}>Acknowledge</Button>
      <Button variant="ink" iconAfter="arrow-right-white" onClick={onOpen}>Open</Button>
    </div>
  )
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

/** H4: the featured card for the soonest appointment. */
function NextAppointment({ next, now, onOpenPatient }: { next: NonNullable<Home['next']>; now: number; onOpenPatient: OpenPatient }) {
  const patient = useQuery(api.patients.get, { patientId: next.patientId })
  return (
    <Card
      bordered={false}
      padding={30}
      gap={16}
      decor={
        <>
          <Blend name="next-blend-1" size={608} top={-321} right={-208} />
          <Blend name="next-blend-2" size={480} top={-182} right={-256} />
        </>
      }
    >
      <Text style={{ font: `600 13px/1.45 ${theme.font.body}` }} color={theme.color.primary}>NEXT APPOINTMENT</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Text style={{ font: `600 36px/1.15 ${theme.font.heading}` }}>{next.patientName}</Text>
        <Chip tone="solid" size={14}>{formatCountdown(next.scheduledAt, now)}</Chip>
        {next.openAlerts > 0 && <CountBadge count={next.openAlerts} />}
      </div>
      <Text color={theme.color.textMuted} style={{ font: `400 17px/1.45 ${theme.font.body}`, whiteSpace: 'pre-wrap' }}>
        {[formatTime(next.scheduledAt), patient?.dateOfBirth ? String(age(patient.dateOfBirth, now)) : null, next.reasonForVisit].filter(Boolean).join('  ·  ')}
      </Text>
      <div>
        <Chip tone={next.language === 'es' ? 'periwinkle' : 'neutral'} icon={next.language === 'es' ? 'globe-periwinkle' : 'globe-muted-14'} size={14}>{languageLabel(next.language)}</Chip>
      </div>
      <Divider />
      <Text style={{ font: `500 18px/1.45 ${theme.font.body}` }}>
        {next.topConcerns.length > 0 ? `Top concerns: ${next.topConcerns.join(', ')}.` : 'No symptoms reported yet.'}
      </Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="chat-ink-18" size={18} />
        <Text variant="strong" style={{ font: `600 16px/1.45 ${theme.font.body}` }}>{`${next.openQuestions} question${next.openQuestions === 1 ? '' : 's'} from patient`}</Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'flex', gap: 6 }} aria-hidden>
          {next.checkinPattern.map((done, i) => (
            <span key={i} style={{ width: 12, height: 12, borderRadius: 6, boxSizing: 'border-box', background: done ? theme.color.primary : theme.color.surface, border: done ? 'none' : `1.5px solid ${theme.color.primary}` }} />
          ))}
        </span>
        <Text variant="muted" style={{ font: `400 15px/1.45 ${theme.font.body}` }}>{`${next.checkinsCompleted} of ${next.checkinDays} check-ins completed`}</Text>
      </div>
      <div>
        <Button size="lg" iconAfter="arrow-right-white" onClick={() => onOpenPatient(next.patientId)}>Go to patient</Button>
      </div>
    </Card>
  )
}

/** H5: the next appointment plus the rest of the week, grouped Today / Tomorrow / This week. */
function Upcoming({ next, rows, now, onOpenPatient }: { next: Home['next']; rows: Row[]; now: number; onOpenPatient: OpenPatient }) {
  const all: Row[] = next ? [next, ...rows] : rows
  const groups: [string, Row[]][] = [
    ['TODAY', all.filter((r) => daysFrom(r.scheduledAt, now) <= 0)],
    ['TOMORROW', all.filter((r) => daysFrom(r.scheduledAt, now) === 1)],
    ['THIS WEEK', all.filter((r) => daysFrom(r.scheduledAt, now) > 1)],
  ]
  return (
    <Card padding={22} gap={6} style={{ paddingLeft: 24, paddingRight: 24 }}>
      <Text variant="heading">Upcoming</Text>
      {all.length === 0 && <Text variant="muted">Nothing else this week.</Text>}
      {groups.map(([label, list], gi) =>
        list.length === 0 ? null : (
          <div key={label} style={{ display: 'grid', gap: 6 }}>
            {gi > 0 && groups.slice(0, gi).some(([, l]) => l.length) && <Divider />}
            <Text variant="label">{label}</Text>
            {list.map((r) => (
              <button
                key={r.appointmentId}
                onClick={() => onOpenPatient(r.patientId)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: 14, border: 'none', background: r.openAlerts > 0 ? theme.color.dangerBg : 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <Text style={{ width: 84, flexShrink: 0, font: `700 14px/1.45 ${theme.font.body}` }}>
                  {label === 'THIS WEEK' ? `${new Date(r.scheduledAt).toLocaleDateString(undefined, { weekday: 'short' })} ${formatTime(r.scheduledAt).replace(/\s?[AP]M$/i, '')}` : formatTime(r.scheduledAt)}
                </Text>
                <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
                  <Text variant="strong">{r.patientName}</Text>
                  <Text variant="muted" style={{ font: `400 13px/1.45 ${theme.font.body}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reasonForVisit}</Text>
                </span>
                <Chip tone={r.language === 'es' ? 'periwinkle' : 'neutral'} size={12}>{r.language.toUpperCase()}</Chip>
                {r.openAlerts > 0 && <CountBadge count={r.openAlerts} />}
                <Icon name="chevron-right-18" size={18} />
              </button>
            ))}
          </div>
        ),
      )}
      {all.length > 0 && <Divider />}
    </Card>
  )
}
