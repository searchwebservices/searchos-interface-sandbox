// Small hooks shared by the dock and the standing surfaces.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { displayName } from '@/lib/time'

// Surface state lives in the store (keyed by lane and surface id), so collapsing a tab, switching tabs or leaving
// the lane never loses a draft, a list or a selection. `initial` must be a stable literal shape.
export function useSurfaceState<T extends Record<string, unknown>>(lane: string, id: string, initial: T): [T, (patch: Partial<T>) => void] {
  const { store, dock } = useApp()
  const cur = store.surfaceState[lane + '|' + id]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => ({ ...initial, ...cur }) as T, [cur])
  const patch = useCallback((p: Partial<T>) => dock.patchSurface(lane, id, p as Record<string, unknown>), [dock, lane, id])
  return [state, patch]
}

// person id -> display name, from the operator list when the console sends it.
export function usePeople(): Record<string, string> {
  const { store } = useApp()
  const list = store.me?.people
  return useMemo(() => Object.fromEntries((list ?? []).filter((p) => p.name).map((p) => [p.id, p.name || displayName(p.id)])), [list])
}

// True under the breakpoint where the dock becomes a bottom sheet (900 px).
export function useNarrow(px = 900): boolean {
  const query = `(max-width: ${px - 0.02}px)`
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false)
  const [narrow, setNarrow] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const on = () => setNarrow(mql.matches)
    on()
    mql.addEventListener?.('change', on)
    return () => mql.removeEventListener?.('change', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px])
  return narrow
}
