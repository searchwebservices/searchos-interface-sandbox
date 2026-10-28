// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { all, callsTo, choose, click, mount, q, setup, teardown, typeInto, world } from './testkit'

beforeEach(setup)
afterEach(teardown)

describe('money shell tabs', () => {
  it('lists the eight tabs in order and opens Home by default', async () => {
    const el = await mount('#/apps/money')
    expect(all(el, 'money-tabs')[0].querySelectorAll('[role=tab]')).toHaveLength(8)
    expect([...el.querySelectorAll('[role=tab]')].map((t) => t.getAttribute('data-testid'))).toEqual(['tab-home', 'tab-overview', 'tab-transactions', 'tab-inbox', 'tab-invoices', 'tab-cartera', 'tab-vault', 'tab-customers'])
    expect(q(el, 'tab-home')?.getAttribute('aria-selected')).toBe('true')
    expect(q(el, 'home-tab')).not.toBeNull()
    expect(q(el, 'money-strip')).toBeNull()
  })
  it('keeps the KPI strip on every tab but Home and moves the hash with the tab', async () => {
    const el = await mount('#/apps/money')
    for (const t of ['transactions', 'inbox', 'invoices', 'cartera', 'vault', 'customers', 'overview']) {
      await click(q(el, 'tab-' + t))
      expect(q(el, 'money-strip'), t).not.toBeNull()
      expect(window.location.hash).toBe('#/apps/money/' + t)
      expect(q(el, 'tab-' + t)?.getAttribute('aria-selected')).toBe('true')
    }
  })
  it('deep links land on the tab named in the hash and /charts opens Overview', async () => {
    let el = await mount('#/apps/money/vault')
    expect(q(el, 'vault-tab')).not.toBeNull()
    await teardown(); setup()
    el = await mount('#/apps/money/charts')
    expect(q(el, 'overview-tab')).not.toBeNull()
  })
  it('puts the tab and the selected record in the Ask Jared context', async () => {
    localStorage.setItem('apps.jared.open', '1')
    const el = await mount('#/apps/money/transactions')
    expect(q(el, 'jared-context')?.textContent).toMatch(/^On screen: Money, Transactions, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/)
    await click(all(el, 'tx-row')[0])
    expect(q(el, 'jared-context')?.textContent).toContain('open: Arido monthly $5,000 MXN (posted)')
  })
})

describe('overview tab', () => {
  it('shows the five widgets with MXN text', async () => {
    const el = await mount('#/apps/money/overview')
    const w = Object.fromEntries(all(el, 'ov-widget').map((n) => [n.getAttribute('data-id'), n.textContent]))
    expect(w.revenue).toBe('Revenue$7,500 MXN')
    expect(w.expenses).toBe('Expenses$4,750.50 MXN')
    expect(w.profit).toBe('Profit$2,749.50 MXN')
    expect(w.burn).toBe('Burn rate$4,750.50 MXN / mo')
    expect(w.runway).toBe('Runway1.7 months$8,300 MXN cash')
  })
  it('draws the revenue chart, the category split, top counterparties and the accounts strip', async () => {
    const el = await mount('#/apps/money/overview')
    expect(q(el, 'ov-chart-months')).not.toBeNull()
    expect(all(el, 'ov-category-list')[0].textContent).toContain('Travel')
    expect(all(el, 'ov-top-list')[0].textContent).toContain('Arido')
    expect(all(el, 'ov-account').map((a) => a.getAttribute('data-id'))).toEqual(['a1', 'a2', 'a3'])
    expect(q(el, 'ov-accounts')?.textContent).toContain('-$4,200 MXN')
    expect(q(el, 'ov-accounts')?.textContent).toContain('off')
  })
  it('keeps the legacy receivable charts underneath', async () => {
    const el = await mount('#/apps/money/overview')
    expect(q(el, 'chart-aging')).not.toBeNull()
  })
  it('refetches with the new range when the period changes, and takes a custom range', async () => {
    const el = await mount('#/apps/money/overview')
    const first = callsTo(/\/overview\?/).at(-1)!.url
    expect(first).toMatch(/from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}/)
    await choose(q(el, 'ov-period'), 'last-month')
    const second = callsTo(/\/overview\?/).at(-1)!.url
    expect(second).not.toBe(first)
    await choose(q(el, 'ov-period'), 'custom')
    await typeInto(q(el, 'ov-from'), '2026-02-01')
    await typeInto(q(el, 'ov-to'), '2026-02-09')
    expect(callsTo(/\/overview\?/).at(-1)!.url).toBe('/api/apps/money/overview?from=2026-02-01&to=2026-02-09&currency=MXN')
  })
  it('toggles MXN and USD, refetching with the currency and formatting in it', async () => {
    const el = await mount('#/apps/money/overview')
    expect(callsTo(/\/overview\?/).at(-1)!.url).toContain('currency=MXN')
    await click(q(el, 'ov-currency-USD'))
    expect(callsTo(/\/overview\?/).at(-1)!.url).toContain('currency=USD')
    expect(all(el, 'ov-widget')[0].textContent).toBe('Revenue$300 USD')
    expect(all(el, 'ov-account').map((a) => a.getAttribute('data-id'))).toEqual(['a4'])
    expect(q(el, 'ov-currency-USD')?.getAttribute('aria-pressed')).toBe('true')
  })
  it('shows a calm empty state when the ledger says 503', async () => {
    const el = await mount('#/apps/money/overview')
    world.status = 503
    await choose(q(el, 'ov-period'), 'ytd')
    expect(q(el, 'app-empty')?.getAttribute('data-state')).toBe('unavailable')
  })
})
