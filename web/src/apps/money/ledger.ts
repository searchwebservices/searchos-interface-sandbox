// Pure helpers of the ledger tabs: periods, status chips, category colours, match suggestions, vault kinds, customers.
import type { Tone } from '../map/estate'
import type { Account, Attachment, Category, InboxItem, Transaction, TxStatus } from './api'
import type { CarteraRow, InvoiceRow } from './types'

// ---- periods (Midday's date range picker, as presets) ----
export type PeriodId = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'ytd' | 'last-12' | 'custom'
export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'this-month', label: 'This month' }, { id: 'last-month', label: 'Last month' }, { id: 'last-3', label: 'Last 3 months' },
  { id: 'last-6', label: 'Last 6 months' }, { id: 'ytd', label: 'Year to date' }, { id: 'last-12', label: 'Last 12 months' }, { id: 'custom', label: 'Custom' },
]
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => y + '-' + pad(m) + '-' + pad(d)
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
// m is 1-based and may leave 1..12; this normalises.
const shiftMonth = (y: number, m: number, by: number): [number, number] => { const t = y * 12 + (m - 1) + by; return [Math.floor(t / 12), (t % 12) + 1] }

// today is YYYY-MM-DD. Returns inclusive from/to.
export function periodRange(id: PeriodId, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  const monthStart = (yy: number, mm: number) => ymd(yy, mm, 1)
  const monthEnd = (yy: number, mm: number) => ymd(yy, mm, daysIn(yy, mm))
  if (id === 'custom' && custom) return custom
  if (id === 'last-month') { const [ly, lm] = shiftMonth(y, m, -1); return { from: monthStart(ly, lm), to: monthEnd(ly, lm) } }
  if (id === 'last-3' || id === 'last-6' || id === 'last-12') {
    const n = id === 'last-3' ? 3 : id === 'last-6' ? 6 : 12
    const [sy, sm] = shiftMonth(y, m, -(n - 1))
    return { from: monthStart(sy, sm), to: today }
  }
  if (id === 'ytd') return { from: ymd(y, 1, 1), to: today }
  return { from: monthStart(y, m), to: today }
}

// ---- formatting ----
export const absMoney = (n: number): number => Math.abs(n)
export const signTone = (n: number): Tone => (n > 0 ? 'ok' : n < 0 ? 'idle' : 'idle')
export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

// ---- statuses ----
export const TX_STATUS: Record<TxStatus, { label: string; tone: Tone }> = {
  posted: { label: 'Posted', tone: 'ok' }, pending: { label: 'Pending', tone: 'warn' }, archived: { label: 'Archived', tone: 'idle' }, excluded: { label: 'Excluded', tone: 'bad' },
}
export const INBOX_STATUS: Record<InboxItem['status'], { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'warn' }, matched: { label: 'Matched', tone: 'ok' }, archived: { label: 'Archived', tone: 'idle' },
}
export const INVOICE_STATUS: Record<InvoiceRow['state'], { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'ok' }, open: { label: 'Open', tone: 'warn' }, overdue: { label: 'Overdue', tone: 'bad' }, void: { label: 'Void', tone: 'idle' },
}

// ---- categories: the contract gives a token NAME, never a colour ----
// The wire names tokens (accent, ok, warn, muted, danger, info); theme.css names its own. Anything else falls back to the chart cycle.
const TOKEN: Record<string, string> = { accent: 'var(--chart-1)', ok: 'var(--ok)', warn: 'var(--warn)', muted: 'var(--chart-5)', danger: 'var(--destructive)', info: 'var(--chart-4)' }
export const tokenColor = (name: string | null | undefined, i = 0): string => (name && TOKEN[name]) || (name && /^chart-[1-5]$/.test(name) ? 'var(--' + name + ')' : 'var(--chart-' + ((i % 5) + 1) + ')')
export const categoryMap = (cats: Category[]): Record<string, Category> => Object.fromEntries(cats.map((c) => [c.slug, c]))
export const accountMap = (accts: Account[]): Record<string, Account> => Object.fromEntries(accts.map((a) => [a.id, a]))

// ---- transactions table ----
export const COLUMNS = [
  { id: 'date', label: 'Date' }, { id: 'name', label: 'Description' }, { id: 'category', label: 'Category' }, { id: 'account', label: 'Account' },
  { id: 'method', label: 'Method' }, { id: 'counterparty', label: 'From / To' }, { id: 'status', label: 'Status' }, { id: 'amount', label: 'Amount' },
] as const
export type ColumnId = (typeof COLUMNS)[number]['id']
export const DEFAULT_COLUMNS: Record<ColumnId, boolean> = { date: true, name: true, category: true, account: true, method: false, counterparty: false, status: true, amount: true }
const COL_KEY = 'money.tx.columns'
export function loadColumns(): Record<ColumnId, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(COL_KEY) ?? 'null') as Partial<Record<ColumnId, boolean>> | null
    return { ...DEFAULT_COLUMNS, ...(raw ?? {}) }
  } catch { return { ...DEFAULT_COLUMNS } }
}
export function saveColumns(c: Record<ColumnId, boolean>): void {
  try { localStorage.setItem(COL_KEY, JSON.stringify(c)) } catch { /* private mode */ }
}

// ---- inbox: suggested matches by amount, date and name (Midday's suggested-match, client side) ----
const dayNum = (iso: string) => Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / 86400000
export interface Suggestion { tx: Transaction; score: number; reasons: string[] }
export function suggestMatches(item: Pick<InboxItem, 'amount' | 'date' | 'counterparty_name' | 'name'>, rows: Transaction[], limit = 5): Suggestion[] {
  const out: Suggestion[] = []
  for (const tx of rows) {
    if (tx.status === 'archived' || tx.status === 'excluded') continue
    let score = 0
    const reasons: string[] = []
    if (item.amount != null) {
      const a = Math.abs(item.amount), b = Math.abs(tx.amount)
      if (a > 0 && Math.abs(a - b) < 0.005) { score += 5; reasons.push('same amount') }
      else if (a > 0 && Math.abs(a - b) / a <= 0.02) { score += 2; reasons.push('amount within 2%') }
    }
    if (item.date) {
      const d = Math.abs(dayNum(item.date) - dayNum(tx.date))
      if (d <= 3) { score += 2; reasons.push(d === 0 ? 'same day' : d + ' d apart') } else if (d <= 14) { score += 1; reasons.push(d + ' d apart') }
    }
    const who = (item.counterparty_name ?? item.name ?? '').toLowerCase().replace(/\.[a-z0-9]+$/, '')
    const hay = ((tx.counterparty_name ?? '') + ' ' + tx.name).toLowerCase()
    if (who.length >= 3 && who.split(/[^a-z0-9]+/).filter((w) => w.length >= 3).some((w) => hay.includes(w))) { score += 2; reasons.push('name') }
    if (score >= 3) out.push({ tx, score, reasons })
  }
  return out.sort((x, y) => y.score - x.score || (x.tx.date < y.tx.date ? 1 : -1)).slice(0, limit)
}

// ---- vault ----
export type VaultKind = 'all' | 'image' | 'pdf' | 'other'
export const kindOfMime = (mime: string): Exclude<VaultKind, 'all'> => (mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'other')
export interface VaultFile { id: string; name: string; mime: string; size: number; kind: string; created_at: string; origin: 'transaction' | 'inbox'; origin_id: string; origin_label: string }
export const vaultFromAttachment = (a: Attachment, tx: Pick<Transaction, 'id' | 'name'>): VaultFile => ({ ...a, origin: 'transaction', origin_id: tx.id, origin_label: tx.name })
export const vaultFromInbox = (i: InboxItem): VaultFile => ({ id: i.id, name: i.name, mime: i.mime, size: i.size, kind: 'receipt', created_at: i.created_at, origin: 'inbox', origin_id: i.id, origin_label: i.counterparty_name ?? 'Inbox' })

// ---- customers ----
export interface CustomerRow { key: string; name: string; id: string | null; former: boolean; mrr: number; last_payment: string | null; open_balance: number; collected: number; tx_count: number }
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function buildCustomers(cartera: CarteraRow[], invoices: InvoiceRow[], rows: Transaction[]): CustomerRow[] {
  const byName = new Map<string, CustomerRow>()
  for (const c of cartera) {
    byName.set(norm(c.company_name), { key: c.id, name: c.company_name, id: c.id, former: c.bucket === 'cerrado' && !c.board_active, mrr: c.mrr_mxn ?? 0, last_payment: c.last_payment_at, open_balance: 0, collected: 0, tx_count: 0 })
  }
  for (const i of invoices) {
    if (i.state !== 'open' && i.state !== 'overdue') continue
    const c = byName.get(norm(i.client_name))
    if (c && i.currency === 'MXN') c.open_balance += i.amount
  }
  for (const t of rows) {
    if (t.amount <= 0 || t.status === 'excluded' || t.status === 'archived') continue
    const c = byName.get(norm(t.counterparty_name))
    if (!c) continue
    if (t.currency !== 'MXN') continue
    c.collected += t.amount
    c.tx_count += 1
    if (t.client_id) c.id = t.client_id
    if (!c.last_payment || t.date > c.last_payment) c.last_payment = t.date
  }
  return [...byName.values()].sort((a, b) => b.mrr - a.mrr || a.name.localeCompare(b.name))
}

// ---- invoices: what belongs to a row ----
export function relatedToInvoice<F extends { receptor: string | null; total: number }, C extends { amount: number | null; currency: string; description: string | null; email: string | null }>(inv: InvoiceRow, facturas: F[], charges: C[]): { facturas: F[]; charges: C[] } {
  const who = norm(inv.client_name)
  const nameHit = (s: string | null) => who.length >= 3 && norm(s).includes(who)
  return {
    facturas: facturas.filter((f) => nameHit(f.receptor) || Math.abs(f.total - inv.amount) < 0.005),
    charges: charges.filter((c) => (c.amount != null && Math.abs(c.amount - inv.amount) < 0.005 && c.currency.toUpperCase() === inv.currency.toUpperCase()) || nameHit(c.description) || nameHit(c.email)),
  }
}

export const addDays = (iso: string, n: number): string => new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
