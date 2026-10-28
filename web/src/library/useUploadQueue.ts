// The upload loop shared by the Library page and the Lane files surface: a queue reducer, up to two XHRs at once
// (one per file, so every row has its own progress) and the refusal and error text the queue shows.
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { REFUSAL_TEXT, makeItem, queueReducer, uploadFile } from '@/lib/library'
import type { BatchMeta, Picked } from '@/lib/library'

const MAX_PARALLEL = 2

export function useUploadQueue(onSettled: () => void) {
  const [queue, dispatch] = useReducer(queueReducer, [])
  const files = useRef(new Map<string, File>())
  const started = useRef(new Set<string>())
  const settled = useRef(onSettled)
  useEffect(() => {
    settled.current = onSettled
  })

  useEffect(() => {
    const active = queue.filter((q) => q.state === 'uploading').length
    let slots = MAX_PARALLEL - active
    for (const q of queue) {
      if (slots <= 0) break
      const tag = q.key + ':' + q.progress + ':' + q.error
      if (q.state !== 'queued' || started.current.has(tag)) continue
      const file = files.current.get(q.key)
      if (!file) continue
      slots--
      started.current.add(tag)
      dispatch({ type: 'start', key: q.key })
      void uploadFile(q, file, (pct) => dispatch({ type: 'progress', key: q.key, pct })).then((r) => {
        const row = r.body.files?.[0]
        if (r.ok && row) dispatch({ type: 'uploaded', key: q.key, fileId: row.id, status: row.status })
        else if (r.body.refused?.length) dispatch({ type: 'refused', key: q.key, error: REFUSAL_TEXT[r.body.refused[0].reason] ?? 'Refused: ' + r.body.refused[0].reason })
        else dispatch({ type: 'failed', key: q.key, error: r.body.error === 'not_a_member' ? 'You are not a member of this lane' : (r.body.error ?? 'Upload failed') })
        started.current.delete(tag)
        settled.current()
      })
    }
  }, [queue])

  const enqueue = useCallback((picked: Picked[], laneId: string, opts: { tags?: string[]; versionOf?: string; meta?: BatchMeta } = {}) => {
    const items = picked.map((p) => {
      const it = makeItem(p.file, laneId, { folder: p.folder, tags: opts.tags ?? opts.meta?.tags ?? [], ...(opts.meta ? { meta: opts.meta } : {}), ...(opts.versionOf ? { versionOf: opts.versionOf } : {}) })
      files.current.set(it.key, p.file)
      return it
    })
    dispatch({ type: 'add', items })
  }, [])
  const retry = useCallback((key: string) => {
    started.current.clear()
    dispatch({ type: 'retry', key })
  }, [])
  return { queue, dispatch, enqueue, retry }
}
