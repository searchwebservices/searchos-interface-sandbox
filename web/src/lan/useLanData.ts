// The LAN model plus everything a view needs to act on it: reload, optimistic actions with rollback, assignments and
// notes. `key` scopes the cached reading (a lane id for the dock surfaces, 'lan-page' for #/lan). Both read the same
// lan-watch summary store entry as Topology and Interface health, so the surfaces never disagree.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useApp } from '@/app/AppContext'
import * as api from '@/lib/api'
import { isOwnerOrAdmin } from '@/lib/store'
import type { LanAction, LanAssignment, LanClass, LanDevice } from '@/lib/types'
import { useLanSummary } from '@/dock/lan'
import { useSurfaceState } from '@/dock/hooks'
import { buildLanModel, HOUSE_PEOPLE, type LanModel } from './model'

interface AssignState extends Record<string, unknown> {
  map: Record<string, LanAssignment>
  loaded: boolean
}
const A0: AssignState = { map: {}, loaded: false }

export interface ActionResult {
  ok: boolean
  error?: string
}
export interface LanData {
  model: LanModel | null
  error: string
  loading: boolean
  reload: () => void
  canWrite: boolean
  people: { id: string; name: string }[]
  act: (mac: string, action: LanAction, label?: string) => Promise<ActionResult>
  assign: (mac: string, patch: { person?: string | null; notes?: string; class?: LanClass | null }) => Promise<ActionResult>
}

const NEXT: Record<Exclude<LanAction, 'rename'>, string> = { approve: 'approved', deny: 'denied', reset: 'pending' }

export function useLanData(key: string): LanData {
  const { store } = useApp()
  const { state, reload, patch } = useLanSummary(key)
  const [as, patchAs] = useSurfaceState<AssignState>(key, 'lan-assign', A0)
  const live = useRef({ state, as })
  live.current = { state, as }

  const loadAssignments = useCallback(() => {
    void api.lanAssignments().then((r) => {
      if (r.ok && r.body && typeof r.body === 'object') {
        const { error: _e, ...map } = r.body
        void _e
        patchAs({ map: map as Record<string, LanAssignment>, loaded: true })
      } else patchAs({ loaded: true })
    })
  }, [patchAs])
  useEffect(() => {
    if (!as.loaded) loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const model = useMemo(() => (state.summary ? buildLanModel(state.summary, as.map) : null), [state.summary, as.map])

  const act = useCallback(
    async (mac: string, action: LanAction, label?: string): Promise<ActionResult> => {
      const before = live.current.state.summary
      if (!before) return { ok: false, error: 'lan-watch has not been read yet.' }
      const edit = (d: LanDevice): LanDevice => (d.mac !== mac ? d : action === 'rename' ? { ...d, label: (label ?? '').trim() || null } : { ...d, status: NEXT[action] })
      patch({ summary: { ...before, devices: before.devices.map(edit) } })
      const r = await api.lanAction(mac, action, label)
      if (!r.ok) {
        // Roll back only the row we touched, so a reading that landed meanwhile is not thrown away.
        const cur = live.current.state.summary
        const old = before.devices.find((d) => d.mac === mac)
        if (cur && old) patch({ summary: { ...cur, devices: cur.devices.map((d) => (d.mac === mac ? old : d)) } })
        return { ok: false, error: r.status === 403 ? 'Only owners and admins can change a device.' : r.body.error === 'lan-watch not reachable' || r.status === 503 ? 'lan-watch is not reachable right now.' : 'The change was not applied.' }
      }
      const fresh = r.body.device
      if (fresh) {
        const cur = live.current.state.summary
        if (cur) patch({ summary: { ...cur, devices: cur.devices.map((d) => (d.mac === mac ? { ...d, status: fresh.status, label: fresh.label } : d)) } })
      }
      return { ok: true }
    },
    [patch],
  )

  const assign = useCallback(
    async (mac: string, p: { person?: string | null; notes?: string; class?: LanClass | null }): Promise<ActionResult> => {
      const prev = live.current.as.map
      const cur = prev[mac] ?? { person: null, notes: '', updated_by: null, updated_at: null }
      patchAs({ map: { ...prev, [mac]: { ...cur, ...p } } })
      const r = await api.putLanAssignment(mac, p)
      if (!r.ok) {
        const now = live.current.as.map
        patchAs({ map: { ...now, [mac]: prev[mac] ?? { person: null, notes: '', updated_by: null, updated_at: null } } })
        return { ok: false, error: r.status === 403 ? 'Only owners and admins can assign a device.' : 'The change was not saved.' }
      }
      const { error: _e, ...entry } = r.body
      void _e
      patchAs({ map: { ...live.current.as.map, [mac]: entry as LanAssignment } })
      return { ok: true }
    },
    [patchAs],
  )

  return {
    model,
    error: state.error,
    loading: state.loading,
    reload,
    canWrite: isOwnerOrAdmin(store),
    people: (store.me?.people ?? []).filter((p) => HOUSE_PEOPLE.includes(p.id)).map((p) => ({ id: p.id, name: p.name || p.id })),
    act,
    assign,
  }
}
