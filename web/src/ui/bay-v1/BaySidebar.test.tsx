// @vitest-environment happy-dom
// Bay's rail end to end: sections per agent in order, health dots, footer line, approver asks in the header count.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'

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
const L = (id: string, kind: string, agent?: string) => ({ id, kind, title: id, members: ['bay'], count: 0, asks: 0, tail: [], last: null, ...(agent ? { agent: { id: agent, name: agent === 'jared' ? 'Jared' : 'Gilfoyle' } } : {}) })

beforeEach(() => {
  window.location.hash = '#/engines'
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/me/profile') return json({ profile: { person_id: 'bay', name: 'Bay', tag: 'bay', avatar: null, editable: true }, prefs: { default: {}, device: {}, effective: {} }, device_id: 'd' })
    if (url === '/api/me') return json({ person: 'bay', role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, ui: 'bay-v1' })
    if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0, agents: { gilfoyle: { opencode: 'up' }, jared: { opencode: 'down' } } })
    if (url === '/api/lanes') return json([L('jared-desk', 'desk', 'jared'), L('jared-bay', 'dm', 'jared'), L('jared-money', 'dm', 'jared'), L('jared-arido', 'dm', 'jared'), L('dm-bay', 'dm'), L('hardware', 'group'), L('odd', 'dm', 'mystery')])
    if (url.startsWith('/api/asks')) return json([{ id: 'a1', lane: 'jared-dani', lane_title: 'Jared and Dani', agent: { id: 'jared' } }])
    if (url === '/api/engines') return json({ engines: [], error: 'not_granted' })
    if (url.endsWith('/messages')) return json([])
    return json({})
  }))
})
afterEach(() => { vi.unstubAllGlobals(); try { localStorage.clear() } catch { /* ignore */ } })

async function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
  return { el, root }
}
const q = (el: HTMLElement, id: string) => el.querySelector('[data-testid="' + id + '"]') as HTMLElement | null
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 10)) })
const savedRails = () => (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.filter((c) => c[0] === '/api/me/profile' && c[1]?.method === 'PUT').map((c) => JSON.parse(String(c[1].body)).prefs.device.rail)

describe('BaySidebar', () => {
  it('renders the agent sections in order, the footer, the approver count and the engines page', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => { root.render(<App />) })
    for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    const ids = [...el.querySelectorAll('[data-testid^="agent-"][data-agent-state]')].map((n) => n.getAttribute('data-testid'))
    expect(ids).toEqual(['agent-jared', 'agent-gilfoyle', 'agent-other'])
    expect(el.querySelectorAll('[data-testid=direct-jared] li').length).toBe(1)
    expect(el.querySelector('[data-testid=direct-jared]')?.textContent).toContain('Jared')
    expect(el.querySelector('[data-testid=bay-lanes-label-jared]')?.textContent).toBe("Bay's lanes")
    expect(el.querySelector('[data-testid=bay-lanes-jared]')?.textContent).toContain('jared-money')
    expect(el.querySelector('[data-testid=bay-lanes-jared]')?.textContent).toContain('jared-arido')
    expect(el.querySelector('[data-testid=bay-lanes-gilfoyle]')).toBeNull()
    expect(el.querySelectorAll('[data-testid=bay-lanes-jared] li').length).toBe(2)
    expect(el.querySelector('[data-testid=agent-jared]')?.getAttribute('data-agent-state')).toBe('down')
    expect(el.querySelector('[data-testid=agents-status]')?.textContent).toBe('Jared unreachable, Gilfoyle online')
    expect(el.querySelector('[data-testid=approval-count]')?.textContent).toBe('1 ask')
    expect(el.querySelector('[data-testid=engines-empty]')?.textContent).toContain('grant is missing')
    expect(window.location.hash).toBe('#/engines')
    await act(async () => root.unmount())
  })

  it('heads each agent with its name and online dot only, no picture, while the DM rows keep avatars', async () => {
    const { el, root } = await mount()
    for (const id of ['gilfoyle', 'jared']) {
      const head = q(el, 'agent-header-' + id) as HTMLElement
      expect(head.querySelector('img')).toBeNull()
      expect(head.querySelector('[data-testid=agent-avatar]')).toBeNull()
      expect(head.querySelector('[data-testid=agent-dot]')).not.toBeNull()
    }
    expect(q(el, 'agent-header-jared')?.textContent).toBe('Jared')
    expect(q(el, 'direct-jared')?.querySelector('img, [data-slot=avatar], span')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('clicking the header collapses everything, DM row included, and again opens it; the state is saved', async () => {
    const { el, root } = await mount()
    expect(q(el, 'direct-jared')).not.toBeNull()
    await act(async () => { q(el, 'agent-header-jared-toggle')!.click() })
    await tick()
    expect(q(el, 'agent-jared')?.getAttribute('data-rail')).toBe('closed')
    expect(q(el, 'direct-jared')).toBeNull()
    expect(q(el, 'bay-lanes-jared')).toBeNull()
    expect(q(el, 'desks-jared')).toBeNull()
    expect(q(el, 'direct-gilfoyle')).not.toBeNull()
    expect(savedRails().pop()).toEqual({ sections: { jared: 'closed' }, pins: [] })
    expect(JSON.parse(localStorage.getItem('sov.rail.v1.bay') ?? '{}')).toEqual({ jared: 'closed' })
    await act(async () => { q(el, 'agent-header-jared-toggle')!.click() })
    await tick()
    expect(q(el, 'direct-jared')).not.toBeNull()
    expect(q(el, 'desks-jared')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('clicking the Search mark folds the rail to icons and reopens it; no other toggle exists', async () => {
    const { el, root } = await mount()
    const state = () => el.querySelector('[data-slot=sidebar]')?.getAttribute('data-state')
    expect(state()).toBe('expanded')
    expect(q(el, 'rail-toggle')!.getAttribute('aria-label')).toBe('Collapse sidebar')
    expect(el.querySelectorAll('[data-slot=sidebar-trigger]').length).toBe(0)
    await act(async () => { q(el, 'rail-toggle')!.click() })
    expect(state()).toBe('collapsed')
    expect(q(el, 'rail-toggle')!.getAttribute('aria-label')).toBe('Expand sidebar')
    await act(async () => { q(el, 'rail-toggle')!.click() })
    expect(state()).toBe('expanded')
    await act(async () => root.unmount())
  })

  it('DM only keeps the DM row and hides the groups and desks; the kebab menu offers the three states', async () => {
    const { el, root } = await mount()
    const kebab = q(el, 'agent-header-gilfoyle-menu')!
    await act(async () => { kebab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await tick()
    const opts = [...document.querySelectorAll('[data-testid^=rail-opt-]')].map((n) => n.textContent)
    expect(opts).toEqual(['Collapse', 'DM only', 'Open'])
    await act(async () => { (document.querySelector('[data-testid=rail-opt-half]') as HTMLElement).click() })
    await tick()
    expect(q(el, 'agent-gilfoyle')?.getAttribute('data-rail')).toBe('half')
    expect(q(el, 'direct-gilfoyle')).not.toBeNull()
    expect(q(el, 'groups-gilfoyle')).toBeNull()
    expect(q(el, 'desks-jared')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it("pins a Bay lane from its row menu, and Bay's lanes goes to Pinned only", async () => {
    const { el, root } = await mount()
    // Bay lanes carry their icon tile, the avatar rows do not
    expect(q(el, 'bay-lanes-jared')?.querySelectorAll('[data-testid=lane-icon]').length).toBe(2)
    expect(q(el, 'direct-jared')?.querySelectorAll('[data-testid=lane-icon]').length).toBe(0)
    await act(async () => { q(el, 'bay-lanes-label-jared-toggle')!.click() })
    await tick()
    expect(q(el, 'bay-lanes-jared')).toBeNull()
    await act(async () => { q(el, 'bay-lanes-label-jared-toggle')!.click() })
    await tick()
    expect(q(el, 'bay-lanes-jared')).not.toBeNull()
    // Pinned only with nothing pinned
    await act(async () => { q(el, 'bay-lanes-label-jared-menu')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await tick()
    expect([...document.querySelectorAll('[data-testid^=rail-opt-]')].map((n) => n.textContent)).toEqual(['Collapse', 'Pinned only', 'Open'])
    await act(async () => { (document.querySelector('[data-testid=rail-opt-half]') as HTMLElement).click() })
    await tick()
    expect(q(el, 'bay-lanes-jared')?.querySelectorAll('li').length).toBe(0)
    expect(q(el, 'bay-lanes-empty-jared')?.textContent).toContain('No pinned lanes')
    // Open it again, then pin jared-arido from its row menu (right click)
    await act(async () => { (document.querySelector('[data-testid=bay-lanes-label-jared-menu]') as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await tick()
    await act(async () => { (document.querySelector('[data-testid=rail-opt-open]') as HTMLElement).click() })
    await tick()
    const arido = [...q(el, 'bay-lanes-jared')!.querySelectorAll('li')].find((li) => li.textContent?.includes('jared-arido'))!
    await act(async () => { arido.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await tick()
    const pin = [...document.querySelectorAll('[data-testid=lane-menu] [role=menuitem]')].find((n) => n.textContent === 'Pin') as HTMLElement
    await act(async () => { pin.click() })
    await tick()
    expect(savedRails().pop()).toEqual({ sections: {}, pins: ['jared-arido'] })
    expect(q(el, 'bay-lanes-jared')?.querySelector('li')?.textContent).toContain('jared-arido')
    expect(q(el, 'bay-lanes-jared')?.querySelector('[data-testid=lane-pinned]')).not.toBeNull()
    expect(q(el, 'rail-pinned')).toBeNull()
    await act(async () => { (document.querySelector('[data-testid=bay-lanes-label-jared-menu]') as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await tick()
    await act(async () => { (document.querySelector('[data-testid=rail-opt-half]') as HTMLElement).click() })
    await tick()
    expect([...q(el, 'bay-lanes-jared')!.querySelectorAll('li')].map((li) => li.textContent).join('|')).toContain('jared-arido')
    expect(q(el, 'bay-lanes-jared')?.querySelectorAll('li').length).toBe(1)
    await act(async () => root.unmount())
  })
})
