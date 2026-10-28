// file_retrieval. Inline: the files with Open and Download. Surface: the File Preview, which shows the summary
// and the metadata. Download goes to GET /api/lanes/:lane/files?path=, which only serves book/, docs/, registry/
// and the uploads folder.
import { useEffect, useState } from 'react'
import { DownloadIcon, FileTextIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fileUrl, libraryDownloadUrl } from '@/lib/api'
import { CardFrame } from './Frame'
import { FileViewer, modeOf, useLibraryFile } from './FileViewer'
import { useCardEnv, useOpen } from './env'
import { asRec, asStr, downloadable, fmtBytes } from './util'
import type { CardProps, SurfaceProps } from './types'

export interface FileRow {
  // The Library row (docs/library-spec.md). With an id the download and the preview come from /api/library/:id.
  id?: string
  name: string
  path: string
  kind: string
  size: number
  lane: string
  hash?: string
  summary?: string
}

// An uploaded file sits at console/data/uploads/<lane>/<library id>/<name>; the id in the path is the Library row id.
const UPLOAD_ID = /(?:^|\/)uploads\/[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//
export const libraryIdOf = (f: FileRow | undefined): string | undefined => (f?.id ? f.id : f ? UPLOAD_ID.exec(f.path ?? '')?.[1] : undefined)

export function filesOf(data: unknown): FileRow[] {
  const list = asRec(data).files
  return Array.isArray(list) ? (list.filter((f) => f && typeof f === 'object') as FileRow[]) : []
}

function DownloadLink({ lane, file }: { lane: string; file: FileRow }) {
  const ok = !!file.id || downloadable(asStr(file.path))
  if (!ok) {
    return (
      <Button type="button" size="xs" variant="outline" disabled title="This path is not served for download">
        <DownloadIcon />
        Download
      </Button>
    )
  }
  return (
    <Button asChild size="xs" variant="outline">
      <a href={file.id ? libraryDownloadUrl(file.id) : fileUrl(lane, file.path)} download={file.name} data-testid="file-download">
        <DownloadIcon />
        Download
      </a>
    </Button>
  )
}

export function FilesInline({ card }: CardProps) {
  const env = useCardEnv()
  const open = useOpen()
  const files = filesOf(card.data)
  const lane = env.lane || card.lane
  return (
    <CardFrame card={card}>
      <ul className="flex flex-col divide-y rounded-md border bg-background" data-testid="file-rows">
        {files.map((f, i) => (
          <li key={f.path + i} className="flex flex-wrap items-center gap-2 px-2 py-1.5" data-testid="file-row">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
            <Badge variant="secondary">{f.kind}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{fmtBytes(f.size)}</span>
            <Button type="button" size="xs" variant="outline" onClick={() => open(card, i)}>
              Open
            </Button>
            <DownloadLink lane={lane} file={f} />
          </li>
        ))}
      </ul>
    </CardFrame>
  )
}

// A repo file (book/, docs/, registry/) has no Library row, so its text comes straight from the lane files route,
// read inline. Capped: past the cap the viewer says so and leaves Download.
export const REPO_TEXT_MAX = 512 * 1024
export interface RepoText {
  state: 'idle' | 'loading' | 'ok' | 'too_large' | 'error'
  text: string
}
export function useRepoText(lane: string, f: FileRow | undefined, enabled: boolean): RepoText {
  const [r, setR] = useState<RepoText>({ state: 'idle', text: '' })
  const path = f?.path ?? ''
  const size = f?.size ?? 0
  useEffect(() => {
    if (!enabled || !path || !downloadable(path)) {
      setR({ state: 'idle', text: '' })
      return
    }
    if (size > REPO_TEXT_MAX) {
      setR({ state: 'too_large', text: '' })
      return
    }
    let live = true
    setR({ state: 'loading', text: '' })
    fetch(fileUrl(lane, path) + '&inline=1', { credentials: 'same-origin' })
      .then(async (res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => live && setR({ state: 'ok', text }))
      .catch(() => live && setR({ state: 'error', text: '' }))
    return () => {
      live = false
    }
  }, [lane, path, size, enabled])
  return r
}

// The details a text file shows in the open, under its summary. Pdfs and images keep them in the viewer's Info popover.
function Details({ f }: { f: FileRow }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" data-testid="file-meta">
      <dt className="font-mono text-muted-foreground">kind</dt>
      <dd className="font-mono">{f.kind}</dd>
      <dt className="font-mono text-muted-foreground">size</dt>
      <dd className="font-mono">{fmtBytes(f.size)}</dd>
      <dt className="font-mono text-muted-foreground">lane</dt>
      <dd className="font-mono">{f.lane}</dd>
      <dt className="font-mono text-muted-foreground">path</dt>
      <dd className="font-mono break-all">{f.path}</dd>
      {f.hash && (
        <>
          <dt className="font-mono text-muted-foreground">hash</dt>
          <dd className="font-mono break-all">{f.hash}</dd>
        </>
      )}
    </dl>
  )
}

// One file in the viewer: the whole surface, with the footer bar. A text kind keeps summary, content and details.
export function FileFrame({ f, onClose, siblings }: { f: FileRow; onClose?: () => void; siblings?: { index: number; count: number; go: (d: number) => void } }) {
  const id = libraryIdOf(f)
  const { pv, row } = useLibraryFile(id)
  const repo = useRepoText(f.lane, f, !id && modeOf(f, null) === 'text')
  return (
    <FileViewer f={f} id={id} row={row} pv={pv} onClose={onClose} siblings={siblings}>
      <h3 className="text-base font-semibold break-all">{f.name}</h3>
      <section>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</h4>
        {f.summary ? <p className="text-sm whitespace-pre-wrap" data-testid="file-summary">{f.summary}</p> : <p className="text-sm text-muted-foreground">No summary stored for this file.</p>}
      </section>
      {id && pv && (
        <section data-testid="file-content">
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Content</h4>
          {pv.has_text ? (
            <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap" data-testid="file-content-text">{pv.text}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">{pv.note ?? 'No processed text for this file yet.'}</p>
          )}
          {pv.truncated && <p className="mt-1 text-xs text-muted-foreground">Cut at the preview limit. Download the file for the rest.</p>}
        </section>
      )}
      {!id && repo.state !== 'idle' && (
        <section data-testid="file-content">
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Content</h4>
          {repo.state === 'ok' ? (
            <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap" data-testid="file-content-text">{repo.text}</pre>
          ) : repo.state === 'loading' ? (
            <p className="text-sm text-muted-foreground">Reading the file.</p>
          ) : repo.state === 'too_large' ? (
            <p className="text-sm text-muted-foreground">Too large to show here. Download the file.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Could not read the file.</p>
          )}
        </section>
      )}
      <section>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</h4>
        <Details f={f} />
      </section>
    </FileViewer>
  )
}

export function FilesSurface({ card, arg }: SurfaceProps) {
  const files = filesOf(card.data)
  const [sel, setSel] = useState(typeof arg === 'number' && arg >= 0 && arg < files.length ? arg : 0)
  const f = files[sel]
  if (!f) return <p className="px-4 text-sm text-muted-foreground">No file.</p>
  return <FileFrame key={f.path + sel} f={f} siblings={{ index: sel, count: files.length, go: (d) => setSel((i) => Math.min(files.length - 1, Math.max(0, i + d))) }} />
}
