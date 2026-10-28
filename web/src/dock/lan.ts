// lan-watch summary and the box interfaces, shared by Topology and Interface health. Both read the same store entry,
// so the two surfaces never disagree and the console is asked once per interval.
import { useCallback, useEffect, useRef } from 'react'
import * as api from '@/lib/api'
import type { BoxIface, LanSummary } from '@/lib/types'
import { useSurfaceState } from './hooks'

export interface LanState extends Record<string, unknown> {
  summary: LanSummary | null
  error: string
  loading: boolean
  fetchedAt: number
}
export interface IfaceState extends Record<string, unknown> {
  list: BoxIface[] | null
  error: string
  loading: boolean
}

const LAN0: LanState = { summary: null, error: '', loading: false, fetchedAt: 0 }
const IF0: IfaceState = { list: null, error: '', loading: false }
const INTERVAL = 30000

export function useLanSummary(lane: string): { state: LanState; reload: () => void; patch: (p: Partial<LanState>) => void } {
  const [state, patch] = useSurfaceState<LanState>(lane, 'lan', LAN0)
  const busy = useRef(false)
  const reload = useCallback(() => {
    if (busy.current) return
    busy.current = true
    patch({ loading: true })
    void api.lanSummary().then((r) => {
      busy.current = false
      if (r.ok && Array.isArray(r.body.devices)) patch({ summary: r.body, error: '', loading: false, fetchedAt: Date.now() })
      else patch({ error: r.status === 503 || r.status === 0 ? 'lan-watch is not reachable right now.' : 'lan-watch gave no usable answer.', loading: false })
    })
  }, [patch])
  useEffect(() => {
    if (!state.fetchedAt || Date.now() - state.fetchedAt > INTERVAL) reload()
    const t = setInterval(reload, INTERVAL)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { state, reload, patch }
}

export function useBoxInterfaces(lane: string, enabled: boolean): { state: IfaceState; reload: () => void } {
  const [state, patch] = useSurfaceState<IfaceState>(lane, 'ifaces', IF0)
  const reload = useCallback(() => {
    patch({ loading: true })
    void api.boxInterfaces().then((r) => {
      if (r.ok && Array.isArray(r.body)) patch({ list: r.body, error: '', loading: false })
      else patch({ error: 'The box interfaces could not be read.', loading: false })
    })
  }, [patch])
  useEffect(() => {
    if (enabled) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
  return { state, reload }
}
