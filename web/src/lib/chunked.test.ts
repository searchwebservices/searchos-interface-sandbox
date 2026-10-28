// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHUNK_OVER, CONFIRM_OVER, GB, MAX_FILE, MB, estimateSeconds, fmtDuration, isChunked, needsConfirm, resumeKey, tooBig, uploadChunked } from './chunked'

const sizedFile = (name: string, size: number) => {
  const f = new File(['x'], name, { lastModified: 111 })
  Object.defineProperty(f, 'size', { value: size })
  Object.defineProperty(f, 'slice', { value: (a: number, b: number) => new Blob([new Uint8Array(Math.max(0, Math.min(b, size) - a))]) })
  return f
}

describe('limits', () => {
  it('chunks above 256 MB, confirms above 1 GB, refuses above 5 GB', () => {
    expect([isChunked(CHUNK_OVER), isChunked(CHUNK_OVER + 1)]).toEqual([false, true])
    expect([needsConfirm(CONFIRM_OVER), needsConfirm(CONFIRM_OVER + 1)]).toEqual([false, true])
    expect([tooBig(MAX_FILE), tooBig(MAX_FILE + 1)]).toEqual([false, true])
    expect(MAX_FILE).toBe(5 * GB)
  })
  it('estimates from a speed and says it in plain words', () => {
    expect(estimateSeconds(1000 * MB, 10 * MB)).toBe(100)
    expect(fmtDuration(45)).toBe('45 seconds')
    expect(fmtDuration(600)).toBe('10 minutes')
    expect(fmtDuration(3 * 3600 + 10 * 60)).toBe('3 h 10 min')
  })
})

class FakeXhr {
  static log: { url: string; bytes: number }[] = []
  static failFirst = 0
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  status = 200
  responseText = '{}'
  withCredentials = false
  url = ''
  open(_m: string, url: string) {
    this.url = url
  }
  send(b: Blob) {
    queueMicrotask(() => {
      if (FakeXhr.failFirst > 0) {
        FakeXhr.failFirst--
        this.onerror?.()
        return
      }
      FakeXhr.log.push({ url: this.url, bytes: b.size })
      this.upload.onprogress?.({ loaded: b.size })
      this.onload?.()
    })
  }
}

let fetches: { url: string; body?: string }[] = []
let received: number[] = []
beforeEach(() => {
  FakeXhr.log = []
  FakeXhr.failFirst = 0
  fetches = []
  received = []
  sessionStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      fetches.push({ url, body: init?.body as string | undefined })
      const j = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))
      if (url === '/api/library/upload/init') return j({ upload_id: 'u-1', part_size: 100, parts: 3 }, 201)
      if (url === '/api/library/upload/u-1') return received.length ? j({ size: 250, part_size: 100, parts: 3, received }) : j({ error: 'no_such_upload' }, 404)
      if (url === '/api/library/upload/u-1/complete') return j({ files: [{ id: 'row-1', name: 'big.bin', kind: 'application/octet-stream', size: 250 }] }, 201)
      return j({}, 404)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('uploadChunked', () => {
  it('inits, sends every part, completes, and forgets the upload id', async () => {
    const pct: number[] = []
    const f = sizedFile('big.bin', 250)
    const r = await uploadChunked(f, 'hardware', { tags: ['chat'], onProgress: (p) => pct.push(p), xhrFactory: () => new FakeXhr() as unknown as XMLHttpRequest, partSize: 100 })
    expect(r.ok).toBe(true)
    expect(r.body.files?.[0].id).toBe('row-1')
    expect(JSON.parse(fetches[0].body!)).toMatchObject({ lane: 'hardware', name: 'big.bin', size: 250, tags: 'chat', part_size: 100 })
    expect(FakeXhr.log.map((l) => l.url)).toEqual(['/api/library/upload/u-1/part/1', '/api/library/upload/u-1/part/2', '/api/library/upload/u-1/part/3'])
    expect(pct[pct.length - 1]).toBe(100)
    expect(fetches[fetches.length - 1].url).toBe('/api/library/upload/u-1/complete')
    expect(sessionStorage.getItem(resumeKey('hardware', f))).toBeNull()
  })
  it('resumes after a reload: the id in sessionStorage, only the missing parts are sent', async () => {
    const f = sizedFile('big.bin', 250)
    sessionStorage.setItem(resumeKey('hardware', f), 'u-1')
    received = [1, 3]
    const r = await uploadChunked(f, 'hardware', { onProgress: () => {}, xhrFactory: () => new FakeXhr() as unknown as XMLHttpRequest })
    expect(r.ok).toBe(true)
    expect(fetches.some((x) => x.url === '/api/library/upload/init')).toBe(false)
    expect(FakeXhr.log.map((l) => l.url)).toEqual(['/api/library/upload/u-1/part/2'])
  })
  it('a part that fails on the network is retried, then the transfer carries on', async () => {
    FakeXhr.failFirst = 1
    const r = await uploadChunked(sizedFile('big.bin', 250), 'hardware', { onProgress: () => {}, xhrFactory: () => new FakeXhr() as unknown as XMLHttpRequest })
    expect(r.ok).toBe(true)
    expect(FakeXhr.log).toHaveLength(3)
  })
  it('a refused init is reported and nothing is sent', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"error":"too_large"}', { status: 413 }))))
    const r = await uploadChunked(sizedFile('big.bin', 250), 'hardware', { onProgress: () => {}, xhrFactory: () => new FakeXhr() as unknown as XMLHttpRequest })
    expect(r).toMatchObject({ ok: false, status: 413, body: { error: 'too_large' } })
    expect(FakeXhr.log).toHaveLength(0)
  })
})
