// Lane files, a small app inside one dock surface: a breadcrumb bar (Lane files > folder > file), the lane's repo
// files (book/, docs/, registry/, read only) and its uploads as ONE folder, `uploads`, with the files at its root and a
// folder per logical path (names, never ids), managed Drive style (select, drag, right-click, rename, keyboard), plus
// the uploader (drop zone, the optional details form and the queue). Opening a file shows the viewer here: a pdf or an
// image takes the whole surface, a text file keeps the breadcrumb above its preview. Close returns to the same folder,
// scroll position and filter (the browser stays mounted, hidden). The dock tab stays "Lane files" at any depth.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftIcon, ChevronRightIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/app/AppContext'
import { ViewerHostContext } from '@/cards/viewer-context'
import { libraryIdOf } from '@/cards/Files'
import { CardSurface } from '@/cards/registry'
import type { CardView } from '@/cards/types'
import * as api from '@/lib/api'
import { UPLOADS, dirOfPath, listDir, uploadsDir } from '@/lib/filetree'
import { TERMINAL_STATUS, queueBusy, relFolder } from '@/lib/library'
import type { BatchMeta, LibraryRow, Picked } from '@/lib/library'
import { isOwnerOrAdmin } from '@/lib/store'
import type { LaneFileRow } from '@/lib/types'
import { Crumbs } from '@/library/Crumbs'
import { DriveBrowser } from '@/library/DriveBrowser'
import { DropZone } from '@/library/DropZone'
import { ViewToggle, useFilesView } from '@/library/FileGrid'
import { fileKind, fromLaneFile, fromLibraryRow } from '@/library/FileTile'
import type { TileAction, TileItem } from '@/library/FileTile'
import { UploadBatchForm } from '@/library/UploadBatchForm'
import { UploadQueue } from '@/library/UploadQueue'
import { canDo } from '@/library/access'
import { useDriveOps, useLaneFolders } from '@/library/useDriveOps'
import { useUploadQueue } from '@/library/useUploadQueue'
import { cn } from '@/lib/utils'
import { addContext } from '@/thread/contextStore'
import { useDock } from './context'
import { useSurfaceState } from './hooks'

interface FilesState extends Record<string, unknown> {
  rows: LaneFileRow[] | null
  error: string
  truncated: boolean
  loading: boolean
  // The folder being browsed, as path segments from the lane root ([] is the root).
  dir: string[]
  // The file open in the File Preview, as the card it renders from. null shows the grid.
  view: { card: CardView; arg: number } | null
}
const F0: FilesState = { rows: null, error: '', truncated: false, loading: false, dir: [], view: null }

const POLL_MS = 3000
// A file is still moving until it reaches a state it rests in. Stored-only types rest at validated.
export function inFlight(r: LibraryRow): boolean {
  if (TERMINAL_STATUS(r.status) || r.needs_parser) return false
  if (r.status === 'validated' && ['image', 'archive'].includes(fileKind(r.name, r.kind))) return false
  return true
}

export function LaneFiles({ lane }: { lane: string }) {
  const d = useDock()
  const { store, toast } = useApp()
  const admin = isOwnerOrAdmin(store)
  const me = store.me?.person ?? ''
  const member = store.lanes[lane]?.members.includes(me) ?? false
  const who = { admin, member }
  const [s, patch] = useSurfaceState<FilesState>(lane, 'files', F0)
  const [lib, setLib] = useState<LibraryRow[] | null>(null)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [view, setView] = useFilesView()
  const [pending, setPending] = useState<Picked[] | null>(null)
  const versionRow = useRef<LibraryRow | null>(null)
  const versionInput = useRef<HTMLInputElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const uploadAt = useRef<string[]>([UPLOADS])
  const ids = { h: useId(), up: useId(), fl: useId() }

  const loadList = useCallback(async () => {
    patch({ loading: true })
    const r = await api.laneFiles(lane)
    if (r.ok && Array.isArray(r.body.files)) patch({ rows: r.body.files, truncated: !!r.body.truncated, error: '', loading: false })
    else patch({ error: 'The file list could not be read.', loading: false })
  }, [lane, patch])
  const queueApi = useUploadQueue(() => void refresh())
  const { queue, dispatch, enqueue, retry } = queueApi
  const loadLib = useCallback(async () => {
    const r = await api.libraryRows(lane)
    if (r.ok && Array.isArray(r.body)) {
      setLib(r.body)
      dispatch({ type: 'pipeline', rows: r.body })
    } else setLib((cur) => cur ?? [])
  }, [lane, dispatch])
  const laneFolders = useLaneFolders(useMemo(() => [lane], [lane]))
  const reloadFolders = laneFolders.reload
  const refresh = useCallback(async () => {
    await Promise.all([loadList(), loadLib(), reloadFolders()])
  }, [loadList, loadLib, reloadFolders])

  useEffect(() => {
    if (!s.rows) void loadList()
    void loadLib()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane])
  const moving = (lib ?? []).some(inFlight) || queueBusy(queue)
  useEffect(() => {
    if (!moving) return
    const t = setInterval(() => void loadLib(), POLL_MS)
    return () => clearInterval(t)
  }, [moving, loadLib])

  const sel = d.selection?.kind === 'file' ? d.selection.id : ''
  const { entries, pathOf } = useMemo(() => {
    const rows = s.rows ?? []
    const uploads = rows.filter((f) => f.source === 'upload')
    const byName = new Map(uploads.map((f) => [f.name, f]))
    const claimed = new Set<string>()
    const pathOf = new Map<string, LaneFileRow>()
    const out: { dir: string[]; item: TileItem }[] = []
    for (const r of lib ?? []) {
      const f = uploads.find((u) => u.path.includes('/' + r.id + '/')) ?? byName.get(r.name)
      if (f) claimed.add(f.path)
      const ext = /\.([A-Za-z0-9]+)$/.exec(r.name)?.[1]?.toLowerCase() ?? 'file'
      const file: LaneFileRow = f ?? { name: r.name, path: 'console/data/uploads/' + lane + '/' + r.id + '/' + r.name, kind: ext, size: r.size, mtime: r.uploaded_at, lane, source: 'upload', scope: 'lane' }
      const it = fromLibraryRow(r, busy[r.id])
      it.selected = sel === file.path
      pathOf.set(it.key, file)
      out.push({ dir: uploadsDir(r.folder), item: it })
    }
    for (const f of rows) {
      if (claimed.has(f.path)) continue
      const it = fromLaneFile(f)
      it.selected = sel === f.path
      pathOf.set(it.key, f)
      out.push({ dir: dirOfPath(f.path, lane), item: it })
    }
    return { entries: out, pathOf }
  }, [s.rows, lib, busy, sel, lane])
  const explicit = laneFolders.folders[lane]
  const extra = useMemo(() => (explicit ?? []).map(uploadsDir), [explicit])
  const listing = useMemo(() => listDir(entries, s.dir, extra), [entries, s.dir, extra])
  const items = listing.files

  const actionsFor = (it: TileItem): TileAction[] => {
    const r = it.raw as LibraryRow
    if (!('uploaded_at' in r)) return []
    const out: TileAction[] = []
    if (canDo(r, 'index', who)) out.push({ id: 'index', label: r.status === 'indexed' || r.status === 'available' ? 'Index again' : 'Index into recall' })
    if (canDo(r, 'version', who)) out.push({ id: 'version', label: 'New version' })
    return out
  }
  const open = (it: TileItem) => {
    const f = pathOf.get(it.key)
    const raw = it.raw as LibraryRow
    if (f) d.openFile(f, 'uploaded_at' in raw ? raw.id : undefined)
  }
  const scroller = useRef<HTMLDivElement>(null)
  const scrollAt = useRef(0)
  const viewing = !!s.view
  // Back puts the grid back where it was.
  useLayoutEffect(() => {
    if (!viewing && scroller.current) scroller.current.scrollTop = scrollAt.current
  }, [viewing])
  const goTo = useCallback(
    (dir: string[]) => {
      scrollAt.current = 0
      if (scroller.current) scroller.current.scrollTop = 0
      patch({ dir, view: null })
    },
    [patch],
  )
  const openFile = s.view ? ((s.view.card.data as { files?: { name?: string; path?: string; id?: string }[] } | null)?.files?.[s.view.arg] ?? null) : null
  const openFileName = openFile?.name ?? 'File'
  // A pdf or an image takes the whole surface; a text file keeps the breadcrumb above its preview.
  const takeover = viewing && ['pdf', 'image'].includes(fileKind(openFileName))
  // Close goes back to the folder the file lives in, even when a card opened it from somewhere else.
  const closeViewer = useCallback(() => {
    const id = openFile ? (openFile.id ?? libraryIdOf(openFile as never)) : undefined
    const row = id ? (lib ?? []).find((r) => r.id === id) : undefined
    patch(row ? { view: null, dir: uploadsDir(row.folder) } : { view: null })
  }, [openFile, lib, patch])
  const viewerHost = useMemo(() => ({ close: closeViewer }), [closeViewer])

  const act = async (it: TileItem, id: string) => {
    const row = it.raw as LibraryRow
    if (id === 'index') {
      setBusy((b) => ({ ...b, [row.id]: 'queued' }))
      const r = await api.libraryIndex(row.id, (l) => setBusy((b) => ({ ...b, [row.id]: l.stage })))
      setBusy((b) => {
        const { [row.id]: _gone, ...rest } = b
        return rest
      })
      toast(r.ok ? 'Indexed into recall: ' + row.name : 'Index failed: ' + (r.error ?? 'unknown'))
      void loadLib()
    } else if (id === 'version') {
      versionRow.current = row
      versionInput.current?.click()
    }
  }

  // ---- uploads. Files land in the folder being browsed (the uploads root when browsing the repo folders).
  const hereFolder = s.dir[0] === UPLOADS ? s.dir.slice(1).join('/') : ''
  const place = (picked: Picked[], base: string): Picked[] => picked.map((p) => ({ file: p.file, folder: [base, p.folder].filter(Boolean).join('/') }))
  const pick = (p: Picked[]) => setPending(place(p, hereFolder))
  const people = useMemo(() => store.me?.people ?? [], [store.me?.people])
  const sendBatch = (meta: BatchMeta | undefined) => {
    if (pending) enqueue(pending, lane, meta ? { meta } : {})
    setPending(null)
  }
  const pickInto = useCallback((dir: string[], mode: 'files' | 'folder') => {
    uploadAt.current = dir
    ;(mode === 'files' ? filesInput : folderInput).current?.click()
  }, [])
  const pickFiles = useCallback((dir: string[]) => pickInto(dir, 'files'), [pickInto])
  const pickFolder = useCallback((dir: string[]) => pickInto(dir, 'folder'), [pickInto])

  // ---- the tree: which lane and which logical folder a dir stands for
  const scope = useMemo(
    () => ({
      laneOf: () => lane,
      folderPath: (dir: string[]) => (dir[0] === UPLOADS ? dir.slice(1).join('/') : null),
      dirOfFolder: (_dir: string[], folder: string) => uploadsDir(folder),
    }),
    [lane],
  )
  const ops = useDriveOps({ scope, rows: lib ?? [], folders: laneFolders.folders, isMember: () => member, admin, people, refresh, toast, pickFiles, pickFolder })
  const crumbOps = useMemo(() => ({ writableDir: ops.writableDir, laneOf: ops.laneOf, moveTo: ops.moveTo }), [ops])
  const folderTiles = listing.folders

  return (
    <section aria-labelledby={ids.h} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="lane-files">
      <h2 id={ids.h} className="sr-only">Lane files</h2>
      {!takeover && (
        <nav aria-label="Lane files path" className="flex min-w-0 items-center gap-1 px-4 pb-2 text-sm" data-testid="files-breadcrumb">
          {viewing && (
            <Button type="button" size="icon-xs" variant="ghost" className="[@media(pointer:coarse)]:size-11" aria-label="Back" onClick={closeViewer} data-testid="files-back">
              <ArrowLeftIcon />
            </Button>
          )}
          <Crumbs
            root="Lane files"
            dir={s.dir}
            viewing={viewing}
            onGo={goTo}
            ops={crumbOps}
            label="Lane files path"
            tail={
              viewing ? (
                <>
                  <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <li className="min-w-0">
                    <span className="font-medium [overflow-wrap:anywhere]" aria-current="page" data-testid="crumb-current">{openFileName}</span>
                  </li>
                </>
              ) : null
            }
          />
        </nav>
      )}
      {s.view && (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="files-preview">
          <ViewerHostContext.Provider value={viewerHost}>
            <CardSurface card={s.view.card} arg={s.view.arg} />
          </ViewerHostContext.Provider>
        </div>
      )}
      <div
        ref={scroller}
        onScroll={(e) => {
          if (!viewing) scrollAt.current = e.currentTarget.scrollTop
        }}
        className={cn('min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4', viewing ? 'hidden' : 'flex')}
        hidden={viewing}
        data-testid="files-browser"
      >
        <section aria-labelledby={ids.up} className="flex min-w-0 flex-col gap-2" data-testid="lane-upload">
          <h3 id={ids.up} className="sr-only">Upload</h3>
          <DropZone onPick={pick} />
          {pending && <UploadBatchForm count={pending.length} folder={hereFolder || undefined} people={people} onSubmit={sendBatch} onSkip={() => sendBatch(undefined)} onCancel={() => setPending(null)} />}
          <UploadQueue items={queue} onRetry={retry} onRemove={(key) => dispatch({ type: 'remove', key })} onClear={() => dispatch({ type: 'clear' })} headingLevel="h3" />
        </section>
        <section aria-labelledby={ids.fl} className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 id={ids.fl} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</h3>
            <Button type="button" size="icon-xs" variant="ghost" className="ml-auto [@media(pointer:coarse)]:size-11" aria-label="Refresh files" onClick={() => void refresh()} disabled={s.loading}>
              <RefreshCwIcon className={s.loading ? 'motion-safe:animate-spin' : ''} />
            </Button>
          </div>
          {s.error && <p className="text-sm text-destructive" role="alert">{s.error}</p>}
          {!s.rows && !s.error ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <DriveBrowser
              key={s.dir.join('/')}
              dir={s.dir}
              folders={folderTiles}
              files={items}
              view={view}
              toolbar={<ViewToggle view={view} onChange={setView} />}
              actionsFor={actionsFor}
              onOpenFile={open}
              onOpenFolder={goTo}
              onAction={(it, id) => void act(it, id)}
              ops={ops}
              laneOfDir={ops.laneOf}
              onAddToChat={(refs) => {
                const n = addContext(lane, refs)
                toast(n ? (n === 1 ? 'Added to the chat as context' : n + ' items added to the chat as context') : 'Already in the chat')
              }}
              emptyText={folderTiles.length ? '' : s.dir.length ? 'This folder is empty.' : 'No files for this lane yet.'}
              countNote={s.truncated ? ' (list cut short)' : ''}
            />
          )}
        </section>
      </div>

      <input
        ref={versionInput}
        type="file"
        hidden
        data-testid="version-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          const row = versionRow.current
          if (f && row) enqueue([{ file: f, folder: row.folder ?? '' }], row.lane, { versionOf: row.id })
          e.target.value = ''
        }}
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        data-testid="menu-files-input"
        onChange={(e) => {
          const base = uploadAt.current[0] === UPLOADS ? uploadAt.current.slice(1).join('/') : ''
          const list = Array.from(e.target.files ?? [])
          if (list.length) setPending(place(list.map((file) => ({ file, folder: '' })), base))
          e.target.value = ''
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        data-testid="menu-folder-input"
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={(e) => {
          const base = uploadAt.current[0] === UPLOADS ? uploadAt.current.slice(1).join('/') : ''
          const list = Array.from(e.target.files ?? [])
          if (list.length) setPending(place(list.map((file) => ({ file, folder: relFolder(file) })), base))
          e.target.value = ''
        }}
      />
    </section>
  )
}
