// Approval queue: every open ask in the lanes this person can see, answered inline. The answer goes through the same
// reply route, with the same owner scope and the same device signature, as the ask card in the thread.
import { useEffect } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/app/AppContext'
import * as api from '@/lib/api'
import { isOwnerOrAdmin, totalAsks } from '@/lib/store'
import type { AskRow } from '@/lib/types'
import { AskCard } from '@/thread/Agent'
import { usePeople, useSurfaceState } from './hooks'
import { AgentNameContext, agentName } from '@/lib/agent'

interface QueueState extends Record<string, unknown> {
  rows: AskRow[] | null
  error: string
  loading: boolean
}
const Q0: QueueState = { rows: null, error: '', loading: false }

export function ApprovalQueue({ lane }: { lane: string }) {
  const app = useApp()
  const people = usePeople()
  const [s, patch] = useSurfaceState<QueueState>(lane, 'approvals', Q0)
  const open = totalAsks(app.store)
  const load = () => {
    patch({ loading: true })
    void api.asks('open').then((r) => {
      if (r.ok && Array.isArray(r.body)) patch({ rows: r.body, error: '', loading: false })
      else patch({ error: 'The approval queue could not be read.', loading: false })
    })
  }
  // Re-read when the number of open asks anywhere changes (a new ask, an answer from another device).
  useEffect(load, [open, app.store.approverTick]) // eslint-disable-line react-hooks/exhaustive-deps
  const canAnswer = isOwnerOrAdmin(app.store)
  const now = Date.now()
  const rows = s.rows ?? []
  const byLane = rows.reduce<Record<string, AskRow[]>>((acc, r) => ((acc[r.lane] ??= []).push(r), acc), {})
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="approval-queue">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span data-testid="queue-count">{s.rows ? (rows.length ? `${rows.length} waiting` : 'Nothing waiting') : ''}</span>
        {!canAnswer && rows.length > 0 && <span>Only an owner can answer these.</span>}
        <Button type="button" size="icon-xs" variant="ghost" className="ml-auto" aria-label="Refresh approvals" onClick={load} disabled={s.loading}>
          <RefreshCwIcon />
        </Button>
      </div>
      {s.error && <p className="text-sm text-destructive">{s.error}</p>}
      {!s.rows && !s.error && <p className="text-sm text-muted-foreground">Loading...</p>}
      {Object.entries(byLane).map(([id, list]) => (
        <AgentNameContext.Provider key={id} value={agentName(app.store.lanes[id])}>
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{list[0].lane_title}</h3>
          {list.map((r) => (
            <AskCard
              key={r.id}
              item={r}
              canAnswer={canAnswer}
              people={people}
              now={now}
              onAnswer={async (d) => {
                const err = await app.answerAsk(r.lane, r.id, r.ask.request_id, d)
                if (!err) patch({ rows: (s.rows ?? []).filter((x) => x.id !== r.id) })
                return err
              }}
            />
          ))}
        </section>
        </AgentNameContext.Provider>
      ))}
    </div>
  )
}
