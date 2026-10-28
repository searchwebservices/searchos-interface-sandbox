import { describe, expect, it } from 'vitest'
import { applyOrder, dropAt, moveId, stepId } from './rail'
import { gapAt } from '@/ui/bay-v1/useRowDrag'
import { moveApp, appKeyMove } from '@/ui/bay-v1/AppsNav'
import { groupLanes } from '@/ui/bay-v1/grouping'
import type { LaneRow } from './types'

const it4 = ['crm', 'money', 'pm', 'map']
const items = it4.map((id) => ({ id }))

describe('rail order', () => {
  it('applies a saved order, appends new or unlisted ids, drops stale ones', () => {
    expect(applyOrder(items, ['map', 'crm']).map((i) => i.id)).toEqual(['map', 'crm', 'money', 'pm'])
    expect(applyOrder(items, ['gone', 'pm']).map((i) => i.id)).toEqual(['pm', 'crm', 'money', 'map'])
    expect(applyOrder(items, undefined).map((i) => i.id)).toEqual(it4)
  })
  it('moves, steps and clamps', () => {
    expect(moveId(it4, 'map', 0)).toEqual(['map', 'crm', 'money', 'pm'])
    expect(stepId(it4, 'crm', -1)).toEqual(it4)
    expect(stepId(it4, 'money', 1)).toEqual(['crm', 'pm', 'money', 'map'])
    expect(stepId(it4, 'map', 1)).toEqual(it4)
    expect(moveId(it4, 'nope', 0)).toEqual(it4)
  })
  it('the drag reducer drops into a gap, with the gap after the dragged row being a no op', () => {
    expect(dropAt(it4, 'crm', 3)).toEqual(['money', 'pm', 'crm', 'map'])
    expect(dropAt(it4, 'map', 0)).toEqual(['map', 'crm', 'money', 'pm'])
    expect(dropAt(it4, 'money', 1)).toEqual(it4)
    expect(dropAt(it4, 'money', 2)).toEqual(it4)
    expect(dropAt(it4, 'crm', 4)).toEqual(['money', 'pm', 'map', 'crm'])
    expect(gapAt([10, 30, 50, 70], 0)).toBe(0)
    expect(gapAt([10, 30, 50, 70], 40)).toBe(2)
    expect(gapAt([10, 30, 50, 70], 99)).toBe(4)
  })
  it('keyboard and menu moves share one reducer', () => {
    expect(appKeyMove({ key: 'ArrowUp', altKey: true })).toBe('up')
    expect(appKeyMove({ key: 'ArrowDown', altKey: true })).toBe('down')
    expect(appKeyMove({ key: 'ArrowDown', altKey: false })).toBeNull()
    expect(moveApp(it4, 'pm', 'up')).toEqual(['crm', 'pm', 'money', 'map'])
    expect(moveApp(it4, 'pm', 'top')).toEqual(['pm', 'crm', 'money', 'map'])
    expect(moveApp(it4, 'pm', 'down')).toEqual(['crm', 'money', 'map', 'pm'])
  })
  it("Bay's lanes follow bayLaneOrder, pinned ones still first", () => {
    const lane = (id: string) => ({ id, kind: 'dm', title: id, members: [], agent: { id: 'jared', name: 'Jared' } }) as unknown as LaneRow
    const all = ['jared-bay', 'jared-money', 'jared-arido', 'jared-growth'].map(lane)
    const ids = (pins: string[], order: string[]) => groupLanes(all, pins, order)[0].bayLanes.map((l) => l.id)
    expect(ids([], [])).toEqual(['jared-money', 'jared-arido', 'jared-growth'])
    expect(ids([], ['jared-growth', 'jared-money'])).toEqual(['jared-growth', 'jared-money', 'jared-arido'])
    expect(ids(['jared-arido'], ['jared-growth', 'jared-money'])).toEqual(['jared-arido', 'jared-growth', 'jared-money'])
  })
})
