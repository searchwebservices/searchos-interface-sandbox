import { describe, expect, it } from 'vitest'
import { qs } from './api'
import { ACCOUNTS, CATEGORIES, INBOX, TRANSACTIONS } from './ledgerFixtures'
import { accountMap, addDays, buildCustomers, bytes, categoryMap, kindOfMime, periodRange, relatedToInvoice, suggestMatches, tokenColor } from './ledger'
import { CARTERA, INVOICES, STRIPE } from './fixtures'

describe('periodRange', () => {
  it('builds month, quarter and year windows', () => {
    expect(periodRange('this-month', '2026-10-27')).toEqual({ from: '2026-10-01', to: '2026-10-27' })
    expect(periodRange('last-month', '2026-10-27')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(periodRange('last-month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodRange('last-3', '2026-10-27')).toEqual({ from: '2026-08-01', to: '2026-10-27' })
    expect(periodRange('last-12', '2026-03-05')).toEqual({ from: '2025-04-01', to: '2026-03-05' })
    expect(periodRange('ytd', '2026-10-27')).toEqual({ from: '2026-01-01', to: '2026-10-27' })
    expect(periodRange('custom', '2026-10-27', { from: '2026-02-01', to: '2026-02-09' })).toEqual({ from: '2026-02-01', to: '2026-02-09' })
  })
  it('handles leap Februaries', () => {
    expect(periodRange('last-month', '2028-03-10').to).toBe('2028-02-29')
  })
})

describe('helpers', () => {
  it('drops empty query values and encodes the rest', () => {
    expect(qs({ a: '1', b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x%20y')
    expect(qs({})).toBe('')
  })
  it('formats sizes and kinds', () => {
    expect(bytes(512)).toBe('512 B')
    expect(bytes(2048)).toBe('2.0 KB')
    expect(bytes(2097152)).toBe('2.0 MB')
    expect(kindOfMime('image/png')).toBe('image')
    expect(kindOfMime('application/pdf')).toBe('pdf')
    expect(kindOfMime('text/csv')).toBe('other')
  })
  it('turns a token name into a var and never a colour', () => {
    expect(tokenColor('chart-2')).toBe('var(--chart-2)')
    expect(tokenColor('#ff0000', 1)).toBe('var(--chart-2)')
    expect(tokenColor(null, 7)).toBe('var(--chart-3)')
  })
  it('indexes categories and accounts', () => {
    expect(categoryMap(CATEGORIES).hosting.parent_slug).toBe('software')
    expect(accountMap(ACCOUNTS).a2.name).toBe('Banorte')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('suggestMatches', () => {
  it('ranks the same amount and day first and skips archived or excluded rows', () => {
    const s = suggestMatches(INBOX[0], TRANSACTIONS)
    expect(s[0].tx.id).toBe('t3')
    expect(s[0].reasons).toContain('same amount')
    expect(s.map((x) => x.tx.id)).not.toContain('t5')
  })
  it('finds nothing when amount, date and name are all far', () => {
    expect(suggestMatches({ amount: 99999, date: '2020-01-01', counterparty_name: null, name: 'zz.pdf' }, TRANSACTIONS)).toEqual([])
  })
  it('accepts an amount within 2 percent together with a close date', () => {
    const s = suggestMatches({ amount: 455, date: '2026-10-04', counterparty_name: null, name: 'x.pdf' }, TRANSACTIONS)
    expect(s[0].tx.id).toBe('t3')
    expect(s[0].reasons).toContain('amount within 2%')
  })
})

describe('buildCustomers', () => {
  it('joins cartera, open invoices and ledger income by name', () => {
    const arido = { ...CARTERA.groups.activos[0], id: 'e9', company_name: 'Arido', monthly_amount: 5000, mrr_mxn: 5000, last_payment_at: '2026-09-04', bucket: 'activos' }
    const rows = buildCustomers([arido, ...CARTERA.groups.desarrollo], INVOICES.invoices, TRANSACTIONS)
    const a = rows.find((r) => r.name === 'Arido')!
    expect(a).toMatchObject({ mrr: 5000, open_balance: 1000, collected: 5000, last_payment: '2026-10-05', id: 'c-arido', tx_count: 1 })
    expect(rows.find((r) => r.name === 'Dev Project')!.mrr).toBe(0)
  })
  it('takes MRR from the board figure on the row, and marks closed non-board rows as former', () => {
    const base = CARTERA.groups.activos[0]
    const rows = buildCustomers([
      { ...base, id: 'a', company_name: 'Active Co', monthly_amount: 9000, mrr_mxn: 7500, board_active: true },
      { ...base, id: 'z', company_name: 'Closing Co', monthly_amount: 5000, mrr_mxn: 0, closing: true, board_active: true },
      { ...base, id: 'c', company_name: 'Old Co', bucket: 'cerrado', monthly_amount: 1500, mrr_mxn: 0, board_active: false },
      { ...base, id: 'k', company_name: 'Kept Closed', bucket: 'cerrado', mrr_mxn: 0, board_active: true },
    ], [], [])
    const by = (n: string) => rows.find((r) => r.name === n)!
    expect(by('Active Co')).toMatchObject({ mrr: 7500, former: false })
    expect(by('Closing Co')).toMatchObject({ mrr: 0, former: false })
    expect(by('Old Co')).toMatchObject({ mrr: 0, former: true })
    expect(by('Kept Closed').former).toBe(false)
  })
})

describe('relatedToInvoice', () => {
  it('links facturas by receptor or amount and charges by amount and currency', () => {
    const inv = INVOICES.invoices[0]
    const none = relatedToInvoice({ ...inv, client_name: 'Zzz' }, INVOICES.facturas, STRIPE.charges)
    expect(none.facturas).toHaveLength(0)
    const r = relatedToInvoice({ ...inv, client_name: 'Arido', amount: 1500 }, [{ receptor: 'Arido SA', total: 116 }], STRIPE.charges)
    expect(r.facturas).toHaveLength(1)
    expect(r.charges).toHaveLength(1)
  })
})
