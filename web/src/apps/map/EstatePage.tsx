// #/apps/map: the SearchOS estate as a mind map. Tree panel on the left (expand, filter, arrows), the canvas in the
// middle, the selected node's meta on the right. Only expanded nodes get tiles.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, ListTreeIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { relDate } from '../format'
import { AppPage } from '../AppPage'
import { TreeCanvas } from '../canvas/lazy'
import { layoutLayered } from '../canvas/layout'
import { KindIcon, Pill, StatusDot } from '../tiles'
import { EmptyState, useAppApi } from '../useAppApi'
import type { EstateBody, EstateNode } from '../types'
import { ancestorsOf, countNodes, indexTree, initialExpanded, limitedTree, metaValue, onTreeKey, pagesToReveal, statusTone, visibleRows } from './estate'
import type { ViewNode } from './estate'


function Tile({ node, selected }: { node: ViewNode; selected: boolean }) {
  if (node.more) {
    return (
      <div data-testid="estate-more" data-parent={node.more.parent} className="flex h-full w-full cursor-pointer flex-col justify-center rounded-lg border border-dashed bg-card px-3 text-card-foreground hover:border-ring">
        <span className="text-sm font-medium">{node.title}</span>
        <span className="truncate text-xs text-muted-foreground">{node.subtitle}</span>
      </div>
    )
  }
  return (
    <div data-testid="estate-tile" data-id={node.id} data-kind={node.kind} data-selected={selected ? 'true' : 'false'} className={cn('flex h-full w-full cursor-pointer flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 text-card-foreground', selected ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-ring')}>
      <div className="flex items-center gap-2">
        <KindIcon kind={node.kind} className="text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.title}</span>
        {node.status && <StatusDot tone={statusTone(node.status)} label={node.status} />}
      </div>
      <div className="truncate pl-6 text-xs text-muted-foreground">{node.subtitle || node.kind}</div>
    </div>
  )
}

function Detail({ node }: { node: EstateNode | null }) {
  if (!node) return <p className="text-sm text-muted-foreground" data-testid="estate-detail-empty">Select a node to see its details.</p>
  const meta = Object.entries(node.meta ?? {})
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="estate-detail" data-id={node.id}>
      <div className="flex items-center gap-2">
        <KindIcon kind={node.kind} className="text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{node.title}</span>
        <Pill>{node.kind}</Pill>
      </div>
      {node.subtitle && <p className="text-xs text-muted-foreground">{node.subtitle}</p>}
      {node.status && <p className="flex items-center gap-2 text-xs"><StatusDot tone={statusTone(node.status)} />{node.status}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" data-testid="estate-meta">
        {meta.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words font-mono">{metaValue(v)}</dd>
          </div>
        ))}
      </dl>
      {!meta.length && <p className="text-xs text-muted-foreground">No extra details.</p>}
      {!!node.children?.length && <p className="text-xs text-muted-foreground">{node.children.length} children</p>}
    </div>
  )
}

export function EstateTree({ body, onSelectTitle }: { body: EstateBody; onSelectTitle?: (title: string) => void }) {
  const root = body.root
  const index = useMemo(() => indexTree(root), [root])
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded(root))
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState<Map<string, number>>(() => new Map())
  const [panel, setPanel] = useState(false)
  const rowsRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => visibleRows(root, expanded, query), [root, expanded, query])
  const view = useMemo(() => limitedTree(root, expanded, pages), [root, expanded, pages])
  const layout = useMemo(() => layoutLayered(view, expanded), [view, expanded])
  const node = selected ? index.get(selected)?.node ?? null : null
  useEffect(() => { onSelectTitle?.(node?.title ?? '') }, [node, onSelectTitle])

  const reveal = useCallback((id: string, open: Set<string>) => {
    for (const a of ancestorsOf(index, id)) open.add(a)
    return open
  }, [index])
  const pick = useCallback((id: string, opts: { toggle?: boolean } = {}) => {
    setPages((cur) => pagesToReveal(index, id, cur))
    setExpanded((cur) => {
      const next = reveal(id, new Set(cur))
      const n = index.get(id)?.node
      if (n?.children?.length) {
        if (!next.has(id)) next.add(id)
        else if (opts.toggle && id === selected) next.delete(id)
      }
      return next
    })
    setSelected(id)
  }, [index, reveal, selected])

  useEffect(() => {
    rowsRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  const render = useCallback((n: ViewNode) => <Tile node={n} selected={n.id === selected} />, [selected])
  const toggleRow = (id: string) => { setExpanded((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  // A tile click: "+N more" opens the next page; any other tile selects and opens or closes. The viewport never moves.
  const tileClick = (id: string) => {
    const more = layout.nodes.find((p) => p.id === id)?.node.more
    if (more) { setPages((cur) => new Map(cur).set(more.parent, (cur.get(more.parent) ?? 1) + 1)); return }
    setSelected(id)
    setExpanded((cur) => {
      const next = new Set(cur)
      const n = index.get(id)?.node
      if (n?.children?.length) { if (!next.has(id)) next.add(id); else if (id === selected) next.delete(id) }
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row" data-testid="estate-map" data-nodes={countNodes(root)}>
      <div className={cn('flex min-h-0 flex-col border-b md:w-72 md:shrink-0 md:border-r md:border-b-0', panel ? 'max-h-[45%] flex-1' : 'hidden md:flex')} data-testid="estate-tree-panel">
        <div className="relative p-2">
          <SearchIcon className="pointer-events-none absolute top-4 left-4 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter the estate" aria-label="Filter the estate" className="pl-8" data-testid="estate-filter" />
        </div>
        <div
          ref={rowsRef}
          role="tree"
          tabIndex={0}
          aria-label="Estate tree"
          data-testid="estate-tree"
          className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && selected) { e.preventDefault(); pick(selected, { toggle: true }); return }
            const r = onTreeKey(e.key, rows, selected, expanded, index)
            if (!r) return
            e.preventDefault()
            setExpanded(r.expanded)
            setSelected(r.selected)
          }}
        >
          {rows.map((r) => (
            <div key={r.node.id} role="treeitem" aria-selected={r.node.id === selected} aria-expanded={r.hasKids ? r.open : undefined} data-testid="estate-row" data-id={r.node.id} style={{ paddingLeft: r.depth * 12 }} className={cn('flex items-center gap-1 rounded-md pr-1 text-sm', r.node.id === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}>
              <button type="button" tabIndex={-1} aria-label={r.open ? 'Collapse' : 'Expand'} className={cn('inline-flex size-6 shrink-0 items-center justify-center', !r.hasKids && 'invisible')} onClick={() => toggleRow(r.node.id)}>
                {r.open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
              </button>
              <button type="button" tabIndex={-1} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={() => pick(r.node.id)}>
                <KindIcon kind={r.node.kind} className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{r.node.title}</span>
                {r.node.status && <StatusDot tone={statusTone(r.node.status)} label={r.node.status} />}
                <span className="shrink-0 rounded bg-secondary px-1 text-[0.625rem] text-secondary-foreground uppercase" data-testid="kind-badge">{r.node.kind}</span>
              </button>
            </div>
          ))}
          {!rows.length && <p className="px-3 py-4 text-sm text-muted-foreground" data-testid="estate-no-match">Nothing matches.</p>}
        </div>
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <Button type="button" variant="outline" size="sm" className="absolute top-2 left-2 z-10 md:hidden" onClick={() => setPanel((v) => !v)} data-testid="estate-tree-toggle" aria-pressed={panel}>
          <ListTreeIcon />
          Tree
        </Button>
        <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading the map...</p>}>
          <TreeCanvas layout={layout} render={render} onSelect={tileClick} label="SearchOS estate map" minimap />
        </Suspense>
        <aside className="max-h-40 overflow-y-auto border-t bg-card p-3 md:absolute md:top-3 md:right-3 md:max-h-[55%] md:w-64 md:rounded-lg md:border md:shadow-sm" data-testid="estate-detail-panel">
          <Detail node={node} />
        </aside>
      </div>
    </div>
  )
}

export function EstatePage() {
  const { state, reload } = useAppApi<EstateBody>('/api/apps/estate')
  const [selTitle, setSelTitle] = useState('')
  const ok = state.kind === 'ok' && state.data?.root ? state.data : null
  return (
    <AppPage
      testid="apps-map-page"
      crumbs={[{ label: 'Apps' }, { label: 'SearchOS map' }]}
      title="SearchOS map"
      context={'SearchOS map' + (ok ? ', ' + countNodes(ok.root) + ' nodes' : '') + (selTitle ? ', selected: ' + selTitle : '')}
      actions={
        <>
          {ok?.generated_at && <span className="hidden text-xs text-muted-foreground sm:inline" title={ok.generated_at}>{relDate(ok.generated_at)}</span>}
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Refresh the map" onClick={reload}><RefreshCwIcon /></Button>
        </>
      }
    >
      {ok ? <EstateTree key={ok.generated_at ?? 'tree'} body={ok} onSelectTitle={setSelTitle} /> : <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 0 } : state} onRetry={reload} />}
    </AppPage>
  )
}
