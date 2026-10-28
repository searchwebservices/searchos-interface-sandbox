// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { all, callsTo, click, mount, q, setup, teardown, typeInto, world } from './testkit'

beforeEach(setup)
afterEach(teardown)
const names = (el: Element) => all(el, 'vault-item').map((i) => i.querySelector('.truncate')?.textContent)

describe('vault tab', () => {
  it('gathers attachments from transactions with files plus every inbox file, newest first', async () => {
    const el = await mount('#/apps/money/vault')
    expect(callsTo(/\/ledger\/t1$/, 'GET')).toHaveLength(1)
    expect(callsTo(/\/ledger\/t2$/, 'GET')).toHaveLength(1)
    expect(callsTo(/\/ledger\/t3$/, 'GET')).toHaveLength(0) // no attachment_count, no detail call
    expect(names(el)).toEqual(['receipt.png', 'invoice-hetzner.pdf', 'figma-receipt.pdf', 'taxi.jpg', 'old.pdf'])
  })
  it('marks the origin of each file', async () => {
    const el = await mount('#/apps/money/vault')
    const origins = all(el, 'vault-item').map((i) => i.getAttribute('data-origin'))
    expect(origins.filter((o) => o === 'inbox')).toHaveLength(3) // the matched receipt is the transaction's own attachment, not listed twice
    expect(origins.filter((o) => o === 'transaction')).toHaveLength(2)
    expect(el.textContent).toContain('Transaction: Arido monthly')
  })
  it('filters by kind and by search', async () => {
    const el = await mount('#/apps/money/vault')
    await click(q(el, 'vault-kind-image'))
    expect(all(el, 'vault-item').every((i) => i.getAttribute('data-kind') === 'image')).toBe(true)
    expect(all(el, 'vault-item')).toHaveLength(2)
    await click(q(el, 'vault-kind-pdf'))
    expect(all(el, 'vault-item')).toHaveLength(3)
    await click(q(el, 'vault-kind-all'))
    await typeInto(q(el, 'vault-search'), 'hetzner')
    expect(all(el, 'vault-item')).toHaveLength(1)
    await typeInto(q(el, 'vault-search'), 'zzz')
    expect(q(el, 'vault-empty')).not.toBeNull()
  })
  it('previews in a dialog and downloads through the file route', async () => {
    const el = await mount('#/apps/money/vault')
    const card = all(el, 'vault-item').find((i) => i.getAttribute('data-id') === 'at2')!
    expect(card.querySelector('[data-testid=vault-download]')?.getAttribute('href')).toBe('/api/apps/money/attachments/at2/file')
    await click(card.querySelector('[data-testid=vault-open]'))
    const d = document.body.querySelector('[data-testid=vault-dialog]')!
    expect(d.querySelector('[data-testid=viewer-pdf]')?.getAttribute('data')).toBe('/api/apps/money/attachments/at2/file')
    expect(d.textContent).toContain('Transaction: Hetzner server')
  })
  it('shows a calm state when the ledger is down', async () => {
    world.ledgerStatus = 503
    const el = await mount('#/apps/money/vault')
    expect(q(el, 'money-strip')).not.toBeNull()
    expect(q(el, 'app-empty')?.getAttribute('data-state')).toBe('unavailable')
  })
})
