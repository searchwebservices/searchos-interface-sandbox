// The file browser around FileTile: a name search, newest first, and a grid or list. The grid is responsive tiles
// of at least 140 px, so a 360 px dock shows two columns and never clips.
import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LayoutGridIcon, ListIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readFilesView, writeFilesView } from '@/lib/prefs'
import type { FilesView } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import { FileTile } from './FileTile'
import type { TileAction, TileItem } from './FileTile'

export function useFilesView(): [FilesView, (v: FilesView) => void] {
  const [view, setView] = useState<FilesView>(readFilesView)
  return [
    view,
    (v) => {
      setView(v)
      writeFilesView(v)
    },
  ]
}

export function ViewToggle({ view, onChange }: { view: FilesView; onChange: (v: FilesView) => void }) {
  const btn = (v: FilesView, label: string, icon: ReactNode) => (
    <Button type="button" size="icon-xs" variant={view === v ? 'secondary' : 'ghost'} className="[@media(pointer:coarse)]:size-11" aria-pressed={view === v} aria-label={label} title={label} onClick={() => onChange(v)} data-testid={'view-' + v}>
      {icon}
    </Button>
  )
  return (
    <div role="group" aria-label="File view" className="flex gap-1" data-testid="view-toggle">
      {btn('grid', 'Grid view', <LayoutGridIcon />)}
      {btn('list', 'List view', <ListIcon />)}
    </div>
  )
}

export const GRID_COLUMNS = 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))'

export function newestFirst(a: TileItem, b: TileItem): number {
  const x = a.when ? Date.parse(a.when) || 0 : 0
  const y = b.when ? Date.parse(b.when) || 0 : 0
  return y - x || a.name.localeCompare(b.name)
}

export function FileGrid({ items, view, toolbar, actionsFor, onOpen, onAction, emptyText, countNote }: {
  items: TileItem[]
  view: FilesView
  toolbar?: ReactNode
  actionsFor: (item: TileItem) => TileAction[]
  onOpen: (item: TileItem) => void
  onAction: (item: TileItem, id: string) => void
  emptyText: string
  countNote?: string
}) {
  const [query, setQuery] = useState('')
  const id = useId()
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => !q || i.name.toLowerCase().includes(q)).sort(newestFirst)
  }, [items, query])
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="file-grid">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">Search files by name</label>
        <Input id={id} type="search" className="min-w-0 flex-1 basis-40 [@media(pointer:coarse)]:h-11" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="file-search" />
        {toolbar}
      </div>
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite" data-testid="file-count">
        {items.length ? `${shown.length} of ${items.length} ${items.length === 1 ? 'file' : 'files'}` : ''}
        {countNote ?? ''}
      </p>
      {!items.length ? (
        emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null
      ) : !shown.length ? (
        <p className="text-sm text-muted-foreground" data-testid="file-none">No file matches.</p>
      ) : (
        <ul
          aria-label="Files"
          className={cn(view === 'grid' ? 'grid gap-2' : 'flex flex-col divide-y rounded-lg border bg-card')}
          style={view === 'grid' ? { gridTemplateColumns: GRID_COLUMNS } : undefined}
          data-testid="file-list"
          data-view={view}
        >
          {shown.map((i) => (
            <FileTile key={i.key} item={i} layout={view} actions={actionsFor(i)} onOpen={onOpen} onAction={onAction} />
          ))}
        </ul>
      )}
    </div>
  )
}
