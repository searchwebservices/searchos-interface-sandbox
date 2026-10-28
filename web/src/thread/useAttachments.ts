// The composer's attachments: files of any type picked, dropped or pasted, kept as chips until the message is sent. On
// send they upload first, one after another, into the lane's uploads root with the tag chat (the Library upload), and
// the message then posts with their ids. Limits: 5 GB per file; over 1 GB the person confirms with the size and an
// estimate; over 256 MB the upload is chunked and resumable (lib/chunked).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONFIRM_OVER, MAX_FILE, estimateSeconds, fmtDuration, isChunked, needsConfirm, tooBig, uploadChunked } from '@/lib/chunked'
import { REFUSAL_TEXT, fmtSize, makeItem, uploadFile } from '@/lib/library'
import type { UploadBody } from '@/lib/library'
import type { ApiResult } from '@/lib/api'
import type { Attachment } from '@/lib/types'

export type AttState = 'ready' | 'uploading' | 'done' | 'error'
export interface Att {
  key: string
  file: File
  state: AttState
  progress: number
  error?: string
  row?: Attachment
  previewUrl?: string
}
export type Uploader = (file: File, lane: string, onPct: (pct: number) => void) => Promise<ApiResult<UploadBody>>

// Chunked above 256 MB, the one-request multipart upload below it.
export const defaultUploader: Uploader = (file, lane, onPct) =>
  isChunked(file.size) ? uploadChunked(file, lane, { tags: ['chat'], onProgress: onPct }) : uploadFile(makeItem(file, lane, { folder: '', tags: ['chat'] }), file, onPct)

export interface PendingConfirm {
  files: File[]
  big: File[]
  bytes: number
  seconds: number
}

let seq = 0
const makeUrl = (f: File): string | undefined => {
  try {
    return f.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : undefined
  } catch {
    return undefined
  }
}
const revoke = (u?: string) => {
  try {
    if (u && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u)
  } catch {
    /* ignore */
  }
}
const errText = (r: ApiResult<UploadBody>): string => {
  const ref = r.body.refused?.[0]
  if (ref) return REFUSAL_TEXT[ref.reason] ?? 'Refused: ' + ref.reason
  const e = r.body.error
  if (e === 'not_a_member') return 'You are not a member of this lane'
  if (e === 'too_large') return 'Over the 5 GB limit'
  if (e === 'network' || r.status === 0) return 'No connection. Send again to resume.'
  return e ?? 'Upload failed'
}

export function useAttachments(lane: string, opts: { notify: (text: string) => void; uploader?: Uploader }) {
  const uploader = opts.uploader ?? defaultUploader
  const notify = opts.notify
  const [items, setItems] = useState<Att[]>([])
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef(items)
  ref.current = items
  const running = useRef(false)

  useEffect(
    () => () => {
      for (const a of ref.current) revoke(a.previewUrl)
    },
    [],
  )

  const commit = useCallback((files: File[]) => {
    setItems((cur) => cur.concat(files.map((file) => ({ key: 'a' + ++seq, file, state: 'ready' as const, progress: 0, previewUrl: makeUrl(file) }))))
  }, [])

  const add = useCallback(
    (list: File[] | FileList) => {
      const files = Array.from(list).filter((f) => {
        if (tooBig(f.size)) {
          notify(f.name + ' is over the ' + fmtSize(MAX_FILE) + ' limit')
          return false
        }
        return true
      })
      if (!files.length) return
      const big = files.filter((f) => needsConfirm(f.size))
      if (big.length) {
        const bytes = big.reduce((n, f) => n + f.size, 0)
        setConfirm({ files, big, bytes, seconds: estimateSeconds(bytes) })
      } else commit(files)
    },
    [commit, notify],
  )
  const resolveConfirm = useCallback(
    (ok: boolean) => {
      setConfirm((c) => {
        if (c && ok) commit(c.files)
        return null
      })
    },
    [commit],
  )

  const remove = useCallback((key: string) => {
    setItems((cur) => {
      const gone = cur.find((a) => a.key === key)
      if (gone) revoke(gone.previewUrl)
      return cur.filter((a) => a.key !== key)
    })
  }, [])
  // Save in the editor: the edited file takes the chip's place and is uploaded on send.
  const replace = useCallback((key: string, file: File) => {
    setItems((cur) =>
      cur.map((a) => {
        if (a.key !== key) return a
        revoke(a.previewUrl)
        return { ...a, file, state: 'ready', progress: 0, error: undefined, row: undefined, previewUrl: makeUrl(file) }
      }),
    )
  }, [])
  const clear = useCallback(() => {
    for (const a of ref.current) revoke(a.previewUrl)
    setItems([])
  }, [])

  const patch = (key: string, p: Partial<Att>) => setItems((cur) => cur.map((a) => (a.key === key ? { ...a, ...p } : a)))

  // Uploads what is not uploaded yet, in order. Resolves with every attachment, or null when one failed (its chip says why).
  const upload = useCallback(async (): Promise<Attachment[] | null> => {
    if (running.current) return null
    running.current = true
    setBusy(true)
    try {
      for (const a of ref.current) {
        if (a.state === 'done') continue
        patch(a.key, { state: 'uploading', progress: 0, error: undefined })
        const r = await uploader(a.file, lane, (pct) => patch(a.key, { progress: pct }))
        const row = r.body.files?.[0]
        if (!r.ok || !row) {
          patch(a.key, { state: 'error', error: errText(r) })
          return null
        }
        patch(a.key, { state: 'done', progress: 100, row: { id: row.id, name: row.name, kind: row.kind, size: row.size } })
        ref.current = ref.current.map((x) => (x.key === a.key ? { ...x, state: 'done', row: { id: row.id, name: row.name, kind: row.kind, size: row.size } } : x))
      }
      return ref.current.map((a) => a.row!).filter(Boolean)
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [lane, uploader])

  const batch = useMemo(() => {
    const total = items.reduce((n, a) => n + a.file.size, 0) || 1
    const done = items.reduce((n, a) => n + (a.state === 'done' ? a.file.size : a.state === 'uploading' ? (a.file.size * a.progress) / 100 : 0), 0)
    return { pct: Math.min(100, (done / total) * 100), count: items.length, index: items.filter((a) => a.state === 'done').length + (items.some((a) => a.state === 'uploading') ? 1 : 0) }
  }, [items])

  return { items, add, remove, replace, clear, upload, busy, batch, confirm, resolveConfirm }
}

export const confirmText = (c: PendingConfirm): string =>
  (c.big.length === 1 ? c.big[0].name + ' is ' : c.big.length + ' files are ') + fmtSize(c.bytes) + '. Over ' + fmtSize(CONFIRM_OVER) + ' an upload can take a while: about ' + fmtDuration(c.seconds) + ' at the speed seen so far.'
