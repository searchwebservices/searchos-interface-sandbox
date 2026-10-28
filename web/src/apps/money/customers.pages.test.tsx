// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CARTERA } from './fixtures'
import { all, mount, q, setup, teardown, typeInto, world } from './testkit'

beforeEach(() => {
  setup()
  const arido = { ...CARTERA.groups.activos[0], id: 'e9', company_name: 'Arido', monthly_amount: 5000, mrr_mxn: 5000, last_payment_at: '2026-09-04' }
  world.cartera = { ...CARTERA, groups: { ...CARTERA.groups, cerrado: [{ ...CARTERA.groups.activos[0], id: 'x1', company_name: 'Gone Co', bucket: 'cerrado', mrr_mxn: 0, board_active: false }], activos: [arido, ...CARTERA.groups.activos.slice(1)] } }
})
afterEach(teardown)
const row = (el: Element, name: string) => all(el, 'customer-row').find((r) => r.textContent?.startsWith(name))!

describe('customers tab', () => {
  it('joins MRR, last payment, open balance and collected per client', async () => {
    const el = await mount('#/apps/money/customers')
    const a = row(el, 'Arido')
    expect(a.querySelector('[data-testid=customer-mrr]')?.textContent).toBe('$5,000 MXN')
    expect(a.querySelector('[data-testid=customer-last]')?.textContent).toBe('2026-10-05') // the ledger is newer than cartera
    expect(a.querySelector('[data-testid=customer-open]')?.textContent).toBe('$1,000 MXN')
    expect(a.querySelector('[data-testid=customer-collected]')?.textContent).toBe('$5,000 MXN')
  })
  it('keeps former clients under a collapsed Former and other group', async () => {
    const el = await mount('#/apps/money/customers')
    expect(all(el, 'customer-row').some((r) => r.textContent?.startsWith('Gone Co'))).toBe(false)
    const t = el.querySelector('[data-testid=customers-former-toggle]') as HTMLElement
    expect(t.textContent).toContain('Former and other (1)')
    t.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(all(el, 'customer-row').some((r) => r.textContent?.startsWith('Gone Co'))).toBe(true)
  })
  it('links to the client page, by the ledger client_id when it has one', async () => {
    const el = await mount('#/apps/money/customers')
    expect(row(el, 'Arido').querySelector('a')?.getAttribute('href')).toBe('#/apps/clients/c-arido')
    expect(row(el, 'Zeta Cafe').querySelector('a')?.getAttribute('href')).toBe('#/apps/clients/e1')
  })
  it('shows a dash for no MRR or balance, and searches by name', async () => {
    const el = await mount('#/apps/money/customers')
    expect(row(el, 'Dev Project').querySelector('[data-testid=customer-mrr]')?.textContent).toBe('-')
    await typeInto(q(el, 'customers-search'), 'zeta')
    expect(all(el, 'customer-row')).toHaveLength(1)
    await typeInto(q(el, 'customers-search'), 'nobody')
    expect(q(el, 'customers-empty')).not.toBeNull()
  })
  it('orders by MRR, biggest first', async () => {
    const el = await mount('#/apps/money/customers')
    expect(all(el, 'customer-row')[0].textContent).toContain('Alfa Studio')
    expect(all(el, 'customer-row')[1].textContent).toContain('Arido')
  })
  it('still lists clients when the ledger is down', async () => {
    world.ledgerStatus = 503
    const el = await mount('#/apps/money/customers')
    expect(all(el, 'customer-row').length).toBeGreaterThan(0)
  })
})
