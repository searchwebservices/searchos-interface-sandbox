// @vitest-environment happy-dom
// Left panel menus, Apps drag and keyboard reorder, and the order prefs end to end.
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
let RAIL: Record<string, unknown> = {}
const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } }))
const L = (id: string, kind: string, agent?: string) => ({ id, kind, title: id, members: ['bay'], count: 0, asks: 0, tail: [], last: null, ...(agent ? { agent: { id: agent, name: agent === 'jared' ? 'Jared' : 'Gilfoyle' } } : {}) })

beforeEach(() => {
  window.location.hash = '#/engines'
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/me/profile') return json({ profile: { person_id: 'bay', name: 'Bay', tag: 'bay', avatar: null, editable: true }, prefs: { default: {}, device: { rail: RAIL }, effective: { rail: RAIL } }, device_id: 'd' })
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


const right = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) }); await tick() }
const items = () => [...document.querySelectorAll('[role=menu] [role=menuitem]')]
const labels = () => items().map((n) => n.textContent)
const closeMenu = async () => { await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }); await tick() }
const appIds = (el: HTMLElement) => [...el.querySelectorAll('[data-testid=rail-apps] [data-row-id]')].map((n) => n.getAttribute('data-row-id'))
const lastApps = () => savedRails().pop()?.appOrder

describe('left panel menus and order', () => {
  beforeEach(() => { RAIL = {} })

  it('puts Jared above Gilfoyle in the sidebar', async () => {
    const { el, root } = await mount()
    const ids = [...el.querySelectorAll('[data-testid^="agent-"][data-agent-state]')].map((n) => n.getAttribute('data-testid'))
    expect(ids.slice(0, 2)).toEqual(['agent-jared', 'agent-gilfoyle'])
    expect(q(el, 'agent-jared')?.querySelector('[data-testid=bay-lanes-jared]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('the pref round trip: a saved appOrder orders the rows, new apps append', async () => {
    RAIL = { appOrder: ['map', 'crm', 'ghost'] }
    const { el, root } = await mount()
    expect(appIds(el)).toEqual(['map', 'crm', 'money', 'pm'])
    await act(async () => root.unmount())
  })

  it('an app row menu lists Open, Open in new tab and the three moves; Move down saves appOrder', async () => {
    const { el, root } = await mount()
    expect(appIds(el)).toEqual(['crm', 'money', 'pm', 'map'])
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await right(el.querySelector('[data-row-id=crm]')!)
    expect(labels()).toEqual(['Open', 'Open in new tab', 'Move up', 'Move down', 'Move to top'])
    expect(items().map((n) => n.getAttribute('data-disabled') !== null)).toEqual([false, false, true, false, true])
    await act(async () => { (items()[1] as HTMLElement).click() })
    await tick()
    expect(open).toHaveBeenCalledWith(location.origin + location.pathname + '#/apps/crm', '_blank', 'noopener')
    await right(el.querySelector('[data-row-id=crm]')!)
    await act(async () => { (items()[3] as HTMLElement).click() })
    await tick()
    expect(lastApps()).toEqual(['money', 'crm', 'pm', 'map'])
    expect(appIds(el)).toEqual(['money', 'crm', 'pm', 'map'])
    await right(el.querySelector('[data-row-id=map]')!)
    await act(async () => { (items()[4] as HTMLElement).click() })
    await tick()
    expect(lastApps()).toEqual(['map', 'money', 'crm', 'pm'])
    open.mockRestore()
    await act(async () => root.unmount())
  })

  it('Alt+Down and Alt+Up on a focused app reorder it; plain arrows do not', async () => {
    const { el, root } = await mount()
    const key = async (id: string, k: string, alt: boolean) => { await act(async () => { q(el, 'nav-apps-' + id)!.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true, cancelable: true })) }); await tick() }
    await key('crm', 'ArrowDown', false)
    expect(lastApps()).toBeUndefined()
    await key('crm', 'ArrowDown', true)
    expect(lastApps()).toEqual(['money', 'crm', 'pm', 'map'])
    await key('map', 'ArrowUp', true)
    expect(lastApps()).toEqual(['money', 'crm', 'map', 'pm'])
    await act(async () => root.unmount())
  })

  it('dragging an app past another drops it there, with the drop line shown mid drag', async () => {
    const { el, root } = await mount()
    const rows = [...el.querySelectorAll<HTMLElement>('[data-testid=rail-apps] [data-row-id]')]
    rows.forEach((r, i) => { r.getBoundingClientRect = () => ({ top: i * 40, height: 36, bottom: i * 40 + 36, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON() {} }) as DOMRect })
    const ev = (t: string, y: number) => new MouseEvent(t, { bubbles: true, cancelable: true, clientX: 10, clientY: y, button: 0 })
    const crm = rows[0]
    await act(async () => { crm.dispatchEvent(ev('pointerdown', 18)) })
    await act(async () => { crm.dispatchEvent(ev('pointermove', 20)) })
    expect(rows[0].className).not.toContain('after:bg-primary')
    await act(async () => { crm.dispatchEvent(ev('pointermove', 100)) })
    expect(rows[3].className).toContain('after:bg-primary')
    expect(rows[0].className).toContain('opacity-60')
    await act(async () => { crm.dispatchEvent(ev('pointerup', 100)) })
    await tick()
    expect(lastApps()).toEqual(['money', 'pm', 'crm', 'map'])
    expect(appIds(el)).toEqual(['money', 'pm', 'crm', 'map'])
    // a click without movement still navigates and saves nothing new
    const n = savedRails().length
    const money = el.querySelector<HTMLElement>('[data-row-id=money]')!
    await act(async () => { money.dispatchEvent(ev('pointerdown', 18)); money.dispatchEvent(ev('pointerup', 18)) })
    expect(savedRails().length).toBe(n)
    await act(async () => root.unmount())
  })

  it('every menu lists only wired actions, per row type', async () => {
    const { el, root } = await mount()
    const row = async (sel: string) => { await right(el.querySelector(sel)!); const l = labels(); await closeMenu(); return l }
    const lane = (id: string) => '[data-testid=lane-' + id + '-menu]'
    void lane
    const liOf = (container: string, text: string) => [...q(el, container)!.querySelectorAll('li')].find((li) => li.textContent?.includes(text))!
    // Engines and quick actions
    await right(q(el, 'nav-engines')!.closest('li')!)
    expect(labels()).toEqual(['Open', 'Open in new tab'])
    await closeMenu()
    for (const t of ['LAN', 'Health', 'Library', 'Devices']) {
      await right([...el.querySelectorAll('[data-sidebar=menu-button]')].find((b) => b.textContent === t)!.closest('li')!)
      expect(labels()).toEqual(['Open', 'Open in new tab'])
      await closeMenu()
    }
    // Agent DM rows (Jared) have no moves; Bay's lanes have them; group lanes have no moves
    await right(liOf('direct-jared', 'Jared'))
    expect(labels()).toEqual(['Open', 'Pin', 'Mark as read', 'Copy link', 'Open in classic'])
    await closeMenu()
    await right(liOf('bay-lanes-jared', 'jared-money'))
    expect(labels()).toEqual(['Open', 'Pin', 'Mark as read', 'Move up', 'Move down', 'Copy link', 'Open in classic'])
    expect(items().map((n) => n.getAttribute('data-disabled') !== null).slice(3, 5)).toEqual([true, false])
    await closeMenu()
    await right(liOf('groups-gilfoyle', 'hardware'))
    expect(labels()).toEqual(['Open', 'Pin', 'Mark as read', 'Copy link', 'Open in classic'])
    await closeMenu()
    // The person footer: Profile and the three themes, no sign out because none exists
    expect(await row('[data-testid=profile-link]')).toEqual(['Profile', 'Light', 'Dark', 'System (on)'])
    // Every row has the kebab for the same menu
    expect(q(el, 'app-crm-kebab')).not.toBeNull()
    expect(q(el, 'lane-jared-money-kebab')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('Move down on a Bay lane saves bayLaneOrder and reorders the rows', async () => {
    const { el, root } = await mount()
    const li = () => [...q(el, 'bay-lanes-jared')!.querySelectorAll('li')]
    expect(li().map((x) => x.textContent?.includes('jared-money'))).toEqual([true, false])
    await right(li()[0])
    await act(async () => { (items()[4] as HTMLElement).click() })
    await tick()
    expect(savedRails().pop()?.bayLaneOrder).toEqual(['jared-arido', 'jared-money'])
    expect(li()[0].textContent).toContain('jared-arido')
    await act(async () => root.unmount())
  })
})
