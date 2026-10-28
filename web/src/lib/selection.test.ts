import { describe, expect, it } from 'vitest'
import * as S from './selection'

const order = ['d:a', 'd:b', 'f1', 'f2', 'f3', 'f4']

describe('selection model', () => {
  it('a click selects one and makes it the anchor', () => {
    const s = S.click(S.EMPTY, 'f2', {}, order)
    expect(s).toEqual({ keys: ['f2'], anchor: 'f2' })
    expect(S.click(s, 'f3', {}, order)).toEqual({ keys: ['f3'], anchor: 'f3' })
  })
  it('Shift click selects the range from the anchor in display order, either direction', () => {
    const a = S.click(S.EMPTY, 'f1', {}, order)
    expect(S.click(a, 'f3', { shift: true }, order).keys).toEqual(['f1', 'f2', 'f3'])
    const b = S.click(S.EMPTY, 'f3', {}, order)
    const r = S.click(b, 'd:b', { shift: true }, order)
    expect(r.keys).toEqual(['d:b', 'f1', 'f2', 'f3'])
    expect(r.anchor).toBe('f3') // the anchor stays, so the next Shift click pivots on it
  })
  it('Shift click with nothing selected behaves like a click', () => {
    expect(S.click(S.EMPTY, 'f2', { shift: true }, order)).toEqual({ keys: ['f2'], anchor: 'f2' })
  })
  it('Cmd or Ctrl click toggles one in and out, and keeps the others', () => {
    let s = S.click(S.EMPTY, 'f1', {}, order)
    s = S.click(s, 'f3', { meta: true }, order)
    expect(s.keys).toEqual(['f1', 'f3'])
    s = S.click(s, 'd:a', { meta: true }, order)
    expect(s.keys).toEqual(['d:a', 'f1', 'f3'])
    s = S.click(s, 'f1', { meta: true }, order)
    expect(s.keys).toEqual(['d:a', 'f3'])
  })
  it('Cmd Shift click adds the range to what is already selected', () => {
    let s = S.click(S.EMPTY, 'd:a', {}, order)
    s = S.click(s, 'f1', { meta: true }, order)
    s = S.click(s, 'f3', { meta: true, shift: true }, order)
    expect(s.keys).toEqual(['d:a', 'f1', 'f2', 'f3'])
  })
  it('select all and prune', () => {
    expect(S.selectAll(order).keys).toEqual(order)
    const s = S.prune({ keys: ['f1', 'gone'], anchor: 'gone' }, order)
    expect(s).toEqual({ keys: ['f1'], anchor: 'f1' })
    expect(S.prune(S.EMPTY, order)).toBe(S.EMPTY)
  })
})

describe('drag rectangle', () => {
  const rects: Record<string, S.Box> = {
    f1: { left: 0, top: 0, right: 100, bottom: 100 },
    f2: { left: 110, top: 0, right: 210, bottom: 100 },
    f3: { left: 0, top: 110, right: 100, bottom: 210 },
    f4: { left: 110, top: 110, right: 210, bottom: 210 },
  }
  const o = ['f1', 'f2', 'f3', 'f4']
  it('boxOf normalises any drag direction', () => {
    expect(S.boxOf({ x: 50, y: 60 }, { x: 10, y: 20 })).toEqual({ left: 10, top: 20, right: 50, bottom: 60 })
  })
  it('selects every tile the box touches, in display order', () => {
    expect(S.rectHits(rects, S.boxOf({ x: 90, y: 90 }, { x: 120, y: 120 }), o)).toEqual(['f1', 'f2', 'f3', 'f4'])
    expect(S.rectHits(rects, S.boxOf({ x: 5, y: 5 }, { x: 150, y: 50 }), o)).toEqual(['f1', 'f2'])
    expect(S.rectHits(rects, S.boxOf({ x: 300, y: 300 }, { x: 400, y: 400 }), o)).toEqual([])
    expect(S.rectHits(rects, S.boxOf({ x: 100, y: 0 }, { x: 110, y: 100 }), o)).toEqual([]) // the gap between tiles
  })
  it('replaces the selection, or adds to it with Cmd, Ctrl or Shift held', () => {
    const base: S.Sel = { keys: ['f4'], anchor: 'f4' }
    expect(S.rectSelect(base, ['f1', 'f2'], false, o).keys).toEqual(['f1', 'f2'])
    expect(S.rectSelect(base, ['f1', 'f2'], true, o).keys).toEqual(['f1', 'f2', 'f4'])
    expect(S.rectSelect(base, [], false, o).keys).toEqual([])
  })
  it('a drag shorter than the slop is a click on open space', () => {
    expect(S.movedFar({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(false)
    expect(S.movedFar({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(true)
  })
})

describe('arrow keys', () => {
  it('moves by one across and by a row down, and stops at the ends', () => {
    expect(S.cursorMove(order, 3, 'f1', 'ArrowRight')).toBe('f2')
    expect(S.cursorMove(order, 3, 'f1', 'ArrowDown')).toBe('f4')
    expect(S.cursorMove(order, 3, 'f4', 'ArrowUp')).toBe('f1')
    expect(S.cursorMove(order, 3, 'd:a', 'ArrowLeft')).toBe('d:a')
    expect(S.cursorMove(order, 3, 'f4', 'ArrowRight')).toBe('f4')
    expect(S.cursorMove(order, 1, 'f2', 'ArrowDown')).toBe('f3')
  })
  it('starts at the first item going forward and the last going back; Home and End jump', () => {
    expect(S.cursorMove(order, 3, null, 'ArrowDown')).toBe('d:a')
    expect(S.cursorMove(order, 3, null, 'ArrowUp')).toBe('f4')
    expect(S.cursorMove(order, 3, 'f2', 'Home')).toBe('d:a')
    expect(S.cursorMove(order, 3, 'f2', 'End')).toBe('f4')
    expect(S.cursorMove([], 3, null, 'ArrowDown')).toBeNull()
  })
})
