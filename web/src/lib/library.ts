// The Library client (docs/library-spec.md): row types, the upload queue reducer, dropped-file collection and the
// XHR upload with progress. The reducer and the collectors are pure or take their inputs, so they test without a browser.
import type { ApiResult } from './api'

export type FileStatus = 'uploaded' | 'validated' | 'processed' | 'indexed' | 'available' | 'failed'
export const PIPELINE: FileStatus[] = ['uploaded', 'validated', 'processed', 'indexed', 'available', 'failed']

export interface LibraryRow {
  id: string
  lane: string
  name: string
  folder?: string | null
  kind: string
  category?: string | null
  size: number
  sha256?: string | null
  uploader?: string | null
  uploaded_at: string
  status: FileStatus
  fail_reason?: string | null
  version: number
  previous_id?: string | null
  tags: string[]
  retention_days?: number | null
  label?: string | null
  notes?: string | null
  assigned_to?: string | null
  needs_parser?: boolean
  note?: string | null
  chunk_count?: number | null
  index_error?: string | null
  uses_count: number
  linked_skills: string[]
}

export interface LibraryUse {
  id: string
  file_id: string
  use_kind: 'conversation' | 'run' | 'skill' | 'recall' | 'surface'
  ref: string
  at: string
  by_person?: string | null
  name?: string
  lane?: string
}

export interface LibraryEvent {
  at: string
  type: string
  lane: string
  file_id?: string
  name?: string
  from?: string | null
  to?: string
  reason?: string | null
  chunks?: number
}

export interface LibraryStatus {
  counts: Record<FileStatus, number>
  events: LibraryEvent[]
  indexing: string[]
}

export interface LibraryPreview {
  id: string
  name: string
  kind: string
  status: FileStatus
  size: number
  text: string
  truncated: boolean
  has_text: boolean
  previewable: boolean
  needs_parser: boolean
  note: string | null
  fail_reason: string | null
}

// ------------------------------------------------------------------ queue reducer
export type QueueState = 'queued' | 'uploading' | 'processing' | 'done' | 'failed' | 'refused'
export interface QueueItem {
  key: string
  lane: string
  name: string
  size: number
  folder: string
  tags: string[]
  meta?: BatchMeta
  versionOf?: string
  progress: number
  state: QueueState
  error?: string
  fileId?: string
  status?: FileStatus
}
export type QueueAction =
  | { type: 'add'; items: QueueItem[] }
  | { type: 'start'; key: string }
  | { type: 'progress'; key: string; pct: number }
  | { type: 'uploaded'; key: string; fileId: string; status: FileStatus }
  | { type: 'failed'; key: string; error: string }
  | { type: 'refused'; key: string; error: string }
  | { type: 'retry'; key: string }
  | { type: 'pipeline'; rows: Pick<LibraryRow, 'id' | 'status' | 'fail_reason'>[] }
  | { type: 'remove'; key: string }
  | { type: 'clear' }

const SETTLED: FileStatus[] = ['processed', 'indexed', 'available', 'validated']

export function queueReducer(s: QueueItem[], a: QueueAction): QueueItem[] {
  const upd = (key: string, f: (q: QueueItem) => QueueItem) => s.map((q) => (q.key === key ? f(q) : q))
  switch (a.type) {
    case 'add':
      return [...s, ...a.items]
    case 'start':
      return upd(a.key, (q) => ({ ...q, state: 'uploading', progress: 0, error: undefined }))
    case 'progress':
      return upd(a.key, (q) => (q.state === 'uploading' ? { ...q, progress: Math.max(q.progress, Math.min(100, Math.round(a.pct))) } : q))
    case 'uploaded':
      return upd(a.key, (q) => ({ ...q, progress: 100, fileId: a.fileId, status: a.status, state: SETTLED.includes(a.status) ? 'done' : a.status === 'failed' ? 'failed' : 'processing' }))
    case 'failed':
      return upd(a.key, (q) => ({ ...q, state: 'failed', error: a.error }))
    case 'refused':
      return upd(a.key, (q) => ({ ...q, state: 'refused', error: a.error }))
    case 'retry':
      return upd(a.key, (q) => (q.state === 'failed' ? { ...q, state: 'queued', progress: 0, error: undefined } : q))
    case 'pipeline': {
      const by = new Map(a.rows.map((r) => [r.id, r]))
      return s.map((q) => {
        const r = q.fileId ? by.get(q.fileId) : undefined
        if (!r || (q.state !== 'processing' && q.state !== 'done')) return q
        if (r.status === 'failed') return { ...q, status: r.status, state: 'failed', error: r.fail_reason ?? 'failed' }
        return { ...q, status: r.status, state: SETTLED.includes(r.status) ? 'done' : 'processing' }
      })
    }
    case 'remove':
      return s.filter((q) => q.key !== a.key)
    case 'clear':
      return s.filter((q) => q.state === 'queued' || q.state === 'uploading' || q.state === 'processing')
  }
}

// The optional details of one upload batch (the inline form): who it is for, a label, tags and notes.
export interface BatchMeta {
  assigned_to?: string
  label?: string
  tags?: string[]
  notes?: string
}
export const queueBusy = (s: QueueItem[]): boolean => s.some((q) => q.state === 'queued' || q.state === 'uploading' || q.state === 'processing')

let seq = 0
export function makeItem(file: { name: string; size: number }, lane: string, opts: { folder?: string; tags?: string[]; versionOf?: string; meta?: BatchMeta } = {}): QueueItem {
  return { key: 'q' + ++seq + '-' + Date.now().toString(36), lane, name: file.name, size: file.size, folder: opts.folder ?? '', tags: opts.tags ?? [], ...(opts.meta ? { meta: opts.meta } : {}), ...(opts.versionOf ? { versionOf: opts.versionOf } : {}), progress: 0, state: 'queued' }
}

export function parseTagInput(raw: string): string[] {
  const out: string[] = []
  for (const t of raw.split(/[,\n]/)) {
    const s = t.trim().toLowerCase().slice(0, 40)
    if (s && !out.includes(s)) out.push(s)
  }
  return out.slice(0, 20)
}

// ------------------------------------------------------------------ dropped files
export interface Picked {
  file: File
  folder: string
}
interface EntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (ok: (f: File) => void, no: (e: unknown) => void) => void
  createReader?: () => { readEntries: (ok: (e: EntryLike[]) => void, no: (e: unknown) => void) => void }
}
async function walk(entry: EntryLike, dir: string, out: Picked[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, no) => entry.file!(ok, no))
    out.push({ file, folder: dir })
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader()
    const next = dir ? dir + '/' + entry.name : entry.name
    for (;;) {
      const batch = await new Promise<EntryLike[]>((ok, no) => reader.readEntries(ok, no))
      if (!batch.length) break
      for (const e of batch) await walk(e, next, out)
    }
  }
}
// Files and folders from a drop or a paste. Folders become files with a folder tag; a browser without
// webkitGetAsEntry falls back to dt.files.
export async function collectFromTransfer(dt: Pick<DataTransfer, 'files' | 'items'> | null): Promise<Picked[]> {
  if (!dt) return []
  const out: Picked[] = []
  const items = dt.items ? Array.from(dt.items) : []
  const entries = items.filter((i) => i.kind === 'file').map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null)
  if (entries.length && entries.every(Boolean)) {
    for (const e of entries) await walk(e as EntryLike, '', out)
    if (out.length) return out
  }
  for (const f of Array.from(dt.files ?? [])) out.push({ file: f, folder: relFolder(f) })
  return out
}
export function relFolder(f: File): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath
  if (!rel || !rel.includes('/')) return ''
  return rel.split('/').slice(0, -1).join('/')
}
// A paste: files from the clipboard, or the text itself as a .txt file.
export function collectFromPaste(cd: Pick<DataTransfer, 'files' | 'getData'> | null, now = new Date()): Picked[] {
  if (!cd) return []
  const files = Array.from(cd.files ?? [])
  if (files.length) return files.map((file) => ({ file, folder: '' }))
  const text = cd.getData('text/plain')
  if (!text.trim()) return []
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return [{ file: new File([text], `pasted-${stamp}.txt`, { type: 'text/plain' }), folder: '' }]
}

// ------------------------------------------------------------------ XHR upload with progress
export interface UploadBody {
  files?: LibraryRow[]
  refused?: { name: string; reason: string }[]
  error?: string
}
// fetch has no upload progress, so this one is XHR (docs/library-spec.md section 1).
export function uploadFile(item: QueueItem, file: File, onProgress: (pct: number) => void, xhrFactory: () => XMLHttpRequest = () => new XMLHttpRequest()): Promise<ApiResult<UploadBody>> {
  return new Promise((resolve) => {
    const xhr = xhrFactory()
    const url = item.versionOf ? '/api/library/' + encodeURIComponent(item.versionOf) + '/version' : '/api/lanes/' + encodeURIComponent(item.lane) + '/files'
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      let body: UploadBody = {}
      try {
        body = JSON.parse(xhr.responseText) as UploadBody
      } catch {
        body = {}
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body })
    }
    xhr.onerror = () => resolve({ ok: false, status: 0, body: { error: 'network' } })
    xhr.onabort = () => resolve({ ok: false, status: 0, body: { error: 'aborted' } })
    const fd = new FormData()
    if (item.tags.length) fd.append('tags', item.tags.join(','))
    if (item.folder) fd.append('folder', item.folder)
    if (item.meta?.assigned_to) fd.append('assigned_to', item.meta.assigned_to)
    if (item.meta?.label) fd.append('label', item.meta.label)
    if (item.meta?.notes) fd.append('notes', item.meta.notes)
    fd.append('file', file, file.name) // fields first: the server reads them in order
    xhr.send(fd)
  })
}

export const REFUSAL_TEXT: Record<string, string> = {
  credential_name: 'Refused: the name looks like a credential file',
  too_large: 'Refused: over the 5 GB limit',
  upload_failed: 'The upload broke off',
  one_file_per_version: 'A new version takes one file',
}

export const TERMINAL_STATUS = (s: FileStatus): boolean => s === 'processed' || s === 'available' || s === 'failed' || s === 'indexed'

export function fmtSize(n: number): string {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
  if (n < 1024 ** 3) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB'
  return (n / 1024 ** 3).toFixed(2) + ' GB'
}

// A use ref of the form lane/message-id opens that message in the thread.
export function hrefForUse(u: Pick<LibraryUse, 'use_kind' | 'ref'>): string | null {
  if (u.use_kind !== 'conversation' && u.use_kind !== 'run') return null
  const m = /^([a-z0-9-]+)\/([A-Za-z0-9._:-]{1,128})$/.exec(u.ref)
  return m ? '#/lanes/' + encodeURIComponent(m[1]) + '/m/' + encodeURIComponent(m[2]) : null
}
