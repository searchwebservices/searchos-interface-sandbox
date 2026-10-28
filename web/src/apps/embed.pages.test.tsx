// @vitest-environment happy-dom
// The CRM and Projects pages and their nav rows, through the real App as Bay.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { crmContextLine, pmContextLine } from './embed'
import { parseRoute } from '../app/router'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
class FakeES { onopen: (() => void) | null = null; onmessage = null; onerror = null; readyState = 1; constructor() { setTimeout(() => this.onopen?.(), 0) } close() {} }
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
const L = (id: string, kind: string, agent?: string) => ({ id, kind, title: id, members: ['bay'], count: 0, asks: 0, tail: [], last: null, ...(agent ? { agent: { id: agent, name: agent === 'jared' ? 'Jared' : 'Gilfoyle' } } : {}) })
let root: Root | null = null
let pmConfig: unknown = { mode: 'subpath', port: null }

beforeEach(() => {
  pmConfig = { mode: 'subpath', port: null }
  try { localStorage.clear() } catch { /* ignore */ }
  document.documentElement.classList.remove('dark')
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  if (!('ResizeObserver' in globalThis)) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/me') return json({ person: 'bay', role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, ui: 'bay-v1' })
    if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0, agents: { gilfoyle: { opencode: 'up' }, jared: { opencode: 'up' } } })
    if (url === '/api/lanes') return json([L('jared-bay', 'dm', 'jared'), L('dm-bay', 'dm')])
    if (url.startsWith('/api/asks')) return json([])
    if (url === '/api/apps/pm/config') return json(pmConfig)
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
const ctxText = (el: Element) => q(el, 'jared-context')?.textContent
const openDock = async (el: Element) => { await act(async () => (q(el, 'jared-tab') as HTMLElement).click()) }

describe('pure helpers', () => {
  it('builds the CRM context line', () => {
    expect(crmContextLine({ type: 'crm.context', route: '#/deals/9', resource: 'deals', id: 9, name: 'Acme' })).toBe('CRM deal 9: Acme (#/deals/9)')
    expect(crmContextLine({ type: 'crm.context', route: '#/contacts/42', resource: 'contacts', id: '42' })).toBe('CRM contact 42 (#/contacts/42)')
    expect(crmContextLine(null)).toBe('CRM')
  })
  it('builds the Plane context line', () => {
    expect(pmContextLine('/v2/apps/pm/')).toBe('Projects')
    expect(pmContextLine('/v2/apps/pm/search/browse/WEB-12/')).toBe('Plane work item WEB-12 (/search/browse/WEB-12)')
    expect(pmContextLine('/search/projects/p1/issues/i9/')).toBe('Plane work item i9 in project p1 (/search/projects/p1/issues/i9)')
    expect(pmContextLine('/search/projects/p1/cycles/')).toBe('Plane project p1 (/search/projects/p1/cycles)')
  })
  it('parses deep links', () => {
    expect(parseRoute('#/apps/crm/deals/9')).toEqual({ name: 'apps-crm', sub: 'deals/9' })
    expect(parseRoute('#/apps/crm')).toEqual({ name: 'apps-crm', sub: '' })
    expect(parseRoute('#/apps/pm/ws/browse/A-1/')).toEqual({ name: 'apps-pm', sub: 'ws/browse/A-1' })
  })
})

describe('nav', () => {
  it('lists CRM, Money, Projects, SearchOS map in that order and marks the active one', async () => {
    const el = await mount('#/apps/crm')
    const ids = [...el.querySelectorAll('[data-testid^=nav-apps-]')].map((n) => n.getAttribute('data-testid'))
    expect(ids).toEqual(['nav-apps-crm', 'nav-apps-money', 'nav-apps-pm', 'nav-apps-map'])
    expect(q(el, 'nav-apps-crm')?.textContent).toBe('CRM')
    expect(q(el, 'nav-apps-pm')?.textContent).toBe('Projects')
    expect(q(el, 'nav-apps-crm')?.getAttribute('data-active')).toBe('true')
    expect(q(el, 'nav-apps-pm')?.getAttribute('data-active')).not.toBe('true')
  })
})

describe('CRM page', () => {
  it('opens the iframe at the deep link and sets the dock context from crm.context', async () => {
    const el = await mount('#/apps/crm/deals/9')
    const f = q(el, 'crm-frame') as HTMLIFrameElement
    expect(f.getAttribute('src')).toBe('/v2/apps/crm/#/deals/9')
    // one header: the shell's page header is not rendered, the dock still is
    expect(q(el, 'app-header')).toBeNull()
    expect(q(el, 'jared-tab') ?? q(el, 'jared-dock')).not.toBeNull()
    await openDock(el)
    expect(ctxText(el)).toBe('On screen: CRM')
    const post = (data: unknown, origin = window.location.origin, source: unknown = f.contentWindow) =>
      act(async () => { window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as MessageEventSource })) })
    await post({ type: 'crm.context', route: '#/deals/9', resource: 'deals', id: 9, name: 'Acme' })
    expect(ctxText(el)).toBe('On screen: CRM deal 9: Acme (#/deals/9)')
    expect(window.location.hash).toBe('#/apps/crm/deals/9')
    await post({ type: 'crm.context', route: '#/companies/7/show/searchos', resource: 'companies', id: 7, title: 'Arido', tab: 'searchos' })
    expect(ctxText(el)).toBe('On screen: CRM company 7: Arido, searchos tab (#/companies/7/show/searchos)')
    await post({ type: 'crm.context', route: '#/deals/9', resource: 'deals', id: 9, name: 'Acme' })
    // a foreign origin or a foreign source is ignored
    await post({ type: 'crm.context', route: '#/contacts/1', resource: 'contacts', id: 1 }, 'https://evil.example')
    await post({ type: 'crm.context', route: '#/contacts/1', resource: 'contacts', id: 1 }, window.location.origin, window)
    expect(ctxText(el)).toBe('On screen: CRM deal 9: Acme (#/deals/9)')
  })
  it('ask: true opens the dock with the composer prefilled, and the person still sends', async () => {
    const el = await mount('#/apps/crm')
    const f = q(el, 'crm-frame') as HTMLIFrameElement
    expect(q(el, 'jared-dock')).toBeNull()
    const post = (data: unknown) => act(async () => { window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source: f.contentWindow as MessageEventSource })) })
    await post({ type: 'crm.context', route: '#/', resource: null, id: null, title: null, ask: true, prompt: 'What should I say to  Magnolia?' })
    await settle()
    expect(q(el, 'jared-dock')).not.toBeNull()
    expect((q(el, 'jared-input') as HTMLTextAreaElement).value).toBe('What should I say to Magnolia?')
    expect(el.querySelectorAll('[data-testid=jared-msg]')).toHaveLength(0)
    // the same message without ask changes nothing in the composer
    await post({ type: 'crm.context', route: '#/deals/9', resource: 'deals', id: 9 })
    expect((q(el, 'jared-input') as HTMLTextAreaElement).value).toBe('What should I say to Magnolia?')
    expect(ctxText(el)).toBe('On screen: CRM deal 9 (#/deals/9)')
  })
  it('posts the theme on load and when it changes', async () => {
    const el = await mount('#/apps/crm')
    const f = q(el, 'crm-frame') as HTMLIFrameElement
    const spy = vi.fn()
    Object.defineProperty(f, 'contentWindow', { configurable: true, value: { postMessage: spy } })
    await act(async () => { f.dispatchEvent(new Event('load')) })
    expect(spy).toHaveBeenCalledWith({ type: 'theme', value: 'light' }, window.location.origin)
    await act(async () => { document.documentElement.classList.add('dark') })
    await settle()
    expect(spy).toHaveBeenCalledWith({ type: 'theme', value: 'dark' }, window.location.origin)
  })
})

describe('Projects page', () => {
  it('opens the proxied Plane and reads the context from the iframe pathname', async () => {
    const el = await mount('#/apps/pm/board/search/browse/WEB-12/')
    const f = q(el, 'pm-frame') as HTMLIFrameElement
    expect(f.getAttribute('src')).toBe('/v2/apps/pm/search/browse/WEB-12/')
    expect(q(el, 'app-header')).toBeNull()
    await openDock(el)
    expect(ctxText(el)).toBe('On screen: Projects')
    Object.defineProperty(f, 'contentWindow', { configurable: true, value: { location: { href: 'http://x/v2/apps/pm/search/browse/WEB-12/', pathname: '/v2/apps/pm/search/browse/WEB-12/' } } })
    await act(async () => { f.dispatchEvent(new Event('load')) })
    expect(ctxText(el)).toBe('On screen: Plane work item WEB-12 (/search/browse/WEB-12)')
  })
  it('uses the dedicated port when the console says so', async () => {
    pmConfig = { mode: 'port', port: 8881 }
    const el = await mount('#/apps/pm/board')
    const f = q(el, 'pm-frame') as HTMLIFrameElement
    expect(f.getAttribute('src')).toBe(window.location.protocol + '//' + window.location.hostname + ':8881/')
  })
})
