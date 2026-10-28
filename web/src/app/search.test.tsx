// @vitest-environment happy-dom
// Universal search: grouping, keyboard navigation, debounce, "More", recent searches. The console is mocked.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import App from '../App'
import { matchLan, matchPages, matchSurfaces, pushRecent, readRecent, RECENT_MAX } from '@/lib/search'

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
const hwMembers = (lanesJson as { id: string; members: string[] }[]).find((l) => l.id === 'hardware')!.members
const urls: string[] = []
let manyMessages = false
const hit = (i: number) => ({ id: 'm' + i, lane: 'lab', lane_title: 'Lab', role: 'person', who: 'Marvin', at: '2026-10-26T10:00:00Z', snippet: '...racked the ladder switch ' + i, link: '#/lanes/lab/m/m' + i })

beforeEach(() => {
  urls.length = 0
  manyMessages = false
  try { localStorage.clear() } catch { /* ignore */ }
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  Element.prototype.scrollIntoView = () => {}
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url)
      if (url === '/api/me') return json({ person: hwMembers[0], role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null })
      if (url === '/api/health') return json({ opencode: 'up', down_for_s: 0, sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return json(lanes)
      if (url === '/api/lan/summary') return json({ devices: [{ mac: 'aa:bb:cc:dd:ee:01', label: 'Garage ladder cam', vendor: 'Acme', status: 'approved', last_ip: '10.0.0.30', online: true }] })
      if (url.startsWith('/api/search')) {
        return json({
          q: 'x',
          types: ['messages', 'files', 'devices'],
          results: {
            messages: { items: Array.from({ length: manyMessages ? 7 : 1 }, (_, i) => hit(i + 1)), total: manyMessages ? 7 : 1 },
            files: { items: [{ source: 'library', id: 'f1', lane: 'lab', name: 'ladder-plan.pdf', folder: 'plans', at: null }], total: 1 },
            devices: { items: [{ id: 'dev1', name: 'Marvin Laptop', person: 'marvin', ip: '10.0.0.5', mac: null, last_seen: null }], total: 1 },
          },
        })
      }
      if (url.startsWith('/api/library/status')) return json({ counts: {}, events: [], indexing: [] })
      if (url.startsWith('/api/library')) return json([])
      if (url.endsWith('/messages')) return json([])
      return json({})
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const wait = async (ms: number) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
const settle = async () => { for (let i = 0; i < 6; i++) await wait(10) }
async function mount(hash = '#/lanes/standards') {
  window.location.hash = hash
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, root }
}
const openSearch = async () => {
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })) })
  await settle()
}
const type = async (text: string) => {
  const input = document.querySelector('[cmdk-input]') as HTMLInputElement
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const key = async (k: string) => {
  const input = document.querySelector('[cmdk-input]') as HTMLInputElement
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
}
const group = (g: string) => document.querySelector('[data-testid=search-group-' + g + ']')

describe('universal search', () => {
  it('the sidebar no longer has the search row; the header has the button; Find stays', async () => {
    const { el, root } = await mount()
    expect(el.textContent).not.toContain('Cmd K Search')
    expect(el.querySelector('[data-testid=search-button]')).toBeTruthy()
    expect(el.querySelector('[data-testid=find-button]')).toBeTruthy()
    expect(el.querySelector('[data-sidebar=header] [data-sidebar=menu-button]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('Cmd K opens it; typing debounces into one server call and groups the answer', async () => {
    const { root } = await mount()
    await openSearch()
    expect(document.querySelector('[data-testid=search-modal]')).toBeTruthy()
    await type('la')
    await type('lad')
    await type('ladder')
    await wait(60)
    expect(urls.filter((u) => u.startsWith('/api/search'))).toHaveLength(0)
    await wait(300)
    const calls = urls.filter((u) => u.startsWith('/api/search'))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('q=ladder')
    expect(calls[0]).toContain('types=messages%2Cfiles%2Cdevices')
    expect(group('messages')?.textContent).toContain('racked the ladder switch 1')
    expect(group('files')?.textContent).toContain('ladder-plan.pdf')
    // console devices from the server and LAN devices from the browser share the Devices group
    expect(group('devices')?.textContent).toContain('Marvin Laptop')
    expect(group('devices')?.textContent).toContain('Garage ladder cam')
    expect(group('lanes')).toBeNull()
    await act(async () => root.unmount())
  })

  it('arrow keys and Enter open the message deep link, and the search is remembered', async () => {
    const { root } = await mount('#/lanes/standards')
    await openSearch()
    await type('ladder')
    await wait(350)
    await key('Enter')
    await settle()
    expect(window.location.hash).toBe('#/lanes/lab/m/m1')
    expect(readRecent()).toEqual(['ladder'])
    await openSearch()
    expect(document.querySelector('[data-testid=search-recent]')?.textContent).toContain('ladder')
    await act(async () => root.unmount())
  })

  it('ArrowDown moves to the next group; local groups answer at once (lanes, surfaces, pages)', async () => {
    const { root } = await mount()
    await openSearch()
    await type('hardware')
    await settle()
    expect(group('lanes')?.textContent).toContain('Hardware')
    await type('files')
    await settle()
    expect(group('surfaces')?.textContent).toContain('Lane files')
    expect(group('pages')?.textContent).toContain('Library')
    const rows = [...document.querySelectorAll('[data-testid=search-row]')]
    const first = rows[0].getAttribute('data-selected')
    await key('ArrowDown')
    await settle()
    expect(document.querySelectorAll('[data-testid=search-row][data-selected=true]')).toHaveLength(1)
    expect(first).toBe('true')
    expect(rows[0].getAttribute('data-selected')).toBe('false')
    await key('Enter')
    await settle()
    expect(window.location.hash).toBe('#/library')
    await act(async () => root.unmount())
  })

  it('caps a group at five rows with a More row that shows the rest', async () => {
    manyMessages = true
    const { root } = await mount()
    await openSearch()
    await type('ladder')
    await wait(350)
    const g = () => group('messages')!
    expect(g().querySelectorAll('[data-testid=search-row]')).toHaveLength(5)
    const more = g().querySelector('[data-testid=search-more-messages]') as HTMLElement
    expect(more.textContent).toContain('(2)')
    await act(async () => { more.click() })
    await settle()
    expect(g().querySelectorAll('[data-testid=search-row]')).toHaveLength(7)
    await act(async () => root.unmount())
  })
})

describe('search helpers', () => {
  it('matches surfaces, pages by role, LAN devices, and keeps eight recents newest first', () => {
    expect(matchSurfaces('scratch').map((s) => s.id)).toEqual(['scratch'])
    expect(matchPages('devices', false)).toEqual([])
    expect(matchPages('devices', true).map((p) => p.id)).toEqual(['devices'])
    expect(matchLan('10.0.0.30', [{ mac: 'a', label: null, vendor: null, status: 'approved', last_ip: '10.0.0.30' }])).toHaveLength(1)
    for (let i = 0; i < 12; i++) pushRecent('term ' + i)
    pushRecent('term 5')
    const r = readRecent()
    expect(r).toHaveLength(RECENT_MAX)
    expect(r[0]).toBe('term 5')
    expect(r.filter((x) => x === 'term 5')).toHaveLength(1)
  })
})
