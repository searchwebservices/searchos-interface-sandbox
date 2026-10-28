// @vitest-environment happy-dom
// FileTile per kind: the type icon, or a real preview when the file has one; names never truncated; actions labelled.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FileTile, clearPreviewCache, fileKind, fromLaneFile, fromLibraryRow, headLines } from './FileTile'
import type { TileItem } from './FileTile'
import type { LibraryRow } from '@/lib/library'
import type { LaneFileRow } from '@/lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let visible: Array<() => void> = []
class FakeIO {
  cb: (e: { isIntersecting: boolean }[]) => void
  constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
    this.cb = cb
  }
  observe() {
    visible.push(() => this.cb([{ isIntersecting: true }]))
  }
  disconnect() {}
}
let fetched: string[] = []
const lane = (name: string, kind = '', extra: Partial<LaneFileRow> = {}): LaneFileRow => ({ name, path: 'docs/' + name, kind, size: 2048, mtime: '2026-10-26T08:00:00Z', lane: 'hardware', source: 'repo', scope: 'lane', ...extra })
const libRow = (over: Partial<LibraryRow>): LibraryRow => ({ id: 'f-' + (over.name ?? 'x'), lane: 'hardware', name: 'x.md', kind: 'text/markdown', size: 2048, uploaded_at: '2026-10-26T10:00:00Z', status: 'available', version: 1, tags: [], uses_count: 0, linked_skills: [], ...over })

beforeEach(() => {
  visible = []
  fetched = []
  clearPreviewCache()
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      fetched.push(url)
      // the thumbnail route answers {"text": first 240 characters}; nothing else is ever fetched by a tile
      if (/\/api\/library\/[^/]+\/thumb/.test(url)) return Promise.resolve(new Response(JSON.stringify({ text: 'Rack plan\nSwitch four\nPorts 1 to 24\nfourth line' }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ text: '# Title\n\nfirst line\nsecond line\nthird line\nfourth' }), { status: 200 }))
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function render(items: TileItem[], layout: 'grid' | 'list' = 'grid') {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ul>
          {items.map((i) => (
            <FileTile key={i.key} item={i} layout={layout} actions={[{ id: 'delete', label: 'Delete', destructive: true }]} onOpen={() => {}} onAction={() => {}} />
          ))}
        </ul>
      </TooltipProvider>,
    )
  })
  return el
}
const intoView = async () => {
  await act(async () => {
    visible.forEach((f) => f())
    await new Promise((r) => setTimeout(r, 10))
  })
}

describe('fileKind', () => {
  it('maps extensions and falls back to the sniffed type', () => {
    expect(['a.md', 'a.txt', 'a.csv', 'a.json', 'a.py', 'a.pdf', 'a.PNG', 'a.pcapng', 'a.zip', 'a.bin'].map((n) => fileKind(n))).toEqual(['md', 'txt', 'csv', 'json', 'code', 'pdf', 'image', 'pcap', 'archive', 'other'])
    expect(fileKind('noext', 'image/webp')).toBe('image')
    expect(fileKind('noext', 'application/pdf')).toBe('pdf')
    expect(fileKind('noext', 'application/octet-stream')).toBe('other')
  })
  it('headLines keeps three non-empty lines and drops heading marks', () => {
    expect(headLines('# Title\n\nfirst\nsecond\nthird\nfourth')).toBe('Title\nfirst\nsecond')
  })
})

describe('FileTile', () => {
  it('shows a type icon for each kind that has no preview', async () => {
    const files = ['a.md', 'a.txt', 'a.csv', 'a.json', 'a.py', 'a.pdf', 'a.pcap', 'a.zip', 'a.bin']
    const kinds = ['md', 'txt', 'csv', 'json', 'code', 'pdf', 'pcap', 'archive', 'other']
    // a thumb that is not there (the console answers 404) leaves the icon: the text kinds get none here, the pdf's image breaks
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"error":"no_thumb"}', { status: 404 }))))
    const el = await render(files.map((n) => fromLibraryRow(libRow({ name: n, kind: 'application/octet-stream', status: 'uploaded' }))))
    await intoView()
    for (const img of el.querySelectorAll('img')) await act(async () => { img.dispatchEvent(new Event('error')) })
    expect([...el.querySelectorAll('[data-testid=tile-icon]')].map((i) => i.getAttribute('data-kind'))).toEqual(kinds)
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('pre')).toBeNull()
  })
  it('an image renders the cached thumbnail, lazily, never the file', async () => {
    const el = await render([fromLibraryRow(libRow({ id: 'img1', name: 'rack.png', kind: 'image/png' }))])
    expect(el.querySelector('img')).toBeNull() // not until it scrolls into view
    await intoView()
    const img = el.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/api/library/img1/thumb')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.className).toContain('object-cover')
    expect(el.querySelector('[data-testid=tile-icon]')).toBeNull()
  })
  it('a repo image uses the lane file thumb route, versioned by its mtime', async () => {
    const el = await render([fromLaneFile(lane('map.jpg', 'jpg'))])
    await intoView()
    expect(el.querySelector('img')!.getAttribute('src')).toBe('/api/lanes/hardware/files/thumb?path=docs%2Fmap.jpg&v=2026-10-26T08%3A00%3A00Z')
  })
  it('a text file fetches its thumb JSON only when in view, shows three lines, and the cache serves a second tile', async () => {
    const f = lane('notes.md', 'md')
    const el = await render([fromLaneFile(f)])
    expect(fetched).toEqual([])
    await intoView()
    expect(el.querySelector('[data-testid=tile-text]')!.textContent).toBe('Title\nfirst line\nsecond line')
    expect(fetched).toHaveLength(1)
    expect(fetched[0]).toContain('/files/thumb?path=')
    const again = await render([fromLaneFile(f)])
    await intoView()
    expect(again.querySelector('[data-testid=tile-text]')!.textContent).toBe('Title\nfirst line\nsecond line')
    expect(fetched).toHaveLength(1)
  })
  it('a pdf shows its first page from the thumb route, and the icon when the console has none', async () => {
    const el = await render([fromLibraryRow(libRow({ id: 'p1', name: 'rack.pdf', kind: 'application/pdf', status: 'processed' })), fromLibraryRow(libRow({ id: 'p2', name: 'new.pdf', kind: 'application/pdf', status: 'uploaded' }))])
    await intoView()
    const imgs = [...el.querySelectorAll('img')]
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/api/library/p1/thumb', '/api/library/p2/thumb'])
    await act(async () => { imgs[1].dispatchEvent(new Event('error')) }) // no pdftoppm: the thumb is a 404
    expect(el.querySelectorAll('[data-testid=tile-icon]')).toHaveLength(1)
    // the words come from ?text=1, never from the image route
    expect(fetched).toEqual(['/api/library/p1/thumb?text=1', '/api/library/p2/thumb?text=1'])
  })
  it('a pdf tile renders the page as an img and keeps the text as a tooltip and one secondary line, never a text block', async () => {
    const el = await render([fromLibraryRow(libRow({ id: 'p9', name: 'plan.pdf', kind: 'application/pdf', status: 'processed' }))])
    await intoView()
    expect(el.querySelector('[data-testid=tile-image]')).not.toBeNull()
    expect(el.querySelector('[data-testid=tile-text]')).toBeNull()
    expect(el.querySelector('[data-testid=tile-preview]')!.getAttribute('title')).toContain('Rack plan')
    expect(el.querySelector('[data-testid=tile-snippet]')!.textContent).toBe('Rack plan')
  })
  it('a grid of 30 files makes at most 30 small requests and not one full download', async () => {
    const kinds: [string, string][] = [['.png', 'image/png'], ['.md', 'text/markdown'], ['.pdf', 'application/pdf'], ['.zip', 'application/zip'], ['.txt', 'text/plain']]
    const items = Array.from({ length: 30 }, (_, i) => {
      const [ext, mime] = kinds[i % kinds.length]
      return i % 2 ? fromLibraryRow(libRow({ id: 'g' + i, name: 'f' + i + ext, kind: mime })) : fromLaneFile(lane('f' + i + ext, ext.slice(1)))
    })
    const el = await render(items)
    await intoView()
    const requests = [...fetched, ...[...el.querySelectorAll('img')].map((i) => i.getAttribute('src')!)]
    expect(requests.length).toBeLessThanOrEqual(30)
    expect(requests.length).toBeGreaterThan(10)
    expect(requests.filter((u) => /\/download|\/files\?path=|\/preview|range/i.test(u))).toEqual([])
    expect(requests.every((u) => /\/thumb(\?|$)/.test(u))).toBe(true)
  })
  it('never truncates the name, keeps the full text in a title, and wraps to two lines', async () => {
    const name = 'switch-room-rack-elevation-final-v3-reviewed.pdf'
    const el = await render([fromLaneFile(lane(name, 'pdf'))])
    const n = el.querySelector('[data-testid=tile-name]')!
    expect(n.textContent).toBe(name)
    expect(n.getAttribute('title')).toBe(name)
    expect(n.className).toContain('line-clamp-2')
    expect(n.className).not.toContain('truncate')
  })
  it('size and age sit on one muted line; the state pill shows only when the file is not available', async () => {
    const el = await render([fromLibraryRow(libRow({ name: 'a.md', status: 'available' })), fromLibraryRow(libRow({ name: 'b.md', status: 'processed' })), fromLibraryRow(libRow({ name: 'c.pcap', kind: 'application/vnd.tcpdump.pcap', needs_parser: true, status: 'validated' })), fromLaneFile(lane('d.md', 'md', { scope: 'shared' }))])
    const pills = [...el.querySelectorAll('[data-testid=file-tile]')].map((t) => t.querySelector('[data-testid=tile-pill]')?.textContent ?? null)
    expect(pills).toEqual([null, 'processed', 'needs a parser', null])
    const meta = el.querySelector('[data-testid=tile-meta]')!
    expect(meta.textContent).toMatch(/^2\.0 KB · /)
    expect(meta.className).toContain('whitespace-nowrap')
    expect(meta.className).toContain('text-muted-foreground')
  })
  it('every action carries the file name and the main control is a labelled button', async () => {
    const el = await render([fromLaneFile(lane('ports.md', 'md'))], 'list')
    const labels = [...el.querySelectorAll('button, a')].map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Open ports.md', 'Open ports.md', 'Download ports.md', 'Actions for ports.md'])
    expect(el.querySelector('[data-testid=file-tile]')!.getAttribute('data-kind')).toBe('md')
  })
})
