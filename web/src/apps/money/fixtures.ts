import type { CarteraBody, CarteraRow, FacturapiBody, HomeBody, InvoicesBody, OverviewBody, StripeBody } from './types'

export const OVERVIEW: OverviewBody = {
  kpis: { mrr_mxn: 13000, collected_month: 1000, collected_count: 2, open_invoices: { count: 5, total: 10900 }, overdue: { count: 4, total: 10000 }, commissions_due: { count: 1, total: 100 }, month: '2026-10', as_of: '2026-10-27' },
  charts: {
    months: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({ month, invoiced: 1000 * i, paid: 800 * i })),
    mrr_by_service: [{ service: 'Site', amount: 300 }, { service: 'Agent', amount: 150 }],
    aging: [{ key: '0-30', label: '0 to 30', count: 1, total: 1000 }, { key: '31-60', label: '31 to 60', count: 1, total: 2000 }, { key: '61-90', label: '61 to 90', count: 0, total: 0 }, { key: '90+', label: '90 plus', count: 1, total: 4000 }],
  },
}

const row = (o: Partial<CarteraRow> & { id: string; company_name: string }): CarteraRow => ({
  contact_name: null, bucket: 'activos', monthly_amount: 1000, currency: 'MXN', billing_mode: 'manual', billing_state: 'cobrando', semaphore: 'amarillo', semaphore_label: 'Pendiente', last_paid_period: '2026-09-01',
  next_payment_estimate: '2026-11-03', build_total: 0, build_deposit_amount: null, build_deposit_paid_at: null, build_final_amount: null, build_final_paid_at: null, notes: null, last_payment_at: '2026-09-04', can_mark_paid: true, payments: [], ...o,
})
export const CARTERA: CarteraBody = {
  period: '2026-10-01', today: '2026-10-27',
  groups: {
    activos: [
      row({ id: 'e3', company_name: 'Beta Stripe', semaphore: 'stripe', billing_mode: 'stripe', can_mark_paid: false, monthly_amount: 500 }),
      row({ id: 'e1', company_name: 'Zeta Cafe', semaphore: 'verde', can_mark_paid: false, last_paid_period: '2026-10-01', last_payment_at: '2026-10-05', payments: [{ id: 'p1', kind: 'monthly', amount: 1000, period: '2026-10-01', paid_at: '2026-10-05' }], notes: 'Pays by transfer' }),
      row({ id: 'e2', company_name: 'Alfa Studio', monthly_amount: 12500, mrr_mxn: 12500, build_total: 30000, build_deposit_amount: 15000, build_deposit_paid_at: '2026-08-01', build_final_amount: 15000 }),
      row({ id: 'e4', company_name: 'Gama Dollars', semaphore: 'rojo', currency: 'USD', monthly_amount: 900, can_mark_paid: false, billing_state: 'no_iniciado' }),
    ],
    desarrollo: [row({ id: 'e5', company_name: 'Dev Project', bucket: 'desarrollo', semaphore: 'rojo', can_mark_paid: false, monthly_amount: 0, build_deposit_amount: 5000 })],
  },
  totals: { entries: 5, activos: 4, desarrollo: 1, mrr: 14000, cobrado: 1500, pendiente: 12500 },
}
export const manyEntries = (n: number): CarteraBody => ({ ...CARTERA, groups: { activos: Array.from({ length: n }, (_, i) => row({ id: 'm' + i, company_name: 'Client ' + String(i).padStart(3, '0') })), desarrollo: [] } })

export const INVOICES: InvoicesBody = {
  invoices: [
    { id: 'i1', client_name: 'Arido', amount: 1000, currency: 'MXN', status: 'sent', state: 'overdue', type: null, due_date: '2026-10-10', paid_date: null, days_overdue: 17 },
    { id: 'i2', client_name: 'Bravo', amount: 2500, currency: 'MXN', status: 'paid', state: 'paid', type: null, due_date: '2026-09-01', paid_date: '2026-09-03', days_overdue: 0 },
    { id: 'i3', client_name: null, amount: 300, currency: 'USD', status: 'sent', state: 'open', type: null, due_date: '2026-11-30', paid_date: null, days_overdue: 0 },
  ],
  facturas: [{ id: 'f1', folio: 'BP260-7', emisor: 'Borja', receptor: 'Arido SA', subtotal: 100, iva: 16, total: 116, status: 'vigente', fecha: '2026-10-04' }],
  mrr_roster: [
    { id: 'm1', client_name: 'Arido', service: 'Agent', amount_mxn: 5000, currency: 'MXN', status: 'active', counts_in_mrr: true, billing_paused: false, archived: false, starts_on: null },
    { id: 'm2', client_name: 'Old Co', service: 'Site', amount_mxn: 700, currency: 'MXN', status: 'ended', counts_in_mrr: false, billing_paused: true, archived: true, starts_on: null },
  ],
  totals: { invoices: 3, open: 2, overdue: 1, facturas: 1, mrr_roster: 2 },
}
export const STRIPE: StripeBody = {
  charges: [{ id: 'ch_1', amount: 1500, currency: 'MXN', status: 'succeeded', created: '2026-10-02T10:00:00Z', description: null, email: 'a@b.c', url: 'https://dashboard.stripe.com/payments/pi_1' }],
  subscriptions: [{ id: 'sub_1', status: 'active', amount: 5000, currency: 'MXN', interval: 'month', current_period_end: '2026-11-02T00:00:00Z', url: 'https://dashboard.stripe.com/subscriptions/sub_1' }],
}
export const FACTURAPI: FacturapiBody = { invoices: [{ id: 'inv123abc', folio: 'BP-7', receptor: 'Arido SA', total: 116, currency: 'MXN', status: 'valid', created: '2026-10-01T00:00:00Z', pdf: '/api/apps/money/facturapi/inv123abc/pdf', xml: '/api/apps/money/facturapi/inv123abc/xml' }] }

// GET /api/apps/money/home on 2026-10-27: three recurring clients, Zycar closing, four stale invoices, 58 pending lines.
export const ARIDO_LATE = row({ id: 'e-arido', company_name: 'Árido Café', monthly_amount: 7500, mrr_mxn: 7500, next_payment_estimate: '2026-10-03', last_paid_period: '2026-09-01' })
export const HOME: HomeBody = {
  as_of: '2026-10-27', month: '2026-10',
  status: '13,000 MXN a month from three clients. 18,510 collected in October. 23,500 overdue across four invoices. Burn 58,864 a month, runway not on file.',
  touch: [
    { id: 'invoice:i-jacky', kind: 'invoice', invoice_id: 'i-jacky', client_name: 'Magnolia Florals', amount: 15000, currency: 'MXN', days: 180, due_date: '2026-04-30', text: 'Magnolia Florals owes 15,000 MXN, 180 days late.', actions: ['mark_paid', 'draft_reminder'], prefill: "Draft a short payment reminder to Magnolia Florals for the invoice of 15,000 MXN due April 30, 180 days late. Write it in the client's language, for Bay to review before anything is sent." },
    { id: 'invoice:i-baja', kind: 'invoice', invoice_id: 'i-baja', client_name: 'Baja Experience', amount: 2000, currency: 'MXN', days: 180, due_date: '2026-04-30', text: 'Baja Experience owes 2,000 MXN, 180 days late.', actions: ['mark_paid', 'draft_reminder'], prefill: 'Draft a short payment reminder to Baja Experience for the invoice of 2,000 MXN due April 30, 180 days late.' },
    { id: 'cartera:e-arido', kind: 'cartera', entry_id: 'e-arido', client_name: 'Árido Café', amount: 7500, currency: 'MXN', days: 24, due_date: '2026-10-03', text: "Árido Café's payment of 7,500 MXN was expected October 3.", actions: ['mark_paid'], entry: ARIDO_LATE },
    { id: 'classify', kind: 'classify', count: 58, text: '58 lines need a category.', actions: ['classify'] },
    { id: 'inbox', kind: 'inbox', count: 2, text: '2 receipts in the inbox have no transaction yet.', actions: ['match'] },
    { id: 'closing:e-zycar', kind: 'closing', entry_id: 'e-zycar', client_name: 'ZY CAR', due_date: '2026-11-04', text: "ZY CAR's last charge is November 4.", actions: ['open'] },
  ],
  touch_empty: null,
  cards: { mrr: { amount: 13000, sub: 'three clients' }, collected: { amount: 18510.41, sub: 'four payments' }, overdue: { amount: 23500, sub: 'four invoices, oldest 180 days', tone: 'bad' }, cash: { amount: 0, sub: 'no bank balance on file' } },
  jared: { kind: 'invoice', text: 'Jared would start with Magnolia Florals: 15,000 MXN, 180 days late, the oldest open invoice.', ask: "Magnolia Florals' invoice for 15,000 MXN is 180 days late. What would you do first?" },
  this_month: {
    month: '2026-10', revenue: 18510.41, expenses_total: 9521.97,
    income: [{ name: 'Árido', amount: 7806.25, text: 'Árido paid 7,806 MXN.' }, { name: 'Zycar', amount: 5204.16, text: 'Zycar paid 5,204 MXN.' }, { name: 'Unique Cabo Weddings', amount: 3500, text: 'Unique Cabo Weddings paid 3,500 MXN.' }, { name: 'Baja Experience', amount: 2000, text: 'Baja Experience paid 2,000 MXN.' }],
    expenses: [{ slug: 'salary', name: 'Salary', amount: 6000, text: 'Salary took 6,000 MXN.' }, { slug: 'fees', name: 'Fees', amount: 2441.97, text: 'Fees took 2,442 MXN.' }, { slug: 'software', name: 'Software', amount: 900, text: 'Software took 900 MXN.' }],
    income_text: null, expenses_text: null,
  },
  chart: [{ month: '2026-05', revenue: 57000, expenses: 30438.44 }, { month: '2026-06', revenue: 68849.98, expenses: 125901.33 }, { month: '2026-07', revenue: 81204.17, expenses: 40763.9 }, { month: '2026-08', revenue: 31284.17, expenses: 90117.46 }, { month: '2026-09', revenue: 20570.41, expenses: 56440.43 }, { month: '2026-10', revenue: 18510.41, expenses: 9521.97 }],
  burn: 58863.92,
  expected: [
    { entry_id: 'e-arido', name: 'Árido Café', amount: 7500, currency: 'MXN', date: '2026-11-03', estimated: false, kind: 'payment', days: 7, text: 'Árido Café, 7,500 MXN on November 3.' },
    { entry_id: 'e-baja', name: 'Baja Experience', amount: 2000, currency: 'MXN', date: '2026-11-03', estimated: true, kind: 'payment', days: 7, text: 'Baja Experience, 2,000 MXN on November 3 (estimated).' },
    { entry_id: 'e-ucw', name: 'Unique Cabo Weddings', amount: 3500, currency: 'MXN', date: '2026-11-03', estimated: true, kind: 'payment', days: 7, text: 'Unique Cabo Weddings, 3,500 MXN on November 3 (estimated).' },
    { entry_id: 'e-zycar', name: 'ZY CAR', amount: 5000, currency: 'MXN', date: '2026-11-04', estimated: false, kind: 'last_charge', days: 8, text: "ZY CAR's last charge, 5,000 MXN on November 4." },
  ],
  accounts: [{ id: 'a1', name: 'Banorte', type: 'bank', currency: 'MXN', balance: 0, enabled: true }, { id: 'a2', name: 'Caja', type: 'cash', currency: 'MXN', balance: 0, enabled: true }, { id: 'a3', name: 'Old', type: 'bank', currency: 'MXN', balance: 0, enabled: false }],
  kpis: OVERVIEW.kpis,
}
export const HOME_QUIET: HomeBody = {
  ...HOME, touch: [], touch_empty: { text: 'Nothing needs you. Next payment expected: Árido Café on November 3.' },
  status: '13,000 MXN a month from three clients. 18,510 collected in October. Nothing overdue. Burn 58,864 a month, runway 0.7 months.',
  cards: { ...HOME.cards, overdue: { amount: 0, sub: 'nothing overdue', tone: 'ok' }, cash: { amount: 40000, sub: 'across one account' } },
  jared: { kind: 'expected', text: "Jared would start with Árido Café's payment on November 3.", ask: "Árido Café's payment of 7,500 MXN is expected November 3. Anything to prepare?" },
  this_month: { ...HOME.this_month, income: [], expenses: [], income_text: 'No income posted yet in October.', expenses_text: 'No expenses posted yet in October.' },
  expected: [],
}
