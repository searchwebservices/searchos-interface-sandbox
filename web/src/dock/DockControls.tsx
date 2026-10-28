// The lane header's part of the dock: the Surfaces menu (what this lane can open), hide and restore, and the chip
// for the lane's selected resource.
import { LayoutPanelLeftIcon, PanelRightCloseIcon, PanelRightOpenIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useApp } from '@/app/AppContext'
import { STANDING, STANDING_TITLE } from '@/lib/dock'
import { useDock } from './context'

export function SelectionChip() {
  const d = useDock()
  if (!d.selection) return null
  return (
    <span className="inline-flex max-w-48 items-center gap-1 rounded-full border bg-secondary py-0.5 pl-2 pr-1 text-xs" data-testid="selection-chip">
      <span className="text-muted-foreground">{d.selection.kind}</span>
      <span className="truncate font-medium">{d.selection.label}</span>
      <button type="button" aria-label="Clear selection" className="rounded-full p-0.5 hover:bg-accent" onClick={() => d.select(null)}>
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

// Multi-select: a click toggles the surface and the menu stays until the person clicks outside or presses Esc.
// Radix still runs onCheckedChange when the select event is default-prevented.
const keepOpen = (e: Event) => e.preventDefault()

export function DockControls(_: { kind: 'dm' | 'group' | 'desk' }) {
  const app = useApp()
  const d = useDock()
  const defaults = d.defaults
  const open = new Set(d.state.surfaces.map((s) => s.id))
  const shown = d.narrow ? d.sheetOpen : !d.state.hidden && d.state.surfaces.length > 0
  return (
    <>
      {!d.fixed && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" data-testid="surfaces-menu">
              <LayoutPanelLeftIcon />
              <span className="hidden sm:inline">Surfaces</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Open in the dock</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STANDING.map((id) => (
              <DropdownMenuCheckboxItem key={id} checked={open.has(id)} onCheckedChange={(on) => (on ? d.openStanding(id) : app.dock.close(d.lane, id))} onSelect={keepOpen} data-testid={'surface-item-' + id}>
                {STANDING_TITLE[id]}
                {defaults.includes(id) && <span className="ml-auto pl-2 text-xs text-muted-foreground">default</span>}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {d.state.surfaces.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="dock-toggle"
          aria-label={shown ? 'Hide dock' : 'Show dock'}
          aria-pressed={shown}
          onClick={() => (d.narrow ? d.setSheetOpen(!d.sheetOpen) : shown ? d.hide() : d.restore())}
        >
          {shown ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
        </Button>
      )}
    </>
  )
}
