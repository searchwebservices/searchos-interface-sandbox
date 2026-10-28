// @vitest-environment happy-dom
// The three app pages through the real App, as Bay (bay-v1) and as Marvin, against a mocked console API.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { CLIENTS, ESTATE, PROFILE } from './fixtures'

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
const L = (id: string, kind: string, agent?: string) => ({ id, kind, title: id, members: ['bay'], count: 0, asks: 0, tail: [], last: null, ...(agent ? { agent: { id: agent, name: agent === 'jared' ? 'Jared' : 'Gilfoyle' } } : {}) })

let ui: string | undefined
let apiStatus = 200
const posts: { url: string; body: string }[] = []
let root: Root | null = null

beforeEach(() => {
  ui = 'bay-v1'
  apiStatus = 200
  posts.length = 0
  try { localStorage.clear() } catch { /* ignore */ }
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  if (!('ResizeObserver' in globalThis)) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push({ url, body: String(init.body) })
    if (url === '/api/me') return json({ person: 'bay', role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, ...(ui ? { ui } : {}) })
    if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0, agents: { gilfoyle: { opencode: 'up' }, jared: { opencode: 'up' } } })
    if (url === '/api/lanes') return json([L('jared-bay', 'dm', 'jared'), L('dm-bay', 'dm')])
    if (url.startsWith('/api/asks')) return json([])
    if (url === '/api/apps/clients/c1/crm') return apiStatus === 200 ? json({ company_id: '7' }) : json({ error: 'db_unavailable' }, apiStatus)
    if (url === '/api/apps/clients/nope/crm') return json({ error: 'not_found' }, 404)
    if (url === '/api/apps/clients') return apiStatus === 200 ? json(CLIENTS) : json({ error: apiStatus === 403 ? 'forbidden' : 'db_unavailable' }, apiStatus)
    if (url === '/api/apps/clients/c1') return apiStatus === 200 ? json(PROFILE) : json({ error: 'db_unavailable' }, apiStatus)
    if (url === '/api/apps/estate') return apiStatus === 200 ? json(ESTATE) : json({ error: 'db_unavailable' }, apiStatus)
    if (url === '/api/lanes/jared-bay/messages' && init?.method === 'POST') return json({ id: 'm0', at: '2026-10-27T10:00:00Z' })
    if (url === '/api/lanes/jared-bay/messages') return json(posts.map((p, i) => ({ id: 'm' + i, lane: 'jared-bay', at: '2026-10-27T10:0' + i + ':00Z', role: 'person', text: JSON.parse(p.body).text })))
    if (url.endsWith('/messages')) return json([])
    return json({})
  }))
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) }) }
async function mount(hash: string) {
  window.location.hash = hash
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => { root!.render(<App />) })
  await settle()
  return el
}
const q = (el: Element, id: string) => el.querySelector('[data-testid=' + id + ']')
const all = (el: Element, id: string) => [...el.querySelectorAll('[data-testid=' + id + ']')]

describe('Apps section in the sidebar', () => {
  it('bay-v1 shows CRM and SearchOS map between Engines and the agents, with no Clients row', async () => {
    const el = await mount('#/apps/map')
    const rail = q(el, 'rail-apps')!
    expect(rail.textContent).toContain('Apps')
    expect(q(el, 'nav-apps-clients')).toBeNull()
    expect(q(el, 'nav-apps-map')?.textContent).toBe('SearchOS map')
    expect(q(el, 'nav-apps-map')?.getAttribute('data-active')).toBe('true')
    expect(q(el, 'nav-apps-crm')?.getAttribute('data-active')).not.toBe('true')
    const order = [...el.querySelectorAll('[data-testid=nav-engines], [data-testid=rail-apps], [data-testid^="agent-"][data-agent-state]')].map((n) => n.getAttribute('data-testid'))
    expect(order.slice(0, 3)).toEqual(['nav-engines', 'rail-apps', 'agent-jared'])
  })
  it('marvin-v1 has no Apps section', async () => {
    ui = undefined
    const el = await mount('#/devices')
    expect(q(el, 'rail-apps')).toBeNull()
    expect(el.textContent).not.toContain('SearchOS map')
  })
})

describe('clients redirects (the app folded into the CRM)', () => {
  it('#/apps/clients goes to the CRM company list', async () => {
    await mount('#/apps/clients')
    expect(window.location.hash).toBe('#/apps/crm/companies')
  })
  it('#/apps/clients/:id looks up the CRM company and lands on its SearchOS tab', async () => {
    await mount('#/apps/clients/c1')
    expect(window.location.hash).toBe('#/apps/crm/companies/7/show/searchos')
  })
  it('a client with no CRM company says so and offers the company list', async () => {
    const el = await mount('#/apps/clients/nope')
    expect(window.location.hash).toBe('#/apps/clients/nope')
    expect(q(el, 'client-not-in-crm')?.textContent).toContain('not in the CRM')
    expect(q(el, 'client-not-in-crm')?.querySelector('a')?.getAttribute('href')).toBe('#/apps/crm/companies')
  })
  it('shows a calm empty state when the database is down', async () => {
    apiStatus = 503
    const el = await mount('#/apps/clients/c1')
    expect(q(el, 'app-empty')?.getAttribute('data-state')).toBe('unavailable')
  })
})

describe('estate map page', () => {
  it('draws the groups around the root first, opens a branch on a tile click, and filters', async () => {
    const el = await mount('#/apps/map')
    expect(q(el, 'estate-map')?.getAttribute('data-nodes')).toBe('7')
    expect(all(el, 'estate-row').map((r) => r.getAttribute('data-id'))).toEqual(['os', 'lanes', 'infra'])
    expect(all(el, 'kind-badge').map((b) => b.textContent)).toContain('group')
    expect(q(el, 'tree-canvas')?.getAttribute('data-tiles')).toBe('3')
    await act(async () => (el.querySelector('[data-testid=estate-row][data-id=lanes] button:last-child') as HTMLElement).click())
    expect(all(el, 'estate-row').map((r) => r.getAttribute('data-id'))).toEqual(['os', 'lanes', 'lane:jared-bay', 'lane:hardware', 'infra'])
    expect(q(el, 'tree-canvas')?.getAttribute('data-tiles')).toBe('5')
    const input = q(el, 'estate-filter') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'relay')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(all(el, 'estate-row').map((r) => r.getAttribute('data-id'))).toEqual(['os', 'infra', 'd1'])
  })
  it('selecting a row shows its meta, centres its tile, and arrows move the selection', async () => {
    const el = await mount('#/apps/map')
    await act(async () => (el.querySelector('[data-testid=estate-row][data-id=lanes] button:last-child') as HTMLElement).click())
    await act(async () => (el.querySelector('[data-testid=estate-row][data-id="lane:jared-bay"] button:last-child') as HTMLElement).click())
    expect(q(el, 'estate-meta')?.textContent).toContain('owner')
    expect(q(el, 'estate-meta')?.textContent).toContain('claude')
    // selecting a node with children opens it: its file tile exists now
    expect(q(el, 'tree-canvas')?.getAttribute('data-tiles')).toBe('6')
    const tree = q(el, 'estate-tree') as HTMLElement
    await act(async () => { tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(el.querySelector('[data-testid=estate-row][aria-selected=true]')?.getAttribute('data-id')).toBe('f1')
    expect(q(el, 'estate-detail')?.getAttribute('data-id')).toBe('f1')
  })
  it.each([403, 503])('shows a calm empty state for %i', async (status) => {
    apiStatus = status
    const el = await mount('#/apps/map')
    expect(q(el, 'app-empty')).toBeTruthy()
    expect(q(el, 'estate-map')).toBeNull()
  })
})

describe('Ask Jared dock', () => {
  it('opens a panel with the page context and sends the hidden prefix only from the panel', async () => {
    const el = await mount('#/apps/map')
    expect(q(el, 'jared-dock')).toBeNull()
    await act(async () => (q(el, 'jared-tab') as HTMLElement).click())
    expect(q(el, 'jared-context')?.textContent).toBe('On screen: SearchOS map, 7 nodes')
    const box = q(el, 'jared-input') as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'who is late?')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => (q(el, 'jared-send') as HTMLElement).click())
    await settle()
    const post = posts.find((p) => p.url === '/api/lanes/jared-bay/messages')
    expect(JSON.parse(post!.body).text).toBe('[on screen: SearchOS map, 7 nodes]\nwho is late?')
    // the panel shows the message without the prefix
    expect(all(el, 'jared-msg').map((m) => m.textContent?.replace(/(sending|not sent)$/, ''))).toEqual(['who is late?'])
  })
  it('the sheet closes again', async () => {
    const el = await mount('#/apps/map')
    await act(async () => (q(el, 'jared-tab') as HTMLElement).click())
    await act(async () => (q(el, 'jared-close') as HTMLElement).click())
    expect(q(el, 'jared-tab')).toBeTruthy()
  })
})
