// Thin client over the ledger routes under /api/apps/money (contract: docs/money-ledger.md on the ledger branch).
// Every call resolves to ApiResult, none throws. Query strings drop empty values.
import { call } from '@/lib/api'
import type { ApiResult } from '@/lib/api'
import type { HomeBody } from './types'

export type TxStatus = 'posted' | 'pending' | 'archived' | 'excluded'
export type TxSource = 'stripe' | 'facturapi' | 'manual' | 'import'
export interface Transaction {
  id: string
  date: string
  name: string
  amount: number // income positive, expense negative
  currency: string
  status: TxStatus
  method: string | null
  category_slug: string | null
  account_id: string | null
  counterparty_name: string | null
  client_id: string | null
  internal: boolean
  note: string | null
  source: TxSource
  source_id: string | null
  attachment_count: number
  category_name?: string | null
  category_color?: string | null
  account_name?: string | null
}
export interface Attachment { id: string; name: string; mime: string; size: number; kind: string; created_at: string; url?: string }
export interface TransactionDetail extends Transaction { attachments: Attachment[] }
// expenses is a positive number on the wire; totals cover the whole filter, per currency.
export interface LedgerTotals { count: number; by_currency: Record<string, { income: number; expenses: number; net: number }> }
// `rows` is the wire's `items`, renamed by the client below.
export interface LedgerPage { rows: Transaction[]; next_cursor: string | null; totals: LedgerTotals }
export interface LedgerQuery { from?: string; to?: string; account?: string; category?: string; status?: string; q?: string; cursor?: string }
export interface TxPatch { category_slug?: string | null; note?: string | null; status?: TxStatus; internal?: boolean; client_id?: string | null; counterparty_name?: string | null }
export type InboxStatus = 'new' | 'matched' | 'archived'
export interface InboxItem {
  id: string; name: string; mime: string; size: number; amount: number | null; currency: string | null; date: string | null
  counterparty_name: string | null; status: InboxStatus; transaction_id: string | null; source: string; created_at: string
}
export interface Account { id: string; name: string; type: string; currency: string; balance: number; enabled: boolean; tx_count?: number; net?: number }
export interface Category { slug: string; name: string; color: string; parent_slug: string | null; system: boolean }
export interface LedgerOverview {
  from: string; to: string; currency: string
  revenue: number; expenses: number; profit: number; burn: number
  by_month: { month: string; revenue: number; expenses: number; profit: number }[]
  by_category: { slug: string; name: string; color: string; revenue: number; expenses: number }[]
  top_counterparties: { name: string; revenue: number; expenses: number; count: number }[]
}

const BASE = '/api/apps/money/'
export const qs = (o: Record<string, string | undefined>): string => {
  const p = Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v as string))
  return p.length ? '?' + p.join('&') : ''
}
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const form = (file: File, extra?: Record<string, string>): RequestInit => {
  const f = new FormData()
  f.append('file', file)
  for (const [k, v] of Object.entries(extra ?? {})) f.append(k, v)
  return { method: 'POST', body: f }
}

export const fileUrl = (attachmentId: string): string => BASE + 'attachments/' + encodeURIComponent(attachmentId) + '/file'
export const inboxFileUrl = (inboxId: string): string => BASE + 'inbox/' + encodeURIComponent(inboxId) + '/file'

// The wire wraps lists in { items } and writes in { ok, item }; these unwrap so the tabs read plain values.
type R<T> = ApiResult<T>
const map = <A, B>(r: ApiResult<A>, f: (a: A) => B): R<B> => (r.ok ? { ...r, body: f(r.body) } : (r as unknown as R<B>))

export const ledgerApi = {
  list: async (q: LedgerQuery = {}): Promise<R<LedgerPage>> =>
    map(await call<{ items: Transaction[]; next_cursor: string | null; totals: LedgerTotals }>(BASE + 'ledger' + qs({ ...q })), (b) => ({ rows: Array.isArray(b?.items) ? b.items : (undefined as unknown as Transaction[]), next_cursor: b?.next_cursor ?? null, totals: b?.totals ?? { count: 0, by_currency: {} } })),
  get: (id: string) => call<TransactionDetail>(BASE + 'ledger/' + encodeURIComponent(id)),
  patch: async (id: string, p: TxPatch) => map(await call<{ ok: boolean; item: Transaction }>(BASE + 'ledger/' + encodeURIComponent(id), jsonInit('PATCH', p)), (b) => b.item),
  create: async (t: { date: string; name: string; amount: number; account_id: string; currency?: string; category_slug?: string | null; status?: TxStatus; counterparty_name?: string | null; note?: string | null }) =>
    map(await call<{ ok: boolean; item: Transaction }>(BASE + 'ledger', jsonInit('POST', t)), (b) => b.item),
  upload: async (id: string, file: File) => map(await call<{ ok: boolean; attachment: Attachment }>(BASE + 'ledger/' + encodeURIComponent(id) + '/attachments', form(file)), (b) => b.attachment),
  // No status asks for everything; the wire's own default is new only.
  inbox: async (status?: InboxStatus) => map(await call<{ items: InboxItem[]; counts?: Record<InboxStatus, number> }>(BASE + 'inbox' + qs({ status: status ?? 'all' })), (b) => ({ rows: b?.items as InboxItem[], counts: b?.counts })),
  inboxUpload: async (file: File) => map(await call<{ ok: boolean; item: InboxItem }>(BASE + 'inbox', form(file)), (b) => b.item),
  inboxPatch: async (id: string, p: { transaction_id?: string | null; status?: 'archived' | 'new'; kind?: string }) => map(await call<{ ok: boolean; item: InboxItem }>(BASE + 'inbox/' + encodeURIComponent(id), jsonInit('PATCH', p)), (b) => b.item),
  accounts: async () => map(await call<{ items: Account[] }>(BASE + 'accounts'), (b) => b?.items as Account[]),
  categories: async () => map(await call<{ items: Category[] }>(BASE + 'categories'), (b) => b?.items as Category[]),
  overview: (from: string, to: string, currency = 'MXN') => call<LedgerOverview>(BASE + 'overview' + qs({ from, to, currency })),
  sync: (only?: string) => call<{ ok?: boolean }>(BASE + 'sync/run' + qs({ only }), { method: 'POST' }),
  // The home page in one call, the typed cash balance, and marking an invoice paid (503 invoices_not_writable until migration 0024 runs).
  home: () => call<HomeBody>(BASE + 'home'),
  setBalance: async (id: string, balance: number) => map(await call<{ ok: boolean; item: Account }>(BASE + 'accounts/' + encodeURIComponent(id), jsonInit('PATCH', { balance })), (b) => b.item),
  invoicePaid: (id: string, paid_date?: string) => call<{ ok?: boolean; error?: string }>(BASE + 'invoices/' + encodeURIComponent(id) + '/paid', jsonInit('POST', paid_date ? { paid_date } : {})),
}
