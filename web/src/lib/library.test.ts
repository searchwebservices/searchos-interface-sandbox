import { describe, expect, it } from 'vitest'
import { collectFromPaste, collectFromTransfer, fmtSize, hrefForUse, makeItem, parseTagInput, queueBusy, queueReducer, uploadFile } from './library'
import type { QueueItem } from './library'

const item = (name: string): QueueItem => makeItem({ name, size: 100 }, 'hardware', { tags: ['a'] })

describe('upload queue reducer', () => {
  it('walks queued, uploading, processing and done, with progress that never goes backwards', () => {
    const q = item('a.md')
    let s = queueReducer([], { type: 'add', items: [q] })
    expect(s[0].state).toBe('queued')
    s = queueReducer(s, { type: 'start', key: q.key })
    s = queueReducer(s, { type: 'progress', key: q.key, pct: 40 })
    s = queueReducer(s, { type: 'progress', key: q.key, pct: 20 })
    expect(s[0]).toMatchObject({ state: 'uploading', progress: 40 })
    s = queueReducer(s, { type: 'uploaded', key: q.key, fileId: 'f1', status: 'uploaded' })
    expect(s[0]).toMatchObject({ state: 'processing', progress: 100, fileId: 'f1' })
    expect(queueBusy(s)).toBe(true)
    s = queueReducer(s, { type: 'pipeline', rows: [{ id: 'f1', status: 'validated' }] })
    expect(s[0].state).toBe('done')
    s = queueReducer(s, { type: 'pipeline', rows: [{ id: 'f1', status: 'processed' }] })
    expect(s[0]).toMatchObject({ state: 'done', status: 'processed' })
    expect(queueBusy(s)).toBe(false)
  })
  it('a pipeline failure shows its reason, retry only applies to failed, refused is final', () => {
    const a = item('a.md')
    const b = item('.env')
    let s = queueReducer([], { type: 'add', items: [a, b] })
    s = queueReducer(s, { type: 'uploaded', key: a.key, fileId: 'f1', status: 'uploaded' })
    s = queueReducer(s, { type: 'pipeline', rows: [{ id: 'f1', status: 'failed', fail_reason: 'archive_corrupt' }] })
    expect(s[0]).toMatchObject({ state: 'failed', error: 'archive_corrupt' })
    s = queueReducer(s, { type: 'retry', key: a.key })
    expect(s[0]).toMatchObject({ state: 'queued', progress: 0 })
    s = queueReducer(s, { type: 'refused', key: b.key, error: 'credential' })
    s = queueReducer(s, { type: 'retry', key: b.key })
    expect(s[1].state).toBe('refused')
    s = queueReducer(s, { type: 'failed', key: a.key, error: 'network' })
    expect(s[0].state).toBe('failed')
    expect(queueReducer(s, { type: 'clear' })).toHaveLength(0)
    expect(queueReducer(s, { type: 'remove', key: a.key })).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('parses tags, sizes and message links', () => {
    expect(parseTagInput('Rack, q4,\nrack,  ')).toEqual(['rack', 'q4'])
    expect(fmtSize(512)).toBe('512 B')
    expect(fmtSize(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(fmtSize(2 * 1024 ** 3)).toBe('2.00 GB')
    expect(hrefForUse({ use_kind: 'conversation', ref: 'hardware/abc-1' })).toBe('#/lanes/hardware/m/abc-1')
    expect(hrefForUse({ use_kind: 'recall', ref: 'chunks:3' })).toBeNull()
    expect(hrefForUse({ use_kind: 'run', ref: 'no slash' })).toBeNull()
  })
  it('collects dropped files, falling back to dt.files, and pasted text becomes a txt file', async () => {
    const f = new File(['x'], 'a.log')
    const got = await collectFromTransfer({ files: [f] as unknown as FileList, items: [] as unknown as DataTransferItemList })
    expect(got).toEqual([{ file: f, folder: '' }])
    const dir = {
      kind: 'file',
      webkitGetAsEntry: () => ({
        isFile: false,
        isDirectory: true,
        name: 'logs',
        createReader: () => {
          let done = false
          return {
            readEntries: (ok: (e: unknown[]) => void) => {
              ok(done ? [] : [{ isFile: true, isDirectory: false, name: 'n.log', file: (cb: (f: File) => void) => cb(new File(['y'], 'n.log')) }])
              done = true
            },
          }
        },
      }),
    }
    const folder = await collectFromTransfer({ files: [] as unknown as FileList, items: [dir] as unknown as DataTransferItemList })
    expect(folder.map((p) => [p.file.name, p.folder])).toEqual([['n.log', 'logs']])
    const pasted = collectFromPaste({ files: [] as unknown as FileList, getData: () => 'some notes' }, new Date('2026-10-26T10:00:00Z'))
    expect(pasted[0].file.name).toBe('pasted-2026-10-26T10-00-00.txt')
    expect(collectFromPaste({ files: [] as unknown as FileList, getData: () => '  ' })).toEqual([])
  })
})

describe('uploadFile', () => {
  it('posts multipart to the lane route with tags and folder before the file, reports XHR progress', async () => {
    const sent: { url?: string; fd?: FormData } = {}
    const x = {
      upload: {} as { onprogress?: (e: unknown) => void },
      open(_m: string, u: string) { sent.url = u },
      send(fd: FormData) {
        sent.fd = fd
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
        this.status = 201
        this.responseText = JSON.stringify({ files: [{ id: 'f1', status: 'uploaded' }] })
        this.onload?.()
      },
      status: 0,
      responseText: '',
      withCredentials: false,
      onload: undefined as undefined | (() => void),
    }
    const pct: number[] = []
    const q = makeItem({ name: 'a.md', size: 1 }, 'hardware', { tags: ['rack', 'q4'], folder: 'logs' })
    const r = await uploadFile(q, new File(['hi'], 'a.md'), (p) => pct.push(p), () => x as unknown as XMLHttpRequest)
    expect(sent.url).toBe('/api/lanes/hardware/files')
    expect([...sent.fd!.keys()]).toEqual(['tags', 'folder', 'file'])
    expect(sent.fd!.get('tags')).toBe('rack,q4')
    expect(pct).toEqual([50])
    expect(r).toMatchObject({ ok: true, status: 201 })
    const v = makeItem({ name: 'a.md', size: 1 }, 'hardware', { versionOf: 'abc' })
    await uploadFile(v, new File(['hi'], 'a.md'), () => {}, () => x as unknown as XMLHttpRequest)
    expect(sent.url).toBe('/api/library/abc/version')
  })
})
