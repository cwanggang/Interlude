// TRACK A owns this file. Time helpers in the patient's own timezone, shared by both tracks
// (calls, pipeline, Track B's app taps and completion counts). Plain functions, no Convex exports.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-24" in the given timezone. */
export function localDate(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** "18:30" in the given timezone. */
export function localTime(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

/**
 * The instant (ms) at which the clock in `timezone` reads `hhmm` on local date `date`
 * ("2026-10-24", "18:30"). Correct across DST changes except inside the skipped hour.
 */
export function zonedTimeToMs(date: string, hhmm: string, timezone: string): number {
  const asUtc = Date.parse(`${date}T${hhmm}:00Z`);
  // The zone's offset at that moment: how far its wall clock is from UTC.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return asUtc - (wallAsUtc - asUtc);
}

/** The local date one day after `date`. */
export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}
