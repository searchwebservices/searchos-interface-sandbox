// The file viewer: it takes over the whole surface it is shown in. A pdf is all its pages in one continuous scroll, an
// image fills the frame, a text kind keeps the preview, and every kind gets the same floating pill at the bottom:
// page x of y (click to jump), zoom, fit, Text, Info, Download, Copy path, Close. Used by Lane files, the Library page
// and file_retrieval cards, so a file opens the same way everywhere.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, DownloadIcon, FileTextIcon, InfoIcon, MaximizeIcon, MinusIcon, PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fileUrl, libraryDownloadUrl, libraryPreview, libraryRow } from '@/lib/api'
import { copyText } from '@/lib/clip'
import type { LibraryPreview, LibraryRow } from '@/lib/library'
import { cn } from '@/lib/utils'
import { PdfPages, clampScale } from './PdfPages'
import type { PdfControl, PdfState } from './PdfPages'
import { useCardEnv } from './env'
import { useViewerZoom } from './useViewerZoom'
import { useSurfaces } from './surface-context'
import { useViewerHost } from './viewer-context'
import { downloadable, fmtBytes } from './util'

export interface ViewerFile {
  id?: string
  name: string
  path: string
  kind: string
  size: number
  lane: string
  hash?: string
  summary?: string
}
export type ViewerMode = 'pdf' | 'image' | 'text'

const isPdfName = (n: string) => /\.pdf$/i.test(n)
const isImageName = (n: string) => /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(n)
export function modeOf(f: { name: string }, pv: LibraryPreview | null): ViewerMode {
  if (pv?.kind === 'application/pdf' || isPdfName(f.name)) return 'pdf'
  if (pv?.kind?.startsWith('image/') || isImageName(f.name)) return 'image'
  return 'text'
}

// The library row and its processed text for a file that has an id.
export function useLibraryFile(id: string | undefined): { pv: LibraryPreview | null; row: LibraryRow | null } {
  const [pv, setPv] = useState<LibraryPreview | null>(null)
  const [row, setRow] = useState<LibraryRow | null>(null)
  useEffect(() => {
    setPv(null)
    setRow(null)
    if (!id) return
    let live = true
    void libraryPreview(id).then((r) => live && r.ok && setPv(r.body))
    void libraryRow(id).then((r) => live && r.ok && r.body?.file && setRow(r.body.file))
    return () => {
      live = false
    }
  }, [id])
  return { pv, row }
}

const pill = 'absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-full border bg-popover/95 px-1.5 py-1 text-popover-foreground shadow-lg backdrop-blur'
const ib = '[@media(pointer:coarse)]:size-11'

function PageIndicator({ page, pages, onJump }: { page: number; pages: number; onJump: (n: number) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={pages}
        defaultValue={page}
        aria-label="Go to page"
        className="h-7 w-14 rounded-md border border-ring bg-background px-1 text-center font-mono text-xs outline-none"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            const n = Number(e.currentTarget.value)
            if (Number.isFinite(n) && n >= 1) onJump(Math.round(n))
            setEditing(false)
          } else if (e.key === 'Escape') setEditing(false)
        }}
        data-testid="pdf-jump-input"
      />
    )
  }
  return (
    <Button type="button" size="xs" variant="ghost" className="font-mono" aria-label={`Page ${page} of ${pages}. Click to jump`} onClick={() => setEditing(true)} data-testid="pdf-page-indicator">
      <span data-testid="pdf-counter">{page} / {pages}</span>
    </Button>
  )
}

function InfoBody({ f, row, pv }: { f: ViewerFile; row: LibraryRow | null; pv: LibraryPreview | null }) {
  const env = useCardEnv()
  const who = (id?: string | null) => (id ? (env.people[id] ?? id) : '')
  const rows: [string, string][] = [
    ['kind', row?.kind ?? pv?.kind ?? f.kind],
    ['size', fmtBytes(row?.size ?? f.size)],
    ['lane', f.lane],
    ['path', f.path],
    ['uploader', who(row?.uploader)],
    ['state', row?.status ?? pv?.status ?? ''],
    ['label', row?.label ?? ''],
    ['assigned', who(row?.assigned_to)],
    ['notes', row?.notes ?? ''],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" data-testid="viewer-info-list">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-muted-foreground">{k}</dt>
          <dd className="font-mono [overflow-wrap:anywhere]" data-testid={'info-' + k}>{v || '-'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function FileViewer({ f, id, row, pv, onClose, siblings, children }: { f: ViewerFile; id?: string; row: LibraryRow | null; pv: LibraryPreview | null; onClose?: () => void; siblings?: { index: number; count: number; go: (d: number) => void }; children?: ReactNode }) {
  const host = useViewerHost()
  const surfaces = useSurfaces()
  const close = onClose ?? host?.close ?? surfaces?.close ?? (() => {})
  const mode = modeOf(f, pv)
  const root = useRef<HTMLDivElement>(null)
  const pdf = useRef<PdfControl>(null)
  const [ps, setPs] = useState<PdfState>({ pages: 0, page: 1, scale: 1, fit: true })
  const [failed, setFailed] = useState(false)
  const [textOpen, setTextOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [zoom, setZoom] = useState<number | 'fit'>('fit') // images: a multiple of the fitted size
  const fail = useCallback(() => setFailed(true), [])
  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [f.path])
  useEffect(() => {
    setFailed(false)
    setTextOpen(false)
    setZoom('fit')
  }, [f.path, id])

  const url = id ? libraryDownloadUrl(id, true) : fileUrl(f.lane, f.path)
  const dl = id ? libraryDownloadUrl(id) : downloadable(f.path) ? fileUrl(f.lane, f.path) : ''
  const zoomImg = (d: number) => setZoom((z) => clampScale((z === 'fit' ? 1 : z) + d))
  const hasText = !!pv?.has_text
  const text = hasText ? (
    <pre className="overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-2 text-xs" data-testid="file-content-text">{pv!.text}</pre>
  ) : (
    <p className="text-sm text-muted-foreground">{pv?.note ?? 'No processed text for this file yet.'}</p>
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || (e.target as HTMLElement).tagName === 'INPUT') return
    const meta = e.metaKey || e.ctrlKey
    const k = e.key
    if (k === 'Escape') {
      e.preventDefault()
      close()
    } else if (meta) {
      // Cmd or ctrl with + - 0 is caught by useViewerZoom while the viewer is focused; nothing else here uses meta
    } else if (mode === 'pdf' && !textOpen) {
      const c = pdf.current
      if (!c) return
      if (k === 'ArrowDown') (e.preventDefault(), c.scrollBy(60))
      else if (k === 'ArrowUp') (e.preventDefault(), c.scrollBy(-60))
      else if (k === 'PageDown') (e.preventDefault(), c.scrollBy(c.pageSize() * 0.9))
      else if (k === 'PageUp') (e.preventDefault(), c.scrollBy(-c.pageSize() * 0.9))
      else if (k === 'Home') (e.preventDefault(), c.goTo(1))
      else if (k === 'End') (e.preventDefault(), c.goTo(ps.pages))
    }
  }

  const pdfOk = mode === 'pdf' && !failed
  // The viewer's own zoom: Cmd plus and minus, ctrl wheel and a two finger pinch land here instead of scaling the app.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const imgScale = () => (zoomRef.current === 'fit' ? 1 : zoomRef.current)
  useViewerZoom(
    root,
    {
      step: (dir) => (pdfOk ? (dir > 0 ? pdf.current?.zoomIn() : pdf.current?.zoomOut()) : mode === 'image' ? zoomImg(dir * 0.25) : undefined),
      fit: () => (pdfOk ? pdf.current?.fit() : setZoom('fit')),
      base: () => (pdfOk ? (pdf.current?.scale() ?? 1) : imgScale()),
      commit: (n) => (pdfOk ? pdf.current?.setScale(n) : mode === 'image' ? setZoom(clampScale(n)) : undefined),
    },
    pdfOk || mode === 'image',
  )
  const percent = Math.round((mode === 'pdf' ? ps.scale : zoom === 'fit' ? 1 : zoom) * 100)
  const isFit = mode === 'pdf' ? ps.fit : zoom === 'fit'

  let stage: ReactNode
  if (pdfOk) {
    stage = <PdfPages url={url} onFail={fail} ctl={pdf} onState={setPs} />
  } else if (mode === 'image') {
    stage = (
      <div className="relative flex min-h-0 flex-1 overflow-auto bg-muted p-3 pb-24" style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }} data-testid="image-stage">
        <img src={url} alt={f.name} className={cn('m-auto block', zoom === 'fit' ? 'max-h-full max-w-full object-contain' : 'max-w-none')} style={zoom === 'fit' ? undefined : { width: `${zoom * 100}%` }} data-zoom-target data-testid="image-view" />
      </div>
    )
  } else {
    stage = (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-24 pt-3" data-testid="text-stage">
        {mode === 'pdf' && failed && <p className="text-xs text-muted-foreground" data-testid="pdf-fallback">Could not render the pages. Showing the processed text.</p>}
        {mode === 'pdf' && failed ? text : children}
      </div>
    )
  }

  return (
    <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('button,a,input,[role=dialog]')) root.current?.focus({ preventScroll: true }) }} className="relative flex min-h-0 flex-1 flex-col outline-none" data-testid="file-preview" data-mode={mode} data-file={f.name}>
      {stage}
      {mode === 'pdf' && textOpen && !failed && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-background px-4 pb-24 pt-3" data-testid="pdf-text-panel">
          {text}
          {pv?.truncated && <p className="mt-1 text-xs text-muted-foreground">Cut at the preview limit. Download the file for the rest.</p>}
        </div>
      )}
      <div className={pill} role="toolbar" aria-label="File viewer" data-testid="viewer-bar">
        {siblings && siblings.count > 1 && (
          <>
            <Button type="button" size="icon-xs" variant="ghost" className={ib} aria-label="Previous file" disabled={siblings.index <= 0} onClick={() => siblings.go(-1)} data-testid="viewer-prev"><ChevronLeftIcon /></Button>
            <span className="px-1 font-mono text-xs" data-testid="viewer-which">{siblings.index + 1}/{siblings.count}</span>
            <Button type="button" size="icon-xs" variant="ghost" className={ib} aria-label="Next file" disabled={siblings.index >= siblings.count - 1} onClick={() => siblings.go(1)} data-testid="viewer-next"><ChevronRightIcon /></Button>
          </>
        )}
        {pdfOk && ps.pages > 0 && <PageIndicator page={ps.page} pages={ps.pages} onJump={(n) => pdf.current?.goTo(n)} />}
        {(pdfOk || mode === 'image') && (
          <>
            <Button type="button" size="icon-xs" variant="ghost" className={ib} aria-label="Zoom out" disabled={percent <= 25} onClick={() => (mode === 'pdf' ? pdf.current?.zoomOut() : zoomImg(-0.25))} data-testid="pdf-zoom-out"><MinusIcon /></Button>
            <span className="w-11 text-center font-mono text-xs" data-testid="pdf-zoom" aria-live="polite">{percent}%</span>
            <Button type="button" size="icon-xs" variant="ghost" className={ib} aria-label="Zoom in" disabled={percent >= 400} onClick={() => (mode === 'pdf' ? pdf.current?.zoomIn() : zoomImg(0.25))} data-testid="pdf-zoom-in"><PlusIcon /></Button>
            <Button type="button" size="icon-xs" variant={isFit ? 'secondary' : 'ghost'} className={ib} aria-label={mode === 'pdf' ? 'Fit width' : 'Fit'} aria-pressed={isFit} onClick={() => (mode === 'pdf' ? pdf.current?.fit() : setZoom('fit'))} data-testid="pdf-fit"><MaximizeIcon /></Button>
          </>
        )}
        {pdfOk && (
          <Button type="button" size="xs" variant={textOpen ? 'secondary' : 'ghost'} className={ib} aria-pressed={textOpen} onClick={() => setTextOpen((o) => !o)} data-testid="viewer-text">
            <FileTextIcon />
            Text
          </Button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="xs" variant="ghost" className={ib} aria-label="Info" data-testid="viewer-info">
              <InfoIcon />
              Info
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-80 max-w-[calc(100vw-2rem)]" data-testid="viewer-info-popover">
            <InfoBody f={f} row={row} pv={pv} />
          </PopoverContent>
        </Popover>
        {dl ? (
          <Button asChild size="icon-xs" variant="ghost" className={ib}>
            <a href={dl} download={f.name} aria-label="Download" title="Download" data-testid="file-download"><DownloadIcon /></a>
          </Button>
        ) : (
          <Button type="button" size="icon-xs" variant="ghost" className={ib} disabled aria-label="Download" title="This path is not served for download" data-testid="file-download"><DownloadIcon /></Button>
        )}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className={ib}
          aria-label="Copy path"
          title="Copy path"
          onClick={async () => {
            if (await copyText(f.path)) {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }
          }}
          data-testid="viewer-copy"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
        <Button type="button" size="icon-xs" variant="ghost" className={ib} aria-label="Close" title="Close" onClick={close} data-testid="viewer-close"><XIcon /></Button>
      </div>
    </div>
  )
}
