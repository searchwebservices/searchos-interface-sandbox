// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { all, callsTo, click, mount, pickFile, q, setup, teardown, typeInto, world } from './testkit'

beforeEach(setup)
afterEach(teardown)
const rowIds = (el: Element) => all(el, 'inbox-row').map((r) => r.getAttribute('data-id'))

describe('inbox list', () => {
  it('lists every receipt with a status chip, and the tabs ask the route by status', async () => {
    const el = await mount('#/apps/money/inbox')
    expect(rowIds(el)).toEqual(['in1', 'in2', 'in3', 'in4'])
    expect(all(el, 'inbox-status').map((c) => c.getAttribute('data-tone'))).toEqual(['warn', 'warn', 'ok', 'idle'])
    expect(all(el, 'inbox-row')[0].textContent).toContain('$450.50 MXN')
    await click(q(el, 'inbox-tab-new'))
    expect(callsTo(/\/inbox\?status=new/)).toHaveLength(1)
    expect(rowIds(el)).toEqual(['in1', 'in2'])
    await click(q(el, 'inbox-tab-archived'))
    expect(rowIds(el)).toEqual(['in4'])
    await click(q(el, 'inbox-tab-matched'))
    expect(rowIds(el)).toEqual(['in3'])
  })
  it('says so when there is nothing', async () => {
    world.inbox = []
    const el = await mount('#/apps/money/inbox')
    expect(q(el, 'inbox-empty')).not.toBeNull()
  })
  it('uploads dropped files as multipart and reloads', async () => {
    const el = await mount('#/apps/money/inbox')
    await pickFile(q(el, 'inbox-dropzone-input'), 'new-receipt.pdf')
    const up = callsTo(/\/inbox$/, 'POST')
    expect(up).toHaveLength(1)
    expect(up[0].form).toEqual({ file: 'new-receipt.pdf' })
    expect(q(el, 'inbox-flash')?.textContent).toBe('Uploaded 1 file.')
  })
})

describe('inbox viewer and matching', () => {
  it('shows the receipt through the file route', async () => {
    const el = await mount('#/apps/money/inbox')
    await click(all(el, 'inbox-row')[1])
    expect(q(el, 'inbox-viewer')?.getAttribute('data-kind')).toBe('image')
    expect(q(el, 'viewer-image')?.getAttribute('src')).toBe('/api/apps/money/inbox/in2/file')
    await click(all(el, 'inbox-row')[0])
    expect(q(el, 'inbox-viewer')?.getAttribute('data-kind')).toBe('pdf')
  })
  it('suggests by amount and date, and matching sends the transaction id', async () => {
    const el = await mount('#/apps/money/inbox')
    await click(all(el, 'inbox-row')[0])
    const cands = all(q(el, 'match-suggestions')!, 'match-candidate')
    expect(cands[0].getAttribute('data-id')).toBe('t3')
    expect(cands[0].textContent).toContain('same amount')
    expect(callsTo(/\/ledger\?from=2026-09-19&to=2026-10-17/)).toHaveLength(1)
    await click(cands[0].querySelector('[data-testid=match-confirm]'))
    const p = callsTo(/\/inbox\/in1$/, 'PATCH')
    expect(p.map((c) => c.body)).toEqual([{ transaction_id: 't3' }])
    expect(q(el, 'inbox-flash')?.textContent).toBe('Matched to Figma.')
    expect(world.inbox[0].status).toBe('matched')
  })
  it('says there is no close match, and a search finds the rest', async () => {
    const el = await mount('#/apps/money/inbox')
    await click(all(el, 'inbox-row')[1])
    expect(q(el, 'match-none')).not.toBeNull()
    await typeInto(q(el, 'match-search'), 'hetzner')
    const found = all(q(el, 'match-results')!, 'match-candidate')
    expect(found.map((c) => c.getAttribute('data-id'))).toEqual(['t2'])
    await click(found[0].querySelector('[data-testid=match-confirm]'))
    expect(callsTo(/\/inbox\/in2$/, 'PATCH')[0].body).toEqual({ transaction_id: 't2' })
  })
  it('names the transaction a matched receipt belongs to, with no match panel', async () => {
    const el = await mount('#/apps/money/inbox')
    await click(all(el, 'inbox-row')[2])
    expect(q(el, 'inbox-matched')?.textContent).toContain('Arido monthly')
    expect(q(el, 'match-panel')).toBeNull()
  })
  it('archives and restores', async () => {
    const el = await mount('#/apps/money/inbox')
    await click(all(el, 'inbox-row')[0])
    await click(q(el, 'inbox-archive'))
    expect(callsTo(/\/inbox\/in1$/, 'PATCH').at(-1)!.body).toEqual({ status: 'archived' })
    await click(q(el, 'inbox-tab-archived'))
    await click(all(el, 'inbox-row')[0])
    await click(q(el, 'inbox-restore'))
    expect(callsTo(/\/inbox\/in1$/, 'PATCH').at(-1)!.body).toEqual({ status: 'new' })
  })
  it('a 409 on match explains itself', async () => {
    const el = await mount('#/apps/money/inbox')
    await click(all(el, 'inbox-row')[0])
    const cand = all(q(el, 'match-suggestions')!, 'match-candidate')[0]
    const orig = globalThis.fetch
    globalThis.fetch = ((u: string, i?: RequestInit) => (u.startsWith('/api/apps/money/inbox/') && i?.method === 'PATCH' ? Promise.resolve(new Response('{}', { status: 409 })) : (orig as typeof fetch)(u, i))) as typeof fetch
    await click(cand.querySelector('[data-testid=match-confirm]'))
    expect(q(el, 'match-error')?.textContent).toBe('That transaction already has a receipt.')
    globalThis.fetch = orig
  })
})
