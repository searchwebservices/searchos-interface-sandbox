// @vitest-environment happy-dom
// Render smoke: the whole app against a mocked console API and a scripted stream.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import App from '../App'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let role = 'owner'
let emit: (o: unknown) => void = () => {}
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

const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } }))
const msgs = [
  { id: 'm1', lane: 'dm-marvin', at: '2026-10-26T10:00:00Z', role: 'person', text: 'hello', signature: { person: 'marvin', device_name: 'Laptop' } },
  { id: 'm2', lane: 'dm-marvin', at: '2026-10-26T10:00:05Z', role: 'gilfoyle', text: 'Run:\n\n```bash\nls -la\npwd\n```' },
]

beforeEach(() => {
  role = 'owner'
  window.location.hash = '#/lanes/dm-marvin'
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/me') return json({ person: 'marvin', role, device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null })
      if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return json((lanesJson as { id: string }[]).map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: [] })))
      if (url.endsWith('/messages')) return json(msgs)
      return json({})
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}

describe('console v2 render', () => {
  it('shows the rail, the thread, a command block with a Copy per command, and the one working row', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => { root.render(<App />) })
    await settle()
    expect(el.querySelector('[data-testid=rail-direct]')).toBeTruthy()
    expect(el.querySelector('[data-testid=rail-threads]')).toBeTruthy()
    expect(el.textContent).toContain('hello')
    expect(el.querySelectorAll('[data-testid=command-block] code')).toHaveLength(2)
    expect(el.querySelector('textarea')?.getAttribute('placeholder')).toBe('Message Gilfoyle')

    await act(async () => { emit({ type: 'busy', lane: 'dm-marvin', busy: true }) })
    await act(async () => { emit({ type: 'message', lane: 'dm-marvin', message: { id: 'r1', lane: 'dm-marvin', at: '2026-10-26T10:01:00Z', role: 'run', run: { turn_id: 't1', message_id: 't1', agent: null, model: null, started: Date.now(), ended: null, status: 'running', tools: [{ id: 'x', name: 'bash', input_summary: 'ls', status: 'running', started: Date.now() }] } } }) })
    await settle()
    expect(el.querySelectorAll('[data-testid=working-row]')).toHaveLength(1)
    expect(el.textContent).toContain('Gilfoyle is working')
    expect(el.querySelector('[data-testid=lane-busy]')).toBeTruthy()

    await act(async () => { emit({ type: 'run_update', lane: 'dm-marvin', id: 'r1', run: { turn_id: 't1', message_id: 't1', agent: null, model: null, started: 1000, ended: 3000, status: 'done', tools: [{ id: 'x', name: 'bash', input_summary: 'ls', status: 'ok', started: 1000, ended: 2000, output_excerpt: 'a' }] } }) })
    await act(async () => { emit({ type: 'busy', lane: 'dm-marvin', busy: false }) })
    await settle()
    expect(el.querySelector('[data-testid=working-row]')).toBeNull()
    expect(el.querySelector('[data-testid=run-row]')?.textContent).toContain('1 tool, 2.0s')
    await act(async () => root.unmount())
  })

  it('shows Gilfoyle\'s avatar beside his message and in the sidebar footer, initials for people', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => { root.render(<App />) })
    await settle()
    const thread = el.querySelector('[data-id=m2]') as HTMLElement
    const img = thread.querySelector('img[data-testid=gilfoyle-avatar]') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/brand/gilfoyle-128.png')
    expect(img.getAttribute('srcset')).toContain('/brand/gilfoyle.png 2x')
    expect(img.getAttribute('alt')).toBe('Gilfoyle')
    expect(thread.textContent).toContain('Gilfoyle')
    expect((el.querySelector('[data-id=m1]') as HTMLElement).querySelector('img')).toBeNull()
    const foot = el.querySelector('[data-testid=gilfoyle-status] img') as HTMLImageElement
    expect(foot.getAttribute('src')).toBe('/brand/gilfoyle-128.png')
    expect(foot.getAttribute('alt')).toBe('Gilfoyle')
    await act(async () => root.unmount())
  })

  it('a non-member sees Read only', async () => {
    window.location.hash = '#/lanes/dm-bay'
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => { root.render(<App />) })
    await settle()
    expect(el.querySelector('textarea')?.getAttribute('placeholder')).toBe('Read only')
    expect(el.querySelector('textarea')?.disabled).toBe(true)
    await act(async () => root.unmount())
  })

  it('the ask card has buttons for owners and "Waiting on an owner" for members', async () => {
    const askFrame = { type: 'ask', lane: 'dm-marvin', ask: { id: 'k1', lane: 'dm-marvin', at: '2026-10-26T10:02:00Z', role: 'ask', ask: { request_id: 'r1', action: 'bash', resources: ['ls /etc'], message: 'ok?', metadata: null, source: null }, state: 'open' } }
    for (const r of ['owner', 'member']) {
      role = r
      const el = document.createElement('div')
      document.body.appendChild(el)
      const root = createRoot(el)
      await act(async () => { root.render(<App />) })
      await settle()
      await act(async () => { emit(askFrame) })
      await settle()
      const card = el.querySelector('[data-testid=ask-card]')
      expect(card?.textContent).toContain('Gilfoyle asks')
      if (r === 'owner') {
        expect(card?.textContent).toContain('Allow once')
        expect(card?.textContent).toContain('Deny')
      } else {
        expect(card?.textContent).toContain('Waiting on an owner')
        expect(card?.textContent).not.toContain('Allow once')
      }
      await act(async () => root.unmount())
    }
  })
})
