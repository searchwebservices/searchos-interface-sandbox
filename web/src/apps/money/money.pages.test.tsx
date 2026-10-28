// @vitest-environment happy-dom
// The Money app through the real App against a mocked console API.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { CARTERA, FACTURAPI, INVOICES, OVERVIEW, STRIPE, manyEntries } from './fixtures'

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


function money(url: string, init?: RequestInit) {
  if (apiStatus !== 200) return json({ error: apiStatus === 403 ? 'owners_only' : 'db_unavailable' }, apiStatus)
  if (url === '/api/apps/money') return json(OVERVIEW)
  if (url === '/api/apps/money/cartera') return json(cartera)
  if (url === '/api/apps/money/invoices') return json(INVOICES)
  if (url === '/api/apps/money/stripe') return stripeOn ? json(STRIPE) : json({ error: 'stripe_not_configured' }, 503)
  if (url === '/api/apps/money/facturapi') return factOn ? json(FACTURAPI) : json({ error: 'facturapi_not_configured' }, 503)
  if (/\/cartera\/[^/]+\/paid$/.test(url) && init?.method === 'POST') return payStatus === 200 ? json({ ok: true, payment_id: 'pay1' }) : json({ error: 'already_recorded' }, payStatus)
  return json({}, 404)
}

let ui: string | undefined
let apiStatus = 200
let stripeOn = true
let factOn = false
let cartera = CARTERA
let payStatus = 200
const posts: { url: string; body: string }[] = []
let root: Root | null = null

beforeEach(() => {
  ui = 'bay-v1'
  apiStatus = 200
  stripeOn = true
  factOn = false
  cartera = CARTERA
  payStatus = 200
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
    if (url.startsWith('/api/apps/money')) return money(url, init)
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


const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = async (n: Element | null) => { await act(async () => (n as HTMLElement).click()) }
const dialog = () => document.body.querySelector('[data-testid=markpaid-dialog]')

describe('money nav', () => {
  it('has Money between CRM and Projects, active on its route', async () => {
    const el = await mount('#/apps/money/cartera')
    const ids = [...el.querySelectorAll('[data-testid^=nav-apps-]')].map((n) => n.getAttribute('data-testid'))
    expect(ids).toEqual(['nav-apps-crm', 'nav-apps-money', 'nav-apps-pm', 'nav-apps-map'])
    expect(q(el, 'nav-apps-money')?.getAttribute('data-active')).toBe('true')
  })
  it('marvin-v1 has no Money', async () => {
    ui = undefined
    const el = await mount('#/devices')
    expect(q(el, 'nav-apps-money')).toBeNull()
  })
})

describe('money page', () => {
  it('shows the KPI strip with MXN text and the Ask Jared context', async () => {
    localStorage.setItem('apps.jared.open', '1')
    const el = await mount('#/apps/money/cartera')
    expect(all(el, 'money-stat').map((s) => s.textContent)).toEqual([
      'MRR$13,000 MXN', 'Collected this month$1,000 MXN2 payments, 2026-10', 'Open invoices$10,900 MXN5 open', 'Overdue$10,000 MXN4 overdue', 'Commissions due$100 MXN1 payouts'])
    expect(q(el, 'jared-context')?.textContent).toBe('On screen: Money, Cartera')
  })
  it.each([[403, 'forbidden'], [503, 'unavailable']])('shows a calm empty state for %i', async (status, kind) => {
    apiStatus = status
    const el = await mount('#/apps/money/cartera')
    expect(q(el, 'app-empty')?.getAttribute('data-state')).toBe(kind)
    expect(q(el, 'money-strip')).toBeNull()
  })
})

describe('cartera tab', () => {
  it('groups by bucket, marks the semaphore, USD, and expands the history', async () => {
    localStorage.setItem('apps.jared.open', '1')
    const el = await mount('#/apps/money/cartera')
    expect(q(el, 'cartera-activos')?.getAttribute('data-count')).toBe('4')
    expect(q(el, 'cartera-desarrollo')?.getAttribute('data-count')).toBe('1')
    expect(all(el, 'cartera-row').map((r) => r.getAttribute('data-semaphore'))).toEqual(['stripe', 'verde', 'amarillo', 'rojo', 'rojo'])
    expect(all(el, 'cartera-amount').map((n) => n.textContent)).toContain('$900 USD')
    expect(all(el, 'cartera-amount').map((n) => n.textContent)).toContain('$12,500 MXN')
    await click(all(el, 'cartera-toggle')[1])
    expect(q(el, 'cartera-detail')?.textContent).toContain('Pays by transfer')
    expect(q(el, 'cartera-history')?.textContent).toContain('2026-10-05')
    expect(q(el, 'jared-context')?.textContent ?? el.textContent).toContain('Cartera, open entry: Zeta Cafe (Collected)')
  })
  it('filters by search, bucket and semaphore', async () => {
    const el = await mount('#/apps/money/cartera')
    await type(q(el, 'cartera-search') as HTMLInputElement, 'alfa')
    expect(all(el, 'cartera-row').map((r) => r.getAttribute('data-id'))).toEqual(['e2'])
    await type(q(el, 'cartera-search') as HTMLInputElement, '')
    const sem = q(el, 'cartera-semaphore') as HTMLSelectElement
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sem, 'rojo'); sem.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(all(el, 'cartera-row').map((r) => r.getAttribute('data-id'))).toEqual(['e4', 'e5'])
  })
  it('pages above 50 rows', async () => {
    cartera = manyEntries(120)
    const el = await mount('#/apps/money/cartera')
    expect(all(el, 'cartera-row')).toHaveLength(50)
    await click(q(el, 'pager-next'))
    expect(all(el, 'cartera-row')[0].getAttribute('data-id')).toBe('m50')
  })
  it('mark paid: confirm dialog with the prefilled amount, calls the right route, then reloads', async () => {
    const el = await mount('#/apps/money/cartera')
    const btns = all(el, 'cartera-markpaid')
    expect(btns).toHaveLength(2) // Alfa (monthly + final) and Dev (deposit); verde, stripe and rojo manual have none
    await click(btns[0])
    expect((document.body.querySelector('[data-testid=markpaid-amount]') as HTMLInputElement).value).toBe('12500')
    expect(document.body.querySelector('[data-testid=markpaid-summary]')?.textContent).toBe('Record $12,500 MXN, monthly for 2026-10, paid 2026-10-27?')
    await click(document.body.querySelector('[data-testid=markpaid-confirm]'))
    await settle()
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe('/api/apps/money/cartera/e2/paid')
    expect(JSON.parse(posts[0].body)).toEqual({ kind: 'monthly', amount: 12500, paid_at: '2026-10-27', period: '2026-10-01' })
    expect(dialog()).toBeNull()
    expect(q(el, 'cartera-flash')?.textContent).toContain('Alfa Studio')
  })
  it('a 409 stays in the dialog with a plain message', async () => {
    payStatus = 409
    const el = await mount('#/apps/money/cartera')
    await click(all(el, 'cartera-markpaid')[0])
    await click(document.body.querySelector('[data-testid=markpaid-confirm]'))
    await settle()
    expect(document.body.querySelector('[data-testid=markpaid-error]')?.textContent).toBe('That payment is already recorded.')
    expect(dialog()).not.toBeNull()
  })
})

describe('invoices tab', () => {
  it('lists invoices, facturas and the roster chips, with the connect lines when keys are missing', async () => {
    stripeOn = false
    const el = await mount('#/apps/money/invoices')
    expect(all(el, 'invoice-row')).toHaveLength(3)
    expect(q(el, 'invoice-rows')?.textContent).toContain('17 d late')
    expect(q(el, 'invoice-rows')?.textContent).toContain('$300 USD')
    expect(q(el, 'factura-rows')?.textContent).toContain('BP260-7')
    expect(q(el, 'factura-rows')?.textContent).toContain('$116 MXN')
    const chips = q(el, 'mrr-rows')?.textContent ?? ''
    expect(chips).toContain('counts in MRR')
    expect(chips).toContain('billing paused')
    expect(chips).toContain('archived')
    expect(q(el, 'connect-stripe')?.textContent).toContain('Connect Stripe')
    expect(q(el, 'connect-facturapi')?.textContent).toContain('Connect Facturapi')
  })
  it('filters invoices to overdue', async () => {
    const el = await mount('#/apps/money/invoices')
    const f = q(el, 'invoice-filter') as HTMLSelectElement
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(f, 'overdue'); f.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(all(el, 'invoice-row')).toHaveLength(1)
  })
  it('shows Stripe charges and subscriptions with dashboard links when configured', async () => {
    const el = await mount('#/apps/money/invoices')
    expect(q(el, 'stripe-data')).not.toBeNull()
    const hrefs = [...q(el, 'stripe-data')!.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['https://dashboard.stripe.com/payments/pi_1', 'https://dashboard.stripe.com/subscriptions/sub_1'])
    expect(q(el, 'stripe-data')?.textContent).toContain('$1,500 MXN')
  })
})

describe('facturapi section', () => {
  it('lists the last invoices with PDF and XML links through the console', async () => {
    factOn = true
    const el = await mount('#/apps/money/invoices')
    const hrefs = [...q(el, 'facturapi-data')!.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/api/apps/money/facturapi/inv123abc/pdf', '/api/apps/money/facturapi/inv123abc/xml'])
    expect(q(el, 'facturapi-data')?.textContent).toContain('BP-7')
  })
})

describe('charts tab', () => {
  it('draws the three charts and the aging counts', async () => {
    const el = await mount('#/apps/money/charts')
    expect(q(el, 'chart-months')).not.toBeNull()
    expect(q(el, 'chart-aging')).not.toBeNull()
    expect(q(el, 'chart-mrr')).not.toBeNull()
    expect(all(el, 'aging-counts').length).toBe(1)
    expect(q(el, 'aging-counts')?.textContent).toContain('90 plus: 1')
  })
})
