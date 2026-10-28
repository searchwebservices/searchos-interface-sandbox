// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TRANSACTIONS } from './ledgerFixtures'
import { all, blur, callsTo, choose, click, mount, pickFile, q, setup, settle, teardown, typeInto, world } from './testkit'

beforeEach(setup)
afterEach(teardown)
const sheet = () => document.body.querySelector('[data-testid=tx-sheet]')!
const inSheet = (id: string) => sheet().querySelector('[data-testid=' + id + ']')
const check = async (n: Element | null) => click(n)

describe('transactions table', () => {
  it('lists the rows with signed amounts, category dots, status chips and the range totals', async () => {
    const el = await mount('#/apps/money/transactions')
    expect(all(el, 'tx-row').map((r) => r.getAttribute('data-id'))).toEqual(['t1', 't2', 't3', 't4', 't5'])
    expect(all(el, 'tx-amount-cell').map((c) => c.textContent)).toEqual(['$5,000 MXN', '-$1,200 MXN', '-$450.50 MXN', '-$3,100 MXN', '$2,500 MXN'])
    expect(all(el, 'tx-status-chip').map((c) => c.getAttribute('data-tone'))).toEqual(['ok', 'ok', 'ok', 'warn', 'idle'])
    expect(all(el, 'tx-cat')[1].textContent).toContain('Hosting')
    expect(all(el, 'tx-cat')[2].textContent).toContain('Uncategorised')
    expect(q(el, 'tx-totals')?.textContent).toContain('$7,500 MXN')
    expect(q(el, 'tx-totals')?.textContent).toContain('$2,749.50 MXN')
  })
  it('sends each filter to the ledger route', async () => {
    const el = await mount('#/apps/money/transactions')
    await choose(q(el, 'tx-status-filter'), 'pending')
    expect(callsTo(/\/ledger\?/).at(-1)!.url).toContain('status=pending')
    expect(all(el, 'tx-row').map((r) => r.getAttribute('data-id'))).toEqual(['t4'])
    await choose(q(el, 'tx-status-filter'), '')
    await choose(q(el, 'tx-account'), 'a2')
    expect(callsTo(/\/ledger\?/).at(-1)!.url).toContain('account=a2')
    await choose(q(el, 'tx-account'), '')
    await choose(q(el, 'tx-category-filter'), 'travel')
    expect(callsTo(/\/ledger\?/).at(-1)!.url).toContain('category=travel')
    await choose(q(el, 'tx-category-filter'), '')
    await typeInto(q(el, 'tx-search'), 'figma')
    expect(callsTo(/\/ledger\?/).at(-1)!.url).toContain('q=figma')
    expect(all(el, 'tx-row')).toHaveLength(1)
    await choose(q(el, 'tx-period'), 'ytd')
    expect(callsTo(/\/ledger\?/).at(-1)!.url).toMatch(/from=\d{4}-01-01/)
  })
  it('hides and shows columns, and remembers the choice', async () => {
    const el = await mount('#/apps/money/transactions')
    expect(el.querySelector('th')?.parentElement?.textContent).not.toContain('Method')
    await click(q(el, 'tx-columns-toggle'))
    await click(q(el, 'col-method'))
    expect(q(el, 'tx-table')?.textContent).toContain('Method')
    await click(q(el, 'col-status'))
    expect(all(el, 'tx-status-chip')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('money.tx.columns')!)).toMatchObject({ method: true, status: false })
    expect((q(el, 'col-amount') as HTMLInputElement).disabled).toBe(true)
  })
  it('loads more rows by cursor without duplicating', async () => {
    world.nextCursor = 'c2'
    world.page2 = [{ ...TRANSACTIONS[0], id: 't9', name: 'Page two' }, TRANSACTIONS[0]]
    const el = await mount('#/apps/money/transactions')
    await click(q(el, 'tx-more'))
    expect(callsTo(/cursor=c2/)).toHaveLength(1)
    expect(all(el, 'tx-row').map((r) => r.getAttribute('data-id'))).toEqual(['t1', 't2', 't3', 't4', 't5', 't9'])
    expect(q(el, 'tx-more')).toBeNull()
  })
  it('shows an empty line and a calm state for 403', async () => {
    world.tx = []
    let el = await mount('#/apps/money/transactions')
    expect(q(el, 'tx-empty-ledger')?.textContent).toContain('No transactions yet. Add one or run a sync.')
    expect(q(el, 'tx-empty-add')).not.toBeNull()
    expect(q(el, 'tx-empty-sync')).not.toBeNull()
    await teardown(); setup(); world.status = 403
    el = await mount('#/apps/money/transactions')
    expect(q(el, 'app-empty')?.getAttribute('data-state')).toBe('forbidden')
  })
})

describe('pending and status default', () => {
  it('asks for all statuses by default and marks pending rows distinctly', async () => {
    world.tx[0] = { ...world.tx[0], status: 'pending', source: 'facturapi' }
    const el = await mount('#/apps/money/transactions')
    expect(callsTo(/\/ledger\?/).at(-1)!.url).toContain('status=all')
    const row = all(el, 'tx-row')[0]
    expect(row.getAttribute('data-pending')).toBe('true')
    expect(row.textContent).toContain('awaiting payment complemento')
    expect(all(el, 'tx-row')[1].getAttribute('data-pending')).toBe('false')
    await click(row)
    expect(sheet().textContent).toContain('waiting for the payment complemento')
  })
  it('totals read per currency with positive expenses', async () => {
    const el = await mount('#/apps/money/transactions')
    const mxn = q(el, 'tx-totals')!.querySelector('[data-currency=MXN]')!
    expect(mxn.textContent).toContain('Expenses $4,750.50 MXN')
    expect(q(el, 'tx-totals')!.querySelector('[data-currency=USD]')).not.toBeNull()
  })
})

describe('bulk actions', () => {
  it('selects rows, shows the count, categorises them all and refreshes', async () => {
    const el = await mount('#/apps/money/transactions')
    const boxes = all(el, 'tx-select')
    await check(boxes[1]); await check(boxes[2])
    expect(q(el, 'tx-bulk-count')?.textContent).toBe('2 selected')
    expect(all(el, 'tx-row')[1].getAttribute('data-selected')).toBe('true')
    await choose(q(el, 'tx-bulk-category'), 'software')
    const patches = callsTo(/\/ledger\/t\d$/, 'PATCH')
    expect(patches.map((p) => p.url)).toEqual(['/api/apps/money/ledger/t2', '/api/apps/money/ledger/t3'])
    expect(patches.every((p) => (p.body as { category_slug: string }).category_slug === 'software')).toBe(true)
    expect(q(el, 'tx-flash')?.textContent).toBe('Updated 2 transactions: Software.')
    expect(q(el, 'tx-bulk')).toBeNull()
    expect(all(el, 'tx-cat')[2].textContent).toContain('Software')
  })
  it('select all then set status excluded', async () => {
    const el = await mount('#/apps/money/transactions')
    await check(q(el, 'tx-select-all'))
    expect(q(el, 'tx-bulk-count')?.textContent).toBe('5 selected')
    await choose(q(el, 'tx-bulk-status'), 'excluded')
    expect(callsTo(/\/ledger\/t\d$/, 'PATCH')).toHaveLength(5)
    expect(all(el, 'tx-row').every((r) => r.getAttribute('data-status') === 'excluded')).toBe(true)
  })
  it('reports partial failures and clears the selection', async () => {
    const el = await mount('#/apps/money/transactions')
    await check(all(el, 'tx-select')[0])
    world.patchStatus = 500
    await choose(q(el, 'tx-bulk-status'), 'archived')
    expect(q(el, 'tx-flash')?.textContent).toBe('Updated 0 of 1, 1 failed.')
  })
  it('clear drops the selection', async () => {
    const el = await mount('#/apps/money/transactions')
    await check(all(el, 'tx-select')[0])
    await click(q(el, 'tx-bulk-clear'))
    expect(q(el, 'tx-bulk')).toBeNull()
  })
})

describe('transaction sheet', () => {
  it('opens on the right with the facts, and shows attachments from the detail route', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(all(el, 'tx-row')[0])
    expect(sheet().getAttribute('data-id')).toBe('t1')
    expect(inSheet('tx-amount')?.textContent).toBe('$5,000 MXN')
    expect(inSheet('tx-facts')?.textContent).toContain('Stripe')
    expect(sheet().querySelectorAll('[data-testid=tx-attachment]')).toHaveLength(1)
    expect(callsTo(/\/ledger\/t1$/, 'GET')).toHaveLength(1)
  })
  it('picks a category through PATCH and the row follows', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(all(el, 'tx-row')[2])
    await choose(inSheet('tx-category'), 'software')
    const p = callsTo(/\/ledger\/t3$/, 'PATCH')
    expect(p).toHaveLength(1)
    expect(p[0].body).toEqual({ category_slug: 'software' })
    expect(all(el, 'tx-cat')[2].textContent).toContain('Software')
  })
  it('saves the note on blur and only when it changed', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(all(el, 'tx-row')[2])
    await blur(inSheet('tx-note'))
    expect(callsTo(/\/ledger\/t3$/, 'PATCH')).toHaveLength(0)
    await typeInto(inSheet('tx-note'), 'annual plan')
    await blur(inSheet('tx-note'))
    expect(callsTo(/\/ledger\/t3$/, 'PATCH').map((c) => c.body)).toEqual([{ note: 'annual plan' }])
  })
  it('toggles internal, excludes, then includes again', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(all(el, 'tx-row')[1])
    await click(inSheet('tx-internal'))
    expect(callsTo(/\/ledger\/t2$/, 'PATCH').at(-1)!.body).toEqual({ internal: true })
    await click(inSheet('tx-exclude'))
    expect(callsTo(/\/ledger\/t2$/, 'PATCH').at(-1)!.body).toEqual({ status: 'excluded' })
    expect(inSheet('tx-status')?.getAttribute('data-tone')).toBe('bad')
    expect(inSheet('tx-restore')?.textContent).toBe('Include again')
    await click(inSheet('tx-restore'))
    expect(callsTo(/\/ledger\/t2$/, 'PATCH').at(-1)!.body).toEqual({ status: 'posted' })
    await click(inSheet('tx-archive'))
    expect(callsTo(/\/ledger\/t2$/, 'PATCH').at(-1)!.body).toEqual({ status: 'archived' })
    expect(inSheet('tx-restore')?.textContent).toBe('Unarchive')
  })
  it('previews an attachment through the file route: image inline, PDF in a frame', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(all(el, 'tx-row')[0])
    await click(inSheet('tx-attachment-preview'))
    expect(inSheet('tx-viewer')?.getAttribute('data-kind')).toBe('image')
    expect(inSheet('viewer-image')?.getAttribute('src')).toBe('/api/apps/money/attachments/at1/file')
    expect(inSheet('viewer-download')?.getAttribute('href')).toBe('/api/apps/money/attachments/at1/file')
  })
  it('uploads an attachment as multipart and lists it', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(all(el, 'tx-row')[2])
    await pickFile(inSheet('tx-dropzone-input'), 'figma.pdf')
    const up = callsTo(/\/ledger\/t3\/attachments$/, 'POST')
    expect(up).toHaveLength(1)
    expect(up[0].form).toEqual({ file: 'figma.pdf' })
    expect(sheet().querySelectorAll('[data-testid=tx-attachment]')).toHaveLength(1)
    expect(sheet().textContent).toContain('figma.pdf')
    await settle()
    expect(all(el, 'tx-row')[2].textContent).toContain('1 file')
  })
  it('says why a save failed', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(all(el, 'tx-row')[2])
    world.patchStatus = 503
    await choose(inSheet('tx-category'), 'travel')
    expect(inSheet('tx-error')?.textContent).toBe('The database is not reachable right now.')
  })
})

describe('add and sync', () => {
  it('adds a manual expense as a negative amount', async () => {
    const el = await mount('#/apps/money/transactions')
    await click(q(el, 'tx-add'))
    const d = document.body
    await typeInto(d.querySelector('[data-testid=add-name]'), 'Taxi')
    expect((d.querySelector('[data-testid=add-confirm]') as HTMLButtonElement).disabled).toBe(true)
    await typeInto(d.querySelector('[data-testid=add-amount]'), '180')
    await click(d.querySelector('[data-testid=add-confirm]'))
    const p = callsTo(/\/ledger$/, 'POST')
    expect(p).toHaveLength(1)
    expect(p[0].body).toMatchObject({ name: 'Taxi', amount: -180, account_id: 'a1', status: 'posted' })
    expect(q(el, 'tx-flash')?.textContent).toBe('Transaction added.')
  })
  it('sync posts to sync/run and reloads', async () => {
    const el = await mount('#/apps/money/transactions')
    const before = callsTo(/\/ledger\?/).length
    await click(q(el, 'tx-sync'))
    expect(callsTo(/sync\/run/, 'POST')).toHaveLength(1)
    expect(callsTo(/\/ledger\?/).length).toBe(before + 1)
  })
})
