// LEGACY (unrouted since the fold into the CRM): #/apps/clients now redirects to the CRM, see ../ClientsRedirect.tsx.
// #/apps/clients: the roster as a map (Search in the middle, clients around it, projects hanging off them) or a list.
import { Suspense, useCallback, useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, LayoutListIcon, NetworkIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { go } from '@/app/router'
import { SearchMark } from '@/components/SearchMark'
import { AppPage } from '../AppPage'
import { TreeCanvas } from '../canvas/lazy'
import { layoutGrid } from '../canvas/layout'
import { absDate, initialsOf, money, relDate } from '../format'
import { Pill, StatusDot } from '../tiles'
import { EmptyState, useAppApi } from '../useAppApi'
import type { ClientRow, ClientsBody } from '../types'
import { clientsTree, filterClients, healthTone, sortClients } from './clients'
import type { MapNode, SortDir, SortKey } from './clients'

const VIEW_KEY = 'apps.clients.view'
type View = 'map' | 'list'
const readView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'map' } catch { return 'map' }
}
const saveView = (v: View) => {
  try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ }
}

export const openClient = (id: string) => go({ name: 'apps-client', id })

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3" data-testid="clients-stat" data-label={label}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('truncate text-lg font-semibold', tone === 'bad' && 'text-destructive')}>{value}</div>
    </div>
  )
}

function MapTile({ n }: { n: MapNode }) {
  if (n.kind === 'search') {
    return (
      <div data-testid="map-tile" data-kind="search" className="flex h-full w-full items-center justify-center gap-2 rounded-xl border-2 border-primary bg-card text-foreground">
        <SearchMark className="size-7" />
        <span className="text-sm font-semibold">Search</span>
      </div>
    )
  }
  if (n.kind === 'client' && n.client) {
    const c = n.client
    return (
      <div data-testid="map-tile" data-kind="client" data-id={c.id} className="flex h-full w-full cursor-pointer items-center gap-2 rounded-lg border bg-card px-2 text-card-foreground hover:border-ring">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground" aria-hidden>{initialsOf(c.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
            <StatusDot tone={healthTone(c.health)} label={'health ' + (c.health ?? 'unknown')} />
            {c.overdue && <span className="text-xs font-bold text-destructive" title="Overdue" data-testid="overdue-mark">!</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">{[c.tier, c.mrr_mxn != null ? money(c.mrr_mxn) : ''].filter(Boolean).join(' / ')}</div>
        </div>
      </div>
    )
  }
  if (n.kind === 'cluster') {
    const count = n.children?.length ?? 0
    return (
      <div data-testid="map-tile" data-kind="cluster" className="flex h-full w-full items-center justify-between rounded-lg border bg-secondary px-3 text-secondary-foreground">
        <span className="truncate text-sm font-semibold">{n.title}</span>
        <Pill>{count}</Pill>
      </div>
    )
  }
  if (n.kind === 'more') {
    return <div data-testid="map-tile" data-kind="more" className="flex h-full w-full cursor-pointer items-center rounded-md border border-dashed bg-card px-2 text-xs text-muted-foreground">{n.title}</div>
  }
  const p = n.project
  return (
    <div data-testid="map-tile" data-kind="project" className="flex h-full w-full cursor-pointer flex-col justify-center rounded-md border border-dashed bg-card px-2 text-card-foreground hover:border-ring">
      <span className="truncate text-xs font-medium">{n.title}</span>
      <span className="truncate text-[0.6875rem] text-muted-foreground">{[p?.type, p?.status].filter(Boolean).join(' / ') || 'project'}</span>
    </div>
  )
}

export function ClientsMap({ rows }: { rows: ClientRow[] }) {
  const tree = useMemo(() => clientsTree(rows), [rows])
  // 61 radial tiles would not fit a ring, so the roster is a grid per health cluster with the projects stacked under each client.
  const layout = useMemo(() => layoutGrid(tree, { tileW: 200, tileH: 64 }), [tree])
  const byId = useMemo(() => new Map(layout.nodes.map((p) => [p.id, p.node])), [layout])
  const render = useCallback((n: MapNode) => <MapTile n={n} />, [])
  // Open on what needs attention: Search, the first cluster and its clients. The rest is a pan or a Fit away.
  const fitIds = useMemo(() => {
    const first = tree.children?.[0]
    return first ? [tree.id, first.id, ...(first.children ?? []).slice(0, 12).map((c) => c.id)] : undefined
  }, [tree])
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading the map...</p>}>
      <TreeCanvas layout={layout} render={render} flow="v" fitIds={fitIds} label="Clients map" minimap onSelect={(id) => { const n = byId.get(id); if (n?.client) openClient(n.client.id) }} />
    </Suspense>
  )
}

const COLS: { key: SortKey; label: string; cls?: string }[] = [
  { key: 'client', label: 'Client' },
  { key: 'projects', label: 'Projects', cls: 'hidden md:table-cell' },
  { key: 'mrr', label: 'MRR' },
  { key: 'health', label: 'Health' },
  { key: 'ball', label: 'Ball', cls: 'hidden md:table-cell' },
  { key: 'last_contact', label: 'Last contact', cls: 'hidden lg:table-cell' },
]

export function ClientsList({ rows, query, onQuery }: { rows: ClientRow[]; query: string; onQuery: (q: string) => void }) {
  const [key, setKey] = useState<SortKey>('mrr')
  const [dir, setDir] = useState<SortDir>('desc')
  const shown = useMemo(() => sortClients(filterClients(rows, query), key, dir), [rows, query, key, dir])
  const sort = (k: SortKey) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setKey(k); setDir(k === 'client' || k === 'ball' ? 'asc' : 'desc') }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="clients-list">
      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Filter clients" aria-label="Filter clients" className="pl-8" data-testid="clients-filter" />
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {COLS.map((c) => (
                <TableHead key={c.key} className={c.cls} aria-sort={key === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="inline-flex items-center gap-1 font-medium" data-testid={'sort-' + c.key} onClick={() => sort(c.key)}>
                    {c.label}
                    {key === c.key && (dir === 'asc' ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((c) => (
              <TableRow key={c.id} data-testid="client-row" data-id={c.id} className="cursor-pointer" tabIndex={0} onClick={() => openClient(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') openClient(c.id) }}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6875rem] font-semibold">{initialsOf(c.name)}</span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{[c.tier, c.company_name].filter(Boolean).join(' / ')}</div>
                    </div>
                    {c.overdue && <Pill tone="bad">overdue</Pill>}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{c.projects.length}</TableCell>
                <TableCell className="whitespace-nowrap">{money(c.mrr_mxn)}</TableCell>
                <TableCell><span className="inline-flex items-center gap-1.5"><StatusDot tone={healthTone(c.health)} label={c.health ?? 'unknown'} /><span className="hidden sm:inline">{c.health ?? ''}</span></span></TableCell>
                <TableCell className="hidden md:table-cell">{c.ball ?? ''}</TableCell>
                <TableCell className="hidden lg:table-cell" title={absDate(c.last_contact_at)}>{relDate(c.last_contact_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!shown.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="clients-none">No clients match.</p>}
      </div>
    </div>
  )
}

export function ClientsPage() {
  const { state, reload } = useAppApi<ClientsBody>('/api/apps/clients')
  const [view, setViewState] = useState<View>(readView)
  const [query, setQuery] = useState('')
  const setView = (v: View) => { setViewState(v); saveView(v) }
  const ok = state.kind === 'ok' && Array.isArray(state.data?.clients) ? state.data : null
  const t = ok?.totals
  return (
    <AppPage
      testid="apps-clients-page"
      crumbs={[{ label: 'Apps' }, { label: 'Clients' }]}
      title="Clients"
      context={'Clients, ' + view + ' view' + (view === 'list' && query.trim() ? ', filter: ' + query.trim() : '')}
      actions={
        <>
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="View">
            <Button type="button" size="xs" variant={view === 'map' ? 'secondary' : 'ghost'} aria-pressed={view === 'map'} data-testid="view-map" onClick={() => setView('map')}><NetworkIcon />Map</Button>
            <Button type="button" size="xs" variant={view === 'list' ? 'secondary' : 'ghost'} aria-pressed={view === 'list'} data-testid="view-list" onClick={() => setView('list')}><LayoutListIcon />List</Button>
          </div>
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Refresh clients" onClick={reload}><RefreshCwIcon /></Button>
        </>
      }
    >
      {ok ? (
        <>
          <div className="grid grid-cols-2 gap-2 border-b p-3 md:grid-cols-4" data-testid="clients-strip">
            <Stat label="Clients" value={String(t?.clients ?? ok.clients.length)} />
            <Stat label="Active" value={String(t?.active ?? 0)} />
            <Stat label="MRR" value={money(t?.mrr_mxn ?? 0)} />
            <Stat label="Overdue" value={String(t?.overdue ?? 0)} tone={t?.overdue ? 'bad' : undefined} />
          </div>
          {ok.clients.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground" data-testid="clients-empty">No clients yet.</p>
          ) : view === 'map' ? (
            <ClientsMap rows={ok.clients} />
          ) : (
            <ClientsList rows={ok.clients} query={query} onQuery={setQuery} />
          )}
        </>
      ) : (
        <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 0 } : state} onRetry={reload} />
      )}
    </AppPage>
  )
}
