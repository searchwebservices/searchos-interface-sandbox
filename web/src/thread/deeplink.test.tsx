// @vitest-environment happy-dom
// Message deep links (/v2/#/lanes/<lane>/m/<id>): Copy link, scrolling and flashing, the page around a message outside the
// loaded window, the redirect to the right lane, forwarded messages that link to their origin, and messages with files.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { parseRoute, hrefFor } from '@/app/router'
import { messageLink } from '@/lib/deeplink'
import { initialStore, reduce } from '@/lib/store'
import type { TextMessage } from '@/lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeES {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() {
    setTimeout(() => this.onopen?.(), 0)
  }
  close() {}
}
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
const LANES = [
  { id: 'hardware', kind: 'group', title: 'Hardware', members: ['marvin', 'bay'] },
  { id: 'lab', kind: 'group', title: 'Lab', members: ['marvin', 'bay'] },
]
const m = (id: string, lane: string, at: string, text: string, extra: Partial<TextMessage> = {}): TextMessage => ({ id, lane, at, role: 'person', text, signature: { person: 'bay', device_name: 'Mac' }, ...extra })
let loaded: TextMessage[] = []
let around: Record<string, { items: TextMessage[] } | null> = {}
let owner: Record<string, string> = {}
const calls: string[] = []
const scrolled: string[] = []

beforeEach(() => {
  calls.length = 0
  scrolled.length = 0
  window.location.hash = '#/lanes/hardware'
  vi.stubEnv('BASE_URL', '/v2/') // the production build base; vitest itself runs at /
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.getAttribute('data-id') ?? this.id) }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url)
      if (url === '/api/me') return json({ person: 'marvin', role: 'owner', device_id: 'd1', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, people: [{ id: 'marvin', name: 'Marvin' }, { id: 'bay', name: 'Bay' }] })
      if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/profiles') return json([])
      if (url === '/api/me/profile') return json({ profile: { person_id: 'marvin', name: 'Marvin', tag: 'marvin', avatar: null, editable: true }, prefs: { default: {}, device: {}, effective: {} }, device_id: 'd1' })
      if (url === '/api/lanes') return json(LANES.map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: [] })))
      let x = /^\/api\/lanes\/([a-z-]+)\/messages\?around=([^&]+)/.exec(url)
      if (x) {
        const hit = around[x[1] + ':' + x[2]]
        return hit ? json({ lane: x[1], around: x[2], items: hit.items, before: 0, after: 0, total: 99 }) : json({ error: 'no_such_message' }, 404)
      }
      x = /^\/api\/messages\/([^/]+)$/.exec(url)
      if (x) return owner[x[1]] ? json({ id: x[1], lane: owner[x[1]] }) : json({ error: 'no_such_message' }, 404)
      if (/\/api\/lanes\/hardware\/messages$/.test(url)) return json(loaded)
      if (url.endsWith('/messages')) return json([])
      return json({})
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
async function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, unmount: () => act(async () => root.unmount()) }
}
const row = (id: string) => document.getElementById('m-' + id) as HTMLElement | null

describe('the link and the route', () => {
  it('the link is origin + /v2/ + #/lanes/<lane>/m/<id>, and the route round-trips it', () => {
    const url = messageLink('hardware', 'a b/1')
    expect(url).toBe(location.origin + '/v2/#/lanes/hardware/m/a%20b%2F1')
    const route = parseRoute(url.slice(url.indexOf('#')))
    expect(route).toEqual({ name: 'lane', id: 'hardware', msg: 'a b/1' })
    expect(hrefFor(route)).toBe('#/lanes/hardware/m/a%20b%2F1')
  })
  it('Copy link in the message menu copies exactly that', async () => {
    loaded = [m('a1', 'hardware', '2026-10-27T10:00:00Z', 'rack is warm')]
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const { unmount } = await mount()
    await act(async () => { row('a1')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await settle()
    const item = [...document.querySelectorAll('[data-testid=message-menu] [role=menuitem]')].find((i) => i.textContent === 'Copy link')!
    await act(async () => { item.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await settle()
    expect(writeText).toHaveBeenCalledWith(location.origin + '/v2/#/lanes/hardware/m/a1')
    await unmount()
  })
})

describe('opening a link', () => {
  it('a message in the loaded thread is scrolled into view and flashed, with no extra request', async () => {
    loaded = [m('a1', 'hardware', '2026-10-27T10:00:00Z', 'one'), m('a2', 'hardware', '2026-10-27T10:01:00Z', 'two')]
    window.location.hash = '#/lanes/hardware/m/a2'
    const { unmount } = await mount()
    expect(scrolled).toContain('a2')
    expect(row('a2')!.classList.contains('ring-2')).toBe(true)
    expect(row('a1')!.classList.contains('ring-2')).toBe(false)
    expect(calls.some((c) => c.includes('around=') || c.startsWith('/api/messages/'))).toBe(false)
    await unmount()
  })
  it('a message outside the loaded window comes from ?around=<id>&limit=60, joins the thread, then scrolls and flashes', async () => {
    loaded = [m('a9', 'hardware', '2026-10-27T11:00:00Z', 'latest')]
    around['hardware:old1'] = { items: [m('old0', 'hardware', '2026-10-01T10:00:00Z', 'before'), m('old1', 'hardware', '2026-10-01T10:01:00Z', 'the one'), m('old2', 'hardware', '2026-10-01T10:02:00Z', 'after')] }
    window.location.hash = '#/lanes/hardware/m/old1'
    const { unmount } = await mount()
    expect(calls).toContain('/api/lanes/hardware/messages?around=old1&limit=60')
    expect(row('old1')).toBeTruthy()
    expect(row('old1')!.classList.contains('ring-2')).toBe(true)
    expect(scrolled).toContain('old1')
    // merged in time order, and the message that was already loaded is still there
    const ids = [...document.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id')).filter((x) => /^(old|a9)/.test(x ?? ''))
    expect(ids).toEqual(['old0', 'old1', 'old2', 'a9'])
    await unmount()
  })
  it('a wrong lane in the link: the console says which lane holds the message and the route moves there', async () => {
    loaded = [m('a3', 'hardware', '2026-10-27T10:00:00Z', 'in hardware')]
    owner['a3'] = 'hardware'
    window.location.hash = '#/lanes/lab/m/a3'
    const { unmount } = await mount()
    expect(calls).toContain('/api/lanes/lab/messages?around=a3&limit=60')
    expect(calls).toContain('/api/messages/a3')
    expect(window.location.hash).toBe('#/lanes/hardware/m/a3')
    expect(row('a3')).toBeTruthy()
    expect(row('a3')!.classList.contains('ring-2')).toBe(true)
    await unmount()
  })
  it('an unknown lane in the link is resolved the same way', async () => {
    loaded = [m('a4', 'hardware', '2026-10-27T10:00:00Z', 'found you')]
    owner['a4'] = 'hardware'
    window.location.hash = '#/lanes/nowhere/m/a4'
    const { unmount } = await mount()
    expect(calls).toContain('/api/messages/a4')
    expect(window.location.hash).toBe('#/lanes/hardware/m/a4')
    await unmount()
  })
  it('a message nobody can see says so and stays put', async () => {
    loaded = [m('a5', 'hardware', '2026-10-27T10:00:00Z', 'here')]
    window.location.hash = '#/lanes/hardware/m/ghost'
    const { unmount } = await mount()
    expect(window.location.hash).toBe('#/lanes/hardware/m/ghost')
    expect(document.body.textContent).toContain('That message is not available.')
    await unmount()
  })
  it('a forwarded message links to its origin through the same route', async () => {
    loaded = [m('f1', 'hardware', '2026-10-27T10:00:00Z', 'forwarded text', { forwarded_from: { lane: 'lab', message_id: 'orig-9', author: 'Bay', at: '2026-10-26T09:00:00Z' } })]
    const { el, unmount } = await mount()
    const link = el.querySelector('[data-testid=forwarded-eyebrow]') as HTMLAnchorElement
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('#/lanes/lab/m/orig-9')
    expect(link.textContent).toContain('Forwarded from Lab, Bay')
    await unmount()
  })
})

describe('messages that carry files', () => {
  it('render as tiles under the text with cached thumbnails, and open in the viewer', async () => {
    loaded = [m('p1', 'hardware', '2026-10-27T10:00:00Z', 'the photo and the capture', { attachments: [{ id: 'img-1', name: 'rack.png', kind: 'image/png', size: 5000 }, { id: 'cap-1', name: 'wan.pcapng', kind: 'application/vnd.tcpdump.pcap', size: 90000 }] })]
    const { el, unmount } = await mount()
    const tiles = [...el.querySelectorAll('[data-testid=msg-attachments] [data-testid=file-tile]')]
    expect(tiles.map((t) => t.querySelector('[data-testid=tile-name]')!.textContent)).toEqual(['rack.png', 'wan.pcapng'])
    expect(row('p1')!.textContent).toContain('the photo and the capture')
    // the text comes first, the tiles after it
    const bubble = row('p1')!.querySelector('[data-find]')!
    expect(bubble.textContent!.indexOf('the photo')).toBeLessThan(bubble.textContent!.indexOf('rack.png'))
    await act(async () => { tiles[1].querySelector('[data-testid=tile-main]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await settle()
    expect(document.querySelector('[data-testid=attachment-viewer]')).toBeTruthy()
    expect(calls).toContain('/api/library/cap-1/preview')
    await unmount()
  })
})

describe('the thread store', () => {
  it('thread_merge adds a fetched page in time order and never drops or duplicates', () => {
    let s = reduce(initialStore(), { type: 'thread', lane: 'hardware', items: [m('b', 'hardware', '2026-10-02T00:00:00Z', 'b'), m('d', 'hardware', '2026-10-04T00:00:00Z', 'd')] })
    s = reduce(s, { type: 'thread_merge', lane: 'hardware', items: [m('a', 'hardware', '2026-10-01T00:00:00Z', 'a'), m('b', 'hardware', '2026-10-02T00:00:00Z', 'b'), m('c', 'hardware', '2026-10-03T00:00:00Z', 'c')] })
    expect(s.threads.hardware.items.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(reduce(s, { type: 'thread_merge', lane: 'hardware', items: [m('a', 'hardware', '2026-10-01T00:00:00Z', 'a')] })).toBe(s)
  })
})
