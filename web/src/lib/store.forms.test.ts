import { describe, expect, it } from 'vitest'
import { feedOf, initialStore, reduce, totalForms } from './store'
import type { Action, Store } from './store'
import type { FormItem, LaneRow, Me, StreamEvent } from './types'
import { FORM } from './forms.fixture'

const me: Me = { person: 'marvin', role: 'owner', device_id: 'd1', device_name: 'Laptop', ip: '10.0.0.2', mac: null, lanwatch_status: null }
const lane = (id: string): LaneRow => ({ id, kind: 'group', title: id, members: ['marvin'], busy: false, count: 0, asks: 0, last: null, tail: [] })
const form = (id: string, over: Partial<FormItem> = {}): FormItem => ({ id, lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'form', form: { ...FORM, id: 'f-' + id }, state: 'pending', ...over })
const frame = (ev: StreamEvent): Action => ({ type: 'frame', ev, now: 5000 })
const base = (): Store => {
  let s = reduce(initialStore(), { type: 'me', me })
  s = reduce(s, { type: 'lanes', lanes: [lane('hardware')] })
  return s
}

describe('forms slice', () => {
  it('created: a form frame lands in the forms slot, counts on the lane row, stays out of the preview', () => {
    const s = reduce(base(), frame({ type: 'form', lane: 'hardware', form: form('a') }))
    expect(s.threads.hardware.forms.a.state).toBe('pending')
    expect(s.lanes.hardware.forms).toBe(1)
    expect(totalForms(s)).toBe(1)
    expect(s.lanes.hardware.count).toBe(0)
    expect(feedOf(s.threads.hardware).map((x) => x.id)).toEqual(['a'])
  })
  it('replied: form_update settles it with who and N of N, and the count drops', () => {
    let s = reduce(base(), frame({ type: 'form', lane: 'hardware', form: form('a') }))
    s = reduce(s, frame({ type: 'form_update', lane: 'hardware', id: 'a', state: 'answered', summary: { answered: 2, total: 2 }, replied_by: { person: 'marvin' }, replied_at: 'now' }))
    const f = s.threads.hardware.forms.a
    expect(f.state).toBe('answered')
    expect(f.summary).toEqual({ answered: 2, total: 2 })
    expect(f.replied_by?.person).toBe('marvin')
    expect(f.form.title).toBe('Welcome John')
    expect(s.lanes.hardware.forms).toBe(0)
  })
  it('cancelled: state flips once, the card keeps its schema', () => {
    let s = reduce(base(), frame({ type: 'form', lane: 'hardware', form: form('a') }))
    s = reduce(s, frame({ type: 'form_update', lane: 'hardware', id: 'a', state: 'cancelled', summary: null, replied_by: { via: 'opencode' } }))
    expect(s.threads.hardware.forms.a.state).toBe('cancelled')
    expect(s.lanes.hardware.forms).toBe(0)
  })
  it('an update for a form we never saw is ignored', () => {
    const s = reduce(base(), frame({ type: 'form_update', lane: 'hardware', id: 'zz', state: 'answered' }))
    expect(s.threads.hardware).toBeUndefined()
  })
  it('my own answer settles the card from the HTTP response without waiting for the frame', () => {
    let s = reduce(base(), frame({ type: 'form', lane: 'hardware', form: form('a') }))
    s = reduce(s, { type: 'form_settled', lane: 'hardware', form: form('a', { state: 'answered' }) })
    expect(s.threads.hardware.forms.a.state).toBe('answered')
  })
  it('reconcile: a thread snapshot replaces forms, so a stale pending settles and a vanished one is gone', () => {
    let s = reduce(base(), frame({ type: 'form', lane: 'hardware', form: form('a') }))
    s = reduce(s, frame({ type: 'form', lane: 'hardware', form: form('b') }))
    expect(s.lanes.hardware.forms).toBe(2)
    s = reduce(s, { type: 'thread', lane: 'hardware', items: [form('a', { state: 'answered', replied_by: { via: 'reconcile' } })] })
    expect(s.threads.hardware.forms.a.state).toBe('answered')
    expect(s.threads.hardware.forms.b).toBeUndefined()
    expect(s.lanes.hardware.forms).toBe(0)
    expect(s.threads.hardware.items).toHaveLength(0)
  })
  it('a lane list reload keeps the pending form count', () => {
    let s = reduce(base(), frame({ type: 'form', lane: 'hardware', form: form('a') }))
    s = reduce(s, { type: 'lanes', lanes: [lane('hardware')] })
    expect(s.lanes.hardware.forms).toBe(1)
  })
  it('removed drops the form', () => {
    let s = reduce(base(), frame({ type: 'form', lane: 'hardware', form: form('a') }))
    s = reduce(s, frame({ type: 'removed', lane: 'hardware', id: 'a' }))
    expect(s.threads.hardware.forms.a).toBeUndefined()
    expect(s.lanes.hardware.forms).toBe(0)
  })
})
