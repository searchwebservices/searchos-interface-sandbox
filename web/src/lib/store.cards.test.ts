import { describe, expect, it } from 'vitest'
import { initialStore, reduce, unreadCount } from './store'
import type { Action, Store } from './store'
import type { CardItem, LaneRow, Me, StreamEvent } from './types'
import { groupFeed } from './groups'
import { FIXTURES } from '@/cards/schemas'

const me: Me = { person: 'marvin', role: 'owner', device_id: 'd1', device_name: 'Laptop', ip: '10.0.0.2', mac: null, lanwatch_status: null }
const lane = (id: string): LaneRow => ({ id, kind: 'group', title: id, members: ['marvin'], busy: false, count: 0, asks: 0, last: null, tail: [] })
const card = (id: string, over: Partial<CardItem['card']> = {}): CardItem => {
  const c = JSON.parse(JSON.stringify((FIXTURES.alert as { valid: CardItem['card'] }).valid)) as CardItem['card']
  return { id, lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'card', card: { ...c, id, ...over } }
}
const frame = (ev: StreamEvent): Action => ({ type: 'frame', ev, now: 5000 })
const base = (): Store => reduce(reduce(initialStore(), { type: 'me', me }), { type: 'lanes', lanes: [lane('hardware')] })

describe('cards in the store', () => {
  it('a card frame lands in the thread and never counts as conversation', () => {
    const s = reduce(base(), frame({ type: 'card', lane: 'hardware', card: card('c1') }))
    expect(s.threads.hardware.items.map((x) => x.id)).toEqual(['c1'])
    expect(s.lanes.hardware.count).toBe(0)
    expect(s.lanes.hardware.last).toBeNull()
    expect(unreadCount(s, 'hardware')).toBe(0)
  })
  it('the same card twice is one item', () => {
    let s = reduce(base(), frame({ type: 'card', lane: 'hardware', card: card('c1') }))
    s = reduce(s, frame({ type: 'card', lane: 'hardware', card: card('c1') }))
    expect(s.threads.hardware.items.length).toBe(1)
  })
  it('card_update sets the state and the resolution, keeping the data', () => {
    let s = reduce(base(), frame({ type: 'card', lane: 'hardware', card: card('c1') }))
    const resolution = { action_id: 'ack', kind: 'ack' as const, by: { person: 'marvin' }, at: '2026-10-26T10:01:00Z' }
    s = reduce(s, frame({ type: 'card_update', lane: 'hardware', id: 'c1', state: 'ack', resolution }))
    const c = (s.threads.hardware.items[0] as CardItem).card
    expect(c.state).toBe('ack')
    expect(c.resolution).toEqual(resolution)
    expect(c.data.title).toBe('Disk at 91 percent')
    expect(reduce(s, frame({ type: 'card_update', lane: 'hardware', id: 'nope', state: 'ack' }))).toBe(s)
  })
  it('the action result (a card frame with the stored item) replaces the item in place', () => {
    let s = reduce(base(), frame({ type: 'card', lane: 'hardware', card: card('c1') }))
    s = reduce(s, frame({ type: 'card', lane: 'hardware', card: card('c1', { state: 'ack' }) }))
    expect(s.threads.hardware.items.length).toBe(1)
    expect((s.threads.hardware.items[0] as CardItem).card.state).toBe('ack')
  })
  it('a thread snapshot keeps stored cards', () => {
    const s = reduce(base(), { type: 'thread', lane: 'hardware', items: [card('c1'), card('c2')] })
    expect(s.threads.hardware.items.map((x) => x.id)).toEqual(['c1', 'c2'])
  })
  it('a card ends the work group before it, so a turn and its card keep their order', () => {
    const run = { id: 'r1', lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'run' as const, run: { message_id: 'm', agent: null, model: null, started: 1, ended: 2, status: 'done' as const, tools: [] } }
    const rows = groupFeed([run, card('c1')])
    expect(rows.map((r) => r.kind)).toEqual(['work', 'item'])
  })
})
