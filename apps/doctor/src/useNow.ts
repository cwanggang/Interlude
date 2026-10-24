import { useEffect, useState } from 'react'

const MINUTE = 60_000

/**
 * The current time rounded down to the minute, updated each minute. Convex queries can't read
 * the clock, so queries that need "now" take this value (stable within a minute, so cached).
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE)
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / MINUTE) * MINUTE), 5_000)
    return () => clearInterval(id)
  }, [])
  return now
}
