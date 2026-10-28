// Bay's #/engines: the Claude Code lanes, from GET /api/engines. Refreshes every 30 s while the tab is visible.
import { useCallback, useEffect, useState } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { call } from '@/lib/api'
import { displayName, relTime } from '@/lib/time'
import { PageHeader } from './Devices'

export interface Engine {
  lane: string
  owner?: string | null
  status?: string | null
  pid_alive?: boolean | null
  started_at?: string | null
  last_prompt_at?: string | null
  last_stop_at?: string | null
  last_event?: unknown
  checked_at?: string | null
}
export interface EnginesBody {
  engines?: Engine[]
  error?: string
}

const DEAD_STATUS = ['dead', 'stopped', 'exited', 'failed', 'crashed', 'down']

export const engineAlive = (e: Engine): boolean => e.pid_alive === true && !DEAD_STATUS.includes((e.status ?? '').toLowerCase())

// Alive first, then by lane name.
export const sortEngines = (list: Engine[]): Engine[] =>
  [...list].sort((a, b) => Number(engineAlive(b)) - Number(engineAlive(a)) || a.lane.localeCompare(b.lane))

export function eventText(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const t = o.type ?? o.name ?? o.event
    if (typeof t === 'string') return t
  }
  return JSON.stringify(v)
}

export function EnginesTable({ body, now }: { body: EnginesBody | null; now?: number }) {
  if (!body) return <p className="text-sm text-muted-foreground" data-testid="engines-loading">Loading...</p>
  const rows = sortEngines(body.engines ?? [])
  const t = (iso?: string | null) => (iso ? relTime(iso, now) || 'never' : 'never')
  if (!rows.length) {
    return (
      <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground" data-testid="engines-empty">
        {body.error === 'not_granted' ? 'The engines grant is missing: this console cannot read the lane engines yet.' : body.error ? 'Engines could not be read (' + body.error + ').' : 'No engines reported.'}
      </p>
    )
  }
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {['Lane', 'Owner', 'Status', 'Last prompt', 'Last stop', 'Last event', 'Checked'].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const alive = engineAlive(e)
            return (
              <TableRow key={e.lane} data-testid="engine-row" data-lane={e.lane} data-alive={alive ? 'true' : 'false'}>
                <TableCell className="font-mono text-xs font-medium">{e.lane}</TableCell>
                <TableCell className="text-xs">{e.owner ? displayName(e.owner) : ''}</TableCell>
                <TableCell>
                  <Badge className={alive ? 'bg-ok/15 text-ok' : undefined} variant={alive ? 'secondary' : 'destructive'} title={e.status ?? ''} data-testid="engine-status">
                    {alive ? 'alive' : 'dead'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{t(e.last_prompt_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t(e.last_stop_at)}</TableCell>
                <TableCell className="max-w-64 truncate text-xs" title={eventText(e.last_event)}>{eventText(e.last_event)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t(e.checked_at)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function EnginesPage() {
  const [body, setBody] = useState<EnginesBody | null>(null)
  const load = useCallback(async () => {
    const r = await call<EnginesBody>('/api/engines')
    const b = r.body ?? {}
    // A 403 with not_granted reads the same as a 200 with an empty list and the error.
    setBody(Array.isArray(b.engines) || b.error ? b : { engines: [], error: r.ok ? undefined : 'unavailable' })
  }, [])
  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState !== 'hidden') void load() }
    const t = setInterval(tick, 30000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [load])
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="engines-page">
      <PageHeader title="Engines">
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void load()}>
          <RefreshCwIcon />
          Refresh
        </Button>
      </PageHeader>
      <div className="mx-auto w-full max-w-[1100px] flex-1 overflow-y-auto px-4 py-6">
        <EnginesTable body={body} />
      </div>
    </div>
  )
}
