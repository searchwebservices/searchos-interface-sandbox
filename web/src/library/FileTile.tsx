// One file as a tile (grid) or a row (list), shared by the Lane files surface, the Library page and message attachments.
// A type icon by kind, or a real preview when the file has one: images and pdfs show the console's cached thumbnail
// (256 px WebP, a pdf's first page), text kinds show the first lines of a 240 character JSON thumb. Previews load when
// the tile scrolls into view; nothing here ever downloads the file itself.
import { useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { DownloadIcon, EllipsisVerticalIcon, ExternalLinkIcon, FileArchiveIcon, FileCodeIcon, FileIcon, FileJsonIcon, FileSpreadsheetIcon, FileTextIcon, FileTypeIcon, ImageIcon, NetworkIcon, ScrollTextIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import * as api from '@/lib/api'
import { fmtSize } from '@/lib/library'
import type { LibraryRow } from '@/lib/library'
import { relTime } from '@/lib/time'
import type { Attachment, LaneFileRow } from '@/lib/types'
import { cn } from '@/lib/utils'

export type FileKind = 'md' | 'txt' | 'csv' | 'json' | 'code' | 'pdf' | 'image' | 'pcap' | 'archive' | 'other'

const EXT: Record<string, FileKind> = {}
const put = (k: FileKind, list: string) => list.split(' ').forEach((e) => (EXT[e] = k))
put('md', 'md markdown')
put('txt', 'txt log text')
put('csv', 'csv tsv')
put('json', 'json jsonl ndjson')
put('code', 'js mjs cjs ts tsx jsx py sh bash zsh css html htm xml yaml yml toml ini sql go rs rb php java c h cpp conf service timer')
put('pdf', 'pdf')
put('image', 'png jpg jpeg gif webp svg avif bmp')
put('pcap', 'pcap pcapng cap')
put('archive', 'zip tar gz tgz 7z rar bz2 xz')

// By extension first (it is what the user sees), then by the MIME type the library sniffed.
export function fileKind(name: string, mime?: string | null): FileKind {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? ''
  if (EXT[ext]) return EXT[ext]
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'pdf'
  if (m.includes('zip') || m.includes('gzip') || m.includes('tar')) return 'archive'
  if (m.includes('pcap') || m.includes('tcpdump')) return 'pcap'
  if (m === 'application/json') return 'json'
  if (m === 'text/markdown') return 'md'
  if (m === 'text/csv') return 'csv'
  if (m.startsWith('text/')) return 'txt'
  return 'other'
}

const ICONS: Record<FileKind, ComponentType<{ className?: string }>> = {
  md: FileTextIcon,
  txt: ScrollTextIcon,
  csv: FileSpreadsheetIcon,
  json: FileJsonIcon,
  code: FileCodeIcon,
  pdf: FileTypeIcon,
  image: ImageIcon,
  pcap: NetworkIcon,
  archive: FileArchiveIcon,
  other: FileIcon,
}
export const KIND_LABEL: Record<FileKind, string> = { md: 'Markdown', txt: 'Text', csv: 'Table', json: 'JSON', code: 'Code', pdf: 'PDF', image: 'Image', pcap: 'Capture', archive: 'Archive', other: 'File' }

export interface TileAction {
  id: string
  label: string
  destructive?: boolean
}
// What the Drive-style browser adds to a tile: selection, the cursor, drag and drop, the context menu and inline rename.
// Without it the tile behaves as before (a click opens it).
export interface DriveTile {
  picked: boolean
  cursor: boolean
  cut: boolean
  renaming: boolean
  draggable: boolean
  onPick: (e: React.MouseEvent) => void
  onContext: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onRename: (name: string | null) => void
}
export interface TileItem {
  key: string
  name: string
  kind: FileKind
  size: number
  when: string | null
  folder?: string
  // A line under the name: the label and who it is assigned to, when the file has them.
  sub?: string
  downloadUrl: string
  imageUrl?: string
  // Resolves to the preview text, or '' when there is none. Cached by cacheKey.
  loadText?: () => Promise<string>
  cacheKey: string
  pill?: { text: string; tone: 'muted' | 'warn' | 'bad' | 'busy'; title?: string }
  selected?: boolean
  raw: LibraryRow | LaneFileRow | Attachment
}

// ------------------------------------------------------------------ adapters
const TEXTUAL: FileKind[] = ['md', 'txt', 'csv', 'json', 'code']

export function fromLibraryRow(row: LibraryRow, stage?: string): TileItem {
  const kind = fileKind(row.name, row.kind)
  // Previews come from the thumbnail route only: a small WebP for an image or a pdf's first page, 240 characters of JSON for text.
  const thumb = api.libraryThumbUrl(row.id)
  let pill: TileItem['pill']
  if (stage) pill = { text: 'indexing: ' + stage, tone: 'busy' }
  else if (row.status === 'failed') pill = { text: 'failed', tone: 'bad', title: row.fail_reason ?? '' }
  else if (row.needs_parser) pill = { text: 'needs a parser', tone: 'warn', title: row.note ?? '' }
  else if (row.status !== 'available') pill = { text: row.status, tone: 'muted', title: row.note ?? row.index_error ?? '' }
  return {
    key: row.id,
    name: row.name,
    kind,
    size: row.size,
    when: row.uploaded_at,
    folder: row.folder ?? undefined,
    sub: [row.label, row.assigned_to ? 'for ' + row.assigned_to : ''].filter(Boolean).join(' · ') || undefined,
    downloadUrl: api.libraryDownloadUrl(row.id),
    imageUrl: kind === 'image' || kind === 'pdf' ? thumb : undefined,
    loadText: TEXTUAL.includes(kind) ? () => api.thumbText(thumb) : kind === 'pdf' ? () => api.thumbText(thumb + '?text=1') : undefined,
    cacheKey: 'lib:' + row.id + ':' + row.version + ':' + (row.sha256 ?? ''),
    pill,
    raw: row,
  }
}

// A file attached to a chat message: the Library id and what the console stored about it.
export function fromAttachment(a: Attachment): TileItem {
  const kind = fileKind(a.name, a.kind)
  const thumb = api.libraryThumbUrl(a.id)
  return {
    key: a.id,
    name: a.name,
    kind,
    size: a.size,
    when: null,
    downloadUrl: api.libraryDownloadUrl(a.id),
    imageUrl: kind === 'image' || kind === 'pdf' ? thumb : undefined,
    loadText: TEXTUAL.includes(kind) ? () => api.thumbText(thumb) : kind === 'pdf' ? () => api.thumbText(thumb + '?text=1') : undefined,
    cacheKey: 'att:' + a.id,
    raw: a,
  }
}

export function fromLaneFile(f: LaneFileRow): TileItem {
  const kind = fileKind(f.name, f.kind)
  const url = api.fileUrl(f.lane, f.path)
  const thumb = api.fileThumbUrl(f.lane, f.path, f.mtime ?? f.size)
  return {
    key: f.path,
    name: f.name,
    kind,
    size: f.size,
    when: f.mtime,
    downloadUrl: url,
    imageUrl: kind === 'image' || kind === 'pdf' ? thumb : undefined,
    loadText: TEXTUAL.includes(kind) ? () => api.thumbText(thumb) : undefined,
    cacheKey: 'path:' + f.lane + ':' + f.path + ':' + (f.mtime ?? '') + ':' + f.size,
    raw: f,
  }
}

// ------------------------------------------------------------------ preview plumbing
const textCache = new Map<string, Promise<string>>()
export function clearPreviewCache(): void {
  textCache.clear()
}
export function headLines(text: string, n = 3): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#{1,6}\s+/, '').trimEnd())
    .filter((l) => l.trim())
    .slice(0, n)
    .map((l) => (l.length > 140 ? l.slice(0, 140) : l))
    .join('\n')
}

function useInView(ref: React.RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setSeen(true)
        io.disconnect()
      }
    }, { rootMargin: '120px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen, ref])
  return seen
}

function usePreviewText(item: TileItem, active: boolean): string {
  const [text, setText] = useState('')
  useEffect(() => {
    if (!active || !item.loadText) return
    let cancelled = false
    let p = textCache.get(item.cacheKey)
    if (!p) {
      p = item.loadText().catch(() => '')
      textCache.set(item.cacheKey, p)
    }
    void p.then((t) => !cancelled && setText(headLines(t)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, item.cacheKey])
  return text
}

const TAP = '[@media(pointer:coarse)]:size-11'

function Pill({ pill }: { pill: NonNullable<TileItem['pill']> }) {
  const tone = pill.tone === 'bad' ? 'destructive' : pill.tone === 'muted' ? 'outline' : 'secondary'
  return (
    <Badge variant={tone} title={pill.title || undefined} data-testid="tile-pill" data-tone={pill.tone} className={cn('h-auto max-w-full self-start whitespace-normal py-0.5 text-left', pill.tone === 'warn' && 'bg-warn/20 text-warn')}>
      {pill.text}
    </Badge>
  )
}

function Preview({ item, text, showImage, onBroken, className }: { item: TileItem; text: string; showImage: boolean; onBroken: () => void; className?: string }) {
  const Icon = ICONS[item.kind]
  const icon = <Icon className="size-8 text-muted-foreground" />
  return (
    <div className={cn('flex items-center justify-center overflow-hidden bg-muted text-muted-foreground', className)} data-testid="tile-preview" data-kind={item.kind} title={item.kind === 'pdf' && text ? text : undefined} aria-hidden="true">
      {showImage && item.imageUrl ? (
        <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={onBroken} data-testid="tile-image" />
      ) : text && item.kind !== 'pdf' ? (
        <pre className="size-full overflow-hidden whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-snug text-foreground" data-testid="tile-text">{text}</pre>
      ) : (
        <span data-testid="tile-icon" data-kind={item.kind} title={KIND_LABEL[item.kind]}>{icon}</span>
      )}
    </div>
  )
}

const isCoarse = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

// The name, or an input over it while renaming. The extension stays out of the selection so typing replaces the stem.
export function RenameInput({ name, onDone, className }: { name: string; onDone: (name: string | null) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = name.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : name.length)
  }, [name])
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <input
      ref={ref}
      defaultValue={name}
      aria-label="New name"
      className={cn('w-full min-w-0 rounded border border-ring bg-background px-1 py-0.5 text-sm outline-none', className)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(e.currentTarget.value)
        else if (e.key === 'Escape') finish(null)
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
      data-testid="rename-input"
    />
  )
}

export function FileTile({ item, layout, actions, onOpen, onAction, drive }: { item: TileItem; layout: 'grid' | 'list'; actions: TileAction[]; onOpen: (item: TileItem) => void; onAction: (item: TileItem, id: string) => void; drive?: DriveTile }) {
  const ref = useRef<HTMLLIElement>(null)
  const seen = useInView(ref)
  const text = usePreviewText(item, seen && item.kind !== 'image')
  const snippet = item.kind === 'pdf' ? text.split('\n')[0] : ''
  const [broken, setBroken] = useState(false)
  const grid = layout === 'grid'
  const meta = [item.size ? fmtSize(item.size) : '', item.when ? relTime(item.when) : ''].filter(Boolean).join(' · ')
  const hoverBtn = 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:hidden'
  const quick = (
    <>
      <Button type="button" size="icon-xs" variant="secondary" className={hoverBtn} aria-label={'Open ' + item.name} onClick={() => onOpen(item)} data-testid="tile-open">
        <ExternalLinkIcon />
      </Button>
      <Button asChild size="icon-xs" variant="secondary" className={hoverBtn}>
        <a href={item.downloadUrl} download={item.name} aria-label={'Download ' + item.name} data-testid="tile-download">
          <DownloadIcon />
        </a>
      </Button>
    </>
  )
  const menu = drive ? (
    <Button type="button" size="icon-xs" variant="secondary" className={TAP} aria-label={'Actions for ' + item.name} aria-haspopup="menu" onClick={drive.onContext} data-testid="tile-menu">
      <EllipsisVerticalIcon />
    </Button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-xs" variant="secondary" className={TAP} aria-label={'Actions for ' + item.name} data-testid="tile-menu">
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpen(item)} data-testid="action-open">Open</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={item.downloadUrl} download={item.name} data-testid="action-download">Download</a>
        </DropdownMenuItem>
        {actions.map((a, i) => (
          <ActionItem key={a.id} a={a} first={i === 0} item={item} onAction={onAction} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const nameEl = drive?.renaming ? (
    <RenameInput name={item.name} onDone={drive.onRename} />
  ) : (
    <span className="line-clamp-2 break-words text-sm font-medium [overflow-wrap:anywhere]" title={item.name} data-testid="tile-name">{item.name}</span>
  )
  // Drive behaviour: a click picks, a double click opens. A touch screen has no double click, so a tap opens.
  const mainClick = (e: React.MouseEvent) => {
    if (!drive) return onOpen(item)
    if (isCoarse() && !e.shiftKey && !e.metaKey && !e.ctrlKey) return onOpen(item)
    drive.onPick(e)
  }
  const rootProps = drive
    ? {
        'data-key': item.key,
        'data-picked': drive.picked,
        'data-cursor': drive.cursor,
        'data-cut': drive.cut,
        'aria-selected': drive.picked,
        draggable: drive.draggable && !drive.renaming,
        onContextMenu: drive.onContext,
        onDragStart: drive.onDragStart,
        onDragEnd: drive.onDragEnd,
        onDoubleClick: () => onOpen(item),
      }
    : {}
  const pickedCls = drive?.picked ? 'ring-2 ring-primary' : drive?.cursor ? 'ring-2 ring-ring/50' : ''
  const metaEl = <span className="whitespace-nowrap text-xs text-muted-foreground" data-testid="tile-meta">{meta}</span>
  const focus = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
  if (grid) {
    return (
      <li ref={ref} {...rootProps} className={cn('group relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card data-[selected=true]:border-primary', 'focus-within:border-ring', pickedCls, drive?.picked && 'bg-accent', drive?.cut && 'opacity-50')} data-testid="file-tile" data-kind={item.kind} data-selected={!!item.selected}>
        <button type="button" tabIndex={drive ? -1 : undefined} className={cn('flex min-w-0 flex-1 flex-col text-left', focus)} aria-label={'Open ' + item.name} onClick={mainClick} data-testid="tile-main">
          <Preview item={item} text={text} showImage={seen && !broken} onBroken={() => setBroken(true)} className="h-24 w-full" />
          <span className="flex min-w-0 flex-1 flex-col gap-1 p-2">
            {nameEl}
            {item.sub ? <span className="line-clamp-1 text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="tile-sub">{item.sub}</span> : null}
            {item.folder && !drive ? <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.folder}</span> : null}
            {snippet ? <span className="line-clamp-1 text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="tile-snippet">{snippet}</span> : null}
            {metaEl}
            {item.pill && <Pill pill={item.pill} />}
          </span>
        </button>
        <div className="absolute right-1 top-1 flex gap-1">
          {quick}
          {menu}
        </div>
      </li>
    )
  }
  return (
    <li ref={ref} {...rootProps} className={cn('group flex min-w-0 items-center gap-2 p-2 data-[selected=true]:bg-accent', drive?.picked && 'bg-accent ring-2 ring-inset ring-primary', drive?.cursor && !drive.picked && 'ring-2 ring-inset ring-ring/50', drive?.cut && 'opacity-50')} data-testid="file-tile" data-kind={item.kind} data-selected={!!item.selected}>
      <button type="button" tabIndex={drive ? -1 : undefined} className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-md text-left', focus)} aria-label={'Open ' + item.name} onClick={mainClick} data-testid="tile-main">
        <Preview item={item} text={text} showImage={seen && !broken} onBroken={() => setBroken(true)} className="size-12 shrink-0 rounded-md" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {nameEl}
          {metaEl}
          {item.pill && <Pill pill={item.pill} />}
        </span>
      </button>
      <span className="flex shrink-0 gap-1">
        {quick}
        {menu}
      </span>
    </li>
  )
}

function ActionItem({ a, first, item, onAction }: { a: TileAction; first: boolean; item: TileItem; onAction: (item: TileItem, id: string) => void }): ReactNode {
  return (
    <>
      {a.destructive && first === false ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem variant={a.destructive ? 'destructive' : undefined} onSelect={() => onAction(item, a.id)} data-testid={'action-' + a.id}>
        {a.label}
      </DropdownMenuItem>
    </>
  )
}
