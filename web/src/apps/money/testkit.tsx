// @vitest-environment happy-dom
// Shared harness of the ledger tab tests: the real App against a mocked console API with a mutable ledger.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { vi } from 'vitest'
import App from '../../App'
import { CARTERA, FACTURAPI, HOME, INVOICES, OVERVIEW, STRIPE } from './fixtures'
import { ACCOUNTS, CATEGORIES, INBOX, LEDGER_OVERVIEW, LEDGER_OVERVIEW_USD, LEDGER_TOTALS, TRANSACTIONS, detailOf } from './ledgerFixtures'
import type { InboxItem, Transaction } from './api'
import type { HomeBody } from './types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
class FakeES {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() { setTimeout(() => this.onopen?.(), 0) }
  close() {}
}
export const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
const L = (id: string, kind: string, agent?: string) => ({ id, kind, title: id, members: ['bay'], count: 0, asks: 0, tail: [], last: null, ...(agent ? { agent: { id: agent, name: agent === 'jared' ? 'Jared' : 'Gilfoyle' } } : {}) })

export interface Call { url: string; method: string; body: unknown; form?: Record<string, string> }
export const world = {
  calls: [] as Call[],
  tx: [] as Transaction[],
  inbox: [] as InboxItem[],
  status: 200,
  ledgerStatus: 200,
  cartera: CARTERA,
  nextCursor: null as string | null,
  page2: [] as Transaction[],
  patchStatus: 200,
  home: HOME as HomeBody,
  homeStatus: 200,
  invoiceStatus: 200,
  reset() {
    this.calls = []
    this.tx = TRANSACTIONS.map((t) => ({ ...t }))
    this.inbox = INBOX.map((i) => ({ ...i }))
    this.status = 200
    this.ledgerStatus = 200
    this.cartera = CARTERA
    this.nextCursor = null
    this.page2 = []
    this.patchStatus = 200
    this.home = HOME
    this.homeStatus = 200
    this.invoiceStatus = 200
  },
}
export const callsTo = (re: RegExp, method?: string) => world.calls.filter((c) => re.test(c.url) && (!method || c.method === method))

function money(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData
  world.calls.push({ url, method, body: isForm ? null : init?.body ? JSON.parse(String(init.body)) : null, ...(isForm ? { form: { file: ((init!.body as FormData).get('file') as File)?.name } } : {}) })
  if (world.status !== 200) return json({ error: world.status === 403 ? 'owners_only' : 'db_unavailable' }, world.status)
  const [path, query = ''] = url.replace('/api/apps/money', '').split('?')
  const params = new URLSearchParams(query)
  let m: RegExpExecArray | null
  if (world.ledgerStatus !== 200 && /^\/(ledger|inbox)/.test(path)) return json({ error: 'db_unavailable' }, world.ledgerStatus)
  if (path === '') return json(OVERVIEW)
  if (path === '/home') return world.homeStatus === 200 ? json(world.home) : json({ error: 'db_unavailable' }, world.homeStatus)
  m = /^\/accounts\/([^/]+)$/.exec(path)
  if (m && method === 'PATCH') { const a = world.home.accounts.find((x) => x.id === m![1]); return a ? json({ ok: true, item: { ...a, balance: JSON.parse(String(init!.body)).balance } }) : json({ error: 'not_found' }, 404) }
  m = /^\/invoices\/([^/]+)\/paid$/.exec(path)
  if (m && method === 'POST') return world.invoiceStatus === 200 ? json({ ok: true, invoice: { id: m[1], status: 'paid', paid_date: JSON.parse(String(init!.body)).paid_date ?? '2026-10-27' } }) : json({ error: world.invoiceStatus === 503 ? 'invoices_not_writable' : 'already_paid' }, world.invoiceStatus)
  if (/\/cartera\/[^/]+\/paid$/.test(path) && method === 'POST') return json({ ok: true, payment_id: 'pay1' })
  if (path === '/cartera') return json(world.cartera)
  if (path === '/invoices') return json(INVOICES)
  if (path === '/stripe') return json(STRIPE)
  if (path === '/facturapi') return json(FACTURAPI)
  if (path === '/accounts') return json({ items: ACCOUNTS })
  if (path === '/categories') return json({ items: CATEGORIES })
  if (path === '/overview') return json(params.get('currency') === 'USD' ? LEDGER_OVERVIEW_USD : LEDGER_OVERVIEW)
  if (path === '/sync/run') return json({ ok: true })
  if (path === '/ledger' && method === 'GET') {
    const cursor = params.get('cursor')
    let rows = cursor ? world.page2 : world.tx
    const st = params.get('status'), cat = params.get('category'), acc = params.get('account'), q = params.get('q')?.toLowerCase()
    if (st && st !== 'all') rows = rows.filter((t) => t.status === st)
    else if (!st) rows = rows.filter((t) => t.status !== 'archived')
    if (cat) rows = rows.filter((t) => t.category_slug === cat)
    if (acc) rows = rows.filter((t) => t.account_id === acc)
    if (q) rows = rows.filter((t) => (t.name + ' ' + (t.counterparty_name ?? '')).toLowerCase().includes(q))
    return json({ items: rows, next_cursor: cursor ? null : world.nextCursor, totals: LEDGER_TOTALS })
  }
  if (path === '/ledger' && method === 'POST') return json({ ok: true, item: { ...detailOf('t1'), id: 'tnew' } }, 201)
  m = /^\/ledger\/([^/]+)\/attachments$/.exec(path)
  if (m && method === 'POST') return json({ ok: true, attachment: { id: 'atnew', name: ((init!.body as FormData).get('file') as File).name, mime: 'application/pdf', size: 10, kind: 'receipt', created_at: '2026-10-27T10:00:00Z' } }, 201)
  m = /^\/ledger\/([^/]+)$/.exec(path)
  if (m && method === 'GET') return json(detailOf(m[1]))
  if (m && method === 'PATCH') {
    if (world.patchStatus !== 200) return json({ error: 'nope' }, world.patchStatus)
    const t = world.tx.find((x) => x.id === m![1])
    if (t) Object.assign(t, JSON.parse(String(init!.body)))
    return json({ ok: true, item: t ?? {} })
  }
  if (path === '/inbox' && method === 'GET') {
    const s = params.get('status') ?? 'new'
    return json({ items: s === 'all' ? world.inbox : world.inbox.filter((i) => i.status === s), counts: { new: 2, matched: 1, archived: 1 } })
  }
  if (path === '/inbox' && method === 'POST') return json({ ok: true, item: { ...INBOX[0], id: 'innew' } }, 201)
  m = /^\/inbox\/([^/]+)$/.exec(path)
  if (m && method === 'PATCH') {
    const i = world.inbox.find((x) => x.id === m![1])
    const b = JSON.parse(String(init!.body))
    if (i) { Object.assign(i, b); if (b.transaction_id) i.status = 'matched' }
    return json({ ok: true, item: i ?? {} })
  }
  return json({}, 404)
}

let root: Root | null = null
export function setup() {
  world.reset()
  try { localStorage.clear() } catch { /* ignore */ }
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  if (!('ResizeObserver' in globalThis)) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/me') return json({ person: 'bay', role: 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, ui: 'bay-v1' })
    if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0, agents: { gilfoyle: { opencode: 'up' }, jared: { opencode: 'up' } } })
    if (url === '/api/lanes') return json([L('jared-bay', 'dm', 'jared'), L('dm-bay', 'dm')])
    if (url.startsWith('/api/asks')) return json([])
    if (url.startsWith('/api/apps/money')) return money(url, init)
    if (url.endsWith('/messages')) return json([])
    return json({})
  }))
}
export async function teardown() {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
}
export const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) }) }
export async function mount(hash: string) {
  window.location.hash = hash
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => { root!.render(<App />) })
  await settle()
  return el
}
export const q = (el: ParentNode, id: string) => el.querySelector('[data-testid=' + id + ']')
export const all = (el: ParentNode, id: string) => [...el.querySelectorAll('[data-testid=' + id + ']')]
export const body = () => document.body
export const click = async (n: Element | null) => { if (!n) throw new Error('click on null'); await act(async () => (n as HTMLElement).click()); await settle() }
export const typeInto = async (el: Element | null, v: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
    el!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}
export const choose = async (el: Element | null, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v)
    el!.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}
export const blur = async (el: Element | null) => { await act(async () => { el!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) }); await settle() }
export const pickFile = async (input: Element | null, name: string, type = 'application/pdf') => {
  const f = new File(['x'], name, { type })
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [f], configurable: true })
    input!.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}
