// #/engines belongs to this shell only. The shared router does not know it (it reads as home), so the shell asks first.
import { useEffect, useState } from 'react'

export const isEnginesHash = (hash: string): boolean => hash.replace(/^#/, '').replace(/^\/+/, '').split('/')[0] === 'engines'

export function useEnginesRoute(): boolean {
  const [on, setOn] = useState(() => isEnginesHash(window.location.hash))
  useEffect(() => {
    const f = () => setOn(isEnginesHash(window.location.hash))
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return on
}
