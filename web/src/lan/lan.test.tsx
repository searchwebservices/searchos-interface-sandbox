// @vitest-environment happy-dom
// The shared LAN model, the DeviceProfile popup and the #/lan page, against a mocked console API (never lan-watch).
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hrefFor, parseRoute } from '@/app/router'
import { AppProvider } from '@/app/AppContext'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { LanAssignment, LanSummary } from '@/lib/types'
import LanPage from '@/pages/Lan'
import { DeviceProfile } from './DeviceProfile'
import { DevicesPage } from '@/pages/Devices'
import { layoutLan } from './layout'
import { activities, buildLanModel, classCounts, findNode, lensPool, matchesLens, matchesQuery, NO_LENS, selectionNodeId } from './model'
import { useLanData } from './useLanData'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export const SUMMARY: LanSummary = {
  generated_at: '2026-10-26T10:00:00Z',
  last_scan: '2026-10-26T09:58:00Z',
  box: { iface: 'enp2s0', ip: '192.168.1.10', mac: 'aa:bb:cc:00:00:01' },
  counts: { total: 6, online: 4, pending: 1, denied: 1 },
  devices: [
    { mac: 'aa:bb:cc:00:00:01', label: 'Lenovo', vendor: 'Lenovo', status: 'approved', online: true, is_box: true, last_ip: '192.168.1.10' },
    { mac: 'aa:bb:cc:00:00:02', label: 'Router', vendor: 'TP-Link', status: 'approved', online: true, last_ip: '192.168.1.1' },
    { mac: 'aa:bb:cc:00:00:50', label: 'Bay iPhone', vendor: 'Apple', status: 'approved', online: true, last_ip: '192.168.1.50', first_seen: '2026-10-01T10:00:00Z', last_seen: '2026-10-26T09:58:00Z' },
    { mac: 'aa:bb:cc:00:00:60', label: 'Printer', vendor: 'HP', status: 'approved', online: false, last_ip: '192.168.1.60' },
    { mac: 'aa:bb:cc:00:00:70', label: null, vendor: 'Unknown Co', status: 'pending', online: true, last_ip: '192.168.1.70', is_random: true },
    { mac: 'aa:bb:cc:00:00:88', label: 'Seen before', vendor: null, status: 'denied', online: false },
  ],
}
const ASSIGN: Record<string, LanAssignment> = { 'aa:bb:cc:00:00:50': { person: 'bay', notes: 'always on', updated_by: 'marvin', updated_at: '2026-10-26T09:00:00Z' } }

describe('model builder', () => {
  const m = buildLanModel(SUMMARY, ASSIGN)
  it('splits the summary into gateway, switch, box and devices, with one status per node', () => {
    expect(m.box.id).toBe('box')
    expect(m.box.ip).toBe('192.168.1.10')
    expect(m.gateway.id).toBe('gateway')
    expect(m.gateway.mac).toBe('aa:bb:cc:00:00:02') // the .1 of the box's subnet is the router
    expect(m.gateway.inferred).toBe(false)
    expect(m.switch.inferred).toBe(true)
    expect(m.devices.map((d) => d.label)).toEqual(['Bay iPhone', 'Printer', 'Unknown Co', 'Seen before'])
    expect(m.devices.map((d) => d.status)).toEqual(['online', 'offline', 'pending', 'denied'])
    expect(m.counts).toEqual({ total: 6, online: 4, offline: 1, pending: 1, denied: 1 })
  })
  it('joins assignments by mac and wires gateway to switch to the box and every device', () => {
    expect(m.devices[0].assignment?.person).toBe('bay')
    expect(m.devices[1].assignment).toBeNull()
    expect(m.edges).toHaveLength(2 + m.devices.length)
    expect(m.edges.filter((e) => e.from === 'switch').map((e) => e.to)).toEqual(['box', ...m.devices.map((d) => d.id)])
  })
  it('infers a gateway when no row has the .1 address, and prefers one the summary names', () => {
    const none = buildLanModel({ ...SUMMARY, devices: SUMMARY.devices.filter((d) => d.last_ip !== '192.168.1.1') })
    expect(none.gateway.inferred).toBe(true)
    expect(none.gateway.ip).toBe('192.168.1.1')
    const named = buildLanModel({ ...SUMMARY, gateway: { mac: 'aa:bb:cc:00:00:60', label: 'Modem' } })
    expect(named.gateway.mac).toBe('aa:bb:cc:00:00:60')
    expect(named.gateway.label).toBe('Modem')
    expect(named.devices.some((d) => d.mac === 'aa:bb:cc:00:00:60')).toBe(false)
    expect(buildLanModel({ devices: [] }).box.inferred).toBe(true)
  })
  it('resolves selections and searches', () => {
    expect(selectionNodeId(m, 'aa:bb:cc:00:00:01')).toBe('box')
    expect(findNode(m, 'aa:bb:cc:00:00:60')?.label).toBe('Printer')
    expect(matchesQuery(m.devices[0], 'apple')).toBe(true)
    expect(matchesQuery(m.devices[0], '192.168.1.5')).toBe(true)
    expect(matchesQuery(m.devices[0], 'printer')).toBe(false)
    expect(matchesQuery(m.devices[1], 'bay')).toBe(false)
    expect(matchesQuery(m.devices[1], 'bay', 'Bay Purcell')).toBe(true) // the assigned person counts
    expect(matchesQuery(m.devices[0], 'purcell', 'Bay Purcell')).toBe(true)
  })
})

// ------------------------------------------------------------------ harness
const reply = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, (c: Call) => Promise<Response>> = {}
let role = 'owner'
let summary: LanSummary = SUMMARY

beforeEach(() => {
  calls = []
  routes = {}
  role = 'owner'
  summary = SUMMARY
  try { localStorage.clear() } catch { /* ignore */ }
  class FakeES { onopen: (() => void) | null = null; onmessage = null; onerror = null; readyState = 1; constructor() { setTimeout(() => this.onopen?.(), 0) } close() {} }
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  ;(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class { m22 = 1 }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const c: Call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
      calls.push(c)
      const r = routes[c.method + ' ' + url]
      if (r) return r(c)
      if (url === '/api/me') return reply({ person: 'marvin', name: 'Marvin', role, device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, people: [{ id: 'marvin', name: 'Marvin' }, { id: 'bay', name: 'Bay Purcell' }] })
      if (url === '/api/health') return reply({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return reply([])
      if (url === '/api/lan/summary') return reply(summary)
      if (url === '/api/lan/assignments') return reply(ASSIGN)
      return reply({})
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
const q = (el: ParentNode, sel: string) => el.querySelector(sel) as HTMLElement | null
const qa = (el: ParentNode, sel: string) => [...el.querySelectorAll(sel)] as HTMLElement[]
const click = async (e: Element | null | undefined) => {
  expect(e).toBeTruthy()
  await act(async () => { e!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  await settle()
}
const typeInto = async (e: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(e, text)
    e.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function render(node: React.ReactNode) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <AppProvider>
          <SidebarProvider>{node}</SidebarProvider>
        </AppProvider>
      </TooltipProvider>,
    )
  })
  await settle()
  return { el, unmount: () => act(async () => root.unmount()) }
}

// A page-less host for the popup: the same hook the surfaces use.
function Host({ id, onClose = () => {} }: { id: string; onClose?: () => void }) {
  const data = useLanData('test')
  return <DeviceProfile nodeId={data.model ? id : null} data={data} onClose={onClose} />
}
const body = () => q(document.body, '[data-testid=device-profile]')!
const post = () => calls.filter((c) => c.method === 'POST' && c.url.includes('/action'))

describe('DeviceProfile', () => {
  it('shows identity, status, the assignment and the notes of the node', async () => {
    const m = await render(<Host id="aa:bb:cc:00:00:50" />)
    const t = body().textContent!
    expect(t).toContain('Bay iPhone')
    expect(t).toContain('aa:bb:cc:00:00:50')
    expect(t).toContain('Apple')
    expect(t).toContain('192.168.1.50')
    expect(q(body(), '[data-testid=profile-status]')!.textContent).toBe('online')
    expect((q(body(), '[data-testid=profile-person]') as HTMLSelectElement).value).toBe('bay')
    expect((q(body(), '[data-testid=profile-notes]') as HTMLTextAreaElement).value).toBe('always on')
    expect((q(body(), '[data-testid=profile-label]') as HTMLInputElement).value).toBe('Bay iPhone')
    await m.unmount()
  })
  it('Approve, Deny and Reset call the console action route, update at once and keep the current status disabled', async () => {
    routes['POST /api/lan/devices/aa:bb:cc:00:00:70/action'] = () => reply({ ok: true })
    const m = await render(<Host id="aa:bb:cc:00:00:70" />)
    expect((q(body(), '[data-testid=profile-reset]') as HTMLButtonElement).disabled).toBe(true) // already pending
    await click(q(body(), '[data-testid=profile-approve]'))
    expect(post().pop()!.body).toEqual({ do: 'approve' })
    expect(q(body(), '[data-testid=profile-status]')!.textContent).toBe('online')
    expect((q(body(), '[data-testid=profile-approve]') as HTMLButtonElement).disabled).toBe(true)
    await click(q(body(), '[data-testid=profile-deny]'))
    expect(post().pop()!.body).toEqual({ do: 'deny' })
    expect(q(body(), '[data-testid=profile-status]')!.textContent).toBe('denied')
    await click(q(body(), '[data-testid=profile-reset]'))
    expect(post().pop()!.body).toEqual({ do: 'reset' })
    expect(q(body(), '[data-testid=profile-status]')!.textContent).toBe('pending approval')
    await m.unmount()
  })
  it('a refused action rolls the optimistic change back and says so', async () => {
    routes['POST /api/lan/devices/aa:bb:cc:00:00:70/action'] = () => reply({ error: 'lan-watch not reachable' }, 503)
    const m = await render(<Host id="aa:bb:cc:00:00:70" />)
    await click(q(body(), '[data-testid=profile-deny]'))
    expect(q(body(), '[data-testid=profile-status]')!.textContent).toBe('pending approval')
    expect(q(body(), '[data-testid=profile-error]')!.textContent).toContain('not reachable')
    await m.unmount()
  })
  it('rename posts the label; assigning a person puts the mapping', async () => {
    routes['POST /api/lan/devices/aa:bb:cc:00:00:60/action'] = () => reply({ ok: true })
    routes['PUT /api/lan/devices/aa:bb:cc:00:00:60'] = (c) => reply({ person: (c.body as { person: string }).person, notes: '', updated_by: 'marvin', updated_at: 'now' })
    const m = await render(<Host id="aa:bb:cc:00:00:60" />)
    await typeInto(q(body(), '[data-testid=profile-label]') as HTMLInputElement, 'Office printer')
    await click(q(body(), '[data-testid=profile-save-name]'))
    expect(post().pop()!.body).toEqual({ do: 'rename', label: 'Office printer' })
    expect(body().textContent).toContain('Office printer')
    const sel = q(body(), '[data-testid=profile-person]') as HTMLSelectElement
    await act(async () => {
      sel.value = 'bay'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).toEqual({ person: 'bay' })
    expect(sel.value).toBe('bay')
    await m.unmount()
  })
  it('notes autosave 600 ms after the last keystroke, once', async () => {
    routes['PUT /api/lan/devices/aa:bb:cc:00:00:60'] = (c) => reply({ person: null, notes: (c.body as { notes: string }).notes, updated_by: 'marvin', updated_at: 'now' })
    const m = await render(<Host id="aa:bb:cc:00:00:60" />)
    vi.useFakeTimers()
    const ta = q(body(), '[data-testid=profile-notes]') as HTMLTextAreaElement
    await typeInto(ta, 'by the door')
    await typeInto(ta, 'by the front door')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
    await act(async () => { vi.advanceTimersByTime(150) })
    vi.useRealTimers()
    await settle()
    const puts = calls.filter((c) => c.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0].body).toEqual({ notes: 'by the front door' })
    expect(q(body(), '[data-testid=profile-saved]')).toBeTruthy()
    await m.unmount()
  })
  it('a member reads but cannot change: no status buttons, the select and notes are locked', async () => {
    role = 'member'
    const m = await render(<Host id="aa:bb:cc:00:00:50" />)
    expect(q(body(), '[data-testid=profile-approve]')).toBeNull()
    expect((q(body(), '[data-testid=profile-person]') as HTMLSelectElement).disabled).toBe(true)
    expect((q(body(), '[data-testid=profile-notes]') as HTMLTextAreaElement).readOnly).toBe(true)
    expect(body().textContent).toContain('Only owners and admins')
    expect(q(body(), '[data-testid=profile-select-lane]')).toBeNull() // no lane around this host
    await m.unmount()
  })
})

describe('LAN page', () => {
  it('has a route', () => {
    expect(parseRoute('#/lan')).toEqual({ name: 'lan' })
    expect(hrefFor({ name: 'lan' })).toBe('#/lan')
  })
  it('draws the gateway, the switch, the box and every device by status, with chips, counts, scan time and a legend', async () => {
    const m = await render(<LanPage />)
    await settle()
    await settle()
    const nodes = qa(m.el, '[data-testid=lan-node]')
    expect(nodes.map((n) => n.dataset.id).sort()).toEqual(['aa:bb:cc:00:00:50', 'aa:bb:cc:00:00:60', 'aa:bb:cc:00:00:70', 'aa:bb:cc:00:00:88', 'box', 'gateway', 'switch'].sort())
    expect(nodes.find((n) => n.dataset.id === 'aa:bb:cc:00:00:60')!.dataset.status).toBe('offline')
    expect(nodes.find((n) => n.dataset.id === 'aa:bb:cc:00:00:70')!.dataset.status).toBe('pending')
    expect(nodes.find((n) => n.dataset.id === 'aa:bb:cc:00:00:50')!.textContent).toContain('Bay Purcell') // assignment chip
    expect(qa(m.el, '[data-testid=lan-group]').map((g) => g.textContent)).toEqual(['pending approval (1)', 'denied (1)', 'online (1)', 'offline (1)'])
    const counts = q(m.el, '[data-testid=lan-counts]')!.textContent!
    expect(counts).toContain('Online')
    expect(q(m.el, '[data-testid=lan-scan]')!.textContent).toContain('Last scan')
    expect(qa(m.el, '[data-testid=lan-legend] li').length).toBe(9)
    expect(q(m.el, '.react-flow__minimap')).toBeTruthy()
    expect(q(m.el, '.react-flow__controls')).toBeTruthy()
    await m.unmount()
  })
  it('a click on a node opens its profile; search focuses the match and dims the rest', async () => {
    const m = await render(<LanPage />)
    await click(qa(m.el, '[data-testid=lan-node]').find((n) => n.dataset.id === 'aa:bb:cc:00:00:60'))
    expect(body().textContent).toContain('Printer')
    await click(q(document.body, '[data-testid=profile-close]'))
    await typeInto(q(m.el, '[data-testid=lan-search]') as HTMLInputElement, 'apple')
    await settle()
    expect(qa(m.el, '[data-testid=lan-hit]').map((h) => h.dataset.id)).toEqual(['aa:bb:cc:00:00:50'])
    const dim = (id: string) => qa(m.el, '[data-testid=lan-node]').find((n) => n.dataset.id === id)!.className.includes('opacity-30')
    expect(dim('aa:bb:cc:00:00:60')).toBe(true)
    expect(dim('aa:bb:cc:00:00:50')).toBe(false)
    await click(q(m.el, '[data-testid=lan-hit]'))
    expect(qa(m.el, '[data-testid=lan-node]').find((n) => n.dataset.id === 'aa:bb:cc:00:00:50')!.dataset.focused).toBe('true')
    await m.unmount()
  })
  it('says so when lan-watch is down and lets the person try again', async () => {
    routes['GET /api/lan/summary'] = () => reply({ error: 'lan-watch not reachable' }, 503)
    const m = await render(<LanPage />)
    expect(q(m.el, '[data-testid=lan-status]')!.textContent).toContain('not reachable')
    expect(qa(m.el, '[data-testid=lan-node]')).toHaveLength(0)
    await m.unmount()
  })
})

const nodeEl = (m: { el: HTMLElement }, id: string) => qa(m.el, '[data-testid=lan-node]').find((n) => n.dataset.id === id)!
const dimmed = (m: { el: HTMLElement }, id: string) => nodeEl(m, id).dataset.dim === 'true'
const chip = (m: { el: HTMLElement }, group: string, value: string) => qa(m.el, '[data-testid=lens-chip]').find((c) => c.dataset.group === group && c.dataset.value === value)
const IPHONE = 'aa:bb:cc:00:00:50'
const PRINTER = 'aa:bb:cc:00:00:60'
const classed = (over: Record<string, Partial<LanAssignment>>) => {
  routes['GET /api/lan/assignments'] = () => reply({ ...ASSIGN, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, ({ ...({ person: null, notes: '', updated_by: null, updated_at: null } as LanAssignment), ...ASSIGN[k], ...v })])) })
}

describe('classes in the model', () => {
  it('the Lenovo box is Search by default, everything else unclassified until a record says otherwise', () => {
    const m = buildLanModel(SUMMARY, { [IPHONE]: { person: 'bay', notes: '', updated_by: null, updated_at: null, class: 'personal_family' } })
    expect(m.box.cls).toBe('search')
    expect(m.devices.find((d) => d.mac === IPHONE)!.cls).toBe('personal_family')
    expect(m.devices.find((d) => d.mac === PRINTER)!.cls).toBeNull()
    expect(classCounts(m)).toEqual({ personal_family: 1, smart_home: 0, lcav: 0, search: 1, none: 4 })
    const overridden = buildLanModel(SUMMARY, { 'aa:bb:cc:00:00:01': { person: null, notes: '', updated_by: null, updated_at: null, class: 'lcav' } })
    expect(overridden.box.cls).toBe('lcav')
  })
  it('infers a device type from the vendor family and the name, and a link from what lan-watch says', () => {
    const m = buildLanModel({ ...SUMMARY, devices: [...SUMMARY.devices, { mac: 'aa:bb:cc:00:00:90', label: 'Porch cam', vendor: 'Hikvision', status: 'approved', online: true, connection: 'wifi' }] })
    const t = Object.fromEntries([m.gateway, m.box, ...m.devices].map((n) => [n.label, n.type]))
    expect(t).toMatchObject({ Router: 'network', 'This box': 'controllers', 'Bay iPhone': 'phones_laptops', Printer: 'other', 'Unknown Co': 'other', 'Porch cam': 'cameras' })
    expect(m.devices.find((d) => d.label === 'Porch cam')!.conn).toBe('wifi')
    expect(m.devices[0].conn).toBe('unknown')
    expect(m.box.conn).toBe('wired')
  })
  it('lenses combine (groups AND, chips in a group OR) and the activity buckets follow the reading time', () => {
    const m = buildLanModel(SUMMARY, ASSIGN)
    const now = Date.parse(SUMMARY.generated_at!)
    const hit = (l: Partial<typeof NO_LENS>) => lensPool(m).filter((n) => matchesLens(n, { ...NO_LENS, ...l }, now)).map((n) => n.label)
    expect(hit({})).toHaveLength(6)
    expect(hit({ types: ['phones_laptops'] })).toEqual(['Bay iPhone'])
    expect(hit({ types: ['phones_laptops', 'network'] })).toEqual(['Router', 'Bay iPhone'])
    expect(hit({ types: ['phones_laptops'], acts: ['stale'] })).toEqual([])
    expect(hit({ acts: ['stale'] })).toEqual(['Printer'])
    expect(hit({ acts: ['pending'] })).toEqual(['Unknown Co'])
    expect(hit({ conns: ['wired'] })).toEqual(['Router', 'This box'])
    expect(hit({ classes: ['none'] })).toHaveLength(5)
    expect([...activities(m.devices[0], now)].sort()).toEqual(['online', 'today', 'week'])
  })
})

describe('layout spacing', () => {
  it('scales the gaps between nodes, not the nodes, and clamps', () => {
    const m = buildLanModel(SUMMARY, ASSIGN)
    const at = (k: number) => {
      const l = layoutLan(m, undefined, k).nodes
      const get = (id: string) => l.find((n) => n.id === id)!
      return { gap: get(PRINTER).position.y - get(IPHONE).position.y, box: get('box').position.x, sw: get('switch').position.y, w: get(IPHONE).width }
    }
    const a = at(0.5), b = at(1), c = at(2)
    expect(a.w).toBe(c.w)
    expect(a.sw).toBeLessThan(b.sw)
    expect(c.sw).toBeGreaterThan(b.sw)
    expect(c.box).toBeLessThan(b.box)
    expect(at(99).sw).toBe(at(3).sw)
    expect(at(0).sw).toBe(at(0.25).sw)
  })
})

describe('LAN page: drawer, class, lenses, spacing', () => {
  it('opens the profile as a non-modal right drawer on a node click, swaps on another click, closes on Esc and on the Close pill', async () => {
    const m = await render(<LanPage />)
    expect(q(document.body, '[data-testid=device-drawer]')).toBeNull()
    await click(nodeEl(m, PRINTER))
    const drawer = q(document.body, '[data-testid=device-drawer]')!
    expect(drawer.dataset.side).toBe('right')
    expect(body().dataset.node).toBe(PRINTER)
    expect(q(document.body, '[data-slot=sheet-overlay]')).toBeNull() // no backdrop
    await click(nodeEl(m, IPHONE)) // the map is still interactive: one drawer, new content
    expect(qa(document.body, '[data-testid=device-drawer]')).toHaveLength(1)
    expect(body().dataset.node).toBe(IPHONE)
    expect(body().textContent).toContain('Bay iPhone')
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await settle()
    expect(q(document.body, '[data-testid=device-drawer]')).toBeNull()
    await click(nodeEl(m, PRINTER))
    await click(q(document.body, '[data-testid=profile-close]'))
    expect(q(document.body, '[data-testid=device-drawer]')).toBeNull()
    await m.unmount()
  })
  it('saving a class calls the route and recolours the node; the person picker lists Marvin and Bay only', async () => {
    routes['PUT /api/lan/devices/' + PRINTER] = (c) => reply({ person: null, notes: '', updated_by: 'marvin', updated_at: 'now', class: (c.body as { class: string }).class })
    const m = await render(<LanPage />)
    expect(nodeEl(m, PRINTER).dataset.class).toBeUndefined()
    expect(nodeEl(m, 'box').dataset.class).toBe('search') // pre-classified
    await click(nodeEl(m, PRINTER))
    expect(qa(body(), '[data-testid=profile-person] option').map((o) => o.textContent)).toEqual(['Unassigned', 'Marvin', 'Bay Purcell'])
    const sel = q(body(), '[data-testid=profile-class]') as HTMLSelectElement
    expect(qa(sel, 'option').map((o) => o.textContent)).toEqual(['Unclassified', 'Personal / family', 'Smart home', 'LCAV', 'Search'])
    await act(async () => {
      sel.value = 'lcav'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()
    expect(calls.find((c) => c.method === 'PUT' && c.url.endsWith(PRINTER))!.body).toEqual({ class: 'lcav' })
    expect(nodeEl(m, PRINTER).dataset.class).toBe('lcav')
    expect(nodeEl(m, PRINTER).textContent).toContain('LCAV')
    expect(q(body(), '[data-testid=profile-class-dot]')!.dataset.class).toBe('lcav')
    expect(q(m.el, '[data-testid=lan-legend-class][data-class=lcav]')!.textContent).toContain('1')
    await m.unmount()
  })
  it('a refused class save rolls back', async () => {
    routes['PUT /api/lan/devices/' + PRINTER] = () => reply({ error: 'x' }, 500)
    const m = await render(<LanPage />)
    await click(nodeEl(m, PRINTER))
    const sel = q(body(), '[data-testid=profile-class]') as HTMLSelectElement
    await act(async () => { sel.value = 'smart_home'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await settle()
    expect(nodeEl(m, PRINTER).dataset.class).toBeUndefined()
    expect(q(body(), '[data-testid=profile-error]')).toBeTruthy()
    await m.unmount()
  })
  it('lenses dim what does not match (the wires stay), count the matches, combine, clear and are remembered', async () => {
    classed({ [IPHONE]: { class: 'personal_family' }, [PRINTER]: { class: 'smart_home' } })
    const m = await render(<LanPage />)
    expect(q(m.el, '[data-testid=lens-count]')!.textContent).toBe('6 devices')
    expect(qa(m.el, '[data-testid=lens-chip][data-group=class]').map((c) => c.textContent)).toEqual(['Personal / family1', 'Smart home1', 'LCAV0', 'Search1', 'Unclassified3'])
    await click(chip(m, 'class', 'personal_family'))
    expect(q(m.el, '[data-testid=lens-count]')!.textContent).toBe('1 of 6 devices match')
    expect(dimmed(m, IPHONE)).toBe(false)
    expect(dimmed(m, PRINTER)).toBe(true)
    expect(dimmed(m, 'box')).toBe(true)
    expect(dimmed(m, 'switch')).toBe(false) // the hub keeps the wires readable
    expect(qa(m.el, '[data-testid=lan-node]')).toHaveLength(7) // dimmed, not removed
    await click(chip(m, 'class', 'smart_home')) // same group: alternatives
    expect(q(m.el, '[data-testid=lens-count]')!.textContent).toBe('2 of 6 devices match')
    await click(chip(m, 'act', 'stale')) // other group: both must hold
    expect(q(m.el, '[data-testid=lens-count]')!.textContent).toBe('1 of 6 devices match')
    expect(dimmed(m, PRINTER)).toBe(false)
    expect(dimmed(m, IPHONE)).toBe(true)
    await typeInto(q(m.el, '[data-testid=lan-search]') as HTMLInputElement, 'nothing like this')
    expect(q(m.el, '[data-testid=lens-count]')!.textContent).toBe('0 of 6 devices match')
    const saved = JSON.parse(localStorage.getItem('sov.lan.v1.marvin')!)
    expect(saved.lens).toEqual({ classes: ['personal_family', 'smart_home'], types: [], conns: [], acts: ['stale'], q: 'nothing like this' })
    await m.unmount()
    const again = await render(<LanPage />) // a new visit on this device starts from the saved lens
    expect(q(again.el, '[data-testid=lens-count]')!.textContent).toBe('0 of 6 devices match')
    expect(chip(again, 'act', 'stale')!.getAttribute('aria-pressed')).toBe('true')
    await click(q(again.el, '[data-testid=lens-clear]'))
    expect(q(again.el, '[data-testid=lens-count]')!.textContent).toBe('6 devices')
    expect(qa(again.el, '[data-testid=lan-node]').some((n) => n.dataset.dim === 'true')).toBe(false)
    await again.unmount()
  })
  it('the type, link and activity chips filter the same way', async () => {
    const m = await render(<LanPage />)
    await click(chip(m, 'type', 'phones_laptops'))
    expect(dimmed(m, IPHONE)).toBe(false)
    expect(dimmed(m, PRINTER)).toBe(true)
    await click(chip(m, 'type', 'phones_laptops'))
    await click(chip(m, 'conn', 'wired'))
    expect(q(m.el, '[data-testid=lens-count]')!.textContent).toBe('2 of 6 devices match')
    await click(chip(m, 'conn', 'wired'))
    await click(chip(m, 'act', 'pending'))
    expect(dimmed(m, 'aa:bb:cc:00:00:70')).toBe(false)
    expect(q(m.el, '[data-testid=lens-count]')!.textContent).toBe('1 of 6 devices match')
    await m.unmount()
  })
  it('the spacing slider and Alt plus and Alt minus change the spacing, are remembered, and Fit is there', async () => {
    const m = await render(<LanPage />)
    const slider = q(m.el, '[data-testid=lan-spacing]') as HTMLInputElement
    expect(q(m.el, '[data-testid=lan-spacing-value]')!.textContent).toBe('1.00x')
    await typeInto(slider, '2')
    expect(q(m.el, '[data-testid=lan-spacing-value]')!.textContent).toBe('2.00x')
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal', key: '=', altKey: true, bubbles: true })) })
    expect(q(m.el, '[data-testid=lan-spacing-value]')!.textContent).toBe('2.25x')
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus', key: '-', altKey: true, bubbles: true })) })
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus', key: '-', altKey: true, bubbles: true })) })
    expect(q(m.el, '[data-testid=lan-spacing-value]')!.textContent).toBe('1.75x')
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus', key: '-', bubbles: true })) }) // no Alt: ignored
    expect(q(m.el, '[data-testid=lan-spacing-value]')!.textContent).toBe('1.75x')
    expect(JSON.parse(localStorage.getItem('sov.lan.v1.marvin')!).spacing).toBe(1.75)
    expect(q(m.el, '[data-testid=lan-fit]')).toBeTruthy()
    await click(q(m.el, '[data-testid=lan-fit]'))
    await m.unmount()
    const again = await render(<LanPage />)
    expect(q(again.el, '[data-testid=lan-spacing-value]')!.textContent).toBe('1.75x')
    await again.unmount()
  })
})

describe('Devices page', () => {
  it('shows a class picker per console device and saves it by MAC', async () => {
    routes['GET /api/devices'] = () => reply([
      { id: 'dev-aaaa1111', name: 'Marvin laptop', person_id: 'marvin', last_ip: '192.168.1.20', last_mac: 'AA:BB:CC:00:00:20', last_seen: '2026-10-26T09:00:00Z' },
      { id: 'dev-bbbb2222', name: 'Old phone', person_id: 'bay', last_ip: null, last_mac: null, last_seen: null },
    ])
    routes['GET /api/lan/assignments'] = () => reply({ 'aa:bb:cc:00:00:20': { person: null, notes: '', updated_by: null, updated_at: null, class: 'lcav' } })
    routes['PUT /api/lan/devices/aa:bb:cc:00:00:20'] = (c) => reply({ person: null, notes: '', updated_by: 'marvin', updated_at: 'now', class: (c.body as { class: string }).class })
    const m = await render(<DevicesPage />)
    const pickers = qa(m.el, '[data-testid=device-class]') as HTMLSelectElement[]
    expect(pickers).toHaveLength(2)
    expect(pickers[0].value).toBe('lcav')
    expect(pickers[0].disabled).toBe(false)
    expect(pickers[1].disabled).toBe(true) // no MAC, nothing to key the class on
    await act(async () => { pickers[0].value = 'search'; pickers[0].dispatchEvent(new Event('change', { bubbles: true })) })
    await settle()
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ class: 'search' })
    expect((qa(m.el, '[data-testid=device-class]')[0] as HTMLSelectElement).value).toBe('search')
    await m.unmount()
  })
})
