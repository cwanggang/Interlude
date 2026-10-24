import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../../../convex/_generated/api'
import { formatDay, isoDay } from '../../format'
import type { Tone } from '../../theme'

type Visit = FunctionReturnType<typeof api.visits.getByAppointment>

/** H10: the header's visit button label, and the badge beside it. `undefined` while loading. */
export function visitStage(visit: Visit | undefined): { label: string; badge?: { text: string; tone: Tone } } {
  if (visit === undefined) return { label: 'Visit' }
  if (visit === null) return { label: 'Start visit' }
  if (visit.status === 'failed') return { label: 'Visit', badge: { text: 'Processing failed', tone: 'danger' } }
  if (visit.releasedToPatient) {
    return { label: 'View visit', badge: { text: visit.releasedAt ? `Released ${formatDay(isoDay(visit.releasedAt))}` : 'Released', tone: 'success' } }
  }
  if (visit.status === 'summarized') return { label: 'Review visit', badge: { text: 'Needs review', tone: 'danger' } }
  return { label: 'Processing…' }
}
