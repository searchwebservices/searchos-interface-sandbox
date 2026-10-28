// The n8n-style LAN map: @xyflow/react with custom node cards styled by theme tokens. Pan, zoom, minimap, controls,
// search that focuses a node, click to open the shared DeviceProfile. Imported lazily by the #/lan page, so the
// library only loads when the page is opened.
import '@xyflow/react/dist/style.css'
import './lan.css'
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { applyNodeChanges, Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { FilterIcon, LayoutGridIcon, MaximizeIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApp } from '@/app/AppContext'
import { DockContext } from '@/dock/context'
import { cn } from '@/lib/utils'
import { relTime } from '@/lib/time'
import { DeviceProfile } from './DeviceProfile'
import { LensBar } from './LensBar'
import { clampSpacing, layoutLan, SPACING_MAX, SPACING_MIN, SPACING_STEP, type LayoutNode } from './layout'
import { useLanUi } from './lanState'
import { allNodes, CLASS_LABEL, CLASS_ORDER, classCounts, lensActive, lensPool, matchesLens, matchesQuery, selectionNodeId, STATUS_ORDER, STATUS_WORD, type LanNode, type NodeStatus } from './model'
import type { LanData } from './useLanData'

const DOT: Record<NodeStatus, string> = { online: 'bg-ok', offline: 'bg-muted-foreground', pending: 'bg-warn', denied: 'bg-destructive' }
const MINI: Record<NodeStatus, string> = { online: 'var(--ok)', offline: 'var(--muted-foreground)', pending: 'var(--warn)', denied: 'var(--destructive)' }
const CLASS_VAR = { personal_family: 'var(--class-personal)', smart_home: 'var(--class-smart)', lcav: 'var(--class-lcav)', search: 'var(--class-search)' } as const

interface CardData extends Record<string, unknown> {
  node: LanNode
  person: string
  focused: boolean
  dim: boolean
}
interface GroupData extends Record<string, unknown> {
  title: string
}

const KIND_WORD = { gateway: 'Gateway', switch: 'Switch', box: 'This box', device: '' } as const

const LanCard = memo(function LanCard({ data }: NodeProps<Node<CardData, 'lan'>>) {
  const n = data.node
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${n.label}, ${STATUS_WORD[n.status]}`}
      data-testid="lan-node"
      data-id={n.id}
      data-status={n.status}
      data-focused={data.focused}
      data-class={n.cls ?? undefined}
      data-dim={data.dim}
      className={cn(
        'lan-class-bar flex h-full w-full cursor-pointer flex-col justify-center gap-1 rounded-lg border bg-card px-3 text-card-foreground outline-none transition-opacity hover:border-ring focus-visible:ring-2 focus-visible:ring-ring',
        data.focused ? 'border-primary ring-2 ring-primary' : 'border-border',
        data.dim && 'opacity-30',
        n.inferred && 'border-dashed',
      )}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="flex items-center gap-2">
        <span className={cn('size-2.5 shrink-0 rounded-full', DOT[n.status])} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.label}</span>
        {n.kind !== 'device' && <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">{KIND_WORD[n.kind]}</span>}
      </div>
      {n.cls && (
        <span className="w-fit text-[10px] tracking-wide text-muted-foreground uppercase" data-testid="lan-class">
          {CLASS_LABEL[n.cls]}
        </span>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{n.ip ?? 'no ip'}</span>
        <span className="min-w-0 flex-1 truncate">{n.vendor ?? ''}</span>
      </div>
      {data.person && (
        <span className="w-fit max-w-full truncate rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground" data-testid="lan-chip">
          {data.person}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
})

const GroupLabel = memo(function GroupLabel({ data }: NodeProps<Node<GroupData, 'group'>>) {
  return (
    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase" data-testid="lan-group">
      {data.title}
    </div>
  )
})

const nodeTypes = { lan: LanCard, group: GroupLabel }

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Inner({ data, compact }: { data: LanData; compact: boolean }) {
  const { model } = data
  const flow = useReactFlow()
  const { store } = useApp()
  const person = store.me?.person
  // Lenses, spacing, focus and the open profile live in one store shared with the dock surface (see lanState).
  const ui = useLanUi(person)
  const { lens, spacing, focus, open, setLens, setFocus, setOpen } = ui
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Inside a lane's dock the lane's selected device is drawn focused too.
  const dock = useContext(DockContext)
  const selected = model && dock?.selection?.kind === 'device' ? selectionNodeId(model, dock.selection.id) : ''
  const query = lens.q
  const setQuery = (q: string) => setLens((l) => ({ ...l, q }))
  const now = model?.generatedAt ? Date.parse(model.generatedAt) || Date.now() : Date.now()
  const dragged = useRef<Record<string, { x: number; y: number }>>({})
  const personName = useCallback((n: LanNode) => data.people.find((p) => p.id === n.assignment?.person)?.name ?? n.assignment?.person ?? '', [data.people])
  const hits = useMemo(() => (model && query.trim() ? allNodes(model).filter((n) => matchesQuery(n, query, personName(n))) : []), [model, query, personName])
  const searching = !!query.trim()
  const filtering = lensActive(lens)
  const matchSet = useMemo(() => new Set(model ? allNodes(model).filter((n) => n.kind === 'switch' || matchesLens(n, lens, now, personName(n))).map((n) => n.id) : []), [model, lens, now, personName])
  const pool = useMemo(() => (model ? lensPool(model) : []), [model])
  const matching = pool.filter((n) => matchSet.has(n.id)).length
  const cc = useMemo(() => classCounts(model), [model])
  const setSpacing = (v: number) => {
    dragged.current = {}
    ui.setSpacing(clampSpacing(v))
  }

  const spacingSeen = useRef(spacing)
  if (spacingSeen.current !== spacing) {
    spacingSeen.current = spacing
    dragged.current = {}
  }
  const layout = useMemo(() => (model ? layoutLan(model, undefined, spacing) : { nodes: [] as LayoutNode[], edges: [] }), [model, spacing])
  const built = useMemo<Node[]>(
    () =>
      layout.nodes.map((l) => ({
        id: l.id,
        type: l.type,
        position: dragged.current[l.id] ?? l.position,
        width: l.width,
        height: l.height,
        draggable: l.type === 'lan',
        selectable: false,
        focusable: l.type === 'lan',
        data: l.type === 'lan' ? ({ node: l.node!, person: personName(l.node!), focused: focus === l.id || selected === l.id, dim: filtering && !matchSet.has(l.id) } satisfies CardData) : ({ title: l.title! } satisfies GroupData),
      })),
    [layout, focus, selected, filtering, matchSet, personName],
  )
  const [nodes, setNodes] = useState<Node[]>(built)
  useEffect(() => setNodes(built), [built])

  const edges = useMemo(
    () =>
      layout.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: 'smoothstep', selectable: false, focusable: false, className: 'lan-edge-' + e.status })),
    [layout.edges],
  )

  const duration = reducedMotion() ? 0 : 300
  const focusOn = (id: string) => {
    setFocus(id)
    void flow.fitView({ nodes: [{ id }], duration, maxZoom: 1.1, padding: 0.6 })
  }
  const relayout = () => {
    dragged.current = {}
    setNodes(built.map((n) => ({ ...n, position: layout.nodes.find((l) => l.id === n.id)?.position ?? n.position })))
    void flow.fitView({ duration, padding: 0.15 })
  }

  // Alt + and Alt - change the spacing from anywhere on the page except inside a text field.
  const spacingRef = useRef(spacing)
  spacingRef.current = spacing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && (t as HTMLInputElement).type !== 'range') return
      const up = e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '='
      const down = e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_'
      if (!up && !down) return
      e.preventDefault()
      setSpacing(spacingRef.current + (up ? SPACING_STEP : -SPACING_STEP))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const fit = () => void flow.fitView({ duration, padding: 0.15 })

  if (!model) return <p className="p-4 text-sm text-muted-foreground" data-testid="lan-status">{data.error || 'Reading lan-watch...'}</p>
  const c = model.counts

  const flowEl = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={(ch) => setNodes((ns) => applyNodeChanges(ch, ns))}
      onNodeClick={(_, n) => {
        if (n.type === 'lan') {
          setFocus(n.id)
          setOpen(n.id)
        }
      }}
      onNodeDragStop={(_, n) => {
        dragged.current[n.id] = n.position
      }}
      onPaneClick={() => setFocus(null)}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
      fitViewOptions={{ padding: 0.15, duration: 0 }}
      minZoom={0.15}
      maxZoom={1.6}
      preventScrolling
      panOnDrag
      zoomOnPinch
      aria-label="LAN map"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
      <Controls showInteractive={false} position="bottom-left" />
      {!compact && <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={0} nodeColor={(n) => { const nd = (n.data as Partial<CardData>)?.node; return nd ? (nd.cls ? CLASS_VAR[nd.cls] : MINI[nd.status]) : 'transparent' }} />}
    </ReactFlow>
  )
  const searchEl = (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) focusOn(hits[0].id)
          if (e.key === 'Escape') setQuery('')
        }}
        placeholder="Find a device"
        aria-label="Find a device"
        className="pl-8"
        data-testid="lan-search"
      />
    </div>
  )
  const hitsEl = searching ? (
    <ul className="flex flex-col gap-0.5" aria-label="Matches" data-testid="lan-hits">
      {hits.slice(0, 8).map((n) => (
        <li key={n.id}>
          <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted" data-testid="lan-hit" data-id={n.id} onClick={() => focusOn(n.id)}>
            <span className={cn('size-2 shrink-0 rounded-full', DOT[n.status])} />
            <span className="min-w-0 flex-1 truncate">{n.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{n.ip ?? ''}</span>
          </button>
        </li>
      ))}
      {hits.length === 0 && <li className="px-2 py-1 text-sm text-muted-foreground">No device matches.</li>}
    </ul>
  ) : null
  const spacingControl = (
    <div className="flex items-center gap-2" data-testid="lan-spacing-box">
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" htmlFor={compact ? 'lan-spacing-dock' : 'lan-spacing'}>
        Spacing
        <span className="font-mono" data-testid="lan-spacing-value">{spacing.toFixed(2)}x</span>
      </label>
      <input
        id={compact ? 'lan-spacing-dock' : 'lan-spacing'}
        type="range"
        min={SPACING_MIN}
        max={SPACING_MAX}
        step={SPACING_STEP}
        value={spacing}
        onChange={(e) => setSpacing(Number(e.target.value))}
        className="min-w-0 flex-1 accent-primary"
        aria-label="Node spacing"
        aria-keyshortcuts="Alt+Plus Alt+Minus"
        data-testid="lan-spacing"
      />
      <Button type="button" size="sm" variant="outline" onClick={fit} data-testid="lan-fit">
        <MaximizeIcon /> Fit
      </Button>
    </div>
  )

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="lan-page" data-compact="true">
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {searchEl}
          <Button type="button" size="icon-sm" variant={filtering || filtersOpen ? 'secondary' : 'outline'} aria-label="Filters" aria-pressed={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} data-testid="lan-filters-toggle">
            <FilterIcon />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Tidy layout" onClick={relayout} data-testid="lan-relayout">
            <LayoutGridIcon />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Refresh LAN" onClick={data.reload} disabled={data.loading} data-testid="lan-refresh">
            <RefreshCwIcon />
          </Button>
        </div>
        {filtersOpen && <LensBar lens={lens} onChange={setLens} matching={matching} total={pool.length} classCounts={cc} />}
        {hitsEl && <div className="border-b px-3 pb-2">{hitsEl}</div>}
        <div className="lan-flow relative min-h-[200px] flex-1" data-testid="lan-canvas">
          {flowEl}
          <DeviceProfile nodeId={open} data={data} onClose={() => setOpen(null)} variant="panel" />
        </div>
        <div className="flex flex-col gap-1 border-t px-3 py-2">
          {spacingControl}
          <p className="text-xs text-muted-foreground" data-testid="lan-counts-compact">
            {c.online} online of {c.total}. {model.lastScan ? `Last scan ${relTime(model.lastScan)}.` : 'No scan time reported.'}
            {filtering ? ` ${matching} of ${pool.length} match.` : ''}
          </p>
          {data.error && <p className="text-xs text-destructive" data-testid="topology-status">{data.error} Showing the last reading.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row" data-testid="lan-page">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <LensBar lens={lens} onChange={setLens} matching={matching} total={pool.length} classCounts={cc} />
      <div className="lan-flow relative min-h-[320px] flex-1" data-testid="lan-canvas">
        {flowEl}
      </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t p-4 md:w-72 md:border-t-0 md:border-l" aria-label="LAN summary">
        {searchEl}
        {hitsEl && <div className="-mt-2">{hitsEl}</div>}

        <dl className="grid grid-cols-2 gap-2" data-testid="lan-counts">
          {(
            [
              ['Online', c.online],
              ['Offline', c.offline],
              ['Pending', c.pending],
              ['Denied', c.denied],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-card px-3 py-2">
              <dd className="text-lg font-semibold">{v}</dd>
              <dt className="text-xs text-muted-foreground">{k}</dt>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground" data-testid="lan-total">
          {c.total} known devices.{' '}
          <span data-testid="lan-scan">{model.lastScan ? `Last scan ${relTime(model.lastScan)}.` : 'No scan time reported.'}</span>
        </p>

        <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground" aria-label="Legend" data-testid="lan-legend">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn('size-2.5 rounded-full', DOT[s])} />
              {STATUS_WORD[s]}
            </li>
          ))}
          {CLASS_ORDER.map((c) => (
            <li key={c} className="flex items-center gap-2" data-testid="lan-legend-class" data-class={c}>
              <span className="lan-class-dot size-2.5 rounded-sm" />
              {CLASS_LABEL[c]} <span className="ml-auto">{cc[c]}</span>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="h-3 w-5 rounded-sm border border-dashed border-border" />
            drawn from a guess, not seen by lan-watch
          </li>
        </ul>

        <div className="flex flex-col gap-1.5">
          {spacingControl}
          <p className="text-[10px] text-muted-foreground">Alt + and Alt - change it. Zoom is separate.</p>
        </div>

        <div className="mt-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={relayout} data-testid="lan-relayout">
            <LayoutGridIcon /> Tidy layout
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={data.reload} disabled={data.loading} data-testid="lan-refresh">
            Refresh
          </Button>
        </div>
        {data.error && <p className="text-xs text-destructive">{data.error} Showing the last reading.</p>}
      </aside>
      <DeviceProfile nodeId={open} data={data} onClose={() => setOpen(null)} variant="drawer" />
    </div>
  )
}

// compact: the Network topology dock surface. Same canvas, lenses, spacing and profile; the summary column becomes a
// toolbar and a footer, and the profile an overlay panel inside the surface.
export default function LanCanvas({ data, compact = false }: { data: LanData; compact?: boolean }) {
  return (
    <ReactFlowProvider>
      <Inner data={data} compact={compact} />
    </ReactFlowProvider>
  )
}
