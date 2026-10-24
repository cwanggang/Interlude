import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../../../convex/_generated/api'
import type { ChipTone } from '../../components'
import { formatDay, isoDay } from '../../format'

type Visit = FunctionReturnType<typeof api.visits.getByAppointment>

export type VisitStage = {
  kind: 'none' | 'processing' | 'review' | 'released' | 'failed'
  label: string
  variant: 'primary' | 'secondary' | 'soft'
  icon: string
  chip?: { text: string; tone: ChipTone; icon: string }
}

/** Figma 6.4: the header's visit button and the chip beside it, from visits.status + releasedToPatient. */
export function visitStage(visit: Visit | undefined): VisitStage {
  if (visit === undefined || visit === null) return { kind: 'none', label: 'Start visit', variant: 'primary', icon: 'mic-white-18' }
  if (visit.status === 'failed') {
    return { kind: 'failed', label: 'View visit', variant: 'secondary', icon: 'eye-ink', chip: { text: 'Processing failed', tone: 'coral', icon: 'alert-coral-14' } }
  }
  if (visit.releasedToPatient) {
    const released = visit.releasedAt ? `Released ${formatDay(isoDay(visit.releasedAt))}` : 'Released'
    return { kind: 'released', label: 'View visit', variant: 'secondary', icon: 'eye-ink', chip: { text: released, tone: 'success', icon: 'check-green-14' } }
  }
  if (visit.status === 'summarized') {
    return { kind: 'review', label: 'Review visit', variant: 'primary', icon: 'eye-white', chip: { text: 'Needs review', tone: 'coral', icon: 'alert-coral-14' } }
  }
  return { kind: 'processing', label: 'Processing…', variant: 'soft', icon: 'loader-teal' }
}
