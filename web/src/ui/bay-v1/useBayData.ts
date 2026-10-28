// What only Bay's shell reads: per agent health (/api/health.agents) and every open ask, including the ones that sit in
// lanes Bay does not see (the approver lanes of jared-dani and jared-borja).
import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import { totalAsks } from '@/lib/store'
import type { Store } from '@/lib/store'
import type { AskRow, Health } from '@/lib/types'

export function useAgentHealth(): Health | null {
  const [h, setH] = useState<Health | null>(null)
  useEffect(() => {
    let live = true
    const load = () => void api.health().then((r) => { if (live && r.ok && r.body.opencode) setH(r.body) })
    load()
    const t = setInterval(load, 30000)
    return () => { live = false; clearInterval(t) }
  }, [])
  return h
}

export function useOpenAsks(store: Store): AskRow[] {
  const [rows, setRows] = useState<AskRow[]>([])
  const open = totalAsks(store)
  useEffect(() => {
    let live = true
    api.asks('open').then((r) => { if (live) setRows(r.ok && Array.isArray(r.body) ? r.body : []) })
    return () => { live = false }
  }, [open])
  return rows
}

// Asks in lanes the rail already shows are in lane.asks; approver asks are the ones whose lane Bay has no row for.
export const approvalCount = (store: Store, rows: AskRow[]): number => totalAsks(store) + rows.filter((r) => !store.lanes[r.lane]).length
