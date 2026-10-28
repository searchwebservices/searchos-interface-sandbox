// @vitest-environment happy-dom
// Console v2 fixes: grouped tool work, one animated loader, single sidebar trigger, Find, lane context menu, ask lines.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import App from '../App'
import { groupFeed } from '@/lib/groups'
import { askLine } from '@/lib/asks'
import type { AskItem, ThreadItem } from '@/lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeES {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() {
    emit = (o) => this.onmessage?.({ data: JSON.stringify(o) })
    setTimeout(() => this.onopen?.(), 0)
  }
  close() {}
}
let emit: (o: unknown) => void = () => {}
const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } }))

const L = 'dm-marvin'
const base = { lane: L }
const msg = (id: string, at: string, role: string, text: string, extra = {}) => ({ ...base, id, at, role, text, signature: { person: 'marvin' }, ...extra })
const tool = (id: string, started: number, ended: number, status = 'ok') => ({ id, name: 'bash', input_summary: 'ls', status, started, ended, output_excerpt: 'out' })
const run = (id: string, at: string, started: number, ended: number, tools: unknown[], status = 'done') => ({ ...base, id, at, role: 'run', run: { message_id: id, agent: null, model: null, started, ended, status, tools } })
const ask = (id: string, at: string, state: string, by: unknown) => ({
  ...base, id, at, role: 'ask', state, replied_by: by, replied_at: new Date().toISOString(),
  ask: { request_id: 'q' + id, action: 'shell', resources: [], message: 'ok?', metadata: null, source: null },
})

let thread: unknown[] = []
beforeEach(() => {
  window.location.hash = '#/lanes/' + L
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/me')
        return json({ person: 'marvin', role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, people: [{ id: 'bay', name: 'Bay' }, { id: 'marvin', name: 'Marvin' }] })
      if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return json((lanesJson as { id: string; agent?: string }[]).map((l) => ({ ...l, agent: l.agent === 'jared' ? { id: 'jared', name: 'Jared', avatar: '/brand/jared-128.png' } : { id: 'gilfoyle', name: 'Gilfoyle', avatar: '/brand/gilfoyle-128.png' }, busy: false, count: 0, asks: 0, last: { id: 'm1', role: 'person', who: 'Marvin', own: true, text: 'hi', at: '2026-10-26T10:00:00Z' }, tail: [{ at: '2026-10-26T10:09:00Z', own: false }] })))
      if (url.endsWith('/messages')) return json(thread)
      return json({})
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
async function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, unmount: () => act(async () => root.unmount()) }
}
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const fixture = (): unknown[] => [
  msg('m1', '2026-10-26T10:00:00Z', 'person', 'please check the rack'),
  run('r1', '2026-10-26T10:00:01Z', 1000, 2000, [tool('a', 1000, 2000)]),
  ask('k1', '2026-10-26T10:00:02Z', 'once', { person: 'bay', device_id: 'd1', device_name: 'Bay MacBook Pro', ip: '1.1.1.1', mac: null }),
  run('r2', '2026-10-26T10:00:03Z', 2500, 5000, [tool('b', 2500, 3000), tool('c', 3000, 5000)]),
  msg('m2', '2026-10-26T10:01:00Z', 'gilfoyle', 'The rack is fine. The rack is cold.'),
  run('r3', '2026-10-26T10:02:00Z', 8000, 9000, [tool('d', 8000, 9000)]),
  msg('m3', '2026-10-26T10:03:00Z', 'person', 'thanks rack'),
]

describe('grouping', () => {
  it('folds runs and answered asks between conversation messages into one group', () => {
    const rows = groupFeed(fixture() as ThreadItem[])
    expect(rows.map((r) => r.kind)).toEqual(['item', 'work', 'item', 'work', 'item'])
    const g = rows[1]
    if (g.kind !== 'work') throw new Error('x')
    expect(g.tools).toHaveLength(3)
    expect(g.members.map((m) => m.role)).toEqual(['run', 'ask', 'run'])
    expect(g.ended - g.started).toBe(4000)
  })
  it('a standalone answered ask stays its own item, an open ask ends the group', () => {
    const rows = groupFeed([ask('k', 'a', 'once', 'bay'), msg('x', 'b', 'person', 'hi'), run('r', 'c', 1, 2, [tool('t', 1, 2)]), ask('o', 'd', 'open', null)] as unknown as ThreadItem[])
    expect(rows.map((r) => r.kind)).toEqual(['item', 'item', 'work', 'item'])
  })
})

describe('ask line', () => {
  const a = (state: string, by: unknown) => ask('k', 'x', state, by) as unknown as AskItem
  it('never prints [object Object]', () => {
    const l = askLine(a('once', { person: 'bay', device_name: 'Bay MacBook Pro' }), { bay: 'Bay' })
    expect(l).toBe('Allowed once by Bay (Bay MacBook Pro), just now')
    expect(askLine(a('always', 'marvin'), {})).toBe('Allowed always by Marvin, just now')
    expect(askLine(a('reject', { person: 'john' }), {})).toBe('Denied by John, just now')
    expect(askLine(a('closed', null), {})).toBe('Closed (dropped by a restart)')
  })
})

describe('other agents and relays', () => {
  it("a Jared reply renders as the agent (Jared's name and avatar, left aligned), not as a person", async () => {
    window.location.hash = '#/lanes/jared-bay'
    thread = [
      { lane: 'jared-bay', id: 'p1', at: '2026-10-27T10:00:00Z', role: 'person', text: 'status?', signature: { person: 'marvin' } },
      { lane: 'jared-bay', id: 'j1', at: '2026-10-27T10:00:05Z', role: 'agent', agent: 'jared', text: 'Quiet day. Suspiciously quiet.' },
    ]
    const { el, unmount } = await mount()
    const reply = [...el.querySelectorAll('[data-align]')].find((n) => n.textContent?.includes('Quiet day'))
    expect(reply?.getAttribute('data-align')).toBe('left')
    expect(reply?.textContent).toContain('Jared')
    expect(reply?.querySelector('img[data-testid=gilfoyle-avatar]')?.getAttribute('src')).toBe('/brand/jared-128.png')
    expect(reply?.textContent).not.toContain('Gilfoyle')
    await unmount()
  })

  it('a relay arrives as a lane message with its eyebrow, and a reply quotes the ask', async () => {
    window.location.hash = '#/lanes/jared-desk'
    thread = [
      { lane: 'jared-desk', id: 'r1', at: '2026-10-27T10:00:00Z', role: 'lane', from_lane: 'dm-bay', text: 'Please pull the CFDI list.', eyebrow: 'Ask from Gilfoyle (dm-bay)', relay_id: 'rl-1', relay_kind: 'ask' },
      { lane: 'jared-desk', id: 'r2', at: '2026-10-27T10:01:00Z', role: 'lane', from_lane: 'gilfoyle-desk', text: '21 C.', eyebrow: 'Reply from Gilfoyle', relay_kind: 'reply', quote: { label: 'Your ask', text: 'rack temperature?' } },
    ]
    const { el, unmount } = await mount()
    const eyebrows = [...el.querySelectorAll('[data-testid=lane-eyebrow]')].map((n) => n.textContent)
    expect(eyebrows).toEqual(['Ask from Gilfoyle (dm-bay)', 'Reply from Gilfoyle'])
    expect(el.querySelector('[data-testid=relay-quote]')?.textContent).toBe('Your ask: rack temperature?')
    expect(el.textContent).toContain('Desk')
    await unmount()
  })
})

describe('thread view', () => {
  it('one row per turn: two closed groups, one open turn, exactly one working loader', async () => {
    thread = fixture()
    const { el, unmount } = await mount()
    const rows = el.querySelectorAll('[data-testid=run-row]')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('3 tools, 4.0s')
    expect(rows[1].textContent).toContain('1 tool, 1.0s')
    for (const r of rows) expect(r.querySelector('[data-status]')?.getAttribute('data-status')).toBe('done')
    expect(el.querySelectorAll('[data-status=working]')).toHaveLength(0)
    // expanded: the tools and the ask inline
    await act(async () => { (rows[0].querySelector('button') as HTMLElement).click() })
    expect(rows[0].querySelector('[data-testid=ask-in-group]')?.textContent).toBe('Permission: shell, allowed once by Bay (Bay MacBook Pro), just now')
    expect(el.textContent).not.toContain('[object Object]')

    await act(async () => { emit({ type: 'busy', lane: L, busy: true }) })
    await act(async () => { emit({ type: 'message', lane: L, message: run('r9', '2026-10-26T10:04:00Z', Date.now(), 0, [tool('z', Date.now(), 0, 'running')], 'running') }) })
    await settle()
    expect(el.querySelectorAll('[data-status=working]')).toHaveLength(1)
    expect(el.querySelector('[data-testid=working-row] [data-status=working]')).toBeTruthy()
    expect(el.textContent).toContain('Gilfoyle is working')
    await unmount()
  })

  it('has no page-header sidebar trigger (the sidebar mark is the toggle)', async () => {
    thread = fixture()
    const { el, unmount } = await mount()
    expect(el.querySelectorAll('[data-sidebar=trigger]')).toHaveLength(0)
    await unmount()
  })

  it('Find highlights and counts matches, steps with Enter, closes with Esc', async () => {
    thread = fixture()
    const { el, unmount } = await mount()
    expect(el.querySelector('[data-testid=find-bar]')).toBeNull()
    const btn = [...el.querySelectorAll('header button')].find((b) => b.textContent?.includes('Find')) as HTMLElement
    await act(async () => { btn.click() })
    const input = el.querySelector('[data-testid=find-bar] input') as HTMLInputElement
    expect(input).toBeTruthy()
    await type(input, 'rack')
    // m1 once, m2 twice, m3 once
    expect(el.querySelector('[data-testid=find-count]')?.textContent).toBe('1 of 4')
    expect(el.textContent).toContain('please check the rack')
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(el.querySelector('[data-testid=find-count]')?.textContent).toBe('2 of 4')
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })) })
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })) })
    expect(el.querySelector('[data-testid=find-count]')?.textContent).toBe('4 of 4')
    await type(input, 'zzz')
    expect(el.querySelector('[data-testid=find-count]')?.textContent).toBe('0 of 0')
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(el.querySelector('[data-testid=find-bar]')).toBeNull()
    // Cmd F opens it again in a lane
    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true })
    await act(async () => { document.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(el.querySelector('[data-testid=find-bar]')).toBeTruthy()
    await unmount()
  })

  it('Cmd F is left to the browser when no lane is open', async () => {
    window.location.hash = '#/health'
    const { el, unmount } = await mount()
    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true })
    await act(async () => { document.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(false)
    expect(el.querySelector('[data-testid=find-bar]')).toBeNull()
    await unmount()
  })

  it('lane rows have no pin icon and a context menu with the five wired items', async () => {
    thread = fixture()
    const { el, unmount } = await mount()
    expect(el.querySelector('[aria-label=Pin], [aria-label=Unpin]')).toBeNull()
    const row = el.querySelector('[data-testid=rail-direct] li') as HTMLElement
    await act(async () => { row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await settle()
    const menu = document.querySelector('[data-testid=lane-menu]')
    expect(menu).toBeTruthy()
    expect([...menu!.querySelectorAll('[role=menuitem]')].map((i) => i.textContent)).toEqual(['Open', 'Pin', 'Mark as read', 'Copy link', 'Open in classic'])
    await act(async () => { (menu!.querySelectorAll('[role=menuitem]')[1] as HTMLElement).click() })
    await settle()
    expect(el.querySelector('[data-testid=rail-pinned]')).toBeTruthy()
    const other = el.querySelector('[data-testid=rail-direct] li') as HTMLElement
    expect(other.querySelector('[data-testid=unread-badge]')).toBeTruthy()
    await act(async () => { other.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await settle()
    const items = document.querySelectorAll('[data-testid=lane-menu] [role=menuitem]')
    await act(async () => { (items[2] as HTMLElement).click() })
    await settle()
    expect(other.querySelector('[data-testid=unread-badge]')).toBeNull()
    await unmount()
  })
})
