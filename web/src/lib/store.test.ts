import { describe, expect, it } from 'vitest'
import { initialStore, isWorking, listed, openRun, reduce, tabTitle, totalAsks, unreadCount } from './store'
import type { Action, Store } from './store'
import type { AskItem, ChangesItem, LaneRow, Me, RunData, RunItem, StreamEvent, TextMessage } from './types'

const me: Me = { person: 'marvin', role: 'owner', device_id: 'd1', device_name: 'Laptop', ip: '10.0.0.2', mac: null, lanwatch_status: null }
const lane = (id: string, over: Partial<LaneRow> = {}): LaneRow => ({ id, kind: 'group', title: id, members: ['marvin'], busy: false, count: 0, asks: 0, last: null, tail: [], ...over })
const text = (id: string, over: Partial<TextMessage> = {}): TextMessage => ({ id, lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'gilfoyle', text: 'hi ' + id, ...over })
const run = (id: string, turn: string, over: Partial<RunData> = {}): RunItem => ({
  id,
  lane: 'hardware',
  at: '2026-10-26T10:00:00Z',
  role: 'run',
  run: { turn_id: turn, message_id: turn, agent: null, model: null, started: 1000, ended: null, status: 'running', tools: [], ...over },
})
const ask = (id: string): AskItem => ({
  id,
  lane: 'hardware',
  at: '2026-10-26T10:00:00Z',
  role: 'ask',
  ask: { request_id: 'r-' + id, action: 'bash', resources: ['ls'], message: 'run it?', metadata: null, source: null },
  state: 'open',
})
const frame = (ev: StreamEvent, now = 5000): Action => ({ type: 'frame', ev, now })
const base = (): Store => {
  let s = initialStore()
  s = reduce(s, { type: 'me', me })
  s = reduce(s, { type: 'lanes', lanes: [lane('hardware'), lane('dm-bay', { kind: 'dm' })] })
  return s
}
const items = (s: Store, l = 'hardware') => s.threads[l].items

describe('messages', () => {
  it('appends once and dedups by id', () => {
    let s = base()
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: text('a') }))
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: text('a') }))
    expect(items(s)).toHaveLength(1)
    expect(s.lanes.hardware.count).toBe(1)
    expect(s.lanes.hardware.last?.text).toBe('hi a')
  })
  it('a stored reply replaces the streaming one by oc_id', () => {
    let s = base()
    s = reduce(s, frame({ type: 'stream', lane: 'hardware', message_id: 'oc1', text: 'par' }))
    s = reduce(s, frame({ type: 'stream', lane: 'hardware', message_id: 'oc1', text: 'partial' }))
    expect(s.threads.hardware.streams.oc1).toBe('partial')
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: text('a', { oc_id: 'oc1' }) }))
    expect(s.threads.hardware.streams.oc1).toBeUndefined()
    s = reduce(s, frame({ type: 'stream_end', lane: 'hardware', message_id: 'oc1' }))
    expect(items(s)).toHaveLength(1)
  })
  it('my own send comes back with its client_id and becomes delivered', () => {
    let s = base()
    s = reduce(s, { type: 'send_start', lane: 'hardware', send: { client_id: 'c1', text: 'yo', at: 'x', state: 'sending' } })
    expect(s.threads.hardware.pending).toHaveLength(1)
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: text('m1', { role: 'person', client_id: 'c1', text: 'yo', signature: { person: 'marvin' } }) }, 7000))
    expect(s.threads.hardware.pending).toHaveLength(0)
    expect(s.threads.hardware.delivered.c1).toBe(7000)
    // the POST answer arriving after the stream does not duplicate it
    s = reduce(s, { type: 'send_ok', lane: 'hardware', client_id: 'c1', message: text('m1', { role: 'person', client_id: 'c1' }), now: 7100 })
    expect(items(s)).toHaveLength(1)
  })
  it('a failed send keeps the text, retry flips it back on the same client id', () => {
    let s = base()
    s = reduce(s, { type: 'send_start', lane: 'hardware', send: { client_id: 'c2', text: 'yo', at: 'x', state: 'sending' } })
    s = reduce(s, { type: 'send_fail', lane: 'hardware', client_id: 'c2', error: 'no_connection' })
    expect(s.threads.hardware.pending[0]).toMatchObject({ state: 'failed', error: 'no_connection' })
    s = reduce(s, { type: 'send_retry', lane: 'hardware', client_id: 'c2' })
    expect(s.threads.hardware.pending[0]).toMatchObject({ client_id: 'c2', state: 'sending' })
  })
  it('a retry after reply_to_not_found drops the quote', () => {
    let s = base()
    s = reduce(s, { type: 'send_start', lane: 'hardware', send: { client_id: 'c3', text: 'yo', at: 'x', state: 'sending', reply_to: { message_id: 'gone' } } })
    s = reduce(s, { type: 'send_fail', lane: 'hardware', client_id: 'c3', error: 'reply_to_not_found' })
    s = reduce(s, { type: 'send_retry', lane: 'hardware', client_id: 'c3' })
    expect(s.threads.hardware.pending[0].reply_to).toBeUndefined()
  })
  it('unread counts others, not my own, and mark_read clears it', () => {
    let s = base()
    s = reduce(s, { type: 'lanes', lanes: [lane('hardware', { last: { id: 'z', role: 'gilfoyle', who: 'Gilfoyle', own: false, text: '', at: '2026-10-26T09:00:00Z' } })] })
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: text('a', { at: '2026-10-26T10:00:00Z' }) }))
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: text('b', { role: 'person', at: '2026-10-26T10:01:00Z', signature: { person: 'marvin' } }) }))
    expect(unreadCount(s, 'hardware')).toBe(1)
    s = reduce(s, { type: 'mark_read', lane: 'hardware', at: '2026-10-26T10:01:00Z' })
    expect(unreadCount(s, 'hardware')).toBe(0)
  })
})

describe('busy', () => {
  it('sets busy and the time it started, clears both', () => {
    let s = base()
    s = reduce(s, frame({ type: 'busy', lane: 'hardware', busy: true }, 9000))
    expect(s.lanes.hardware.busy).toBe(true)
    expect(s.threads.hardware.busySince).toBe(9000)
    expect(isWorking(s.lanes.hardware, s.threads.hardware)).toBe(true)
    s = reduce(s, frame({ type: 'busy', lane: 'hardware', busy: false }))
    expect(s.threads.hardware.busySince).toBeNull()
    expect(isWorking(s.lanes.hardware, s.threads.hardware)).toBe(false)
  })
})

describe('asks', () => {
  it('counts open asks, collapses on ask_update, and the asks frame is authoritative', () => {
    let s = base()
    s = reduce(s, frame({ type: 'ask', lane: 'hardware', ask: ask('k1') }))
    expect(s.lanes.hardware.asks).toBe(1)
    expect(totalAsks(s)).toBe(1)
    expect(tabTitle(s)).toContain('[1 ask]')
    s = reduce(s, frame({ type: 'ask_update', lane: 'hardware', id: 'k1', state: 'once', replied_by: 'marvin', replied_at: '2026-10-26T10:05:00Z' }))
    expect(items(s)[0]).toMatchObject({ state: 'once', replied_by: 'marvin' })
    expect(s.lanes.hardware.asks).toBe(0)
    s = reduce(s, frame({ type: 'asks', lane: 'hardware', open: 3 }))
    expect(s.lanes.hardware.asks).toBe(3)
  })
  it('an ask answered through the API replaces the item', () => {
    let s = base()
    s = reduce(s, frame({ type: 'ask', lane: 'hardware', ask: ask('k2') }))
    s = reduce(s, { type: 'ask_answered', lane: 'hardware', ask: { ...ask('k2'), state: 'reject', replied_by: 'bay' } })
    expect(items(s)[0]).toMatchObject({ state: 'reject' })
    expect(s.lanes.hardware.asks).toBe(0)
  })
})

describe('runs per turn', () => {
  it('one run per turn: a second item of the same turn replaces the first', () => {
    let s = base()
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: run('r1', 't1') }))
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: run('r1b', 't1', { status: 'done', ended: 4000 }) }))
    expect(items(s)).toHaveLength(1)
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: run('r2', 't2') }))
    expect(items(s)).toHaveLength(2)
  })
  it('run_update patches the run in place, and an open run counts as working but is not listed', () => {
    let s = base()
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: run('r1', 't1') }))
    const t = s.threads.hardware
    expect(openRun(t)?.id).toBe('r1')
    expect(isWorking(s.lanes.hardware, t)).toBe(true)
    expect(listed(t)).toHaveLength(0)
    s = reduce(s, frame({ type: 'run_update', lane: 'hardware', id: 'r1', run: { ...run('r1', 't1').run, status: 'done', ended: 3000, tools: [{ id: 'x', name: 'bash', input_summary: 'ls', status: 'ok', started: 1000, ended: 2000 }] } }))
    const t2 = s.threads.hardware
    expect(openRun(t2)).toBeNull()
    expect(listed(t2)).toHaveLength(1)
    expect(isWorking(s.lanes.hardware, t2)).toBe(false)
  })
  it('runs and changes never touch the rail preview or unread', () => {
    let s = base()
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: run('r1', 't1') }))
    const ch: ChangesItem = { id: 'c1', lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'changes', files: [{ path: 'a.txt', additions: 1, deletions: 0, diff: '+x', truncated: false }] }
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: ch }))
    expect(s.lanes.hardware.count).toBe(0)
    expect(s.lanes.hardware.last).toBeNull()
    expect(items(s)).toHaveLength(2)
  })
})

describe('removed, session, forms slot', () => {
  it('removes an item and recounts asks', () => {
    let s = base()
    s = reduce(s, frame({ type: 'ask', lane: 'hardware', ask: ask('k1') }))
    s = reduce(s, frame({ type: 'message', lane: 'hardware', message: text('a') }))
    s = reduce(s, frame({ type: 'removed', lane: 'hardware', id: 'k1' }))
    expect(items(s).map((x) => x.id)).toEqual(['a'])
    expect(s.lanes.hardware.asks).toBe(0)
  })
  it('flags a lane whose session vanished', () => {
    let s = base()
    s = reduce(s, frame({ type: 'session', lane: 'hardware', state: 'missing' }))
    expect(s.lanes.hardware.session_missing).toBe(true)
  })
  it('keeps form frames in the forms slot and out of the thread', () => {
    let s = base()
    s = reduce(s, frame({ type: 'form', lane: 'hardware', form: { id: 'f1', lane: 'hardware', at: 'x', role: 'form', state: 'pending', form: { id: 'o1', title: 'T', fields: [], metadata: null } } }))
    s = reduce(s, frame({ type: 'form_update', lane: 'hardware', id: 'f1', state: 'answered' }))
    expect(s.threads.hardware.forms.f1.state).toBe('answered')
    expect(items(s)).toHaveLength(0)
  })
  it('a thread snapshot keeps pending sends and forms, drops streams that are now stored', () => {
    let s = base()
    s = reduce(s, { type: 'send_start', lane: 'hardware', send: { client_id: 'c9', text: 'x', at: 'x', state: 'sending' } })
    s = reduce(s, frame({ type: 'stream', lane: 'hardware', message_id: 'oc9', text: 'abc' }))
    s = reduce(s, { type: 'thread', lane: 'hardware', items: [text('a', { oc_id: 'oc9' })] })
    expect(s.threads.hardware.loaded).toBe(true)
    expect(s.threads.hardware.pending).toHaveLength(1)
    expect(s.threads.hardware.streams.oc9).toBeUndefined()
  })
  it('health frames keep the per agent status, and the health action does too', () => {
    const agents = { gilfoyle: { opencode: 'up' as const }, jared: { opencode: 'down' as const, down_for_s: 9 } }
    let s = reduce(base(), { type: 'health', health: { opencode: 'up', sessions: {}, pending_asks: 2, agents } })
    expect(s.health?.agents).toEqual(agents)
    s = reduce(s, frame({ type: 'health', opencode: 'down', down_for_s: 5 }))
    expect(s.health?.agents).toEqual(agents)
    s = reduce(s, frame({ type: 'health', opencode: 'up', agents: { gilfoyle: { opencode: 'up' } } }))
    expect(s.health?.agents).toEqual({ gilfoyle: { opencode: 'up' } })
  })
  it('an approver_ask frame only bumps a tick, it adds no lane and no thread', () => {
    const s0 = base()
    const s = reduce(s0, frame({ type: 'approver_ask', lane: 'jared-dani' }))
    expect(s.approverTick).toBe(1)
    expect(s.lanes).toEqual(s0.lanes)
    expect(s.threads['jared-dani']).toBeUndefined()
  })
  it('health frames land on the store', () => {
    const s = reduce(base(), frame({ type: 'health', opencode: 'down', down_for_s: 40 }))
    expect(s.health).toEqual({ opencode: 'down', down_for_s: 40 })
  })
})
