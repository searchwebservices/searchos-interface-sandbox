// Wire shapes of GET /api/apps/money/* (admin only). Dates are 'YYYY-MM-DD' in America/Mazatlan; money is MXN unless a row says USD.
export type Semaphore = 'stripe' | 'verde' | 'amarillo' | 'rojo'
export type PayKind = 'monthly' | 'build_deposit' | 'build_final'
export interface Kpis {
  mrr_mxn: number
  collected_month: number
  collected_count?: number
  collected_usd?: number
  open_invoices: { count: number; total: number }
  overdue: { count: number; total: number }
  commissions_due: { count: number; total: number }
  month: string
  as_of: string
}
export interface Charts {
  months: { month: string; invoiced: number; paid: number }[]
  mrr_by_service: { service: string; amount: number }[]
  aging: { key: string; label: string; count: number; total: number }[]
}
export interface OverviewBody { kpis: Kpis; charts: Charts }
export interface Payment { id: string; kind: PayKind; amount: number; period: string | null; paid_at: string | null }
export interface CarteraRow {
  id: string
  company_name: string
  contact_name: string | null
  bucket: string
  closing?: boolean
  mrr_mxn?: number
  board_active?: boolean
  monthly_amount: number
  currency: string
  billing_mode: string | null
  billing_state: string | null
  semaphore: Semaphore
  semaphore_label: string
  last_paid_period: string | null
  next_payment_estimate: string | null
  build_total: number
  build_deposit_amount: number | null
  build_deposit_paid_at: string | null
  build_final_amount: number | null
  build_final_paid_at: string | null
  notes: string | null
  last_payment_at: string | null
  can_mark_paid: boolean
  payments: Payment[]
}
export interface CarteraBody {
  period: string
  today: string
  groups: Record<string, CarteraRow[]>
  totals: { entries: number; activos: number; desarrollo: number; cerrado?: number; mrr: number; cobrado: number; cobrado_count?: number; cobrado_usd?: number; pendiente: number }
}
export interface InvoiceRow { id: string; client_name: string | null; amount: number; currency: string; status: string | null; state: 'paid' | 'open' | 'overdue' | 'void'; type: string | null; due_date: string | null; paid_date: string | null; days_overdue: number }
export interface FacturaRow { id: string; folio: string | null; emisor: string | null; receptor: string | null; subtotal: number; iva: number; total: number; status: string | null; fecha: string | null }
export interface MrrRow { id: string; client_name: string; service: string | null; amount_mxn: number; currency: string; status: string | null; counts_in_mrr: boolean; billing_paused: boolean; archived: boolean; starts_on: string | null }
export interface InvoicesBody { invoices: InvoiceRow[]; facturas: FacturaRow[]; mrr_roster: MrrRow[]; totals: { invoices: number; open: number; overdue: number; facturas: number; mrr_roster: number } }
export interface StripeBody {
  charges: { id: string; amount: number | null; currency: string; status: string | null; created: string | null; description: string | null; email: string | null; url: string }[]
  subscriptions: { id: string; status: string | null; amount: number | null; currency: string | null; interval: string | null; current_period_end: string | null; url: string }[]
}
export interface FacturapiBody { invoices: { id: string; folio: string | null; receptor: string | null; total: number | null; currency: string; status: string | null; created: string | null; pdf: string; xml: string }[] }

// GET /api/apps/money/home: the page in one call. Sentences come ready from the console; the page formats only card amounts.
export type TouchAction = 'mark_paid' | 'draft_reminder' | 'classify' | 'match' | 'open' | 'open_invoices'
export interface TouchRow {
  id: string
  kind: 'invoice' | 'cartera' | 'classify' | 'inbox' | 'closing' | 'more'
  text: string
  actions: TouchAction[]
  invoice_id?: string
  entry_id?: string
  entry?: CarteraRow
  client_name?: string
  amount?: number
  currency?: string
  days?: number
  due_date?: string | null
  count?: number
  prefill?: string
}
export interface HomeCard { amount: number; sub: string; tone?: 'bad' | 'ok' }
export interface HomeBody {
  as_of: string
  month: string
  status: string
  touch: TouchRow[]
  touch_empty: { text: string } | null
  cards: { mrr: HomeCard; collected: HomeCard; overdue: HomeCard; cash: HomeCard }
  jared: { kind: string; text: string; ask: string }
  this_month: { month: string; revenue: number; expenses_total: number; income: { name: string; amount: number; text: string }[]; expenses: { slug: string; name: string; amount: number; text: string }[]; income_text: string | null; expenses_text: string | null }
  chart: { month: string; revenue: number; expenses: number }[]
  burn: number
  expected: { entry_id: string; name: string; amount: number; currency: string; date: string; estimated: boolean; kind: 'payment' | 'last_charge'; days: number; text: string }[]
  accounts: { id: string; name: string; type: string; currency: string; balance: number; enabled: boolean }[]
  kpis: Kpis
}
