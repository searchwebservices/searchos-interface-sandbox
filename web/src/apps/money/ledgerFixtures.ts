// Fixtures for the ledger tabs, shaped like the contract. Used by the tests; nothing here ships to a route.
import type { Account, Attachment, Category, InboxItem, LedgerOverview, Transaction, TransactionDetail } from './api'

export const ACCOUNTS: Account[] = [
  { id: 'a1', name: 'Stripe', type: 'stripe', currency: 'MXN', balance: 12500, enabled: true },
  { id: 'a2', name: 'Banorte', type: 'bank', currency: 'MXN', balance: -4200, enabled: true },
  { id: 'a3', name: 'Caja', type: 'cash', currency: 'MXN', balance: 800, enabled: false },
  { id: 'a4', name: 'Stripe USD', type: 'stripe', currency: 'USD', balance: 300, enabled: true },
]
export const CATEGORIES: Category[] = [
  { slug: 'revenue', name: 'Revenue', color: 'ok', parent_slug: null, system: true },
  { slug: 'software', name: 'Software', color: 'accent', parent_slug: null, system: true },
  { slug: 'hosting', name: 'Hosting', color: 'info', parent_slug: 'software', system: false },
  { slug: 'refunds', name: 'Refunds', color: 'danger', parent_slug: null, system: true },
  { slug: 'travel', name: 'Travel', color: 'warn', parent_slug: null, system: true },
]
const tx = (o: Partial<Transaction> & { id: string; name: string; amount: number; date: string }): Transaction => ({
  currency: 'MXN', status: 'posted', method: 'card', category_slug: null, account_id: 'a1', counterparty_name: null, client_id: null, internal: false, note: null,
  source: 'stripe', source_id: null, attachment_count: 0, ...o,
})
export const TRANSACTIONS: Transaction[] = [
  tx({ id: 't1', name: 'Arido monthly', amount: 5000, date: '2026-10-05', category_slug: 'revenue', counterparty_name: 'Arido', client_id: 'c-arido', method: 'transfer', attachment_count: 1 }),
  tx({ id: 't2', name: 'Hetzner server', amount: -1200, date: '2026-10-04', category_slug: 'hosting', account_id: 'a2', counterparty_name: 'Hetzner', source: 'import', attachment_count: 1 }),
  tx({ id: 't3', name: 'Figma', amount: -450.5, date: '2026-10-03', category_slug: null, account_id: 'a2', counterparty_name: 'Figma', source: 'import' }),
  tx({ id: 't4', name: 'Flight to CDMX', amount: -3100, date: '2026-10-02', category_slug: 'travel', account_id: 'a2', status: 'pending', source: 'manual' }),
  tx({ id: 't5', name: 'Bravo setup', amount: 2500, date: '2026-09-28', category_slug: 'revenue', counterparty_name: 'Bravo', source: 'facturapi', status: 'archived' }),
]
// expenses is positive on the wire
export const LEDGER_TOTALS = { count: 5, by_currency: { MXN: { income: 7500, expenses: 4750.5, net: 2749.5 }, USD: { income: 300, expenses: 0, net: 300 } } }
export const ATT_IMG: Attachment = { id: 'at1', name: 'receipt.png', mime: 'image/png', size: 20480, kind: 'receipt', created_at: '2026-10-05T12:00:00Z' }
export const ATT_PDF: Attachment = { id: 'at2', name: 'invoice-hetzner.pdf', mime: 'application/pdf', size: 2097152, kind: 'invoice', created_at: '2026-10-04T12:00:00Z' }
export const DETAILS: Record<string, TransactionDetail> = {
  t1: { ...TRANSACTIONS[0], attachments: [ATT_IMG] },
  t2: { ...TRANSACTIONS[1], attachments: [ATT_PDF] },
}
export const detailOf = (id: string): TransactionDetail => DETAILS[id] ?? { ...TRANSACTIONS.find((t) => t.id === id)!, attachments: [] }

export const INBOX: InboxItem[] = [
  { id: 'in1', name: 'figma-receipt.pdf', mime: 'application/pdf', size: 48000, amount: 450.5, currency: 'MXN', date: '2026-10-03', counterparty_name: 'Figma', status: 'new', transaction_id: null, source: 'upload', created_at: '2026-10-03T09:00:00Z' },
  { id: 'in2', name: 'taxi.jpg', mime: 'image/jpeg', size: 90000, amount: 180, currency: 'MXN', date: '2026-10-01', counterparty_name: null, status: 'new', transaction_id: null, source: 'upload', created_at: '2026-10-01T09:00:00Z' },
  { id: 'in3', name: 'arido.pdf', mime: 'application/pdf', size: 30000, amount: 5000, currency: 'MXN', date: '2026-10-05', counterparty_name: 'Arido', status: 'matched', transaction_id: 't1', source: 'email', created_at: '2026-10-05T09:00:00Z' },
  { id: 'in4', name: 'old.pdf', mime: 'application/pdf', size: 1000, amount: null, currency: null, date: null, counterparty_name: null, status: 'archived', transaction_id: null, source: 'upload', created_at: '2026-09-01T09:00:00Z' },
]

export const LEDGER_OVERVIEW: LedgerOverview = {
  from: '2026-05-01', to: '2026-10-27', currency: 'MXN',
  revenue: 7500, expenses: 4750.5, profit: 2749.5, burn: 4750.5,
  by_month: [{ month: '2026-08', revenue: 6000, expenses: 4000, profit: 2000 }, { month: '2026-09', revenue: 7000, expenses: 4400, profit: 2600 }, { month: '2026-10', revenue: 7500, expenses: 4750.5, profit: 2749.5 }],
  by_category: [{ slug: 'hosting', name: 'Hosting', color: 'info', revenue: 0, expenses: 1200 }, { slug: 'travel', name: 'Travel', color: 'warn', revenue: 0, expenses: 3100 }, { slug: 'software', name: 'Software', color: 'accent', revenue: 0, expenses: 450.5 }, { slug: 'revenue', name: 'Revenue', color: 'ok', revenue: 7500, expenses: 0 }],
  top_counterparties: [{ name: 'Arido', revenue: 5000, expenses: 0, count: 1 }, { name: 'Bravo', revenue: 2500, expenses: 0, count: 1 }, { name: 'Hetzner', revenue: 0, expenses: 1200, count: 1 }],
}
export const LEDGER_OVERVIEW_USD: LedgerOverview = { ...LEDGER_OVERVIEW, currency: 'USD', revenue: 300, expenses: 0, profit: 300, burn: 0, by_category: [], top_counterparties: [{ name: 'Acme', revenue: 300, expenses: 0, count: 1 }], by_month: [{ month: '2026-10', revenue: 300, expenses: 0, profit: 300 }] }
