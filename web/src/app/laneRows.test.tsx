// @vitest-environment happy-dom
// Sidebar rows: the DM inbox card and the animated group icons (handle mocked).
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import App from '../App'

const calls = vi.hoisted(() => ({ start: 0, stop: 0 }))
vi.mock('@/components/ui/server', async () => {
  const React = await import('react')
  return {
    ServerIcon: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({ startAnimation: () => { calls.start++ }, stopAnimation: () => { calls.stop++ } }))
      return <div data-testid={props['data-testid'] as string} data-busy={props['data-busy'] as string} />
    }),
  }
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeES {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() { setTimeout(() => this.onopen?.(), 0) }
  close() {}
}
const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } }))
let hwBusy = false
let reduced = false

beforeEach(() => {
  calls.start = 0
  calls.stop = 0
  window.location.hash = '#/lanes/dm-marvin'
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: reduced && q.includes('reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/me') return json({ person: 'marvin', role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null })
    if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
    if (url === '/api/lanes') {
      return json((lanesJson as { id: string }[]).map((l) => ({
        ...l, busy: l.id === 'hardware' ? hwBusy : false, count: 1, asks: 0, tail: [],
        last: l.id === 'dm-marvin' ? { id: 'x', role: 'person', who: 'marvin', own: true, text: 'ping the rack', at: new Date(Date.now() - 5 * 60000).toISOString() } : null,
      })))
    }
    if (url.endsWith('/messages')) return json([])
    return json({})
  }))
})
afterEach(() => { vi.unstubAllGlobals(); reduced = false })

const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) }) }
async function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, root }
}

describe('lane rows', () => {
  it('DM row is an inbox card: Gilfoyle avatar, title, You: preview, relative time', async () => {
    const { el, root } = await mount()
    const row = el.querySelector('[data-testid=rail-direct]') as HTMLElement
    expect(row.querySelector('img[data-testid=gilfoyle-avatar]')?.getAttribute('src')).toBe('/brand/gilfoyle-128.png')
    expect(row.textContent).toContain('Gilfoyle')
    expect(row.textContent).not.toContain('Marvin and Gilfoyle')
    expect(row.querySelector('[data-testid=lane-preview]')?.textContent).toBe('You: ping the rack')
    expect(row.querySelector('[data-testid=lane-time]')?.textContent).toBe('5 min ago')
    await act(async () => root.unmount())
  })

  it('a busy group lane triggers the icon handle and loops', async () => {
    hwBusy = true
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { el, root } = await mount()
    expect(el.querySelector('[data-testid=rail-threads] [data-testid=lane-icon]')?.getAttribute('data-busy')).toBe('true')
    const first = calls.start
    expect(first).toBeGreaterThan(0)
    await act(async () => { vi.advanceTimersByTime(4100) })
    expect(calls.start).toBeGreaterThanOrEqual(first + 2)
    vi.useRealTimers()
    await act(async () => root.unmount())
  })

  it('an idle group lane stays static', async () => {
    hwBusy = false
    const { el, root } = await mount()
    expect(el.querySelector('[data-testid=rail-threads] [data-testid=lane-icon]')?.getAttribute('data-busy')).toBe('false')
    expect(calls.start).toBe(0)
    await act(async () => root.unmount())
  })

  it('reduced motion does not loop a busy lane', async () => {
    hwBusy = true
    reduced = true
    const { root } = await mount()
    expect(calls.start).toBe(0)
    await act(async () => root.unmount())
  })
})
