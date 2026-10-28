// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { all, body, callsTo, click, mount, q, setup, teardown, typeInto, world } from './testkit'

beforeEach(setup)
afterEach(teardown)
const sheet = () => document.body.querySelector('[data-testid=invoice-sheet]')!

describe('invoice chips and detail sheet', () => {
  it('shows Midday-style status chips with tones', async () => {
    const el = await mount('#/apps/money/invoices')
    expect(all(el, 'invoice-chip').map((c) => [c.textContent, c.getAttribute('data-tone')])).toEqual([['Overdue', 'bad'], ['Paid', 'ok'], ['Open', 'warn']])
    expect(q(el, 'invoice-rows')?.textContent).toContain('17 d late')
  })
  it('opens the sheet for a row and lists the linked facturas, Facturapi invoices and Stripe charges', async () => {
    const el = await mount('#/apps/money/invoices')
    await click(all(el, 'invoice-open')[0]) // Arido, $1,000 overdue
    expect(sheet().getAttribute('data-id')).toBe('i1')
    expect(sheet().querySelector('[data-testid=invoice-sheet-status]')?.getAttribute('data-tone')).toBe('bad')
    expect(sheet().querySelector('[data-testid=invsheet-facturas]')?.getAttribute('data-count')).toBe('1') // receptor Arido SA
    expect(sheet().querySelector('[data-testid=invsheet-factura]')?.textContent).toContain('BP260-7')
    expect(sheet().querySelector('[data-testid=invsheet-facturapi]')?.getAttribute('data-count')).toBe('1')
    expect(sheet().querySelector('[data-testid=invsheet-stripe]')?.getAttribute('data-count')).toBe('0')
  })
  it('matches Stripe charges by amount and currency', async () => {
    const el = await mount('#/apps/money/invoices')
    await click(all(el, 'invoice-open')[1]) // Bravo $2,500: no charge, no factura
    expect(sheet().querySelector('[data-testid=invsheet-stripe]')?.getAttribute('data-count')).toBe('0')
    expect(sheet().textContent).toContain('Nothing linked to this invoice.')
  })
  it('keeps the context for Ask Jared and leaves the page lists intact', async () => {
    localStorage.setItem('apps.jared.open', '1')
    const el = await mount('#/apps/money/invoices')
    await click(all(el, 'invoice-open')[0])
    expect(q(el, 'jared-context')?.textContent).toContain('open invoice: Arido $1,000 MXN (overdue)')
    expect(all(el, 'factura-row')).toHaveLength(1)
  })
})

describe('mark paid on overdue rows', () => {
  it('shows the button on overdue rows only and posts the paid date after a confirm', async () => {
    const el = await mount('#/apps/money/invoices')
    expect(all(el, 'invoice-markpaid')).toHaveLength(1)
    await click(q(el, 'invoice-markpaid'))
    expect(q(body(), 'invoicepaid-dialog')?.textContent).toContain('Arido, $1,000 MXN')
    await typeInto(q(body(), 'invoicepaid-date'), '2026-10-20')
    await click(q(body(), 'invoicepaid-confirm'))
    const post = callsTo(/\/invoices\/i1\/paid$/, 'POST')
    expect(post).toHaveLength(1)
    expect(post[0].body).toEqual({ paid_date: '2026-10-20' })
    expect(q(body(), 'invoicepaid-dialog')).toBeNull()
  })
  it('says plainly when the console cannot write invoices yet', async () => {
    world.invoiceStatus = 503
    const el = await mount('#/apps/money/invoices')
    await click(q(el, 'invoice-markpaid'))
    await click(q(body(), 'invoicepaid-confirm'))
    expect(q(body(), 'invoicepaid-error')?.textContent).toContain('migration 0024')
  })
})
