// @vitest-environment happy-dom
// The Library page against a mocked console API: table fixtures, sort and search, the panels, the drop zone and the queue.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import App from '../App'
import type { LibraryRow } from '@/lib/library'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeES {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() { setTimeout(() => this.onopen?.(), 0) }
  close() {}
}
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
const lanes = (lanesJson as { id: string; members: string[] }[]).map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: [] }))
const members = (lanesJson as { id: string; members: string[] }[]).find((l) => l.id === 'hardware')!.members

const row = (over: Partial<LibraryRow>): LibraryRow => ({
  id: 'f-' + (over.name ?? 'x'), lane: 'hardware', name: 'x.md', kind: 'text/markdown', size: 2048, uploader: members[0], uploaded_at: '2026-10-26T10:00:00Z', status: 'processed', version: 1, tags: [], uses_count: 0, linked_skills: [], ...over,
})
let rows: LibraryRow[] = []
const calls: { url: string; init?: RequestInit }[] = []
let xhrs: FakeXHR[] = []
class FakeXHR {
  upload: { onprogress?: (e: unknown) => void } = {}
  status = 0
  responseText = ''
  withCredentials = false
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  url = ''
  body?: FormData
  open(_m: string, u: string) { this.url = u; xhrs.push(this) }
  send(b: FormData) { this.body = b }
}

beforeEach(() => {
  calls.length = 0
  xhrs = []
  try { localStorage.setItem('sov.files.view', '"list"') } catch { /* ignore */ } // the table is the list view
  rows = [
    row({ name: 'rack-notes.md', tags: ['rack'], uses_count: 2, status: 'available', size: 4096 }),
    row({ name: 'switch.pcap', kind: 'application/vnd.tcpdump.pcap', status: 'validated', needs_parser: true, note: 'needs a parser (tshark is not installed)', size: 9 * 1024 * 1024 }),
    row({ name: 'old.zip', kind: 'application/zip', status: 'failed', fail_reason: 'archive_corrupt', lane: 'lab', tags: ['backup'] }),
  ]
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXHR
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === '/api/me') return json({ person: members[0], role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, people: members.map((id) => ({ id, name: id })) })
      if (url === '/api/health') return json({ opencode: 'up', down_for_s: 0, sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return json(lanes)
      if (url.startsWith('/api/library/status')) return json({ counts: { uploaded: 0, validated: 1, processed: 0, indexed: 0, available: 1, failed: 1 }, events: [{ at: '2026-10-26T10:00:00Z', type: 'library_indexed', lane: 'hardware', name: 'rack-notes.md', chunks: 4 }], indexing: [] })
      if (url.startsWith('/api/library/uses')) return json([{ id: 'u1', file_id: 'f1', use_kind: 'conversation', ref: 'hardware/msg-9', at: '2026-10-26T10:00:00Z', name: 'rack-notes.md', lane: 'hardware' }])
      if (/^\/api\/library\/f-[^/]+\/preview$/.test(url)) return json({ id: 'f-rack-notes.md', name: 'rack-notes.md', kind: 'text/markdown', status: 'available', size: 4096, text: 'Switch four flaps', truncated: false, has_text: true, previewable: false, needs_parser: false, note: null, fail_reason: null })
      if (url.startsWith('/api/library')) {
        const lane = new URL(url, 'http://x').searchParams.get('lane')
        return json(rows.filter((r) => !lane || r.lane === lane))
      }
      return json([])
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
const mount = async (hash: string) => {
  window.location.hash = hash
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, root }
}
const names = (el: Element) => [...el.querySelectorAll('[data-testid=library-row]')].map((r) => r.getAttribute('data-name'))

describe('library grid', () => {
  it('opens as a grid of tiles by default, with a toggle that remembers the list and brings the table back', async () => {
    localStorage.removeItem('sov.files.view')
    const { el, root } = await mount('#/library/hardware')
    expect(el.querySelector('[data-testid=library-table]')).toBeNull()
    const list = el.querySelector('[data-testid=file-list]')!
    expect(list.getAttribute('data-view')).toBe('grid')
    expect([...el.querySelectorAll('[data-testid=tile-name]')].map((n) => n.textContent).sort()).toEqual(['rack-notes.md', 'switch.pcap'])
    expect(el.querySelector('[data-testid=view-grid]')!.getAttribute('aria-pressed')).toBe('true')
    await act(async () => (el.querySelector('[data-testid=view-list]') as HTMLElement).click())
    expect(el.querySelector('[data-testid=library-table]')).toBeTruthy()
    expect(localStorage.getItem('sov.files.view')).toBe('"list"')
    await act(async () => root.unmount())
  })
  it('all lanes opens on one folder per lane, and a lane folder opens to its files', async () => {
    localStorage.removeItem('sov.files.view')
    const { el, root } = await mount('#/library')
    const tiles = () => [...el.querySelectorAll('[data-testid=folder-tile]')]
    expect(tiles().map((t) => t.getAttribute('aria-label')).sort()).toEqual(['Open folder hardware', 'Open folder lab'])
    expect(el.querySelector('[data-testid=file-tile]')).toBeNull()
    const lab = tiles().find((t) => t.getAttribute('aria-label') === 'Open folder lab')!
    await act(async () => { lab.dispatchEvent(new MouseEvent('click', { bubbles: true })); lab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    await settle()
    expect([...el.querySelectorAll('[data-testid=tile-name]')].map((n) => n.textContent)).toEqual(['old.zip'])
    expect([...el.querySelectorAll('[data-testid=library-breadcrumb] li')].map((n) => n.textContent)).toEqual(['Library', 'Lab'])
    await act(async () => root.unmount())
  })
  it('the tile search filters by name and a tile menu offers the owner actions', async () => {
    localStorage.removeItem('sov.files.view')
    const { el, root } = await mount('#/library/hardware')
    const search = el.querySelector('[data-testid=file-search]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { set.call(search, 'pcap'); search.dispatchEvent(new Event('input', { bubbles: true })) })
    expect([...el.querySelectorAll('[data-testid=tile-name]')].map((n) => n.textContent)).toEqual(['switch.pcap'])
    await act(async () => { set.call(search, 'rack'); search.dispatchEvent(new Event('input', { bubbles: true })) })
    const menu = el.querySelector('[data-testid=tile-menu]') as HTMLButtonElement
    expect(menu.getAttribute('aria-label')).toBe('Actions for rack-notes.md')
    await act(async () => { menu.click() })
    await settle()
    expect([...document.querySelectorAll('[role=menuitem]')].map((i) => i.textContent)).toEqual(['Open', 'Download', 'Rename', 'Cut', 'Move to...', 'Label', 'Assign', 'Notes', 'Index again', 'New version', 'Delete'])
    await act(async () => root.unmount())
  })
})

describe('library page', () => {
  it('renders the table fixtures with status, tags, used-by and version, and the three panels', async () => {
    const { el, root } = await mount('#/library')
    expect(el.querySelector('[data-testid=library-page]')).toBeTruthy()
    expect(names(el).sort()).toEqual(['old.zip', 'rack-notes.md', 'switch.pcap'])
    const text = (n: string) => el.querySelector(`[data-name="${n}"]`)!.textContent!
    expect(text('rack-notes.md')).toContain('available')
    expect(text('rack-notes.md')).toContain('rack')
    expect(text('rack-notes.md')).toContain('v1')
    expect(text('switch.pcap')).toContain('needs a parser')
    expect(text('old.zip')).toContain('failed')
    expect(el.querySelector('[data-name="rack-notes.md"] [data-testid=used-by]')?.textContent).toBe('2')
    expect(el.querySelector('[data-testid=count-available]')?.textContent).toBe('1')
    expect(el.querySelector('[data-testid=pipeline-events]')?.textContent).toContain('rack-notes.md: indexed, 4 chunks')
    expect(el.querySelector('[data-testid=conversation-use] a')?.getAttribute('href')).toBe('#/lanes/hardware/m/msg-9')
    expect(el.querySelector('[data-testid=panel-skills]')?.textContent).toContain('No skill links a file yet')
    await act(async () => root.unmount())
  })

  it('scopes to a lane from the route, searches, and sorts by name', async () => {
    const lab = await mount('#/library/lab')
    expect(names(lab.el)).toEqual(['old.zip'])
    expect(calls.some((c) => c.url === '/api/library?lane=lab')).toBe(true)
    await act(async () => lab.root.unmount())
    const { el, root } = await mount('#/library')
    const search = el.querySelector('input[aria-label="Search files"]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { set.call(search, 'pcap'); search.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(names(el)).toEqual(['switch.pcap'])
    await act(async () => { set.call(search, ''); search.dispatchEvent(new Event('input', { bubbles: true })) })
    const nameSort = [...el.querySelectorAll('th button')].find((b) => b.textContent === 'Name') as HTMLButtonElement
    await act(async () => nameSort.click())
    expect(names(el)).toEqual(['old.zip', 'rack-notes.md', 'switch.pcap'])
    await act(async () => nameSort.click())
    expect(names(el)).toEqual(['switch.pcap', 'rack-notes.md', 'old.zip'])
    await act(async () => root.unmount())
  })

  it('the drop zone accepts dropped files into the queue and the XHR carries tags and progress; retry works', async () => {
    const { el, root } = await mount('#/library/hardware')
    const tags = el.querySelector('[data-testid=batch-tags]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { set.call(tags, 'Rack, q4'); tags.dispatchEvent(new Event('input', { bubbles: true })) })
    const zone = el.querySelector('[data-testid=drop-zone]')!
    const file = new File(['# hello'], 'hello.md', { type: 'text/markdown' })
    const drop = Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [file], items: [] } })
    await act(async () => { zone.dispatchEvent(drop) })
    await settle()
    expect(xhrs).toHaveLength(0) // the optional details form comes first
    await act(async () => (el.querySelector('[data-testid=batch-skip]') as HTMLElement).click())
    await settle()
    expect(el.querySelectorAll('[data-testid=queue-row]')).toHaveLength(1)
    expect(xhrs).toHaveLength(1)
    expect(xhrs[0].url).toBe('/api/lanes/hardware/files')
    expect(xhrs[0].body!.get('tags')).toBe('rack,q4')
    expect((xhrs[0].body!.get('file') as File).name).toBe('hello.md')
    await act(async () => { xhrs[0].upload.onprogress?.({ lengthComputable: true, loaded: 30, total: 100 }) })
    expect(el.querySelector('[data-testid=queue-state]')?.textContent).toBe('30%')
    // the server breaks off: failed, then Retry sends it again
    await act(async () => { xhrs[0].status = 500; xhrs[0].responseText = '{"error":"upload_failed"}'; xhrs[0].onload?.() })
    await settle()
    expect(el.querySelector('[data-testid=queue-row]')?.getAttribute('data-state')).toBe('failed')
    const retry = [...el.querySelectorAll('[data-testid=queue-row] button')].find((b) => b.textContent === 'Retry') as HTMLButtonElement
    await act(async () => retry.click())
    await settle()
    expect(xhrs).toHaveLength(2)
    await act(async () => { xhrs[1].status = 201; xhrs[1].responseText = JSON.stringify({ files: [row({ id: 'f-hello.md', name: 'hello.md', status: 'uploaded' })], refused: [] }); xhrs[1].onload?.() })
    await settle()
    expect(el.querySelector('[data-testid=queue-row]')?.getAttribute('data-state')).toMatch(/processing|done/)
    await act(async () => root.unmount())
  })

  it('the upload form assigns a person, a label, tags and notes to the whole batch, and every file carries them', async () => {
    const { el, root } = await mount('#/library/hardware')
    const zone = el.querySelector('[data-testid=drop-zone]')!
    const files = [new File(['a'], 'a.md'), new File(['b'], 'b.md')]
    await act(async () => { zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files, items: [] } })) })
    await settle()
    const form = el.querySelector('[data-testid=batch-form]')!
    expect(form.textContent).toContain('2 files')
    const setIn = (id: string, v: string, proto: 'input' | 'textarea' = 'input') => {
      const e = form.querySelector(`[data-testid=${id}]`) as HTMLInputElement
      const set = Object.getOwnPropertyDescriptor(proto === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')!.set!
      return act(async () => { set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) })
    }
    const sel = form.querySelector('[data-testid=batch-assign]') as HTMLSelectElement
    expect([...sel.options].map((o) => o.value)[0]).toBe('')
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, sel.options[1].value); sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await setIn('batch-label', 'Quote pack')
    await setIn('batch-tags', 'Garage, q4')
    await setIn('batch-notes', 'for the walkthrough', 'textarea')
    await act(async () => (form.querySelector('[data-testid=batch-submit]') as HTMLElement).click())
    await settle()
    expect(el.querySelector('[data-testid=batch-form]')).toBeNull()
    expect(xhrs).toHaveLength(2)
    for (const x of xhrs) {
      expect(x.body!.get('label')).toBe('Quote pack')
      expect(x.body!.get('tags')).toBe('garage,q4')
      expect(x.body!.get('notes')).toBe('for the walkthrough')
      expect(x.body!.get('assigned_to')).toBe(sel.options[1].value)
    }
    await act(async () => root.unmount())
  })
  it('the upload form can be cancelled and nothing uploads', async () => {
    const { el, root } = await mount('#/library/hardware')
    const zone = el.querySelector('[data-testid=drop-zone]')!
    await act(async () => { zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [new File(['a'], 'a.md')], items: [] } })) })
    await settle()
    await act(async () => (el.querySelector('[data-testid=batch-cancel]') as HTMLElement).click())
    expect(el.querySelector('[data-testid=batch-form]')).toBeNull()
    expect(xhrs).toHaveLength(0)
    await act(async () => root.unmount())
  })
  it('a refused name shows the reason in the queue', async () => {
    const { el, root } = await mount('#/library/hardware')
    const zone = el.querySelector('[data-testid=drop-zone]')!
    const drop = Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [new File(['K=1'], '.env')], items: [] } })
    await act(async () => { zone.dispatchEvent(drop) })
    await settle()
    await act(async () => (el.querySelector('[data-testid=batch-skip]') as HTMLElement).click())
    await settle()
    await act(async () => { xhrs[0].status = 422; xhrs[0].responseText = '{"error":"all_refused","refused":[{"name":".env","reason":"credential_name"}]}'; xhrs[0].onload?.() })
    await settle()
    expect(el.querySelector('[data-testid=queue-row]')?.textContent).toContain('the name looks like a credential file')
    await act(async () => root.unmount())
  })

  it('the row menu offers the owner actions and Preview reads the processed text', async () => {
    const { el, root } = await mount('#/library')
    const menu = el.querySelector('[data-name="rack-notes.md"] [data-testid=row-menu]') as HTMLButtonElement
    await act(async () => { menu.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })); menu.click() })
    await settle()
    const items = [...document.querySelectorAll('[role=menuitem]')].map((i) => i.textContent)
    expect(items).toEqual(['Preview', 'Download', 'Index again', 'New version', 'Retention', 'Delete'])
    const pv = document.querySelector('[data-testid=action-preview]') as HTMLElement
    await act(async () => { pv.click() })
    await settle()
    expect(document.querySelector('[data-testid=library-viewer] [data-testid=file-content-text]')?.textContent).toBe('Switch four flaps')
    await act(async () => (document.querySelector('[data-testid=viewer-close]') as HTMLElement).click())
    expect(document.querySelector('[data-testid=library-viewer]')).toBeNull()
    await act(async () => root.unmount())
  })
})
