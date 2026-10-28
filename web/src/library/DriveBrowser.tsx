// The file browser, Drive style: folders and files in one grid or list with multi-select (click, Shift click, Cmd or
// Ctrl click, a drag rectangle on open space), drag and drop onto folders and breadcrumb items, a right-click menu on
// files, folders and open space, inline rename and the keyboard (arrows, Enter, F2, Delete with a confirm, Cmd A, Cmd X,
// Cmd V, Esc). What each action does to the server is the host's `ops`; this component owns the interaction.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { FolderIcon } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { LibraryPatch } from '@/lib/api'
import type { LibraryRow } from '@/lib/library'
import type { ContextAttachment, LaneFileRow } from '@/lib/types'
import type { FilesView } from '@/lib/prefs'
import * as S from '@/lib/selection'
import { cn } from '@/lib/utils'
import { DetailsDialog, MoveDialog } from './EditDialogs'
import type { MetaDraft, Person } from './MetaFields'
import { RenameInput, FileTile } from './FileTile'
import type { DriveTile, TileAction, TileItem } from './FileTile'
import { GRID_COLUMNS, newestFirst } from './FileGrid'
import { PopupMenu } from './PopupMenu'
import type { MenuEntry } from './PopupMenu'
import { getCut, setCut, setDrag, useDropTarget } from './dnd'
import type { DropTargetOps } from './dnd'

export interface DriveFolder {
  name: string
  count: number
  // What the tile shows when the segment is not a name worth showing (a lane id at the top of the Library).
  label?: string
}
export interface DriveOps extends DropTargetOps {
  canDelete: boolean
  people: Person[]
  // The logical folder paths of the lane that owns `dir`, for the Move to dialog.
  folderList: (dir: string[]) => string[]
  // The logical folder ('' is the root, 'a/b' nested) a tree dir stands for, null where the tree is read only.
  folderPath: (dir: string[]) => string | null
  // The tree dir of a logical folder of the same lane as `dir`.
  dirOfFolder: (dir: string[], folder: string) => string[]
  renameFile: (row: LibraryRow, name: string) => Promise<void> | void
  renameFolder: (dir: string[], name: string) => Promise<void> | void
  newFolder: (parent: string[], name: string) => Promise<void> | void
  remove: (rows: LibraryRow[], folders: string[][]) => Promise<void> | void
  patch: (rows: LibraryRow[], patch: LibraryPatch) => Promise<void> | void
  uploadFiles: (dir: string[]) => void
  uploadFolder: (dir: string[]) => void
}

export const folderKey = (dir: string[]): string => 'd:' + dir.join('/')
const libRowOf = (it: TileItem): LibraryRow | null => ('uploaded_at' in it.raw ? (it.raw as LibraryRow) : null)
const isTextTarget = (t: EventTarget | null): boolean => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
const mods = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): S.Mods => ({ shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })

function NameDialog({ title, initial, confirm, onClose, onDone }: { title: string; initial: string; confirm: string; onClose: () => void; onDone: (name: string) => void }) {
  const [v, setV] = useState(initial)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="name-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Letters, numbers and spaces. No slashes.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (v.trim()) onDone(v.trim())
          }}
        >
          <Input autoFocus aria-label="Folder name" value={v} onChange={(e) => setV(e.target.value)} data-testid="name-input" />
          <DialogFooter>
            <Button type="submit" disabled={!v.trim()} data-testid="name-confirm">{confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FolderTile({ f, dir, view, picked, cursor, cut, renaming, ops, onPick, onContext, onOpen, onDragStart, onRename, writable, canLink }: {
  f: DriveFolder
  dir: string[]
  view: FilesView
  picked: boolean
  cursor: boolean
  cut: boolean
  renaming: boolean
  ops: DropTargetOps
  onPick: (e: React.MouseEvent) => void
  onContext: (e: React.MouseEvent) => void
  onOpen: () => void
  onDragStart: (e: React.DragEvent) => void
  onRename: (name: string | null) => void
  writable: boolean
  canLink: boolean
}) {
  const t = useDropTarget(dir, ops)
  return (
    <li
      className="min-w-0"
      data-key={folderKey(dir)}
      data-picked={picked}
      data-cut={cut}
      aria-selected={picked}
      draggable={(writable || canLink) && !renaming}
      onDragStart={onDragStart}
      onDragEnd={() => setDrag(null)}
      onContextMenu={onContext}
      onDoubleClick={onOpen}
      {...t.props}
    >
      <div className={cn('flex w-full min-w-0 items-center gap-2 rounded-lg border bg-card p-2 text-left', picked && 'bg-accent ring-2 ring-primary', cursor && !picked && 'ring-2 ring-ring/50', t.over && 'bg-accent ring-2 ring-primary', cut && 'opacity-50')} data-drop-over={t.over}>
        <button
          type="button"
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
          aria-label={'Open folder ' + f.name}
          onClick={(e) => {
            if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches && !e.shiftKey && !e.metaKey && !e.ctrlKey) onOpen()
            else onPick(e)
          }}
          data-testid="folder-tile"
          data-view={view}
        >
          <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            {renaming ? <RenameInput name={f.name} onDone={onRename} /> : <span className="text-sm font-medium [overflow-wrap:anywhere]" data-testid="folder-name">{f.label ?? f.name}</span>}
            <span className="text-xs text-muted-foreground">{f.count} {f.count === 1 ? 'file' : 'files'}</span>
          </span>
        </button>
      </div>
    </li>
  )
}

export function DriveBrowser({ dir, folders, files, view, toolbar, actionsFor, onOpenFile, onOpenFolder, onAction, ops, emptyText, countNote, laneOfDir, onAddToChat }: {
  dir: string[]
  folders: DriveFolder[]
  files: TileItem[]
  view: FilesView
  toolbar?: ReactNode
  actionsFor: (item: TileItem) => TileAction[]
  onOpenFile: (item: TileItem) => void
  onOpenFolder: (dir: string[]) => void
  onAction: (item: TileItem, id: string) => void
  ops: DriveOps
  emptyText: string
  countNote?: string
  laneOfDir: (dir: string[]) => string | null
  // When the browser sits next to a chat: "Add to chat" in the menu and drag onto the composer attach these as context.
  onAddToChat?: (refs: ContextAttachment[]) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<S.Sel>(S.EMPTY)
  const [cursor, setCursor] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; entries: MenuEntry[]; keys: string[]; label: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [moving, setMoving] = useState<string[] | null>(null)
  const [details, setDetails] = useState<{ rows: LibraryRow[]; focus?: keyof MetaDraft } | null>(null)
  const [box, setBox] = useState<S.Box | null>(null)
  const [, bump] = useState(0)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.sub ?? '').toLowerCase().includes(q)).sort(newestFirst)
  }, [files, query])
  const shownFolders = useMemo(() => {
    const q = query.trim().toLowerCase()
    return folders.filter((f) => !q || f.name.toLowerCase().includes(q))
  }, [folders, query])
  const order = useMemo(() => [...shownFolders.map((f) => folderKey([...dir, f.name])), ...shown.map((i) => i.key)], [shownFolders, shown, dir])
  const itemOf = useMemo(() => new Map(shown.map((i) => [i.key, i])), [shown])
  const folderOf = (key: string): DriveFolder | undefined => shownFolders.find((f) => folderKey([...dir, f.name]) === key)
  const dirOfKey = (key: string): string[] => key.slice(2).split('/').filter(Boolean)
  const writableHere = ops.writableDir(dir)
  const lane = laneOfDir(dir) ?? ''

  // After a refresh, drop what is no longer displayed.
  useEffect(() => {
    setSel((s) => S.prune(s, order))
    setCursor((c) => (c && order.includes(c) ? c : null))
  }, [order])
  const cutKeys = getCut()

  // ---- what a key means
  const writableKey = (key: string): boolean => {
    if (key.startsWith('d:')) return ops.writableDir(dirOfKey(key))
    const it = itemOf.get(key)
    return !!it && !!libRowOf(it) && writableHere
  }
  const rowsOf = (keys: string[]): LibraryRow[] => keys.map((k) => itemOf.get(k)).filter((i): i is TileItem => !!i).map(libRowOf).filter((r): r is LibraryRow => !!r)
  const foldersOf = (keys: string[]): string[][] => keys.filter((k) => k.startsWith('d:')).map(dirOfKey)
  const cutPayload = (keys: string[]) => ({ files: rowsOf(keys).map((r) => r.id), folders: foldersOf(keys), lane })
  // The chat context for these keys: a Library id (or the repo path) for a file, the tree path for a folder.
  const contextOf = (keys: string[]): ContextAttachment[] =>
    keys.flatMap((k): ContextAttachment[] => {
      if (k.startsWith('d:')) {
        const d = dirOfKey(k)
        return [{ mode: 'context', ref: d.join('/'), kind: 'folder', name: d[d.length - 1] ?? 'uploads', lane: laneOfDir(d) ?? lane, path: d.join('/') }]
      }
      const it = itemOf.get(k)
      if (!it) return []
      const row = libRowOf(it)
      if (row) return [{ mode: 'context', ref: row.id, kind: 'file', name: row.name, lane: row.lane, path: [...dir, row.name].join('/') }]
      const f = it.raw as LaneFileRow
      return typeof f.path === 'string' ? [{ mode: 'context', ref: f.path, kind: 'file', name: f.name, lane: f.lane, path: f.path }] : []
    })

  // ---- selection
  const pick = (key: string, e: React.MouseEvent) => {
    setSel((s) => S.click(s, key, mods(e), order))
    setCursor(key)
    root.current?.focus({ preventScroll: true })
  }
  const clear = () => setSel(S.EMPTY)

  // ---- opening
  const openKey = (key: string) => {
    if (key.startsWith('d:')) return onOpenFolder(dirOfKey(key))
    const it = itemOf.get(key)
    if (it) onOpenFile(it)
  }
  const download = (it: TileItem) => {
    const a = document.createElement('a')
    a.href = it.downloadUrl
    a.download = it.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // ---- the context menu
  const openMenu = (e: React.MouseEvent, key: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    let at = { x: e.clientX, y: e.clientY }
    if (e.type !== 'contextmenu' && !e.clientX && !e.clientY) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      at = { x: r.left, y: r.bottom }
    }
    if (!key) {
      const entries: MenuEntry[] = writableHere
        ? [
            { id: 'new-folder', label: 'New folder' },
            { id: 'upload-files', label: 'Upload files' },
            { id: 'upload-folder', label: 'Upload folder' },
            { id: 'sep', label: '', separator: true },
            { id: 'select-all', label: 'Select all', disabled: !order.length },
            { id: 'paste', label: 'Paste', disabled: !getCut() },
          ]
        : [
            { id: 'select-all', label: 'Select all', disabled: !order.length },
            { id: 'ro', label: 'Repo files (book, docs, registry) are read only here. Upload into the uploads folder.', note: true },
          ]
      setMenu({ at, entries, keys: [], label: 'Folder menu' })
      return
    }
    const keys = sel.keys.includes(key) ? sel.keys : [key]
    if (!sel.keys.includes(key)) {
      setSel({ keys: [key], anchor: key })
      setCursor(key)
    }
    const many = keys.length > 1
    const allWritable = keys.every(writableKey)
    const first = keys[0]
    const it = itemOf.get(first)
    const entries: MenuEntry[] = []
    if (!many) entries.push({ id: 'open', label: 'Open' })
    if (!many && it) entries.push({ id: 'download', label: 'Download' })
    if (onAddToChat) entries.push({ id: 'add-to-chat', label: 'Add to chat' })
    if (!allWritable) {
      entries.push({ id: 'ro', label: 'Repo files are read only. Rename, move and delete happen in the repo.', note: true })
    } else {
      if (!many) entries.push({ id: 'rename', label: 'Rename' })
      entries.push({ id: 'cut', label: 'Cut' }, { id: 'move', label: 'Move to...' })
      const rows = rowsOf(keys)
      if (rows.length) entries.push({ id: 'label', label: 'Label' }, { id: 'assign', label: 'Assign' }, { id: 'notes', label: 'Notes' })
      if (!many && it) {
        const extra = actionsFor(it).filter((a) => a.id !== 'delete')
        for (const a of extra) entries.push({ id: 'act:' + a.id, label: a.label })
      }
      entries.push({ id: 'sep2', label: '', separator: true }, { id: 'delete', label: many ? `Delete ${keys.length} items` : 'Delete', destructive: true, disabled: !ops.canDelete })
    }
    setMenu({ at, entries, keys, label: many ? `${keys.length} selected` : (it?.name ?? folderOf(first)?.name ?? 'Item') + ' menu' })
  }
  const runMenu = (id: string) => {
    const m = menu
    setMenu(null)
    if (!m) return
    const keys = m.keys
    const first = keys[0]
    const it = first ? itemOf.get(first) : undefined
    if (id === 'new-folder') setNaming(true)
    else if (id === 'upload-files') ops.uploadFiles(dir)
    else if (id === 'upload-folder') ops.uploadFolder(dir)
    else if (id === 'select-all') setSel(S.selectAll(order))
    else if (id === 'paste') void paste()
    else if (id === 'open') openKey(first)
    else if (id === 'download' && it) download(it)
    else if (id === 'add-to-chat') onAddToChat?.(contextOf(keys))
    else if (id === 'rename') setRenaming(first)
    else if (id === 'cut') doCut(keys)
    else if (id === 'move') setMoving(keys)
    else if (id === 'label' || id === 'assign' || id === 'notes') setDetails({ rows: rowsOf(keys), focus: id === 'label' ? 'label' : id === 'assign' ? 'assigned_to' : 'notes' })
    else if (id === 'delete') setConfirm(keys)
    else if (id.startsWith('act:') && it) onAction(it, id.slice(4))
  }

  // ---- cut and paste
  const doCut = (keys: string[]) => {
    setCut(cutPayload(keys))
    bump((n) => n + 1)
  }
  const paste = async () => {
    const c = getCut()
    if (!c || !writableHere) return
    setCut(null)
    bump((n) => n + 1)
    await ops.moveTo(c.files, c.folders, dir)
  }

  // ---- drag and drop (the tile side; drop targets live in dnd.ts)
  const dragStart = (e: React.DragEvent, key: string) => {
    // A read only item cannot be moved, but it can still be dragged onto the composer as context.
    if (!writableKey(key) && !onAddToChat) return e.preventDefault()
    const keys = sel.keys.includes(key) ? sel.keys : [key]
    if (!sel.keys.includes(key)) {
      setSel({ keys: [key], anchor: key })
      setCursor(key)
    }
    setDrag({ ...cutPayload(keys.filter(writableKey)), ...(onAddToChat ? { refs: contextOf(keys) } : {}) })
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = onAddToChat ? 'all' : 'move'
      try {
        e.dataTransfer.setData('text/plain', keys.length + (keys.length === 1 ? ' item' : ' items'))
      } catch {
        /* a synthetic drag has no clipboard */
      }
    }
  }

  // ---- the drag rectangle
  const start = useRef<{ x: number; y: number; base: S.Sel; additive: boolean } | null>(null)
  const rects = (): Record<string, S.Box> => {
    const out: Record<string, S.Box> = {}
    root.current?.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => {
      const r = el.getBoundingClientRect()
      out[el.dataset.key!] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    })
    return out
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-key],button,input,a,select,textarea,[role=menu]')) return
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    start.current = { x: e.clientX, y: e.clientY, base: sel, additive }
    const move = (ev: PointerEvent) => {
      const s0 = start.current
      if (!s0) return
      const here = { x: ev.clientX, y: ev.clientY }
      if (!S.movedFar(s0, here)) return
      const b = S.boxOf(s0, here)
      setBox(b)
      setSel(S.rectSelect(s0.base, S.rectHits(rects(), b, order), s0.additive, order))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const s0 = start.current
      start.current = null
      setBox(null)
      if (s0 && !S.movedFar(s0, { x: ev.clientX, y: ev.clientY }) && !s0.additive) clear()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    root.current?.focus({ preventScroll: true })
  }

  // ---- the keyboard
  const cols = (key: string | null): number => {
    if (view === 'list') return 1
    const el = key ? root.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null
    const row = el?.parentElement
    if (!el || !row) return 1
    const top = el.getBoundingClientRect().top
    return Math.max(1, [...row.children].filter((c) => c.getBoundingClientRect().top === top).length)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTextTarget(e.target) || menu) return
    const meta = e.metaKey || e.ctrlKey
    const k = e.key
    if (meta && k.toLowerCase() === 'a') {
      e.preventDefault()
      setSel(S.selectAll(order))
    } else if (meta && k.toLowerCase() === 'x') {
      e.preventDefault()
      const keys = sel.keys.filter(writableKey)
      if (keys.length) doCut(keys)
    } else if (meta && k.toLowerCase() === 'v') {
      e.preventDefault()
      void paste()
    } else if (k === 'Escape') {
      if (sel.keys.length || getCut()) {
        e.preventDefault()
        e.stopPropagation()
        clear()
        setCut(null)
        bump((n) => n + 1)
      }
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) {
      e.preventDefault()
      const next = S.cursorMove(order, cols(cursor), cursor, k as 'ArrowLeft')
      if (!next) return
      setCursor(next)
      setSel((s) => S.click(s.anchor ? s : { keys: [], anchor: next }, next, { shift: e.shiftKey }, order))
      queueMicrotask(() => root.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(next)}"]`)?.scrollIntoView?.({ block: 'nearest' }))
    } else if (k === 'Enter') {
      const key = cursor ?? sel.keys[0]
      if (key) {
        e.preventDefault()
        openKey(key)
      }
    } else if (k === 'F2') {
      const key = sel.keys.length === 1 ? sel.keys[0] : cursor
      if (key && writableKey(key)) {
        e.preventDefault()
        setRenaming(key)
      }
    } else if ((k === 'Delete' || k === 'Backspace') && sel.keys.length) {
      e.preventDefault()
      if (!sel.keys.every(writableKey)) return
      if (!ops.canDelete) return ops.remove([], []) // the host explains: only owners delete
      setConfirm(sel.keys)
    }
  }

  // ---- rename
  const finishRename = async (key: string, name: string | null) => {
    setRenaming(null)
    root.current?.focus({ preventScroll: true })
    if (name === null) return
    const n = name.trim()
    if (key.startsWith('d:')) {
      const f = folderOf(key)
      if (n && f && n !== f.name) await ops.renameFolder(dirOfKey(key), n)
    } else {
      const it = itemOf.get(key)
      const row = it && libRowOf(it)
      if (n && row && n !== row.name) await ops.renameFile(row, n)
    }
  }

  const tileFor = (it: TileItem): DriveTile => ({
    picked: S.has(sel, it.key),
    cursor: cursor === it.key,
    cut: !!cutKeys?.files.includes(libRowOf(it)?.id ?? ''),
    renaming: renaming === it.key,
    draggable: writableKey(it.key) || !!onAddToChat,
    onPick: (e) => pick(it.key, e),
    onContext: (e) => openMenu(e, it.key),
    onDragStart: (e) => dragStart(e, it.key),
    onDragEnd: () => setDrag(null),
    onRename: (n) => void finishRename(it.key, n),
  })

  const total = files.length + folders.length
  const empty = !total
  const confirmRows = confirm ? rowsOf(confirm) : []
  const confirmFolders = confirm ? foldersOf(confirm) : []
  const confirmWhat = confirm ? (confirm.length === 1 ? (itemOf.get(confirm[0])?.name ?? folderOf(confirm[0])?.name ?? 'this item') : confirm.length + ' items') : ''
  const movingRows = moving ? rowsOf(moving) : []
  const movingFolders = moving ? foldersOf(moving) : []
  const movingPaths = movingFolders.map((d) => ops.folderPath(d)).filter((p): p is string => !!p)

  return (
    <div
      ref={root}
      className="flex min-h-48 min-w-0 flex-1 flex-col gap-2 outline-none"
      role="group"
      aria-label="Files browser"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => {
        if (!(e.target as HTMLElement).closest('[data-key]')) openMenu(e, null)
      }}
      data-testid="file-grid"
      data-selected-count={sel.keys.length}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={searchId} className="sr-only">Search files by name</label>
        <Input id={searchId} type="search" className="min-w-0 flex-1 basis-40 [@media(pointer:coarse)]:h-11" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="file-search" />
        {toolbar}
      </div>
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite" data-testid="file-count">
        {sel.keys.length > 1 ? `${sel.keys.length} selected` : files.length ? `${shown.length} of ${files.length} ${files.length === 1 ? 'file' : 'files'}` : ''}
        {countNote ?? ''}
      </p>
      {shownFolders.length > 0 && (
        <ul aria-label="Folders" className="grid gap-2" style={{ gridTemplateColumns: GRID_COLUMNS }} data-testid="folder-list">
          {shownFolders.map((f) => {
            const d = [...dir, f.name]
            const key = folderKey(d)
            return (
              <FolderTile
                key={key}
                f={f}
                dir={d}
                view={view}
                picked={S.has(sel, key)}
                cursor={cursor === key}
                cut={!!cutKeys?.folders.some((x) => x.join('/') === d.join('/'))}
                renaming={renaming === key}
                ops={ops}
                writable={ops.writableDir(d)}
                canLink={!!onAddToChat}
                onPick={(e) => pick(key, e)}
                onContext={(e) => openMenu(e, key)}
                onOpen={() => onOpenFolder(d)}
                onDragStart={(e) => dragStart(e, key)}
                onRename={(n) => void finishRename(key, n)}
              />
            )
          })}
        </ul>
      )}
      {empty ? (
        emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null
      ) : !shown.length && !shownFolders.length ? (
        <p className="text-sm text-muted-foreground" data-testid="file-none">No file matches.</p>
      ) : shown.length ? (
        <ul
          aria-label="Files"
          className={cn(view === 'grid' ? 'grid gap-2' : 'flex flex-col divide-y rounded-lg border bg-card')}
          style={view === 'grid' ? { gridTemplateColumns: GRID_COLUMNS } : undefined}
          data-testid="file-list"
          data-view={view}
        >
          {shown.map((i) => (
            <FileTile key={i.key} item={i} layout={view} actions={actionsFor(i)} onOpen={onOpenFile} onAction={onAction} drive={tileFor(i)} />
          ))}
        </ul>
      ) : null}

      {box && <div className="pointer-events-none fixed z-40 border border-primary bg-primary/10" style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }} data-testid="select-rect" />}
      {menu && <PopupMenu at={menu.at} entries={menu.entries} label={menu.label} onPick={runMenu} onClose={() => setMenu(null)} />}
      {naming && (
        <NameDialog
          title="New folder"
          initial=""
          confirm="Create"
          onClose={() => setNaming(false)}
          onDone={(n) => {
            setNaming(false)
            void ops.newFolder(dir, n)
          }}
        />
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent data-testid="delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Delete {confirmWhat}?</AlertDialogTitle>
            <AlertDialogDescription>{confirmFolders.length ? 'Folders go with everything inside them. ' : ''}It moves to the bin for 30 days and leaves recall. Nothing else changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void ops.remove(confirmRows, confirmFolders)
                setConfirm(null)
                clear()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MoveDialog
        open={!!moving}
        names={moving ? (moving.length === 1 ? (itemOf.get(moving[0])?.name ?? folderOf(moving[0])?.name ?? 'item') : moving.length + ' items') : ''}
        folders={ops.folderList(dir).filter((f) => !movingPaths.some((m) => f === m || f.startsWith(m + '/')))}
        current={ops.folderPath(dir) ?? ''}
        onClose={() => setMoving(null)}
        onPick={(f) => {
          void ops.moveTo(movingRows.map((r) => r.id), movingFolders, ops.dirOfFolder(dir, f))
          setMoving(null)
        }}
      />
      {details && (
        <DetailsDialog
          rows={details.rows}
          focus={details.focus}
          people={ops.people}
          onClose={() => setDetails(null)}
          onSave={(p) => {
            void ops.patch(details.rows, p)
            setDetails(null)
          }}
        />
      )}
    </div>
  )
}
