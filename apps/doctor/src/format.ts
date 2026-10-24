export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** "2026-10-24" → "Oct 24". Parsed as a calendar date, not UTC midnight. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "in 25 min", "in 3 h 10 min", "in 4 days", "started 5 min ago". */
export function formatCountdown(ms: number, now: number): string {
  const minutes = Math.round((ms - now) / 60_000)
  if (minutes < 0) return `started ${-minutes} min ago`
  if (minutes < 60) return `in ${minutes} min`
  if (minutes < 24 * 60) return `in ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
  const days = Math.round(minutes / (24 * 60))
  return `in ${days} day${days === 1 ? '' : 's'}`
}

/** Whole calendar days from `now` to `ms`, in the browser's time zone (0 = today). */
export function daysFrom(ms: number, now: number): number {
  const start = (t: number) => {
    const d = new Date(t)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  return Math.round((start(ms) - start(now)) / 86_400_000)
}

export function greeting(now: number): string {
  const hour = new Date(now).getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export function languageLabel(language: 'en' | 'es'): string {
  return language === 'es' ? 'Spanish · interpreter recommended' : 'English'
}

/** Age in whole years from "1957-05-12". */
export function age(dateOfBirth: string, now: number): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number)
  const today = new Date(now)
  const birthdayPassed = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d)
  return today.getFullYear() - y - (birthdayPassed ? 0 : 1)
}
