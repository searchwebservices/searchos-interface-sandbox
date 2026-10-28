// Section 5 of docs/console-v2-spec.md: /v2/#/health, from GET /api/health. The provider refetches every 30 s and
// the sidebar footer reads the same store slot, so this page and the footer never disagree.
import { useEffect } from 'react'
import { GilfoyleAvatar } from '@/components/GilfoyleAvatar'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/app/AppContext'
import { cn } from '@/lib/utils'
import { displayName, fmtDuration } from '@/lib/time'
import { PageHeader } from './Devices'
import { DEFAULT_AGENT_NAME } from '@/lib/agent'

export function healthLine(h: { opencode: 'up' | 'down'; down_for_s: number } | null, agent: string = DEFAULT_AGENT_NAME): string {
  if (!h) return 'Checking'
  return h.opencode === 'up' ? agent + ', online' : h.down_for_s > 0 ? agent + ', unreachable for ' + fmtDuration(h.down_for_s * 1000) : agent + ', unreachable'
}

function Row({ label, children, testid }: { label: string; children: React.ReactNode; testid?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm" data-testid={testid}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-medium">{children}</span>
    </div>
  )
}

// onlyLane scopes the page to one lane (Marvin's one chat): only that lane's session is listed and only its asks count.
export function HealthPage({ onlyLane }: { onlyLane?: string | null } = {}) {
  const { store, refreshHealth } = useApp()
  const scoped = onlyLane !== undefined
  const h = store.health
  useEffect(() => {
    void refreshHealth()
    const t = setInterval(() => void refreshHealth(), 30000)
    return () => clearInterval(t)
  }, [refreshHealth])
  const sessions = Object.entries(h?.sessions ?? {}).filter(([lane]) => !scoped || lane === onlyLane)
  const asks = scoped ? (onlyLane ? (store.lanes[onlyLane]?.asks ?? 0) : 0) : (h?.pending_asks ?? 0)
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="health-page">
      <PageHeader title="Health">
        <GilfoyleAvatar size="sm" />
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void refreshHealth()}>
          <RefreshCwIcon />
          Refresh
        </Button>
      </PageHeader>
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
        <section className="divide-y rounded-lg border px-3">
          <Row label="OpenCode" testid="health-opencode">
            <span className={cn('size-2 rounded-full', !h && 'bg-muted-foreground', h?.opencode === 'up' && 'bg-ok', h?.opencode === 'down' && 'bg-destructive')} />
            {!h ? 'Checking' : h.opencode === 'up' ? 'Up' : h.down_for_s > 0 ? 'Down for ' + fmtDuration(h.down_for_s * 1000) : 'Down'}
          </Row>
          <Row label="Pending asks" testid="health-asks">
            {asks}
          </Row>
          <Row label="Outbox depth" testid="health-outbox">
            {h?.outbox ?? 0}
          </Row>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{scoped ? 'Session' : 'Sessions per lane'}</h2>
          {sessions.length ? (
            <ul className="divide-y rounded-lg border px-3" data-testid="health-sessions">
              {sessions.map(([lane, st]) => (
                <li key={lane} className="flex items-center justify-between py-2 text-sm" data-state={st}>
                  <span>{store.lanes[lane]?.title ?? displayName(lane)}</span>
                  <span className={cn('flex items-center gap-2 font-medium', st === 'missing' && 'text-destructive')}>
                    <span className={cn('size-2 rounded-full', st === 'ok' ? 'bg-ok' : 'bg-destructive')} />
                    {st === 'ok' ? 'OK' : 'Missing'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{h ? scoped ? 'No session reported.' : 'No lane sessions reported.' : 'Loading...'}</p>
          )}
        </section>
      </div>
    </div>
  )
}
