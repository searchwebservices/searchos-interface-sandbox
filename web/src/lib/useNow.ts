import { useEffect, useState } from 'react'

// A clock that ticks every `ms` while `on` is true. Used for the working row's elapsed time and relative times.
export function useNow(ms: number, on = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return undefined
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms, on])
  return now
}
