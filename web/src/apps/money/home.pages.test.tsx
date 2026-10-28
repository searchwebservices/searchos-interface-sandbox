// @vitest-environment happy-dom
// The Money home: one status sentence, "needs a touch" with one action a row, four cards, Jared's opener, this month, the
// chart and the next thirty days, through the real App against the mocked console.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HOME_QUIET } from './fixtures'
import { all, body, callsTo, click, mount, q, setup, teardown, typeInto, world } from './testkit'

beforeEach(setup)
afterEach(teardown)

describe('money home, above the fold', () => {
  it('reads the status sentence from the one home call and hides the KPI strip', async () => {
    const el = await mount('#/apps/money')
    expect(callsTo(/\/api\/apps\/money\/home$/)).toHaveLength(1)
    expect(q(el, 'home-status')?.textContent).toBe('13,000 MXN a month from three clients. 18,510 collected in October. 23,500 overdue across four invoices. Burn 58,864 a month, runway not on file.')
    expect(q(el, 'money-strip')).toBeNull()
    expect(q(el, 'jared-context')).toBeNull()
  })
  it('lists what needs a touch, a sentence and one action per row', async () => {
    const el = await mount('#/apps/money')
    const rows = all(el, 'touch-row')
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['invoice', 'invoice', 'cartera', 'classify', 'inbox', 'closing'])
    expect(rows[0].textContent).toContain('Magnolia Florals owes 15,000 MXN, 180 days late.')
    expect([...rows[0].querySelectorAll('[data-testid=touch-action]')].map((b) => b.textContent)).toEqual(['Mark paid', 'Draft reminder'])
    expect([...rows[3].querySelectorAll('[data-testid=touch-action]')].map((b) => b.getAttribute('data-action'))).toEqual(['classify'])
    expect(rows[5].textContent).toContain("ZY CAR's last charge is November 4.")
  })
  it('marks an overdue invoice paid through the invoice route and refreshes', async () => {
    const el = await mount('#/apps/money')
    await click(all(el, 'touch-row')[0].querySelector('[data-action=mark_paid]'))
    expect(q(body(), 'invoicepaid-dialog')?.textContent).toContain('Magnolia Florals, $15,000 MXN')
    await typeInto(q(body(), 'invoicepaid-date'), '2026-10-20')
    await click(q(body(), 'invoicepaid-confirm'))
    const post = callsTo(/\/invoices\/i-jacky\/paid$/, 'POST')
    expect(post).toHaveLength(1)
    expect(post[0].body).toEqual({ paid_date: '2026-10-20' })
    expect(q(body(), 'invoicepaid-dialog')).toBeNull()
    expect(q(el, 'home-flash')?.textContent).toBe('Recorded: Magnolia Florals paid.')
    expect(callsTo(/\/api\/apps\/money\/home$/)).toHaveLength(2)
  })
  it('says plainly when the console cannot write invoices yet', async () => {
    world.invoiceStatus = 503
    const el = await mount('#/apps/money')
    await click(all(el, 'touch-row')[0].querySelector('[data-action=mark_paid]'))
    await click(q(body(), 'invoicepaid-confirm'))
    expect(q(body(), 'invoicepaid-error')?.textContent).toContain('migration 0024')
    expect(q(body(), 'invoicepaid-dialog')).not.toBeNull()
  })
  it('marks a late cartera entry paid with the cartera dialog', async () => {
    const el = await mount('#/apps/money')
    await click(all(el, 'touch-row')[2].querySelector('[data-action=mark_paid]'))
    expect(q(body(), 'markpaid-dialog')).not.toBeNull()
    expect((q(body(), 'markpaid-amount') as HTMLInputElement).value).toBe('7500')
    await click(q(body(), 'markpaid-confirm'))
    expect(callsTo(/\/cartera\/e-arido\/paid$/, 'POST')).toHaveLength(1)
    expect(q(el, 'home-flash')?.textContent).toBe('Recorded for Árido Café.')
  })
  it('Draft reminder opens the Jared dock with the reminder request in the composer', async () => {
    const el = await mount('#/apps/money')
    expect(q(el, 'jared-dock')).toBeNull()
    await click(all(el, 'touch-row')[0].querySelector('[data-action=draft_reminder]'))
    expect(q(el, 'jared-dock')?.getAttribute('data-open')).toBe('true')
    expect((q(el, 'jared-input') as HTMLTextAreaElement).value).toBe("Draft a short payment reminder to Magnolia Florals for the invoice of 15,000 MXN due April 30, 180 days late. Write it in the client's language, for Bay to review before anything is sent.")
    expect(q(el, 'jared-context')?.textContent).toContain('On screen: Money, Home, 13,000 MXN a month')
  })
  it('Classify opens Transactions filtered to pending over a year, Match opens the inbox, Open opens the cartera', async () => {
    const el = await mount('#/apps/money')
    await click(all(el, 'touch-row')[3].querySelector('[data-action=classify]'))
    expect(window.location.hash).toBe('#/apps/money/transactions?status=pending')
    expect(q(el, 'tab-transactions')?.getAttribute('aria-selected')).toBe('true')
    const ledger = callsTo(/\/ledger\?/).at(-1)!.url
    expect(ledger).toContain('status=pending')
    expect((q(el, 'tx-status') as HTMLSelectElement)?.value ?? new URLSearchParams(ledger.split('?')[1]).get('status')).toBe('pending')
    await click(q(el, 'tab-home'))
    await click(all(el, 'touch-row')[4].querySelector('[data-action=match]'))
    expect(window.location.hash).toBe('#/apps/money/inbox')
    await click(q(el, 'tab-home'))
    await click(all(el, 'touch-row')[5].querySelector('[data-action=open]'))
    expect(window.location.hash).toBe('#/apps/money/cartera')
  })
  it('shows four same-size cards with a sentence each, and the add balance chip saves a balance', async () => {
    const el = await mount('#/apps/money')
    const cards = all(el, 'home-card')
    expect(cards.map((c) => c.getAttribute('data-id'))).toEqual(['mrr', 'collected', 'overdue', 'cash'])
    expect(cards[0].textContent).toBe('MRR$13,000 MXNthree clients')
    expect(cards[1].textContent).toBe('Collected this month$18,510 MXNfour payments')
    expect(cards[2].textContent).toBe('Overdue$23,500 MXNfour invoices, oldest 180 days')
    expect(cards[3].textContent).toBe('Cash position$0 MXNno bank balance on fileadd balance')
    await click(q(el, 'home-add-balance'))
    expect(q(body(), 'balance-dialog')).not.toBeNull()
    expect([...body().querySelectorAll('[data-testid=balance-account] option')].map((o) => o.textContent)).toEqual(['Banorte (MXN)', 'Caja (MXN)'])
    await typeInto(q(body(), 'balance-amount'), '40000')
    await click(q(body(), 'balance-confirm'))
    const patch = callsTo(/\/accounts\/a1$/, 'PATCH')
    expect(patch).toHaveLength(1)
    expect(patch[0].body).toEqual({ balance: 40000 })
    expect(q(el, 'home-flash')?.textContent).toBe('Balance saved.')
  })
  it("Jared's card names what he would start with and prefills the dock", async () => {
    const el = await mount('#/apps/money')
    expect(q(el, 'home-jared-text')?.textContent).toBe('Jared would start with Magnolia Florals: 15,000 MXN, 180 days late, the oldest open invoice.')
    await click(q(el, 'home-ask-jared'))
    expect((q(el, 'jared-input') as HTMLTextAreaElement).value).toBe("Magnolia Florals' invoice for 15,000 MXN is 180 days late. What would you do first?")
  })
})

describe('money home, below the fold and states', () => {
  it('says this month in sentences, draws six months and lists the next thirty days', async () => {
    const el = await mount('#/apps/money')
    expect([...q(el, 'home-income')!.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Árido paid 7,806 MXN.', 'Zycar paid 5,204 MXN.', 'Unique Cabo Weddings paid 3,500 MXN.', 'Baja Experience paid 2,000 MXN.'])
    expect([...q(el, 'home-expenses')!.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Salary took 6,000 MXN.', 'Fees took 2,442 MXN.', 'Software took 900 MXN.'])
    expect(q(el, 'home-chart')?.textContent).toContain('Burn $58,863.92 MXN a month')
    expect(q(el, 'home-chart')?.querySelector('[data-slot=chart]')).not.toBeNull()
    const rows = all(el, 'home-expected-row')
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['payment', 'payment', 'payment', 'last_charge'])
    expect(rows[0].textContent).toBe('Árido Café, 7,500 MXN on November 3.in 7 days')
    expect(rows[3].textContent).toBe("ZY CAR's last charge, 5,000 MXN on November 4.in 8 days")
  })
  it('designed empty state: nothing needs you, with the next expected payment', async () => {
    world.home = HOME_QUIET
    const el = await mount('#/apps/money')
    expect(all(el, 'touch-row')).toHaveLength(0)
    expect(q(el, 'home-touch-empty')?.textContent).toBe('Nothing needs you. Next payment expected: Árido Café on November 3.')
    expect(all(el, 'home-card')[3].textContent).toContain('$40,000 MXNacross one account')
    expect(q(el, 'home-income')?.textContent).toBe('No income posted yet in October.')
    expect(q(el, 'home-expected')?.textContent).toContain('No payment expected in the next thirty days.')
    expect(q(el, 'home-jared-text')?.textContent).toBe("Jared would start with Árido Café's payment on November 3.")
  })
  it('a 503 from the home route is a calm empty state with a retry', async () => {
    world.homeStatus = 503
    const el = await mount('#/apps/money')
    expect(q(el, 'app-empty')?.getAttribute('data-state')).toBe('unavailable')
    world.homeStatus = 200
    await click(q(el, 'app-empty')!.querySelector('button'))
    expect(q(el, 'home-status')).not.toBeNull()
  })
  it('the refresh action reloads the home call too', async () => {
    const el = await mount('#/apps/money')
    await click(el.querySelector('[aria-label="Refresh money"]'))
    expect(callsTo(/\/api\/apps\/money\/home$/)).toHaveLength(2)
  })
  it('no em dash anywhere on the page', async () => {
    const el = await mount('#/apps/money')
    expect(el.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})
