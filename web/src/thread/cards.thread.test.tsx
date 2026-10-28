// @vitest-environment happy-dom
// Cards in the lane: stored cards and the older items all draw through the registry, actions post to the console.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import App from '../App'
import { FIXTURES } from '@/cards/schemas'

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
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
const L = 'dm-marvin'
const stored = (id: string, kind: string, at: string) => {
  const c = JSON.parse(JSON.stringify((FIXTURES as Record<string, { valid: object }>)[kind].valid))
  return { id, lane: L, at, role: 'card', card: { ...c, id, lane: L, at } }
}
const ask = { id: 'k1', lane: L, at: '2026-10-26T10:00:02Z', role: 'ask', state: 'open', ask: { request_id: 'q1', action: 'shell', resources: [], message: 'ok?', metadata: null, source: null } }

let thread: unknown[] = []
let calls: Array<{ url: string; method?: string }> = []
let actionReply: () => Promise<Response> = () => json({})
beforeEach(() => {
  calls = []
  window.location.hash = '#/lanes/' + L
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  if (!('ResizeObserver' in globalThis)) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method })
      if (url === '/api/me') return json({ person: 'marvin', role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, people: [{ id: 'marvin', name: 'Marvin' }] })
      if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return json((lanesJson as { id: string }[]).map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: [] })))
      if (url.endsWith('/messages')) return json(thread)
      if (url.includes('/cards/')) return actionReply()
      return json({})
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
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
const button = (el: ParentNode, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
const click = async (e: Element | null | undefined) => {
  expect(e).toBeTruthy()
  await act(async () => (e as HTMLElement).click())
  await settle()
}

describe('cards in the lane', () => {
  it('stored cards and the older items draw through the one registry', async () => {
    thread = [stored('c1', 'alert', '2026-10-26T10:00:00Z'), ask, stored('c2', 'metrics_snapshot', '2026-10-26T10:00:03Z'), stored('c3', 'file_retrieval', '2026-10-26T10:00:04Z')]
    const m = await mount()
    expect(m.el.querySelector('[data-testid=card-alert]')).toBeTruthy()
    expect(m.el.querySelector('[data-testid=ask-card]')).toBeTruthy()
    expect(m.el.querySelectorAll('[data-testid=metric-panel]').length).toBe(3)
    expect(m.el.querySelectorAll('[data-testid=file-row]').length).toBe(2)
    expect(m.el.querySelector('[data-testid=unknown-card]')).toBeNull()
    await m.unmount()
  })
  it('an unknown kind in the thread shows the placeholder and the rest of the thread still draws', async () => {
    const odd = stored('c9', 'alert', '2026-10-26T10:00:00Z') as { card: { kind: string } }
    odd.card.kind = 'mood_ring'
    thread = [odd, stored('c1', 'alert', '2026-10-26T10:00:05Z')]
    const m = await mount()
    expect(m.el.querySelector('[data-testid=unknown-card]')!.textContent).toContain('mood_ring')
    expect(m.el.querySelector('[data-testid=card-alert]')).toBeTruthy()
    await m.unmount()
  })
  it('Acknowledge posts to the card action route and the card shows acknowledged', async () => {
    const item = stored('c1', 'alert', '2026-10-26T10:00:00Z')
    thread = [item]
    actionReply = () => json({ card: { ...item, card: { ...item.card, state: 'ack', resolution: { action_id: 'ack', kind: 'ack', label: 'Acknowledge', by: { person: 'marvin', device_name: 'Laptop' }, at: '2026-10-26T10:01:00Z' } } } })
    const m = await mount()
    await click(button(m.el, 'Acknowledge'))
    const post = calls.find((c) => c.url === '/api/lanes/dm-marvin/cards/c1/actions/ack')
    expect(post?.method).toBe('POST')
    expect(button(m.el, 'Acknowledge')).toBeUndefined()
    expect(m.el.textContent).toContain('Acknowledged')
    await m.unmount()
  })
  it('an error from the console is shown on the card', async () => {
    thread = [stored('c1', 'alert', '2026-10-26T10:00:00Z')]
    actionReply = () => json({ error: 'not_a_member' }, 403)
    const m = await mount()
    await click(button(m.el, 'Acknowledge'))
    expect(m.el.textContent).toContain('Only members of this lane can do this.')
    await m.unmount()
  })
  it('a card frame on the stream lands in the open lane', async () => {
    thread = []
    const m = await mount()
    await act(async () => emit({ type: 'card', lane: L, card: stored('c5', 'alert', '2026-10-26T10:00:00Z') }))
    await settle()
    expect(m.el.querySelector('[data-testid=card-alert]')).toBeTruthy()
    await act(async () => emit({ type: 'card_update', lane: L, id: 'c5', state: 'ack', resolution: { action_id: 'ack', kind: 'ack', by: { person: 'marvin' }, at: '2026-10-26T10:02:00Z' } }))
    await settle()
    expect(button(m.el, 'Acknowledge')).toBeUndefined()
    await m.unmount()
  })
  it('Open on a file card opens the File Preview inside Lane files, not in a sheet and not as its own tab', async () => {
    thread = [stored('c3', 'file_retrieval', '2026-10-26T10:00:04Z')]
    const m = await mount()
    await click(m.el.querySelectorAll('[data-testid=file-row] button')[0])
    expect(document.querySelector('[data-testid=surface-sheet]')).toBeNull()
    expect(m.el.querySelector('[data-testid=dock-panel][data-surface="card:c3"]')).toBeNull()
    const panel = m.el.querySelector('[data-testid=dock-panel][data-surface="files"]')
    expect(panel).toBeTruthy()
    expect(panel!.querySelector('[data-testid=files-preview] [data-testid=file-preview]')!.textContent).toContain('Listening ports on the Lenovo.')
    expect(m.el.querySelector('[data-testid=dock-panel-title]')!.textContent).toBe('Lane files')
    await m.unmount()
  })
})
