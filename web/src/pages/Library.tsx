// docs/library-spec.md section 2: /v2/#/library and /v2/#/library/<lane>. Lane filter, drop zone, batch tags, upload
// queue, the Library table, and the right-hand panels. Uploading stores a file; only the Index action changes recall.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/app/AppContext'
import { go } from '@/app/router'
import * as api from '@/lib/api'
import { isOwnerOrAdmin } from '@/lib/store'
import { displayName, relTime } from '@/lib/time'
import { FileFrame } from '@/cards/Files'
import type { FileRow } from '@/cards/Files'
import { folderSegs, listDir } from '@/lib/filetree'
import { hrefForUse, parseTagInput, queueBusy, relFolder } from '@/lib/library'
import type { BatchMeta, LibraryRow, LibraryStatus, LibraryUse, Picked } from '@/lib/library'
import { Crumbs } from '@/library/Crumbs'
import { DriveBrowser } from '@/library/DriveBrowser'
import { DropZone } from '@/library/DropZone'
import { UploadBatchForm } from '@/library/UploadBatchForm'
import { useDriveOps, useLaneFolders } from '@/library/useDriveOps'
import { LibraryTable } from '@/library/LibraryTable'
import type { RowAction, TableCtx } from '@/library/LibraryTable'
import { ConversationsPanel, IndexingPanel, SkillsPanel } from '@/library/Panels'
import { UploadQueue } from '@/library/UploadQueue'
import { ViewToggle, useFilesView } from '@/library/FileGrid'
import { fromLibraryRow } from '@/library/FileTile'
import type { TileAction, TileItem } from '@/library/FileTile'
import { canDo } from '@/library/access'
import { useUploadQueue } from '@/library/useUploadQueue'
import { PageHeader } from './Devices'
import { agentName } from '@/lib/agent'

const PENDING = new Set(['uploaded', 'validated'])

// onlyLane scopes the page to one lane (Marvin's one chat): no lane filter, no upload-to-lane choice, rows and uploads of that lane only.
// `undefined` is the ordinary Library; `null` is scoped with no lane to show.
export function LibraryPage({ lane, onlyLane }: { lane?: string; onlyLane?: string | null }) {
  const { store, toast } = useApp()
  const scoped = onlyLane !== undefined
  const laneFilter = scoped ? (onlyLane ?? undefined) : lane
  const admin = isOwnerOrAdmin(store)
  const me = store.me?.person ?? ''
  const lanes = useMemo(() => store.order.filter((id) => !scoped || id === onlyLane).map((id) => store.lanes[id]).filter(Boolean), [store.order, store.lanes, scoped, onlyLane])
  const memberLanes = lanes.filter((l) => l.members.includes(me))
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [status, setStatus] = useState<LibraryStatus | null>(null)
  const [uses, setUses] = useState<LibraryUse[]>([])
  const [loaded, setLoaded] = useState(false)
  const [tagText, setTagText] = useState('')
  const [target, setTarget] = useState('')
  const { queue, dispatch, enqueue, retry } = useUploadQueue(() => void refresh())
  const [view, setView] = useFilesView()
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<LibraryRow | null>(null)
  const [dir, setDir] = useState<string[]>(laneFilter ? [laneFilter] : [])
  const [pending, setPending] = useState<{ picked: Picked[]; lane: string } | null>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const uploadAt = useRef<string[]>([])
  const [usesFor, setUsesFor] = useState<{ row: LibraryRow; uses: LibraryUse[] } | null>(null)
  const [retention, setRetention] = useState<{ row: LibraryRow; days: string } | null>(null)
  const [deleting, setDeleting] = useState<LibraryRow | null>(null)
  const versionRow = useRef<LibraryRow | null>(null)
  const versionInput = useRef<HTMLInputElement>(null)

  const dirLane = dir[0] && memberLanes.some((l) => l.id === dir[0]) ? dir[0] : ''
  const uploadLane = dirLane || target || (laneFilter && memberLanes.some((l) => l.id === laneFilter) ? laneFilter : '') || memberLanes[0]?.id || ''
  useEffect(() => setDir(laneFilter ? [laneFilter] : []), [laneFilter])
  const laneTitle = useCallback((id: string) => store.lanes[id]?.title ?? id, [store.lanes])
  const people = store.me?.people
  const peopleList = useMemo(() => people ?? [], [people])
  const personName = useCallback((id: string | null | undefined) => (id ? (people?.find((p) => p.id === id)?.name ?? displayName(id)) : 'unknown'), [people])

  const refresh = useCallback(async () => {
    const [r, s, u] = await Promise.all([api.libraryRows(laneFilter), api.libraryStatus(laneFilter), api.libraryUses(['conversation', 'run', 'skill'], laneFilter)])
    if (r.ok) {
      setRows(r.body)
      dispatch({ type: 'pipeline', rows: r.body })
    }
    if (s.ok) setStatus(s.body)
    if (u.ok) setUses(u.body)
    setLoaded(true)
  }, [laneFilter, dispatch])

  const settling = rows.some((r) => PENDING.has(r.status) && !r.needs_parser) || queueBusy(queue)
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    const t = setInterval(() => void refresh(), settling ? 1500 : 10000)
    return () => clearInterval(t)
  }, [refresh, settling])

  const addPicked = (picked: Picked[], laneId: string, versionOf?: string) => {
    if (!laneId) return toast('Join a lane to upload')
    enqueue(picked, laneId, { tags: versionOf ? [] : parseTagInput(tagText), ...(versionOf ? { versionOf } : {}) })
  }
  // Files picked for a lane land in the folder being browsed, and wait on the optional details form.
  const baseFolder = dirLane ? dir.slice(1).join('/') : ''
  const place = (picked: Picked[], base: string): Picked[] => picked.map((p) => ({ file: p.file, folder: [base, p.folder].filter(Boolean).join('/') }))
  const holdBatch = (picked: Picked[]) => {
    if (!uploadLane) return toast('Join a lane to upload')
    setPending({ picked: place(picked, baseFolder), lane: uploadLane })
  }
  const sendBatch = (meta: BatchMeta | undefined) => {
    if (!pending) return
    enqueue(pending.picked, pending.lane, { tags: meta?.tags ?? parseTagInput(tagText), ...(meta ? { meta } : {}) })
    setPending(null)
  }
  const pickFiles = useCallback((d: string[]) => {
    uploadAt.current = d
    filesInput.current?.click()
  }, [])
  const pickFolder = useCallback((d: string[]) => {
    uploadAt.current = d
    folderInput.current?.click()
  }, [])
  const pickedFrom = (list: File[], withRel: boolean) => {
    const d = uploadAt.current
    const lane = d[0] && memberLanes.some((l) => l.id === d[0]) ? d[0] : uploadLane
    if (!lane) return toast('Join a lane to upload')
    const base = d[0] === lane ? d.slice(1).join('/') : ''
    setPending({ picked: place(list.map((file) => ({ file, folder: withRel ? relFolder(file) : '' })), base), lane })
  }

  const can: TableCtx['can'] = (row, a) => canDo(row, a, { admin, member: store.lanes[row.lane]?.members.includes(me) ?? false })
  const onAction = async (row: LibraryRow, a: RowAction) => {
    if (a === 'preview') {
      setViewing(row)
    } else if (a === 'download') {
      window.location.assign(api.libraryDownloadUrl(row.id))
    } else if (a === 'index') {
      setBusy((b) => ({ ...b, [row.id]: 'queued' }))
      const r = await api.libraryIndex(row.id, (l) => setBusy((b) => ({ ...b, [row.id]: l.stage })))
      setBusy((b) => {
        const { [row.id]: _gone, ...rest } = b
        return rest
      })
      toast(r.ok ? 'Indexed into recall: ' + row.name : 'Index failed: ' + (r.error ?? 'unknown'))
      void refresh()
    } else if (a === 'reprocess') {
      const r = await api.libraryReprocess(row.id)
      toast(r.ok ? 'Processing again' : 'Could not retry: ' + (r.body.error ?? r.status))
      void refresh()
    } else if (a === 'version') {
      versionRow.current = row
      versionInput.current?.click()
    } else if (a === 'retention') {
      setRetention({ row, days: row.retention_days ? String(row.retention_days) : '' })
    } else if (a === 'delete') {
      setDeleting(row)
    } else if (a === 'uses') {
      const r = await api.libraryRow(row.id)
      setUsesFor({ row, uses: r.ok ? r.body.uses : [] })
    }
  }
  const ctx: TableCtx = { laneTitle, personName, can, busy, onAction: (r, a) => void onAction(r, a) }
  const tiles = useMemo(() => rows.map((r) => fromLibraryRow(r, busy[r.id])), [rows, busy])
  const tileActions = (it: TileItem): TileAction[] => {
    const r = it.raw as LibraryRow
    const out: TileAction[] = []
    if (can(r, 'index')) out.push({ id: 'index', label: r.status === 'indexed' || r.status === 'available' ? 'Index again' : 'Index into recall' })
    if (can(r, 'reprocess')) out.push({ id: 'reprocess', label: 'Process again' })
    if (can(r, 'version')) out.push({ id: 'version', label: 'New version' })
    return out
  }

  // ---- the tree: [lane, ...folder] for every row, so All lanes opens on one folder per lane
  const laneIds = useMemo(() => [...new Set(rows.map((r) => r.lane))], [rows])
  const laneFolders = useLaneFolders(laneIds)
  const reloadFolders = laneFolders.reload
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), reloadFolders()])
  }, [refresh, reloadFolders])
  const entries = useMemo(() => tiles.map((t) => ({ dir: [(t.raw as LibraryRow).lane, ...folderSegs((t.raw as LibraryRow).folder)], item: t })), [tiles])
  const extra = useMemo(() => Object.entries(laneFolders.folders).flatMap(([l, fs]) => fs.map((f) => [l, ...folderSegs(f)])), [laneFolders.folders])
  const listing = useMemo(() => {
    const l = listDir(entries, dir, extra)
    return dir.length === 0 ? { ...l, folders: l.folders.map((f) => ({ ...f, label: laneTitle(f.name) })) } : l
  }, [entries, extra, dir, laneTitle])
  const scope = useMemo(
    () => ({
      laneOf: (d: string[]) => d[0] ?? null,
      folderPath: (d: string[]) => (d.length ? d.slice(1).join('/') : null),
      dirOfFolder: (d: string[], folder: string) => [d[0], ...folderSegs(folder)],
    }),
    [],
  )
  const ops = useDriveOps({ scope, rows, folders: laneFolders.folders, isMember: (l) => store.lanes[l]?.members.includes(me) ?? false, admin, people: peopleList, refresh: refreshAll, toast, pickFiles, pickFolder })
  const crumbOps = useMemo(() => ({ writableDir: ops.writableDir, laneOf: ops.laneOf, moveTo: ops.moveTo }), [ops])
  const asFile = (r: LibraryRow): FileRow => ({ id: r.id, name: r.name, path: 'console/data/uploads/' + r.lane + '/' + r.id + '/' + r.name, kind: r.kind, size: r.size, lane: r.lane })
  const convoUses = uses.filter((u) => u.use_kind === 'conversation' || u.use_kind === 'run')
  const skillUses = uses.filter((u) => u.use_kind === 'skill')

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="library-page">
      {viewing && (
        <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-background max-md:fixed max-md:z-[60] max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]" data-testid="library-viewer">
          <FileFrame f={asFile(viewing)} onClose={() => setViewing(null)} />
        </div>
      )}
      <PageHeader title="Library">
        <div className="ml-auto flex items-center gap-2">
          {!scoped && <Select value={laneFilter ?? 'all'} onValueChange={(v) => go(v === 'all' ? { name: 'library' } : { name: 'library', lane: v })}>
            <SelectTrigger className="w-48" aria-label="Lane filter" data-testid="lane-filter">
              <SelectValue placeholder="All lanes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lanes</SelectItem>
              {lanes.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.kind === 'dm' ? agentName(l) + ' (' + l.title + ')' : l.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>}
        </div>
      </PageHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-xs" placeholder="Batch tags, comma separated" aria-label="Batch tags" value={tagText} onChange={(e) => setTagText(e.target.value)} data-testid="batch-tags" />
              {!scoped && <Select value={uploadLane} onValueChange={setTarget}>
                <SelectTrigger className="w-52" aria-label="Upload to lane" data-testid="upload-lane">
                  <SelectValue placeholder="Upload to" />
                </SelectTrigger>
                <SelectContent>
                  {memberLanes.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{'Upload to ' + (l.kind === 'dm' ? agentName(l) + ' (' + l.title + ')' : l.title)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>}
            </div>
            <DropZone onPick={holdBatch} disabled={!uploadLane} />
            {pending && <UploadBatchForm count={pending.picked.length} folder={baseFolder || undefined} people={peopleList} defaultTags={tagText} onSubmit={sendBatch} onSkip={() => sendBatch(undefined)} onCancel={() => setPending(null)} />}
          </section>
          <UploadQueue items={queue} onRetry={retry} onRemove={(key) => dispatch({ type: 'remove', key })} onClear={() => dispatch({ type: 'clear' })} />
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : view === 'list' ? (
            <div className="flex flex-col gap-2">
              <div className="flex justify-end">
                <ViewToggle view={view} onChange={setView} />
              </div>
              <LibraryTable rows={rows} ctx={ctx} showLane={!laneFilter} />
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <nav aria-label="Library path" className="text-sm" data-testid="library-breadcrumb">
                <Crumbs root="Library" dir={dir} onGo={setDir} ops={crumbOps} label="Library path" nameOf={(d, n) => (d.length === 1 ? laneTitle(n) : n)} />
              </nav>
              <DriveBrowser
                key={dir.join('/')}
                dir={dir}
                folders={listing.folders}
                files={listing.files}
                view="grid"
                toolbar={<ViewToggle view={view} onChange={setView} />}
                actionsFor={tileActions}
                onOpenFile={(it) => void onAction(it.raw as LibraryRow, 'preview')}
                onOpenFolder={setDir}
                onAction={(it, id) => void onAction(it.raw as LibraryRow, id as RowAction)}
                ops={ops}
                laneOfDir={ops.laneOf}
                emptyText="No files yet. Drop some above."
              />
            </div>
          )}
        </div>
        <aside className="flex flex-col gap-3" aria-label="Library panels">
          <IndexingPanel status={status} />
          <ConversationsPanel uses={convoUses} />
          <SkillsPanel uses={skillUses} />
        </aside>
      </div>

      <input
        ref={versionInput}
        type="file"
        hidden
        data-testid="version-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          const row = versionRow.current
          if (f && row) addPicked([{ file: f, folder: row.folder ?? '' }], row.lane, row.id)
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
          const list = Array.from(e.target.files ?? [])
          if (list.length) pickedFrom(list, false)
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
          const list = Array.from(e.target.files ?? [])
          if (list.length) pickedFrom(list, true)
          e.target.value = ''
        }}
      />

      <Dialog open={!!usesFor} onOpenChange={(o) => !o && setUsesFor(null)}>
        <DialogContent data-testid="library-uses">
          <DialogHeader>
            <DialogTitle className="break-all">Used by: {usesFor?.row.name}</DialogTitle>
            <DialogDescription>Every use of this file, newest first.</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
            {(usesFor?.uses ?? []).map((u) => {
              const href = hrefForUse(u)
              return (
                <li key={u.id} className="flex gap-2">
                  <span className="w-24 shrink-0 text-muted-foreground">{u.use_kind}</span>
                  <span className="min-w-0 flex-1 truncate">{href ? <a className="underline underline-offset-2" href={href} onClick={() => setUsesFor(null)}>{u.ref}</a> : u.ref}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relTime(u.at)}</span>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!retention} onOpenChange={(o) => !o && setRetention(null)}>
        <DialogContent data-testid="library-retention">
          <DialogHeader>
            <DialogTitle>Retention</DialogTitle>
            <DialogDescription>Days to keep {retention?.row.name} before it moves to the bin. Empty keeps it.</DialogDescription>
          </DialogHeader>
          <Input inputMode="numeric" placeholder="Keep forever" aria-label="Retention in days" value={retention?.days ?? ''} onChange={(e) => setRetention((r) => (r ? { ...r, days: e.target.value.replace(/\D/g, '') } : r))} />
          <DialogFooter>
            <Button
              type="button"
              onClick={async () => {
                if (!retention) return
                const days = retention.days ? Number(retention.days) : null
                const r = await api.libraryRetention(retention.row.id, days)
                toast(r.ok ? (days ? 'Kept for ' + days + ' days' : 'Kept until deleted') : 'Could not save: ' + (r.body.error ?? r.status))
                setRetention(null)
                void refresh()
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent data-testid="library-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>It moves to the bin for 30 days and leaves recall. Nothing else changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return
                const r = await api.libraryDelete(deleting.id)
                toast(r.ok ? 'Moved to the bin' : 'Could not delete: ' + (r.body.error ?? r.status))
                setDeleting(null)
                void refresh()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
