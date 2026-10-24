// Doctor Home tab (H1–H5): welcome and counts, find patient, alerts strip, next appointment card,
// and the rest of the week grouped by day. One reactive query: dashboard.doctorHome.
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Badge, Button, Card, ListItem, Screen, Text } from '../components'
import { daysFrom, formatCountdown, formatDateTime, formatTime, greeting, languageLabel } from '../format'
import { theme } from '../theme'
import { useNow } from '../useNow'

type Home = FunctionReturnType<typeof api.dashboard.doctorHome>
type Row = Home['upcoming'][number]
type OpenPatient = (id: Id<'patients'>) => void

export default function DoctorHome({ onOpenPatient, onSeeAllPatients }: { onOpenPatient: OpenPatient; onSeeAllPatients: () => void }) {
  const now = useNow()
  const home = useQuery(api.dashboard.doctorHome, { now })

  if (home === undefined) return <Screen title="Home"><Text variant="muted">Loading…</Text></Screen>
  if (home.doctorName === null) return <Screen title="Home"><Text variant="muted">No appointments yet. Run `npm run seed`.</Text></Screen>

  const alertCount = home.alerts.length
  return (
    <Screen title={`${greeting(now)}, ${home.doctorName}`}>
      <Text variant="muted">
        {new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
        {home.appointmentsThisWeek} appointment{home.appointmentsThisWeek === 1 ? '' : 's'} this week · {alertCount} alert{alertCount === 1 ? '' : 's'}
      </Text>
      <FindPatient onOpenPatient={onOpenPatient} onSeeAll={onSeeAllPatients} />
      <AlertsStrip alerts={home.alerts} onOpenPatient={onOpenPatient} />
      {home.next ? (
        <NextAppointment next={home.next} now={now} onOpenPatient={onOpenPatient} />
      ) : (
        <Card title="Next appointment"><Text variant="muted">No upcoming appointments this week.</Text></Card>
      )}
      <Upcoming rows={home.upcoming} now={now} onOpenPatient={onOpenPatient} />
    </Screen>
  )
}

/** H2: type a name, click a result to open that patient. Filters patients.list on the client. */
function FindPatient({ onOpenPatient, onSeeAll }: { onOpenPatient: OpenPatient; onSeeAll: () => void }) {
  const rows = useQuery(api.patients.list)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matches = needle ? (rows ?? []).filter((r) => r.patient.name.toLowerCase().includes(needle)).slice(0, 5) : []
  return (
    <Card>
      <div style={{ display: 'flex', gap: theme.space.md, alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) onOpenPatient(matches[0].patient._id)
          }}
          placeholder="Find patient by name"
          aria-label="Find patient by name"
          style={{
            flex: 1,
            font: 'inherit',
            fontSize: theme.font.size.md,
            padding: `${theme.space.sm}px ${theme.space.md}px`,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.sm,
            background: theme.color.surface,
            color: theme.color.text,
          }}
        />
        <Button variant="secondary" onClick={onSeeAll}>See all patients</Button>
      </div>
      {needle && matches.length === 0 && <Text variant="muted">No patient matches “{query.trim()}”.</Text>}
      {matches.map(({ patient, nextAppointment }) => (
        <ListItem
          key={patient._id}
          onClick={() => onOpenPatient(patient._id)}
          title={patient.name}
          subtitle={nextAppointment ? `Next visit ${formatDateTime(nextAppointment.scheduledAt)}` : 'No upcoming visit'}
          trailing={<Badge>{patient.language.toUpperCase()}</Badge>}
        />
      ))}
    </Card>
  )
}

/** H3 / C8: red, only when there are unacknowledged alerts. */
function AlertsStrip({ alerts, onOpenPatient }: { alerts: Home['alerts']; onOpenPatient: OpenPatient }) {
  const acknowledge = useMutation(api.alerts.acknowledge)
  if (alerts.length === 0) return null
  return (
    <Card title="Red-flag alerts" tone="danger">
      {alerts.map((a) => (
        <ListItem
          key={a.alertId}
          title={<><strong>{a.patientName}</strong> <Badge tone="danger">{a.symptom}</Badge> <em>“{a.quote}”</em></>}
          subtitle={<>{a.quoteEnglish && a.quoteEnglish !== a.quote && <>{a.quoteEnglish}<br /></>}{formatDateTime(a.createdAt)}</>}
          trailing={
            <>
              <Button onClick={() => onOpenPatient(a.patientId)}>Open</Button>
              <Button variant="secondary" onClick={() => void acknowledge({ alertId: a.alertId })}>Acknowledge</Button>
            </>
          }
        />
      ))}
    </Card>
  )
}

/** H4: the featured card for the soonest appointment. */
function NextAppointment({ next, now, onOpenPatient }: { next: NonNullable<Home['next']>; now: number; onOpenPatient: OpenPatient }) {
  return (
    <Card title="Next appointment" actions={<Button onClick={() => onOpenPatient(next.patientId)}>Go to patient</Button>}>
      <div style={{ display: 'flex', gap: theme.space.md, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Text variant="title">{next.patientName}</Text>
        <Text>{formatTime(next.scheduledAt)} · {formatCountdown(next.scheduledAt, now)}</Text>
        <Badge tone={next.language === 'es' ? 'primary' : 'neutral'}>{languageLabel(next.language)}</Badge>
        {next.openAlerts > 0 && <Badge tone="danger">{next.openAlerts} alert{next.openAlerts === 1 ? '' : 's'}</Badge>}
      </div>
      <Text variant="muted">{next.reasonForVisit}</Text>
      <Text>
        {next.topConcerns.length > 0 ? `Top concerns: ${next.topConcerns.join(', ')}. ` : 'No symptoms reported yet. '}
        {next.openQuestions} question{next.openQuestions === 1 ? '' : 's'} from patient.
      </Text>
      <Text variant="muted">{next.checkinsCompleted} of {next.checkinDays} check-ins completed</Text>
    </Card>
  )
}

/** H5: the rest of the week, grouped Today / Tomorrow / This week. */
function Upcoming({ rows, now, onOpenPatient }: { rows: Row[]; now: number; onOpenPatient: OpenPatient }) {
  const groups: [string, Row[]][] = [
    ['Today', rows.filter((r) => daysFrom(r.scheduledAt, now) <= 0)],
    ['Tomorrow', rows.filter((r) => daysFrom(r.scheduledAt, now) === 1)],
    ['This week', rows.filter((r) => daysFrom(r.scheduledAt, now) > 1)],
  ]
  return (
    <Card title="Upcoming">
      {rows.length === 0 && <Text variant="muted">Nothing else this week.</Text>}
      {groups.map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label}>
            <Text variant="muted">{label}</Text>
            {list.map((r) => (
              <ListItem
                key={r.appointmentId}
                onClick={() => onOpenPatient(r.patientId)}
                title={<>{label === 'This week' ? formatDateTime(r.scheduledAt) : formatTime(r.scheduledAt)} · <strong>{r.patientName}</strong></>}
                subtitle={r.reasonForVisit}
                trailing={
                  <>
                    <Badge>{r.language.toUpperCase()}</Badge>
                    {r.openAlerts > 0 && <Badge tone="danger">alert</Badge>}
                  </>
                }
              />
            ))}
          </div>
        ),
      )}
    </Card>
  )
}
