// @vitest-environment happy-dom
// The dock and the standing surfaces, rendered with fixtures against a mocked console API (no network, no lan-watch).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import { clearContext } from '@/thread/contextStore'
import { AppProvider } from '@/app/AppContext'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FIXTURES } from '@/cards/schemas'
import { shortHash } from '@/dock/DockHost'
import { LaneView } from '@/thread/LaneView'

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

const reply = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, (c: Call) => Promise<Response>> = {}
let role = 'owner'
let narrow = false
let thread: unknown[] = []

const stored = (id: string, kind: string, at: string, over: Record<string, unknown> = {}, lane = 'hardware') => {
  const c = JSON.parse(JSON.stringify((FIXTURES as Record<string, { valid: object }>)[kind].valid))
  return { id, lane, at, role: 'card', card: { ...c, id, lane, at, ...over } }
}
const ask = (id: string, lane: string, rid: string) => ({ id, lane, lane_title: lane === 'hardware' ? 'Hardware' : 'Marvin and Gilfoyle', at: '2026-10-26T10:00:02Z', role: 'ask', state: 'open', ask: { request_id: rid, action: 'shell', resources: ['rm -rf /tmp/x'], message: 'ok to run?', metadata: null, source: null } })

const LAN = {
  generated_at: '2026-10-26T10:00:00Z',
  box: { iface: 'enp2s0', ip: '192.168.1.10', mac: 'aa:bb:cc:00:00:01' },
  counts: { total: 5, online: 3, pending: 1, denied: 1 },
  devices: [
    { mac: 'aa:bb:cc:00:00:01', label: 'Lenovo', vendor: 'Lenovo', status: 'approved', online: true, is_box: true, last_ip: '192.168.1.10' },
    { mac: 'aa:bb:cc:00:00:50', label: 'Bay iPhone', vendor: 'Apple', status: 'approved', online: true, last_ip: '192.168.1.50', first_seen: '2026-10-01T10:00:00Z', last_seen: '2026-10-26T09:58:00Z' },
    { mac: 'aa:bb:cc:00:00:60', label: 'Printer', vendor: 'HP', status: 'approved', online: false, last_ip: '192.168.1.60' },
    { mac: 'aa:bb:cc:00:00:70', label: null, vendor: 'Unknown Co', status: 'pending', online: true, last_ip: '192.168.1.70' },
    { mac: 'aa:bb:cc:00:00:88', label: 'Seen before', vendor: null, status: 'denied', online: false },
  ],
}
const IFACES = [
  { name: 'lo', state: 'UNKNOWN', addrs: ['127.0.0.1/8'], mac: null, mtu: 65536, speed_mbps: null, carrier_changes: null, rx: { bytes: 1, packets: 1, errors: 0, dropped: 0 }, tx: { bytes: 1, packets: 1, errors: 0, dropped: 0 } },
  { name: 'enp2s0', state: 'UP', addrs: ['192.168.1.10/24'], mac: 'aa:bb:cc:00:00:01', mtu: 1500, speed_mbps: 1000, carrier_changes: 2, rx: { bytes: 5000, packets: 40, errors: 3, dropped: 1 }, tx: { bytes: 4000, packets: 30, errors: 0, dropped: 0 } },
]

beforeEach(() => {
  for (const l of ['hardware', 'dm-marvin', 'lab']) clearContext(l)
  calls = []
  role = 'owner'
  narrow = false
  thread = []
  routes = {}
  try { localStorage.clear() } catch { /* ignore */ }
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: narrow, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  if (!('ResizeObserver' in globalThis)) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  ;(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class { m22 = 1 }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const c: Call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
      calls.push(c)
      const path = url.split('?')[0]
      const r = routes[c.method + ' ' + url] ?? routes[c.method + ' ' + path]
      if (r) return r(c)
      if (url === '/api/me') return reply({ person: 'marvin', name: 'Marvin', role, device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, people: [{ id: 'marvin', name: 'Marvin' }] })
      if (url === '/api/health') return reply({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return reply((lanesJson as { id: string }[]).map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: [] })))
      if (url.endsWith('/messages')) return reply(thread)
      if (path.endsWith('/pins')) return reply({ lane: 'x', pins: [] })
      if (path.endsWith('/scratch')) return reply({ lane: 'x', text: '', version: 0, updated_at: null, updated_by: null })
      if (path.endsWith('/files')) return reply({ lane: 'x', files: [], truncated: false })
      if (path === '/api/asks') return reply([])
      if (path === '/api/lan/summary') return reply(LAN)
      if (path === '/api/box/interfaces') return reply(IFACES)
      return reply({})
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
async function mount(lane: string) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <AppProvider>
          <SidebarProvider>
            <LaneView laneId={lane} />
          </SidebarProvider>
        </AppProvider>
      </TooltipProvider>,
    )
  })
  await settle()
  return { el, unmount: () => act(async () => root.unmount()) }
}
const sentTo = (m: string, u: string) => calls.filter((c) => c.method === m && c.url.startsWith(u))
const q = (el: ParentNode, sel: string) => el.querySelector(sel) as HTMLElement | null
const qa = (el: ParentNode, sel: string) => [...el.querySelectorAll(sel)] as HTMLElement[]
const tab = (el: ParentNode, id: string) => q(el, `[data-testid=dock-tab][data-surface="${id}"]`)
const panel = (el: ParentNode, id: string) => q(el, `[data-testid=dock-panel][data-surface="${id}"]`)
const button = (el: ParentNode, label: string) => qa(el, 'button').find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label)
const click = async (e: Element | null | undefined) => {
  expect(e).toBeTruthy()
  // SVG nodes have no .click() in happy-dom, so dispatch the event.
  await act(async () => { e!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  await settle()
}
// The file browser is Drive style: a click selects, a double click opens.
const dbl = async (e: Element | null | undefined) => {
  expect(e).toBeTruthy()
  await act(async () => { e!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); e!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })) })
  await settle()
}
// A topology node opens its profile; "Select in lane" in the profile sets the lane selection.
const selectNode = async (nodes: HTMLElement[], label: string | ((n: HTMLElement) => boolean)) => {
  await click(nodes.find((n) => (typeof label === 'string' ? n.getAttribute('aria-label')?.startsWith(label) : label(n))))
  await click(q(document.body, '[data-testid=profile-select-lane]'))
}
const type = async (e: HTMLTextAreaElement, text: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    set.call(e, text)
    e.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}
const rightClick = async (e: Element | null | undefined) => {
  expect(e).toBeTruthy()
  await act(async () => { e!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 })) })
  await settle()
}
const menuItem = (label: string) => qa(document.body, '[role=menuitem]').find((i) => i.textContent?.trim() === label) ?? null
const menuLabels = () => qa(document.body, '[role=menuitem]').map((i) => i.textContent?.trim())
const saved = (lane: string) => JSON.parse(localStorage.getItem('sov.dock.v1.marvin.' + lane) ?? 'null')
const isVisible = (e: HTMLElement | null) => !!e && !e.hidden && !e.className.split(' ').includes('hidden')

describe('the surface menu', () => {
  it('renders no close button, and right click on a tab or the panel header lists the items', async () => {
    const m = await mount('dm-marvin')
    expect(q(m.el, '[aria-label="Close surface"]')).toBeNull()
    expect(qa(m.el, '[data-testid=dock-tab] svg.lucide-x, [data-testid=dock-panel-header] svg.lucide-x').length).toBe(0)
    await rightClick(tab(m.el, 'scratch'))
    expect(menuLabels()).toEqual(['Close', 'Remove from defaults', 'Expand', 'Move up', 'Move down', 'Hide dock'])
    await m.unmount()
    const h = await mount('hardware')
    await rightClick(q(h.el, '[data-testid=dock-panel-header]'))
    expect(menuLabels()).toEqual(['Close', 'Remove from defaults', 'Collapse', 'Move up', 'Move down', 'Hide dock'])
    await h.unmount()
  })
  it('the panel header has no buttons: the main header dock button and the tab menu carry everything', async () => {
    const m = await mount('dm-marvin')
    const header = q(m.el, '[data-testid=dock-panel-header]')!
    expect(header.querySelectorAll('button').length).toBe(0)
    expect(q(m.el, '[aria-label="Collapse panel"]')).toBeNull()
    expect(q(m.el, '[aria-label="Surface menu"]')).toBeNull()
    expect(q(m.el, '[data-testid=surface-menu-button]')).toBeNull()
    await m.unmount()
  })
  it('the quick access icons are focusable and open the same menu from the keyboard (Shift F10 or the Menu key)', async () => {
    const m = await mount('dm-marvin')
    const t = tab(m.el, 'scratch')!
    expect(t.tagName).toBe('BUTTON')
    expect(t.tabIndex).toBeGreaterThanOrEqual(0)
    t.focus()
    await act(async () => { t.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })) })
    await settle()
    expect(menuLabels()).toEqual(['Close', 'Remove from defaults', 'Expand', 'Move up', 'Move down', 'Hide dock'])
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await settle()
    const a = tab(m.el, 'approvals')!
    await act(async () => { a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true })) })
    await settle()
    expect(menuLabels()).toContain('Hide dock')
    expect(menuLabels()).toContain('Collapse')
    await m.unmount()
  })
  it('Enter on a quick access icon is the button click: it opens that surface', async () => {
    const m = await mount('dm-marvin')
    await click(tab(m.el, 'scratch'))
    expect(q(m.el, '[data-testid=dock-panel-title]')!.textContent).toBe('Scratchpad')
    await m.unmount()
  })
  it('Close and Hide dock work from the menu', async () => {
    const m = await mount('dm-marvin')
    await rightClick(tab(m.el, 'approvals'))
    await click(menuItem('Close'))
    expect(tab(m.el, 'approvals')).toBeNull()
    await rightClick(tab(m.el, 'scratch'))
    await click(menuItem('Hide dock'))
    expect(q(m.el, '[data-testid=dock]')).toBeNull()
    await m.unmount()
  })
  it('Make default is stored per device and applies the next time the lane opens fresh', async () => {
    const m = await mount('dm-marvin')
    await rightClick(tab(m.el, 'scratch'))
    await click(menuItem('Remove from defaults'))
    expect(JSON.parse(localStorage.getItem('sov.dock.defaults.v1.marvin.dm-marvin')!)).toEqual(['approvals'])
    await rightClick(tab(m.el, 'scratch'))
    expect(menuLabels()[1]).toBe('Make default for this lane')
    await click(menuItem('Make default for this lane'))
    await rightClick(tab(m.el, 'scratch'))
    await click(menuItem('Remove from defaults'))
    await m.unmount()
    localStorage.removeItem('sov.dock.v1.marvin.dm-marvin') // a fresh layout on this device
    const again = await mount('dm-marvin')
    expect(qa(again.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['approvals'])
    await again.unmount()
  })
  it('reorder with Move up and Move down persists in the dock layout', async () => {
    const m = await mount('dm-marvin')
    await rightClick(tab(m.el, 'scratch'))
    await click(menuItem('Move up'))
    expect(qa(m.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['scratch', 'approvals'])
    await rightClick(tab(m.el, 'scratch'))
    expect(menuItem('Move up')!.getAttribute('aria-disabled') ?? menuItem('Move up')!.hasAttribute('data-disabled')).toBeTruthy()
    await click(menuItem('Move down'))
    expect(saved('dm-marvin').surfaces.map((x: { id: string }) => x.id)).toEqual(['approvals', 'scratch'])
    await rightClick(tab(m.el, 'scratch'))
    await click(menuItem('Move up'))
    await m.unmount()
    const again = await mount('dm-marvin')
    expect(qa(again.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['scratch', 'approvals'])
    await again.unmount()
  })
})

describe('the dock shell', () => {
  it('a DM lane starts with approval queue and scratchpad; one panel is expanded', async () => {
    const m = await mount('dm-marvin')
    expect(qa(m.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['approvals', 'scratch'])
    expect(q(m.el, '[data-testid=dock-panel-title]')!.textContent).toBe('Approval queue')
    expect(isVisible(panel(m.el, 'approvals'))).toBe(true)
    expect(isVisible(panel(m.el, 'scratch'))).toBe(false)
    await m.unmount()
  })
  it('the hardware lane starts with topology, interface health and lane files', async () => {
    const m = await mount('hardware')
    expect(qa(m.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['topology', 'iface', 'files'])
    await m.unmount()
  })
  it('expand and collapse never lose state: a scratchpad draft survives a collapse and a tab switch', async () => {
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply({ lane: 'dm-marvin', text: 'old', version: 1, updated_at: '2026-10-26T09:00:00Z', updated_by: { person: 'marvin' } })
    routes['PUT /api/lanes/dm-marvin/scratch'] = () => new Promise<Response>(() => {}) // the save never lands
    const m = await mount('dm-marvin')
    await click(tab(m.el, 'scratch'))
    const ta = () => q(m.el, '[data-testid=scratch-text]') as HTMLTextAreaElement
    expect(ta().value).toBe('old')
    await type(ta(), 'old plus a draft')
    await click(tab(m.el, 'scratch')) // clicking the open tab collapses the dock to tabs
    expect(q(m.el, '[data-testid=dock]')!.dataset.expanded).toBe('false')
    expect(qa(m.el, '[data-testid=dock-tab]').length).toBe(2)
    await click(tab(m.el, 'approvals'))
    await click(tab(m.el, 'scratch'))
    expect(ta().value).toBe('old plus a draft')
    expect(q(m.el, '[data-testid=scratch-status]')!.textContent).toContain('Saving')
    await m.unmount()
  })
  it('the draggable divider is bounded to 360..520 px and the layout is saved per device', async () => {
    const m = await mount('dm-marvin')
    const div = q(m.el, '[data-testid=dock-divider]')!
    expect(div.getAttribute('aria-valuenow')).toBe('420')
    for (let i = 0; i < 20; i++) await act(async () => { div.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })) })
    expect(div.getAttribute('aria-valuenow')).toBe('520')
    for (let i = 0; i < 40; i++) await act(async () => { div.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    expect(div.getAttribute('aria-valuenow')).toBe('360')
    expect((q(m.el, '[data-testid=dock-panel-area]')!.parentElement as HTMLElement).style.width).toBe('360px')
    expect(saved('dm-marvin')).toMatchObject({ v: 1, width: 360, hidden: false })
    await m.unmount()
  })
  it('hide gives the conversation the full width, restore brings the dock back, and a reload remembers the choice', async () => {
    const m = await mount('dm-marvin')
    await click(q(m.el, '[data-testid=dock-toggle]'))
    expect(q(m.el, '[data-testid=dock]')).toBeNull()
    expect(saved('dm-marvin').hidden).toBe(true)
    await m.unmount()
    const again = await mount('dm-marvin')
    expect(q(again.el, '[data-testid=dock]')).toBeNull()
    await click(q(again.el, '[data-testid=dock-toggle]'))
    expect(q(again.el, '[data-testid=dock]')).toBeTruthy()
    expect(saved('dm-marvin').hidden).toBe(false)
    await again.unmount()
  })
  it('localStorage that throws does not break the lane', async () => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('full') }
    try {
      const m = await mount('dm-marvin')
      expect(q(m.el, '[data-testid=dock]')).toBeTruthy()
      await m.unmount()
    } finally {
      Storage.prototype.setItem = real
    }
  })
  it('the Surfaces menu lists what the lane supports, stays open and toggles each item with a check', async () => {
    const m = await mount('lab')
    expect(qa(m.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['scratch', 'files'])
    const trigger = q(m.el, '[data-testid=surfaces-menu]')!
    await act(async () => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await settle()
    const item = (id: string) => q(document.body, `[data-testid=surface-item-${id}]`)!
    expect(item('approvals')).toBeTruthy()
    expect(qa(document.body, '[data-testid^=surface-item-]').length).toBe(5)
    expect(qa(document.body, '[data-testid^=surface-item-]').some((i) => i.textContent?.includes('Pinned'))).toBe(false)
    expect(item('scratch').textContent).toContain('default')
    expect(item('scratch').getAttribute('aria-checked')).toBe('true')
    expect(item('approvals').getAttribute('aria-checked')).toBe('false')
    // opens, and the menu is still there
    await click(item('approvals'))
    expect(tab(m.el, 'approvals')).toBeTruthy()
    expect(q(m.el, '[data-testid=dock-panel-title]')!.textContent).toBe('Approval queue')
    expect(q(document.body, '[role=menu]')).toBeTruthy()
    expect(item('approvals').getAttribute('aria-checked')).toBe('true')
    // a second item without reopening
    await click(item('topology'))
    expect(tab(m.el, 'topology')).toBeTruthy()
    expect(q(document.body, '[role=menu]')).toBeTruthy()
    // clicking a checked item closes that surface, still open
    await click(item('approvals'))
    expect(tab(m.el, 'approvals')).toBeNull()
    expect(item('approvals').getAttribute('aria-checked')).toBe('false')
    expect(q(document.body, '[role=menu]')).toBeTruthy()
    // Esc closes it
    await act(async () => { q(document.body, '[role=menu]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    await settle()
    expect(q(document.body, '[role=menu]')).toBeNull()
    await m.unmount()
  })
  it('the Surfaces menu closes on a click outside it', async () => {
    const m = await mount('lab')
    const trigger = q(m.el, '[data-testid=surfaces-menu]')!
    await act(async () => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    await settle()
    expect(q(document.body, '[role=menu]')).toBeTruthy()
    await act(async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })) })
    await settle()
    expect(q(document.body, '[role=menu]')).toBeNull()
    await m.unmount()
  })
  it('a card Open puts its surface in the dock, replacing the sheet, and a second card keeps the first as a tab', async () => {
    thread = [stored('c1', 'alert', '2026-10-26T10:00:00Z'), stored('c2', 'file_retrieval', '2026-10-26T10:00:04Z')]
    const m = await mount('hardware')
    const openOf = (id: string) => button(q(m.el, `[data-card-id="${id}"]`)!, 'Open') ?? qa(q(m.el, `[data-card-id="${id}"]`)!, 'button').find((b) => b.textContent === 'Open')
    await click(openOf('c1'))
    expect(document.querySelector('[data-testid=surface-sheet]')).toBeNull()
    expect(panel(m.el, 'card:c1')!.querySelector('[data-testid=alert-surface]')).toBeTruthy()
    expect(q(m.el, '[data-testid=dock-panel-title]')!.textContent).toContain('Alert')
    await click(qa(q(m.el, '[data-card-id="c2"]')!, 'button').find((b) => b.textContent === 'Open'))
    // a file card does not get a tab of its own: it opens inside Lane files
    expect(tab(m.el, 'card:c2')).toBeNull()
    expect(panel(m.el, 'card:c2')).toBeNull()
    expect(isVisible(panel(m.el, 'files'))).toBe(true)
    expect(panel(m.el, 'files')!.querySelector('[data-testid=file-preview]')).toBeTruthy()
    expect(tab(m.el, 'card:c1')).toBeTruthy()
    expect(saved('hardware').surfaces.map((s: { id: string }) => s.id)).toContain('card:c1')
    await m.unmount()
  })
  it('an open action marked auto opens the surface once, and not again after a reload', async () => {
    const auto = stored('c7', 'alert', '2026-10-26T10:00:00Z', { actions: [{ id: 'open', label: 'Open', kind: 'open', auto: true }] })
    thread = [auto]
    const m = await mount('hardware')
    expect(tab(m.el, 'card:c7')).toBeTruthy()
    expect(q(m.el, '[data-testid=dock-panel-title]')!.textContent).toContain('Alert')
    expect(q(m.el, '[aria-label="Close surface"]')).toBeNull()
    await rightClick(tab(m.el, 'card:c7'))
    await click(menuItem('Close'))
    expect(tab(m.el, 'card:c7')).toBeNull()
    await m.unmount()
    const again = await mount('hardware')
    expect(tab(again.el, 'card:c7')).toBeNull()
    expect(saved('hardware').auto).toContain('c7')
    await again.unmount()
  })
  it('under 900 px the dock is a bottom sheet, raised by the dock button', async () => {
    narrow = true
    const m = await mount('dm-marvin')
    expect(q(m.el, '[data-testid=dock]')).toBeNull()
    expect(document.querySelector('[data-testid=dock-sheet]')).toBeNull()
    await click(q(m.el, '[data-testid=dock-toggle]'))
    const sheet = document.querySelector('[data-testid=dock-sheet]')!
    expect(sheet).toBeTruthy()
    expect(sheet.getAttribute('data-side')).toBe('bottom')
    expect(sheet.querySelectorAll('[data-testid=dock-tab]').length).toBe(2)
    await m.unmount()
  })
})

describe('approval queue', () => {
  it('lists open asks across lanes and answers inline through the same reply route', async () => {
    routes['GET /api/asks'] = () => reply([ask('a1', 'dm-marvin', 'q1'), ask('a2', 'hardware', 'q2')])
    routes['POST /api/lanes/hardware/asks/q2/reply'] = () => reply({ ask: { ...ask('a2', 'hardware', 'q2'), state: 'once', replied_by: { person: 'marvin', device_name: 'Laptop' }, replied_at: '2026-10-26T10:05:00Z' } })
    const m = await mount('dm-marvin')
    const p = panel(m.el, 'approvals')!
    expect(q(p, '[data-testid=queue-count]')!.textContent).toBe('2 waiting')
    expect(qa(p, 'section h3').map((h) => h.textContent)).toEqual(['Marvin and Gilfoyle', 'Hardware'])
    expect(qa(p, '[data-testid=ask-card]').length).toBe(2)
    const second = qa(p, '[data-testid=ask-card]')[1]
    await click(qa(second, 'button').find((b) => /once/i.test(b.textContent ?? '')))
    const post = calls.find((c) => c.url === '/api/lanes/hardware/asks/q2/reply')!
    expect(post.method).toBe('POST')
    expect(post.body).toEqual({ decision: 'once' })
    expect(qa(p, '[data-testid=ask-card]').length).toBe(1)
    expect(q(p, '[data-testid=queue-count]')!.textContent).toBe('1 waiting')
    await m.unmount()
  })
  it('shows the scope line per ask and offers Always only where the policy allows it', async () => {
    const withScope = (a: ReturnType<typeof ask>, scope: Record<string, unknown>) => ({ ...a, ask: { ...a.ask, scope } })
    routes['GET /api/asks'] = () =>
      reply([
        withScope(ask('a1', 'dm-marvin', 'q1'), { host: 'lenovo', command_class: 'curl', always_allowed: false }),
        withScope(ask('a2', 'hardware', 'q2'), { host: 'lenovo', command_class: 'uptime', always_allowed: true }),
      ])
    const m = await mount('dm-marvin')
    const p = panel(m.el, 'approvals')!
    const cards = qa(p, '[data-testid=ask-card]')
    expect(cards.map((c) => q(c, '[data-testid=ask-scope]')!.textContent)).toEqual(['lenovo, curl', 'lenovo, uptime'])
    const always = (c: Element) => qa(c, 'button').some((b) => b.textContent?.trim() === 'Always')
    expect(cards.map(always)).toEqual([false, true])
    await m.unmount()
  })
  it('a member who is not an owner sees the asks but cannot answer them', async () => {
    role = 'member'
    routes['GET /api/asks'] = () => reply([ask('a1', 'dm-marvin', 'q1')])
    const m = await mount('dm-marvin')
    const p = panel(m.el, 'approvals')!
    expect(p.textContent).toContain('Only an owner can answer')
    expect(qa(p, 'button').filter((b) => /once|always|reject|deny|allow/i.test(b.textContent ?? '')).length).toBe(0)
    await m.unmount()
  })
  it('says so when nothing is waiting and when the queue cannot be read', async () => {
    const m = await mount('dm-marvin')
    expect(q(panel(m.el, 'approvals')!, '[data-testid=queue-count]')!.textContent).toBe('Nothing waiting')
    await m.unmount()
    routes['GET /api/asks'] = () => reply({ error: 'x' }, 500)
    const bad = await mount('dm-marvin')
    expect(panel(bad.el, 'approvals')!.textContent).toContain('could not be read')
    await bad.unmount()
  })
})

describe('no pinned context', () => {
  it('the surface is gone: not in a DM dock, not in the menu, and the pins route is never called', async () => {
    const m = await mount('dm-marvin')
    expect(tab(m.el, 'pinned')).toBeNull()
    expect(q(m.el, '[data-testid=pinned-context]')).toBeNull()
    expect(m.el.textContent).not.toContain('Pinned context')
    expect(calls.some((c) => c.url.endsWith('/pins'))).toBe(false)
    await m.unmount()
  })
  it('a layout saved with the old Pinned context tab drops it on load', async () => {
    localStorage.setItem('sov.dock.v1.marvin.dm-marvin', JSON.stringify({ v: 1, surfaces: [{ id: 'approvals', kind: 'standing', title: 'Approval queue' }, { id: 'pinned', kind: 'standing', title: 'Pinned context' }, { id: 'scratch', kind: 'standing', title: 'Scratchpad' }], active: 'pinned', hidden: false, width: 420, auto: [] }))
    const m = await mount('dm-marvin')
    expect(qa(m.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['approvals', 'scratch'])
    await m.unmount()
  })
  it('the selection chip follows the lane selection', async () => {
    const m = await mount('hardware')
    await selectNode(qa(m.el, '[data-testid=lan-node]'), 'Bay iPhone')
    expect(q(m.el, '[data-testid=selection-chip]')!.textContent).toContain('Bay iPhone')
    await m.unmount()
  })
})

describe('no changes summary card', () => {
  it('a changes item in the thread renders nothing', async () => {
    thread = [
      { id: 'm1', lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'person', text: 'edit the docs', signature: { person: 'marvin' } },
      { id: 'c1', lane: 'hardware', at: '2026-10-26T10:00:05Z', role: 'changes', files: [{ path: 'docs/a.md', additions: 1, deletions: 1, diff: '@@ -1 +1 @@\n-old\n+new', truncated: false }] },
    ]
    const m = await mount('hardware')
    expect(m.el.textContent).toContain('edit the docs')
    expect(q(m.el, '[data-testid=changes-card]')).toBeNull()
    expect(m.el.textContent).not.toMatch(/Changed \d+ files?/)
    await m.unmount()
  })
})

describe('scratchpad', () => {
  const note = (text: string, version: number, by: object | null = { person: 'marvin' }) => ({ lane: 'dm-marvin', text, version, updated_at: '2026-10-26T09:00:00Z', updated_by: by })
  const puts = () => calls.filter((c) => c.method === 'PUT' && c.url === '/api/lanes/dm-marvin/scratch')
  const ta = (m: { el: HTMLElement }) => q(m.el, '[data-testid=scratch-text]') as HTMLTextAreaElement
  const status = (m: { el: HTMLElement }) => q(m.el, '[data-testid=scratch-status]')!.textContent
  // Fake timers only after the mount, so the lane loads on real ones.
  const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
  // settle() waits on a real timer, so once the clock is fake the helpers below only flush React.
  const typeF = async (e: HTMLTextAreaElement, text: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => { set.call(e, text); e.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  const clickF = async (e: Element | null | undefined) => {
    expect(e).toBeTruthy()
    await act(async () => { e!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  afterEach(() => vi.useRealTimers())

  it('has no Save button; it shows who wrote the note, in plain type with room between lines', async () => {
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(note('# plan', 3, { person: 'gilfoyle', via: 'harness' }))
    const m = await mount('dm-marvin')
    await click(tab(m.el, 'scratch'))
    const p = panel(m.el, 'scratch')!
    expect(button(p, 'Save')).toBeUndefined()
    expect(status(m)).toContain('Version 3, by Gilfoyle')
    expect(ta(m).className).not.toContain('font-mono')
    expect(ta(m).className).toContain('leading-relaxed')
    await m.unmount()
  })
  it('autosaves 600 ms after typing stops, on the version it loaded, and says Saved just now', async () => {
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(note('# plan', 3))
    routes['PUT /api/lanes/dm-marvin/scratch'] = (c) => reply(note((c.body as { text: string }).text, 4))
    const m = await mount('dm-marvin')
    vi.useFakeTimers()
    await clickF(tab(m.el, 'scratch'))
    await typeF(ta(m), '# plan\n- a')
    await tick(400)
    await typeF(ta(m), '# plan\n- ab') // typing again restarts the wait
    await tick(599)
    expect(puts().length).toBe(0)
    expect(status(m)).toBe('Saving...')
    await tick(1)
    expect(puts().length).toBe(1)
    expect(puts()[0].body).toEqual({ text: '# plan\n- ab', base_version: 3 })
    await tick(0)
    expect(status(m)).toBe('Saved just now')
    await m.unmount()
  })
  it('saves on blur at once, and Cmd S saves at once and shows Saved', async () => {
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(note('a', 1))
    routes['PUT /api/lanes/dm-marvin/scratch'] = (c) => reply(note((c.body as { text: string }).text, 1 + puts().length))
    const m = await mount('dm-marvin')
    vi.useFakeTimers()
    await clickF(tab(m.el, 'scratch'))
    await typeF(ta(m), 'ab')
    await act(async () => { ta(m).dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    await tick(0)
    expect(puts().length).toBe(1)
    await typeF(ta(m), 'abc')
    await act(async () => { ta(m).dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })) })
    await tick(0)
    expect(puts().length).toBe(2)
    expect(puts()[1].body).toEqual({ text: 'abc', base_version: 2 })
    expect(status(m)).toContain('Saved')
    // Cmd S on a clean note writes nothing and still says Saved
    await act(async () => { ta(m).dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })) })
    await tick(0)
    expect(puts().length).toBe(2)
    expect(status(m)).toContain('Saved')
    await m.unmount()
  })
  it('a version mismatch pulls the other side and merges its new lines after ours, never overwriting', async () => {
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(note('one\ntwo\n', 1))
    let first = true
    routes['PUT /api/lanes/dm-marvin/scratch'] = (c) => {
      if (first) {
        first = false
        return reply({ error: 'version_conflict', current: note('one\ntwo\nGilfoyle: rack 2 checked\n', 2, { person: 'gilfoyle', via: 'harness' }) }, 409)
      }
      return reply(note((c.body as { text: string }).text, 3))
    }
    const m = await mount('dm-marvin')
    vi.useFakeTimers()
    await clickF(tab(m.el, 'scratch'))
    await typeF(ta(m), 'one\ntwo\nmine\n')
    await tick(600)
    await tick(0)
    expect(puts().length).toBe(2)
    expect(puts()[0].body).toEqual({ text: 'one\ntwo\nmine\n', base_version: 1 })
    expect(puts()[1].body).toEqual({ text: 'one\ntwo\nmine\nGilfoyle: rack 2 checked\n', base_version: 2 })
    expect(ta(m).value).toBe('one\ntwo\nmine\nGilfoyle: rack 2 checked\n')
    expect(q(m.el, '[data-testid=scratch-conflict]')).toBeNull()
    expect(status(m)).toContain('Saved')
    await m.unmount()
  })
  it('Gilfoyle appends arrive live: the open pad is read every 5 s and takes a newer version when nothing is unsaved', async () => {
    let v = note('a', 1)
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(v)
    const m = await mount('dm-marvin')
    vi.useFakeTimers()
    await clickF(tab(m.el, 'scratch'))
    const reads = () => calls.filter((c) => c.method === 'GET' && c.url === '/api/lanes/dm-marvin/scratch').length
    await tick(10)
    const before = reads()
    v = note('a\nGilfoyle: hello\n', 2, { person: 'gilfoyle', via: 'harness' })
    await tick(4900)
    expect(reads()).toBe(before)
    await tick(200)
    expect(reads()).toBe(before + 1)
    expect(ta(m).value).toBe('a\nGilfoyle: hello\n')
    expect(status(m)).toContain('by Gilfoyle')
    // collapsed: no polling
    await clickF(tab(m.el, 'scratch'))
    const mid = reads()
    await tick(12000)
    expect(reads()).toBe(mid)
    await m.unmount()
  })
  it('an append that lands while the person has unsaved text is merged in, not lost and not overwritten', async () => {
    let server = note('a', 1)
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(server)
    routes['PUT /api/lanes/dm-marvin/scratch'] = () => reply({ error: 'down' }, 500) // the edit stays unsaved
    const m = await mount('dm-marvin')
    vi.useFakeTimers()
    await clickF(tab(m.el, 'scratch'))
    await typeF(ta(m), 'a mine')
    server = note('a\nGilfoyle: hello\n', 2, { person: 'gilfoyle', via: 'harness' })
    await tick(5100)
    expect(ta(m).value).toBe('a mine\nGilfoyle: hello\n')
    await m.unmount()
  })
  it('Tab inserts two spaces', async () => {
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(note('ab', 1))
    routes['PUT /api/lanes/dm-marvin/scratch'] = () => new Promise<Response>(() => {})
    const m = await mount('dm-marvin')
    await click(tab(m.el, 'scratch'))
    const el = ta(m)
    el.focus()
    el.setSelectionRange(1, 1)
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => { el.dispatchEvent(ev) })
    await settle()
    expect(ev.defaultPrevented).toBe(true)
    expect(ta(m).value).toBe('a  b')
    await m.unmount()
  })
  it('History lists the server versions and Restore writes that text as a new version', async () => {
    routes['GET /api/lanes/dm-marvin/scratch'] = () => reply(note('now', 3))
    routes['GET /api/lanes/dm-marvin/scratch?history=1'] = () => reply({ lane: 'dm-marvin', versions: [{ version: 3, at: '2026-10-26T09:00:00Z', by: { person: 'marvin' }, bytes: 3 }, { version: 2, at: '2026-10-26T08:00:00Z', by: { person: 'gilfoyle', via: 'harness' }, bytes: 9 }] })
    routes['GET /api/lanes/dm-marvin/scratch?version=2'] = () => reply(note('older text', 2, { person: 'gilfoyle', via: 'harness' }))
    routes['PUT /api/lanes/dm-marvin/scratch'] = (c) => reply(note((c.body as { text: string }).text, 4))
    const m = await mount('dm-marvin')
    await click(tab(m.el, 'scratch'))
    const btn = q(m.el, '[data-testid=scratch-history-button]')!
    await act(async () => { btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' })) })
    await settle()
    const rows = qa(document.body, '[data-testid=scratch-version]')
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Version 3 (current)'), expect.stringContaining('Version 2')])
    expect(rows[1].textContent).toContain('Gilfoyle')
    await click(rows[1])
    await settle()
    expect(ta(m).value).toBe('older text')
    expect(puts().pop()!.body).toEqual({ text: 'older text', base_version: 3 })
    await m.unmount()
  })
})

describe('lane files', () => {
  const rows = [
    { name: 'ports.md', path: 'registry/ports.md', kind: 'md', size: 1840, mtime: '2026-10-26T08:00:00Z', lane: 'hardware', source: 'repo', scope: 'shared' },
    { name: 'rack-elevation-final-reviewed-version-three.pdf', path: 'console/data/uploads/hardware/rack-elevation-final-reviewed-version-three.pdf', kind: 'pdf', size: 52000, mtime: '2026-10-25T08:00:00Z', lane: 'hardware', source: 'upload', scope: 'lane' },
    { name: 'notes.txt', path: 'console/data/uploads/hardware/notes.txt', kind: 'txt', size: 90, mtime: '2026-10-24T08:00:00Z', lane: 'hardware', source: 'upload', scope: 'lane' },
    { name: 'plan.md', path: 'console/data/uploads/hardware/site/plan.md', kind: 'md', size: 300, mtime: '2026-10-23T08:00:00Z', lane: 'hardware', source: 'upload', scope: 'lane' },
    { name: 'wiring.md', path: 'docs/hardware/wiring.md', kind: 'md', size: 700, mtime: '2026-10-22T08:00:00Z', lane: 'hardware', source: 'repo', scope: 'lane' },
  ]
  const long = rows[1].name
  const tiles = (p: Element) => qa(p, '[data-testid=file-tile]')
  const names = (p: Element) => qa(p, '[data-testid=tile-name]').map((n) => n.textContent)
  const crumbs = (p: Element) => qa(p, '[data-testid=files-breadcrumb] li').map((n) => n.textContent)
  const cd = async (p: Element, name: string) => dbl(qa(p, '[data-testid=folder-tile]').find((f) => f.getAttribute('aria-label') === 'Open folder ' + name))
  const folders = (p: Element) => qa(p, '[data-testid=folder-tile]').map((f) => f.getAttribute('aria-label')!.replace('Open folder ', ''))
  const crumb = (p: Element, name: string) => qa(p, '[data-testid=crumb]').find((c) => c.textContent === name)
  const search = (p: Element) => q(p, '[data-testid=file-search]') as HTMLInputElement
  const setValue = async (e: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', undefined)
    routes['GET /api/lanes/hardware/files'] = (c) => (c.url.includes('?path=') ? Promise.resolve(new Response('Ports\nswitch four', { status: 200 })) : reply({ lane: 'hardware', files: rows, truncated: false }))
    routes['GET /api/lanes/hardware/files/thumb'] = () => reply({ text: 'Ports\nswitch four' })
  })
  it('the root shows folders from the path prefixes, uploads included, with a breadcrumb bar at the top', async () => {
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    const p = panel(m.el, 'files')!
    expect(folders(p)).toEqual(['docs', 'registry', 'uploads'])
    expect(q(p, '[data-testid=folder-list]')!.textContent).toContain('3 files') // uploads holds three, one of them in site/
    expect(crumbs(p)).toEqual(['Lane files'])
    expect(q(p, '[data-testid=crumb-current]')!.getAttribute('aria-current')).toBe('page')
    expect(q(p, '[data-testid=files-breadcrumb]')!.tagName).toBe('NAV')
    await m.unmount()
  })
  it('folders and sub-folders navigate, the breadcrumb goes back up, and the tab stays Lane files', async () => {
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    const p = panel(m.el, 'files')!
    await cd(p, 'uploads')
    expect(crumbs(p)).toEqual(['Lane files', 'uploads'])
    expect(folders(p)).toEqual(['site'])
    expect(names(p)).toEqual([long, 'notes.txt'])
    await cd(p, 'site')
    expect(crumbs(p)).toEqual(['Lane files', 'uploads', 'site'])
    expect(names(p)).toEqual(['plan.md'])
    await click(crumb(p, 'uploads'))
    expect(crumbs(p)).toEqual(['Lane files', 'uploads'])
    await click(crumb(p, 'Lane files'))
    expect(folders(p)).toEqual(['docs', 'registry', 'uploads'])
    await cd(p, 'docs')
    await cd(p, 'hardware')
    expect(names(p)).toEqual(['wiring.md'])
    expect(tab(m.el, 'files')!.textContent).toContain('Lane files')
    await m.unmount()
  })
  it('opens as a grid at the dock minimum: two columns of 140 px tiles, full names, newest first', async () => {
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    const p = panel(m.el, 'files')!
    await cd(p, 'uploads')
    const list = q(p, '[data-testid=file-list]')!
    expect(list.getAttribute('data-view')).toBe('grid')
    expect(list.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(min(140px, 100%), 1fr))')
    // 360 px dock, 16 px gutters, 8 px gap: floor((328 + 8) / (140 + 8)) columns
    expect(Math.floor((360 - 32 + 8) / (140 + 8))).toBe(2)
    expect(names(p)).toEqual([long, 'notes.txt'])
    expect(q(p, '[data-testid=tile-name][title="' + long + '"]')).toBeTruthy()
    expect(qa(p, '[data-testid=tile-name]').every((n) => !n.className.includes('truncate'))).toBe(true)
    expect(p.textContent).not.toContain('shared')
    await click(crumb(p, 'Lane files'))
    await cd(p, 'registry')
    expect(q(p, 'a[download]')!.getAttribute('href')).toBe('/api/lanes/hardware/files?path=registry%2Fports.md')
    await m.unmount()
  })
  it('a text file shows its first lines; Open shows the File Preview inside Lane files as the next breadcrumb', async () => {
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    const p = panel(m.el, 'files')!
    await cd(p, 'registry')
    expect(q(p, '[data-testid=tile-text]')!.textContent).toBe('Ports\nswitch four')
    await click(crumb(p, 'Lane files'))
    await cd(p, 'uploads')
    await dbl(button(tiles(p).find((t) => t.querySelector('[data-testid=tile-name]')!.textContent === 'notes.txt')!, 'Open notes.txt'))
    // still the one tab and the one panel: no separate preview tab
    expect(qa(m.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['topology', 'iface', 'files'])
    expect(q(m.el, '[data-testid=dock-panel-title]')!.textContent).toBe('Lane files')
    expect(tab(m.el, 'files')!.querySelector('svg.lucide-folder')).toBeTruthy()
    expect(crumbs(p)).toEqual(['Lane files', 'uploads', 'notes.txt'])
    expect(q(p, '[data-testid=crumb-current]')!.textContent).toBe('notes.txt')
    const pv = q(p, '[data-testid=files-preview]')!
    expect(pv.querySelector('[data-testid=file-preview]')!.textContent).toContain('console/data/uploads/hardware/notes.txt')
    expect(q(pv, '[data-testid=viewer-bar]')).toBeTruthy() // text kinds keep their preview inside the same frame, with the footer
    expect(isVisible(q(p, '[data-testid=files-browser]'))).toBe(false)
    expect(q(m.el, '[data-testid=selection-chip]')!.textContent).toContain('notes.txt')
    // a folder crumb also leaves the file
    await click(crumb(p, 'uploads'))
    expect(q(p, '[data-testid=files-preview]')).toBeNull()
    expect(names(p)).toEqual([long, 'notes.txt'])
    await m.unmount()
  })
  it('a pdf takes over the whole surface: no breadcrumb above it, Close returns to the same grid, folder, filter and scroll position', async () => {
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    const p = panel(m.el, 'files')!
    await cd(p, 'uploads')
    await setValue(search(p), 'rack')
    const scroller = q(p, '[data-testid=files-browser]')!
    scroller.scrollTop = 120
    await act(async () => { scroller.dispatchEvent(new Event('scroll')) })
    await dbl(button(tiles(p)[0], 'Open ' + long))
    expect(q(p, '[data-testid=files-breadcrumb]')).toBeNull()
    expect(q(p, '[data-testid=files-back]')).toBeNull()
    expect(q(p, '[data-testid=file-preview]')!.getAttribute('data-mode')).toBe('pdf')
    expect(q(p, '[data-testid=files-preview]')!.firstElementChild).toBe(q(p, '[data-testid=file-preview]'))
    await click(q(p, '[data-testid=viewer-close]'))
    expect(q(p, '[data-testid=files-preview]')).toBeNull()
    expect(crumbs(p)).toEqual(['Lane files', 'uploads'])
    expect(search(p).value).toBe('rack')
    expect(names(p)).toEqual([long])
    expect(scroller.scrollTop).toBe(120)
    await m.unmount()
  })
  it('a file_retrieval card opens Lane files at that file, in its folder, and Back lists that folder', async () => {
    const card = stored('c9', 'file_retrieval', '2026-10-26T10:00:04Z', { data: { files: [{ name: 'notes.txt', path: 'console/data/uploads/hardware/notes.txt', kind: 'txt', size: 90, lane: 'hardware', summary: 'Rack notes.' }] } })
    thread = [card]
    const m = await mount('hardware')
    await click(qa(q(m.el, '[data-card-id="c9"]')!, 'button').find((b) => b.textContent === 'Open'))
    const p = panel(m.el, 'files')!
    expect(isVisible(p)).toBe(true)
    expect(qa(m.el, '[data-testid=dock-tab]').map((t) => t.dataset.surface)).toEqual(['topology', 'iface', 'files'])
    expect(crumbs(p)).toEqual(['Lane files', 'uploads', 'notes.txt'])
    expect(q(p, '[data-testid=file-summary]')!.textContent).toBe('Rack notes.')
    await click(q(p, '[data-testid=files-back]'))
    expect(names(p)).toEqual([long, 'notes.txt'])
    await m.unmount()
  })
  describe('the uploads tree', () => {
    const uid = (n: number) => `${n}b9f4c2e-1111-4222-8333-444455556666`
    const mk = (n: number, name: string, folder: string) => ({ id: uid(n), lane: 'hardware', name, folder, kind: name.endsWith('.pdf') ? 'application/pdf' : 'text/markdown', size: 400, uploader: 'marvin', uploaded_at: `2026-10-26T10:0${n}:00Z`, status: 'available', version: 1, tags: [], uses_count: 0, linked_skills: [] })
    const manifest = [mk(1, 'invoice.pdf', ''), mk(2, 'notes.md', ''), mk(3, 'quote-a.pdf', 'Garage quotes/2026'), mk(4, 'plan.md', 'Plans')]
    const onDisk = manifest.map((r) => ({ name: r.name, path: `console/data/uploads/hardware/${r.id}/${r.name}`, kind: r.name.split('.').pop(), size: 400, mtime: r.uploaded_at, lane: 'hardware', source: 'upload', scope: 'lane' }))
    const sent = (m: string, u: string) => calls.filter((c) => c.method === m && c.url.startsWith(u))
    const drag = async (e: Element, type: string) => act(async () => { e.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer: { effectAllowed: '', dropEffect: '', setData() {} } })) })
    beforeEach(() => {
      routes['GET /api/lanes/hardware/files'] = () => reply({ lane: 'hardware', files: onDisk, truncated: false })
      routes['GET /api/library'] = () => reply(manifest)
      routes['GET /api/library/folders'] = () => reply({ lane: 'hardware', folders: ['Empty', 'Garage quotes', 'Garage quotes/2026', 'Plans'] })
      routes['POST /api/library/move'] = () => reply({ moved: [], skipped: [] })
      routes['POST /api/library/folders'] = () => reply({ folder: { lane: 'hardware', path: 'x' } }, 201)
    })
    it('uploads is one master folder: its files at the root, its folders by name, never an id', async () => {
      const m = await mount('hardware')
      await click(tab(m.el, 'files'))
      const p = panel(m.el, 'files')!
      expect(folders(p)).toEqual(['uploads'])
      await cd(p, 'uploads')
      expect(crumbs(p)).toEqual(['Lane files', 'uploads'])
      expect(folders(p)).toEqual(['Empty', 'Garage quotes', 'Plans'])
      expect(names(p).sort()).toEqual(['invoice.pdf', 'notes.md'])
      await cd(p, 'Garage quotes')
      expect(folders(p)).toEqual(['2026'])
      await cd(p, '2026')
      expect(crumbs(p)).toEqual(['Lane files', 'uploads', 'Garage quotes', '2026'])
      expect(names(p)).toEqual(['quote-a.pdf'])
      expect(p.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
      await m.unmount()
    })
    it('dragging a file onto a folder moves it, and onto a breadcrumb item moves it up', async () => {
      const m = await mount('hardware')
      await click(tab(m.el, 'files'))
      const p = panel(m.el, 'files')!
      await cd(p, 'uploads')
      const tile = tiles(p).find((t) => q(t, '[data-testid=tile-name]')!.textContent === 'notes.md')!
      await drag(tile, 'dragstart')
      await drag(q(p, '[data-key="d:uploads/Plans"]')!, 'drop')
      await settle()
      expect(sent('POST', '/api/library/move').map((c) => c.body)).toEqual([{ ids: [uid(2)], folder: 'Plans' }])
      await cd(p, 'Plans')
      const inner = tiles(p).find((t) => q(t, '[data-testid=tile-name]')!.textContent === 'plan.md')!
      await drag(inner, 'dragstart')
      await drag(crumb(p, 'uploads')!, 'drop')
      await settle()
      expect(sent('POST', '/api/library/move').map((c) => c.body)).toEqual([{ ids: [uid(2)], folder: 'Plans' }, { ids: [uid(4)], folder: '' }])
      await m.unmount()
    })
    it('right-click on open space makes a new folder inside the folder you are in', async () => {
      const m = await mount('hardware')
      await click(tab(m.el, 'files'))
      const p = panel(m.el, 'files')!
      await cd(p, 'uploads')
      await cd(p, 'Garage quotes')
      await act(async () => { q(p, '[data-testid=file-grid]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })) })
      await click(q(document.body, '[data-testid="menu-new-folder"]'))
      const input = q(document.body, '[data-testid=name-input]') as HTMLInputElement
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Q4'); input.dispatchEvent(new Event('input', { bubbles: true })) })
      await click(q(document.body, '[data-testid=name-confirm]'))
      expect(sent('POST', '/api/library/folders').map((c) => c.body)).toEqual([{ lane: 'hardware', path: 'Garage quotes/Q4' }])
      await m.unmount()
    })
    it('repo folders are read only and say so on right-click', async () => {
      routes['GET /api/lanes/hardware/files'] = () => reply({ lane: 'hardware', files: [...onDisk, { name: 'ports.md', path: 'registry/ports.md', kind: 'md', size: 10, mtime: '2026-10-26T08:00:00Z', lane: 'hardware', source: 'repo', scope: 'shared' }], truncated: false })
      const m = await mount('hardware')
      await click(tab(m.el, 'files'))
      const p = panel(m.el, 'files')!
      await cd(p, 'registry')
      const t = tiles(p)[0]
      await act(async () => { t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })) })
      expect(qa(document.body, '[role=menuitem]').map((i) => i.textContent)).toEqual(['Open', 'Download', 'Add to chat'])
      expect(q(document.body, '[data-testid=context-note]')!.textContent).toContain('read only')
      expect(t.getAttribute('draggable')).toBe('true') // not movable, but it can still be dragged onto the composer as context
      await m.unmount()
    })
    describe('files as chat context', () => {
      const ctxChips = (el: ParentNode) => qa(el, '[data-testid=context-chip]')
      const menuFor = async (t: Element) => { await act(async () => { t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })) }) }
      const pickItem = async (label: string) => { await click(qa(document.body, '[role=menuitem]').find((i) => i.textContent === label)) }
      const tileNamed = (p: Element, n: string) => tiles(p).find((t) => q(t, '[data-testid=tile-name]')!.textContent === n)!
      it('right click Add to chat on a file, a folder and a multi-selection attaches distinct context chips and uploads nothing', async () => {
        const m = await mount('hardware')
        await click(tab(m.el, 'files'))
        const p = panel(m.el, 'files')!
        await cd(p, 'uploads')
        await menuFor(tileNamed(p, 'notes.md'))
        expect(qa(document.body, '[role=menuitem]').map((i) => i.textContent)).toContain('Add to chat')
        await pickItem('Add to chat')
        let chips = ctxChips(m.el)
        expect(chips.map((c) => q(c, '[data-testid=context-name]')!.textContent)).toEqual(['notes.md'])
        expect(chips[0].dataset.kind).toBe('file')
        expect(q(chips[0], 'svg.lucide-link')).toBeTruthy() // the link icon, not a file icon or a progress bar
        expect(q(chips[0], '[data-testid=context-path]')!.textContent).toBe('uploads/notes.md')
        expect(qa(m.el, '[data-testid=attach-chip]').length).toBe(0) // not an upload chip
        // a folder
        await menuFor(qa(p, '[data-testid=folder-tile]').find((f) => f.getAttribute('aria-label') === 'Open folder Plans')!.closest('li')!)
        await pickItem('Add to chat')
        chips = ctxChips(m.el)
        expect(chips.map((c) => c.dataset.kind)).toEqual(['file', 'folder'])
        expect(q(chips[1], '[data-testid=context-path]')!.textContent).toBe('uploads/Plans')
        // two selected files at once
        await click(tileNamed(p, 'invoice.pdf').querySelector('[data-testid=tile-main]'))
        await act(async () => { tileNamed(p, 'notes.md').querySelector('[data-testid=tile-main]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })) })
        await menuFor(tileNamed(p, 'notes.md'))
        await pickItem('Add to chat')
        expect(ctxChips(m.el).length).toBe(3) // notes.md was already there: only the pdf is new
        expect(sentTo('POST', '/api/lanes/hardware/files')).toEqual([]) // no bytes moved
        // a chip is removable
        await click(q(ctxChips(m.el)[2], '[data-testid=context-remove]'))
        expect(ctxChips(m.el).length).toBe(2)
        await m.unmount()
      })
      it('dragging from the browser onto the composer adds the same chips', async () => {
        const m = await mount('hardware')
        await click(tab(m.el, 'files'))
        const p = panel(m.el, 'files')!
        await cd(p, 'uploads')
        const t = tileNamed(p, 'notes.md')
        const dt = { types: ['text/plain'], files: [], setData() {}, effectAllowed: '', dropEffect: '' }
        const fire = (el: Element, type: string) => act(async () => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); el.dispatchEvent(e) })
        await fire(t, 'dragstart')
        const zone = q(m.el, '[data-testid=composer-drop]')!
        await fire(zone, 'dragover')
        expect(zone.dataset.dragging).toBe('true')
        await fire(zone, 'drop')
        expect(ctxChips(m.el).map((c) => q(c, '[data-testid=context-name]')!.textContent)).toEqual(['notes.md'])
        expect(zone.dataset.dragging).toBe('false')
        await m.unmount()
      })
      it('send posts attachments with mode context, and the thread shows linked tiles under the text that open in Lane files', async () => {
        routes['POST /api/lanes/hardware/messages'] = (c) => {
          const b = c.body as { text: string; client_id: string; attachments: unknown[] }
          return reply({ message: { id: 'srv-1', lane: 'hardware', at: '2026-10-26T12:00:00Z', role: 'person', text: b.text, client_id: b.client_id, attachments: b.attachments, signature: { person: 'marvin' } }, forwarded: true }, 201)
        }
        const m = await mount('hardware')
        await click(tab(m.el, 'files'))
        const p = panel(m.el, 'files')!
        await cd(p, 'uploads')
        await menuFor(tileNamed(p, 'notes.md'))
        await pickItem('Add to chat')
        await menuFor(qa(p, '[data-testid=folder-tile]').find((f) => f.getAttribute('aria-label') === 'Open folder Plans')!.closest('li')!)
        await pickItem('Add to chat')
        await type(q(m.el, '#v2-composer') as unknown as HTMLTextAreaElement, 'what changed here?')
        await click(q(m.el, 'button[type=submit]'))
        await settle()
        const post = sentTo('POST', '/api/lanes/hardware/messages')
        expect(post.length).toBe(1)
        const b = post[0].body as { text: string; attachments: { mode: string; kind: string; ref: string; name: string }[] }
        expect(b.text).toBe('what changed here?')
        expect(b.attachments.map((a) => [a.mode, a.kind, a.ref, a.name])).toEqual([['context', 'file', uid(2), 'notes.md'], ['context', 'folder', 'uploads/Plans', 'Plans']])
        expect(sentTo('POST', '/api/lanes/hardware/files')).toEqual([]) // no upload happened
        expect(ctxChips(m.el).length).toBe(0) // the composer cleared
        // the message
        expect(q(m.el, '[data-testid=context-eyebrow]')!.textContent).toBe('About these files')
        const tilesEl = qa(m.el, '[data-testid=context-tile]')
        expect(tilesEl.map((t) => t.dataset.kind)).toEqual(['file', 'folder'])
        // the folder tile opens Lane files at that folder
        await click(tab(m.el, 'iface'))
        await click(tilesEl[1])
        expect(q(panel(m.el, 'files')!, '[data-testid=files-breadcrumb]')!.textContent).toContain('Plans')
        // the file tile opens the file inside Lane files
        await click(qa(m.el, '[data-testid=context-tile]')[0])
        expect(q(panel(m.el, 'files')!, '[data-testid=file-preview]')).toBeTruthy()
        await m.unmount()
      })
    })
    it('the optional upload form lands in the multipart body of every file of the batch', async () => {
      class FakeXHR2 {
        static all: FakeXHR2[] = []
        upload = {}
        url = ''
        body?: FormData
        open(_m: string, u: string) { this.url = u; FakeXHR2.all.push(this) }
        send(b: FormData) { this.body = b }
      }
      vi.stubGlobal('XMLHttpRequest', FakeXHR2)
      const m = await mount('hardware')
      await click(tab(m.el, 'files'))
      const p = panel(m.el, 'files')!
      await cd(p, 'uploads')
      await cd(p, 'Plans')
      await act(async () => { q(p, '[data-testid=drop-zone]')!.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [new File(['a'], 'a.md')], items: [] } })) })
      await settle()
      const form = q(p, '[data-testid=batch-form]')!
      expect(form.textContent).toContain('1 file ready for Plans')
      const label = q(form, '[data-testid=batch-label]') as HTMLInputElement
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(label, 'Plan v2'); label.dispatchEvent(new Event('input', { bubbles: true })) })
      await click(q(form, '[data-testid=batch-submit]'))
      expect(FakeXHR2.all[0].url).toBe('/api/lanes/hardware/files')
      expect(FakeXHR2.all[0].body!.get('label')).toBe('Plan v2')
      expect(FakeXHR2.all[0].body!.get('folder')).toBe('Plans')
      await m.unmount()
    })
  })
  it('the file card id is a short hash of the path, so a long path never breaks the card envelope', () => {
    expect(shortHash('console/data/uploads/hardware/' + 'x'.repeat(400))).toHaveLength(16)
    expect(shortHash('a')).not.toBe(shortHash('b'))
  })
  it('the grid and list toggle is remembered per device, and the search filters by name', async () => {
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    const p = panel(m.el, 'files')!
    await click(q(p, '[data-testid=view-list]'))
    expect(q(p, '[data-testid=file-list]') === null).toBe(true) // the root lists folders only
    await cd(p, 'uploads')
    expect(q(p, '[data-testid=file-list]')!.getAttribute('data-view')).toBe('list')
    expect(localStorage.getItem('sov.files.view')).toBe('"list"')
    await m.unmount()
    const again = await mount('hardware')
    await click(tab(again.el, 'files'))
    const ap = panel(again.el, 'files')!
    await cd(ap, 'uploads')
    expect(q(ap, '[data-testid=file-list]')!.getAttribute('data-view')).toBe('list')
    expect(q(ap, '[data-testid=view-list]')!.getAttribute('aria-pressed')).toBe('true')
    await setValue(search(ap), 'rack')
    expect(names(ap)).toEqual([long])
    await again.unmount()
  })
  it('landmarks and headings: a labelled region, an upload section and a files section', async () => {
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    const p = panel(m.el, 'files')!
    const region = q(p, '[data-testid=lane-files]')!
    expect(region.tagName).toBe('SECTION')
    expect(document.getElementById(region.getAttribute('aria-labelledby')!)!.textContent).toBe('Lane files')
    expect(qa(p, 'h2, h3').map((h) => h.textContent)).toEqual(['Lane files', 'Upload', 'Files'])
    expect(q(p, '[aria-label="Lane files path"]')).toBeTruthy()
    expect(q(p, '[data-testid=file-search]')!.id).toBeTruthy()
    expect(q(p, 'label[for="' + q(p, '[data-testid=file-search]')!.id + '"]')).toBeTruthy()
    await m.unmount()
  })
  it('says so when the lane has no files', async () => {
    routes['GET /api/lanes/hardware/files'] = () => reply({ lane: 'hardware', files: [], truncated: false })
    const m = await mount('hardware')
    await click(tab(m.el, 'files'))
    expect(panel(m.el, 'files')!.textContent).toContain('No files for this lane yet.')
    await m.unmount()
  })

  describe('the uploader', () => {
    let xhrs: { url: string; status: number; responseText: string; upload: { onprogress?: (e: unknown) => void }; onload?: () => void; body?: FormData }[] = []
    let lib: Record<string, unknown>[] = []
    beforeEach(() => {
      xhrs = []
      lib = []
      class FakeXHR {
        upload: { onprogress?: (e: unknown) => void } = {}
        status = 0
        responseText = ''
        withCredentials = false
        onload?: () => void
        url = ''
        body?: FormData
        constructor() {
          xhrs.push(this)
        }
        open(_m: string, u: string) { this.url = u }
        send(b: FormData) { this.body = b }
      }
      vi.stubGlobal('XMLHttpRequest', FakeXHR)
      routes['GET /api/library'] = () => reply(lib)
    })
    const libRow = (status: string) => ({ id: 'f-new', lane: 'hardware', name: 'rack-photo.png', kind: 'image/png', size: 3000, uploader: 'marvin', uploaded_at: new Date().toISOString(), status, version: 1, tags: [], uses_count: 0, linked_skills: [] })
    it('mounts the drop zone and the queue inside the surface, scoped to the lane', async () => {
      const m = await mount('hardware')
      await click(tab(m.el, 'files'))
      const p = panel(m.el, 'files')!
      expect(q(p, '[data-testid=drop-zone]')).toBeTruthy()
      const file = new File(['png'], 'rack-photo.png', { type: 'image/png' })
      const zone = q(p, '[data-testid=drop-zone]')!
      await act(async () => { zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [file], items: [] } })) })
      await settle()
      await click(q(p, '[data-testid=batch-skip]')) // the optional details form: skip uploads right away
      expect(qa(p, '[data-testid=queue-row]')).toHaveLength(1)
      expect(xhrs[0].url).toBe('/api/lanes/hardware/files')
      await act(async () => { xhrs[0].upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 }) })
      expect(q(p, '[data-testid=queue-state]')!.textContent).toBe('50%')
      await m.unmount()
    })
    it('a finished upload shows up as a tile, its state advances on the 3 s poll and the poll stops at a final state', async () => {
      const m = await mount('hardware')
      await click(tab(m.el, 'files'))
      const p = panel(m.el, 'files')!
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      const zone = q(p, '[data-testid=drop-zone]')!
      await act(async () => { zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [new File(['png'], 'rack-photo.png')], items: [] } })) })
      await settle()
      await click(q(p, '[data-testid=batch-skip]'))
      lib = [libRow('uploaded')]
      await act(async () => { xhrs[0].status = 201; xhrs[0].responseText = JSON.stringify({ files: [libRow('uploaded')], refused: [] }); xhrs[0].onload?.() })
      await settle()
      await dbl(qa(p, '[data-testid=folder-tile]').find((f) => f.getAttribute('aria-label') === 'Open folder uploads'))
      const tile = () => qa(p, '[data-testid=file-tile]').find((t) => t.querySelector('[data-testid=tile-name]')!.textContent === 'rack-photo.png')!
      expect(tile()).toBeTruthy()
      expect(tile().querySelector('[data-testid=tile-pill]')!.textContent).toBe('uploaded')
      lib = [libRow('processed')]
      await act(async () => { vi.advanceTimersByTime(3000) })
      await settle()
      expect(tile().querySelector('[data-testid=tile-pill]')!.textContent).toBe('processed')
      // processed is a final state: the poll stops
      const polls = () => calls.filter((c) => c.url.startsWith('/api/library')).length
      const before = polls()
      await act(async () => { vi.advanceTimersByTime(9000) })
      await settle()
      expect(polls()).toBe(before)
      vi.useRealTimers()
      await m.unmount()
    })
  })
})

describe('topology and interface health', () => {
  it('the Network topology surface is the LAN canvas in compact form: every node by status, a click opens the profile as a panel inside the surface, Select in lane sets the chip', async () => {
    const m = await mount('hardware')
    const t = panel(m.el, 'topology')!
    expect(q(t, '[data-testid=lan-page]')!.dataset.compact).toBe('true')
    expect(q(t, '.react-flow')).toBeTruthy()
    expect(q(t, '.react-flow__minimap')).toBeNull() // no minimap in the dock
    const nodes = qa(t, '[data-testid=lan-node]')
    expect(nodes.length).toBe(3 + 4) // gateway, box, switch + 4 devices
    const status = (label: string) => nodes.find((n) => n.getAttribute('aria-label')?.startsWith(label))!.dataset.status
    expect(status('Bay iPhone')).toBe('online')
    expect(status('Printer')).toBe('offline')
    expect(status('Unknown Co')).toBe('pending')
    expect(status('Seen before')).toBe('denied')
    expect(q(t, '[data-testid=lan-counts-compact]')!.textContent).toContain('3 online of 5')
    expect(q(m.el, '[data-testid=selection-chip]')).toBeNull()
    await click(nodes.find((n) => n.getAttribute('aria-label')?.startsWith('Printer')))
    const prof = q(t, '[data-testid=device-panel]')! // inside the surface, not a viewport drawer or a dialog
    expect(prof.textContent).toContain('Printer')
    expect(q(document.body, '[data-testid=device-drawer]')).toBeNull()
    expect(q(m.el, '[data-testid=selection-chip]')).toBeNull() // opening a profile does not select
    await click(q(prof, '[data-testid=profile-select-lane]'))
    expect(q(t, '[data-testid=device-panel]')).toBeNull()
    expect(q(m.el, '[data-testid=selection-chip]')!.textContent).toContain('Printer')
    expect(qa(t, '[data-testid=lan-node]').find((n) => n.getAttribute('aria-label')?.startsWith('Printer'))!.dataset.focused).toBe('true')
    await m.unmount()
  })
  it('the lenses bar and the spacing control are the LAN page ones, and their state is shared with it', async () => {
    const m = await mount('hardware')
    const t = panel(m.el, 'topology')!
    expect(q(t, '[data-testid=lens-bar]')).toBeNull() // tucked behind the Filters button in the dock
    await click(q(t, '[data-testid=lan-filters-toggle]'))
    expect(q(t, '[data-testid=lens-bar]')).toBeTruthy()
    await click(q(t, '[data-testid=lens-chip][data-group=act][data-value=offline]') ?? qa(t, '[data-testid=lens-chip][data-group=act]')[0])
    expect(qa(t, '[data-testid=lan-node]').some((n) => n.dataset.dim === 'true')).toBe(true) // dimmed, not removed
    expect(qa(t, '[data-testid=lan-node]').length).toBe(7)
    const slider = q(t, '[data-testid=lan-spacing]') as HTMLInputElement
    expect(slider).toBeTruthy()
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '1.5'); slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true })) })
    await settle()
    const stored = JSON.parse(localStorage.getItem('sov.lan.v1.marvin') ?? 'null') // the key the #/lan page reads
    expect(stored.spacing).toBe(1.5)
    expect(stored.lens.acts.length).toBe(1)
    await m.unmount()
  })
  it('the canvas keeps pan and pinch to itself: touch-action none, so the bottom sheet does not scroll under it', async () => {
    narrow = true
    const m = await mount('hardware')
    await act(async () => { q(m.el, '[data-testid=dock-toggle]')?.click() })
    await settle()
    const flow = q(document.body, '[data-testid=dock-sheet] .lan-flow') ?? q(document.body, '.lan-flow')
    expect(flow).toBeTruthy()
    expect(q(flow!, '.react-flow')).toBeTruthy()
    const css = readFileSync(resolve(__dirname, '../lan/lan.css'), 'utf8')
    expect(css).toMatch(/\.lan-flow\s*\{[^}]*touch-action:\s*none/)
    await m.unmount()
  })
  it('Interface health follows the selection with the lan-watch record', async () => {
    const m = await mount('hardware')
    expect(panel(m.el, 'iface')!.textContent).toContain('Select a device')
    await selectNode(qa(m.el, '[data-testid=lan-node]'), 'Bay iPhone')
    await click(tab(m.el, 'iface'))
    const h = q(panel(m.el, 'iface')!, '[data-testid=device-health]')!
    expect(h.textContent).toContain('Bay iPhone')
    expect(h.textContent).toContain('Link up')
    expect(h.textContent).toContain('192.168.1.50')
    expect(h.textContent).toContain('aa:bb:cc:00:00:50')
    expect(calls.some((c) => c.url === '/api/box/interfaces')).toBe(false)
    await m.unmount()
  })
  it('the box itself shows the interface list: state, addresses, speed, mtu, errors', async () => {
    const m = await mount('hardware')
    await selectNode(qa(m.el, '[data-testid=lan-node]'), (n) => !!n.getAttribute('aria-label')?.startsWith('This box'))
    await click(tab(m.el, 'iface'))
    const cards = qa(panel(m.el, 'iface')!, '[data-testid=iface-card]')
    expect(cards.map((c) => c.dataset.iface)).toEqual(['lo', 'enp2s0'])
    const eth = cards[1]
    expect(eth.textContent).toContain('UP')
    expect(eth.textContent).toContain('192.168.1.10/24')
    expect(eth.textContent).toContain('1000 Mb/s')
    expect(eth.textContent).toContain('1500')
    expect(eth.textContent).toContain('3 errors, 1 dropped')
    expect(cards[0].textContent).toContain('unknown') // lo has no link speed
    await m.unmount()
  })
  it('Interface health has a device picker: This box and every device, and picking one selects it for the lane', async () => {
    const m = await mount('hardware')
    const p = panel(m.el, 'iface')!
    expect(q(p, '[data-testid=iface-empty]')).toBeTruthy()
    await click(q(p, '[data-testid=iface-picker]'))
    const items = qa(document.body, '[data-testid=picker-item]')
    expect(items.map((i) => i.dataset.id)).toEqual(['box', 'aa:bb:cc:00:00:50', 'aa:bb:cc:00:00:60', 'aa:bb:cc:00:00:70', 'aa:bb:cc:00:00:88'])
    await click(items[1])
    expect(q(m.el, '[data-testid=selection-chip]')!.textContent).toContain('Bay iPhone')
    expect(q(p, '[data-testid=device-health]')!.textContent).toContain('192.168.1.50')
    expect(q(p, '[data-testid=iface-picker]')!.textContent).toContain('Bay iPhone')
    await click(q(p, '[data-testid=iface-picker]'))
    await click(qa(document.body, '[data-testid=picker-item]')[0])
    expect(qa(p, '[data-testid=iface-card]').length).toBe(2) // This box lists its interfaces
    await m.unmount()
  })
  it('says so when lan-watch is down, and tries again on request', async () => {
    let down = true
    routes['GET /api/lan/summary'] = () => (down ? reply({ error: 'lan-watch not reachable' }, 503) : reply(LAN))
    const m = await mount('hardware')
    const t = panel(m.el, 'topology')!
    expect(q(t, '[data-testid=topology-status]')!.textContent).toContain('not reachable')
    down = false
    await click(button(t, 'Try again'))
    expect(qa(t, '[data-testid=lan-node]').length).toBe(7)
    await m.unmount()
  })
})
