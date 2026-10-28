// Big uploads. A file over 256 MB goes up in parts the console stores under uploads/.parts/<upload id>/ and assembles on
// complete. The upload id is kept in sessionStorage, so after a reload picking the same file again resumes at the first
// part the console does not hold yet. Smaller files use the one-request multipart upload in ./library.
import { call } from './api'
import type { ApiResult } from './api'
import type { UploadBody } from './library'

export const MB = 1024 * 1024
export const GB = 1024 * MB
export const CHUNK_OVER = 256 * MB // above this size an upload is chunked
export const CONFIRM_OVER = 1 * GB // above this size the person confirms first
export const MAX_FILE = 5 * GB // the hard limit per file
export const PART_SIZE = 32 * MB
const RETRIES = 3
const SPEED_KEY = 'sov.upload.bps'
const DEFAULT_BPS = 25 * MB // a LAN guess until a real upload measures better

export const isChunked = (size: number): boolean => size > CHUNK_OVER
export const needsConfirm = (size: number): boolean => size > CONFIRM_OVER
export const tooBig = (size: number): boolean => size > MAX_FILE

function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}
export function measuredBps(): number {
  const v = Number(store()?.getItem(SPEED_KEY))
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_BPS
}
export function rememberBps(bytes: number, ms: number): void {
  if (bytes < 8 * MB || ms < 500) return
  try {
    store()?.setItem(SPEED_KEY, String(Math.round((bytes / ms) * 1000)))
  } catch {
    /* storage is a convenience */
  }
}
export function estimateSeconds(bytes: number, bps = measuredBps()): number {
  return Math.max(1, Math.round(bytes / bps))
}
export function fmtDuration(sec: number): string {
  if (sec < 90) return sec + ' seconds'
  const m = Math.round(sec / 60)
  if (m < 90) return m + ' minutes'
  const h = Math.floor(m / 60)
  return h + ' h ' + (m % 60) + ' min'
}

// ---------------------------------------------------------------- resume memory
export const resumeKey = (lane: string, f: { name: string; size: number; lastModified?: number }) => `sov.upload:${lane}:${f.name}:${f.size}:${f.lastModified ?? 0}`
const remember = (k: string, id: string) => {
  try {
    store()?.setItem(k, id)
  } catch {
    /* ignore */
  }
}
const forget = (k: string) => {
  try {
    store()?.removeItem(k)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- the transfer
interface InitBody {
  upload_id?: string
  part_size?: number
  parts?: number
  error?: string
}
interface StatusBody {
  size?: number
  part_size?: number
  parts?: number
  received?: number[]
  error?: string
}

function putPart(url: string, blob: Blob, onBytes: (loaded: number) => void, signal: AbortSignal | undefined, xhrFactory: () => XMLHttpRequest): Promise<{ ok: boolean; status: number; error?: string }> {
  return new Promise((resolve) => {
    const xhr = xhrFactory()
    xhr.open('PUT', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => onBytes(e.loaded)
    xhr.onload = () => {
      let error: string | undefined
      try {
        error = (JSON.parse(xhr.responseText) as { error?: string }).error
      } catch {
        /* not json */
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, error })
    }
    xhr.onerror = () => resolve({ ok: false, status: 0, error: 'network' })
    xhr.onabort = () => resolve({ ok: false, status: 0, error: 'aborted' })
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

export interface ChunkedOptions {
  tags?: string[]
  folder?: string
  onProgress: (pct: number) => void
  signal?: AbortSignal
  xhrFactory?: () => XMLHttpRequest
  partSize?: number
}

// Resolves like the one-request upload: { ok, body: { files: [row] } } or { ok: false, body: { error } }.
export async function uploadChunked(file: File, lane: string, opts: ChunkedOptions): Promise<ApiResult<UploadBody>> {
  const xhrFactory = opts.xhrFactory ?? (() => new XMLHttpRequest())
  const fail = (error: string, status = 0): ApiResult<UploadBody> => ({ ok: false, status, body: { error } })
  const key = resumeKey(lane, file)
  const t0 = Date.now()
  let uid = store()?.getItem(key) ?? ''
  let partSize = 0
  let parts = 0
  let have = new Set<number>()

  if (uid) {
    const st = await call<StatusBody>('/api/library/upload/' + encodeURIComponent(uid))
    if (st.ok && st.body.size === file.size && st.body.part_size && st.body.parts) {
      partSize = st.body.part_size
      parts = st.body.parts
      have = new Set(st.body.received ?? [])
    } else uid = ''
  }
  if (!uid) {
    const init = await call<InitBody>('/api/library/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lane, name: file.name, size: file.size, folder: opts.folder ?? '', tags: (opts.tags ?? []).join(','), part_size: opts.partSize ?? PART_SIZE }),
    })
    if (!init.ok || !init.body.upload_id || !init.body.part_size || !init.body.parts) return fail(init.body.error ?? 'init_failed', init.status)
    uid = init.body.upload_id
    partSize = init.body.part_size
    parts = init.body.parts
    remember(key, uid)
  }

  let done = 0
  for (let n = 1; n <= parts; n++) if (have.has(n)) done += Math.min(partSize, file.size - (n - 1) * partSize)
  opts.onProgress((done / file.size) * 100)

  for (let n = 1; n <= parts; n++) {
    if (have.has(n)) continue
    const start = (n - 1) * partSize
    const blob = file.slice(start, Math.min(file.size, start + partSize))
    let last: { ok: boolean; status: number; error?: string } = { ok: false, status: 0 }
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      if (opts.signal?.aborted) return fail('aborted')
      last = await putPart('/api/library/upload/' + encodeURIComponent(uid) + '/part/' + n, blob, (loaded) => opts.onProgress(((done + loaded) / file.size) * 100), opts.signal, xhrFactory)
      if (last.ok || (last.status >= 400 && last.status < 500)) break
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
    if (!last.ok) {
      if (last.status === 404) forget(key) // the console no longer holds this upload: start over next time
      return fail(last.error ?? 'part_failed', last.status)
    }
    done += blob.size
    opts.onProgress((done / file.size) * 100)
  }

  const fin = await call<UploadBody>('/api/library/upload/' + encodeURIComponent(uid) + '/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  if (fin.ok) {
    forget(key)
    rememberBps(file.size, Date.now() - t0)
  } else if (fin.body.error === 'parts_missing') forget(key)
  return fin
}
