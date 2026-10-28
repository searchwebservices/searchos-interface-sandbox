// The dock: a vertical strip of surface tabs (icon and title) plus one expanded panel, right of the conversation.
// Every open surface stays mounted (the collapsed ones are hidden), so collapsing never loses a thing. Under 900 px
// the same content is a bottom sheet. The divider is draggable between 360 and 520 px.
import { useRef } from 'react'
import type { ComponentProps, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useApp } from '@/app/AppContext'
import { CardSurface } from '@/cards/registry'
import { UnknownCard } from '@/cards/registry'
import { DOCK_MAX, DOCK_MIN, isStanding } from '@/lib/dock'
import type { DockSurface, StandingId } from '@/lib/dock'
import { cn } from '@/lib/utils'
import { useDock } from './context'
import { iconOf } from './icons'
import { STANDING_VIEW } from './standing'

const STRIP = 'w-[4.5rem]'

function SurfaceBody({ surface }: { surface: DockSurface }) {
  const d = useDock()
  if (surface.kind === 'standing') {
    const View = isStanding(surface.id) ? STANDING_VIEW[surface.id] : undefined
    return View ? <View lane={d.lane} /> : <UnknownCard kind={surface.id} />
  }
  const card = d.cardById(surface.id.slice('card:'.length))
  if (!card) return <p className="px-4 text-sm text-muted-foreground" data-testid="surface-missing">This card is not in the thread any more.</p>
  return <CardSurface card={card as never} arg={surface.arg} />
}

// The one list of actions on a surface, in the right-click / long-press / keyboard (Shift F10, Menu key) context menu.
function surfaceMenu(surface: DockSurface, d: ReturnType<typeof useDock>, app: ReturnType<typeof useApp>) {
  const Item = ContextMenuItem
  const Sep = ContextMenuSeparator
  const i = d.state.surfaces.findIndex((s) => s.id === surface.id)
  const open = d.state.active === surface.id
  const standing = surface.kind === 'standing' && isStanding(surface.id)
  const isDefault = standing && d.defaults.includes(surface.id as StandingId)
  // In a fixed dock the standing surfaces cannot be closed or made (un)default.
  const pinned = standing && !!d.fixed?.includes(surface.id as StandingId)
  return (
    <>
      {!pinned && <Item onSelect={() => app.dock.close(d.lane, surface.id)}>Close</Item>}
      {!pinned && (
        <Item disabled={!standing} onSelect={() => d.setDefault(surface.id as StandingId, !isDefault)}>
          {isDefault ? 'Remove from defaults' : 'Make default for this lane'}
        </Item>
      )}
      <Item onSelect={() => (open ? app.dock.collapse(d.lane) : app.dock.expand(d.lane, surface.id))}>{open ? 'Collapse' : 'Expand'}</Item>
      <Sep />
      <Item disabled={i <= 0} onSelect={() => app.dock.move(d.lane, surface.id, -1)}>Move up</Item>
      <Item disabled={i < 0 || i >= d.state.surfaces.length - 1} onSelect={() => app.dock.move(d.lane, surface.id, 1)}>Move down</Item>
      <Sep />
      <Item onSelect={() => (d.narrow ? d.setSheetOpen(false) : d.hide())}>Hide dock</Item>
    </>
  )
}

// Right-click on a pointer, long press on touch (Radix opens the menu on both).
function SurfaceContextMenu({ surface, children }: { surface: DockSurface; children: ReactNode }) {
  const app = useApp()
  const d = useDock()
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent data-testid="surface-menu">{surfaceMenu(surface, d, app)}</ContextMenuContent>
    </ContextMenu>
  )
}

// A browser fires `contextmenu` for the Menu key and Shift F10 on its own; some do not, so the tab asks for it
// explicitly, at the tab's own corner. Enter and Space are the button's own click, which opens the surface.
function openMenuFromKey(e: KeyboardEvent<HTMLElement>) {
  if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return
  e.preventDefault()
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
}

function Tab({ surface, active, vertical, onClick, ...rest }: { surface: DockSurface; active: boolean; vertical: boolean; onClick: () => void } & Omit<ComponentProps<'button'>, 'onClick'>) {
  const Icon = iconOf(surface)
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={surface.title}
      {...rest}
      data-testid="dock-tab"
      data-surface={surface.id}
      onClick={onClick}
      onKeyDown={openMenuFromKey}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-md px-1 py-1.5 max-md:min-h-11 text-[0.6875rem] leading-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        vertical ? 'w-full flex-col text-center' : 'max-w-40 flex-row px-2 text-xs',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn('min-w-0', vertical ? 'line-clamp-2 break-words' : 'truncate')}>{surface.title}</span>
    </button>
  )
}

function Panels() {
  const d = useDock()
  const { surfaces, active } = d.state
  const current = surfaces.find((s) => s.id === active)
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="dock-panel-area">
      {current && (
        <SurfaceContextMenu surface={current}>
        <div className="flex items-center gap-1 border-b px-3 py-2" data-testid="dock-panel-header">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="dock-panel-title">
            {current.title}
          </h2>
        </div>
        </SurfaceContextMenu>
      )}
      {surfaces.map((s) => (
        <div key={s.id} hidden={s.id !== active} data-testid="dock-panel" data-surface={s.id} className={cn('min-h-0 flex-1 flex-col overflow-hidden pt-3', s.id === active ? 'flex' : 'hidden')}>
          <SurfaceBody surface={s} />
        </div>
      ))}
    </div>
  )
}

function Divider() {
  const app = useApp()
  const d = useDock()
  const start = useRef<{ x: number; w: number } | null>(null)
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, w: d.state.width }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current) app.dock.setWidth(d.lane, start.current.w + (start.current.x - e.clientX))
  }
  const up = () => {
    start.current = null
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') app.dock.setWidth(d.lane, d.state.width + 16)
    else if (e.key === 'ArrowRight') app.dock.setWidth(d.lane, d.state.width - 16)
    else return
    e.preventDefault()
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize dock"
      aria-valuemin={DOCK_MIN}
      aria-valuemax={DOCK_MAX}
      aria-valuenow={d.state.width}
      tabIndex={0}
      data-testid="dock-divider"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      className="w-1.5 shrink-0 cursor-col-resize touch-none bg-border/40 outline-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60"
    />
  )
}

// The drag handle of the phone sheet: pull it down to close. A tap on it does nothing; the X is still there.
function SheetHandle({ onClose }: { onClose: () => void }) {
  const y0 = useRef<number | null>(null)
  return (
    <div
      data-testid="dock-handle"
      className="flex h-10 shrink-0 touch-none items-center justify-center"
      onPointerDown={(e) => { y0.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId) }}
      onPointerMove={(e) => { if (y0.current !== null && e.clientY - y0.current > 72) { y0.current = null; onClose() } }}
      onPointerUp={() => { y0.current = null }}
      onPointerCancel={() => { y0.current = null }}
    >
      <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
    </div>
  )
}

export function Dock() {
  const app = useApp()
  const d = useDock()
  const { surfaces, active, hidden, width } = d.state
  if (!surfaces.length) return null
  const tabs = (vertical: boolean) => (
    <div role="tablist" aria-label="Surfaces" className={cn('flex gap-1', vertical ? 'flex-col p-1' : 'flex-row overflow-x-auto border-b p-1')}>
      {surfaces.map((s) => (
        <SurfaceContextMenu key={s.id} surface={s}>
          <Tab surface={s} vertical={vertical} active={s.id === active} onClick={() => (s.id === active ? app.dock.collapse(d.lane) : app.dock.expand(d.lane, s.id))} />
        </SurfaceContextMenu>
      ))}
    </div>
  )

  if (d.narrow) {
    return (
      <Sheet open={d.sheetOpen} onOpenChange={d.setSheetOpen}>
        <SheetContent side="bottom" className="h-[70svh] gap-0 p-0 max-md:h-dvh max-md:rounded-none max-md:pt-[env(safe-area-inset-top)]" data-testid="dock-sheet">
          <SheetHeader className="sr-only">
            <SheetTitle>Surfaces</SheetTitle>
            <SheetDescription>Surfaces open beside this conversation</SheetDescription>
          </SheetHeader>
          <SheetHandle onClose={() => d.setSheetOpen(false)} />
          {tabs(false)}
          <Panels />
        </SheetContent>
      </Sheet>
    )
  }

  if (hidden) return null
  const expanded = active !== null
  return (
    <aside className="flex min-h-0 shrink-0 border-l bg-card" data-testid="dock" data-expanded={expanded} aria-label="Surfaces dock">
      {expanded && <Divider />}
      {/* Always mounted, so collapsing only hides the panels: card surfaces keep their own state too. */}
      <div className={cn('min-h-0 flex-col', expanded ? 'flex' : 'hidden')} style={{ width }}>
        <Panels />
      </div>
      <nav className={cn('flex min-h-0 shrink-0 flex-col overflow-y-auto border-l bg-sidebar', STRIP)} aria-label="Surface tabs">
        {tabs(true)}
      </nav>
    </aside>
  )
}
