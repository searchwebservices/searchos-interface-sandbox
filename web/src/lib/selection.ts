// The selection model of the file browser, as pure functions so it tests without a DOM: click selects one, Cmd or
// Ctrl click toggles, Shift click extends from the anchor over the displayed order, the drag rectangle selects what it
// touches (and adds to the selection when Cmd, Ctrl or Shift is held). `order` is always the keys as displayed.

export interface Sel {
  keys: string[]
  anchor: string | null
}
export const EMPTY: Sel = { keys: [], anchor: null }
export interface Mods {
  shift?: boolean
  meta?: boolean // Cmd on a Mac, Ctrl elsewhere
}

const uniq = (a: string[]) => [...new Set(a)]
// Keeps the selection in display order, so every consumer sees one stable sequence.
const inOrder = (keys: string[], order: string[]) => order.filter((k) => keys.includes(k))

export function click(s: Sel, key: string, mods: Mods, order: string[]): Sel {
  if (mods.shift && s.anchor && order.includes(s.anchor) && order.includes(key)) {
    const a = order.indexOf(s.anchor)
    const b = order.indexOf(key)
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1)
    return { keys: mods.meta ? inOrder(uniq([...s.keys, ...range]), order) : range, anchor: s.anchor }
  }
  if (mods.meta) {
    return s.keys.includes(key) ? { keys: s.keys.filter((k) => k !== key), anchor: key } : { keys: inOrder([...s.keys, key], order), anchor: key }
  }
  return { keys: [key], anchor: key }
}

export const selectAll = (order: string[]): Sel => ({ keys: [...order], anchor: order[0] ?? null })
export const has = (s: Sel, key: string): boolean => s.keys.includes(key)
// Drops keys that are no longer displayed (after a move, a delete or a refresh).
export function prune(s: Sel, order: string[]): Sel {
  const keys = s.keys.filter((k) => order.includes(k))
  return keys.length === s.keys.length ? s : { keys, anchor: s.anchor && keys.includes(s.anchor) ? s.anchor : (keys[0] ?? null) }
}

// ---------------------------------------------------------------- the drag rectangle
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}
export const boxOf = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) })
export const touches = (r: Box, b: Box): boolean => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top
// The keys whose rectangles the drag box touches, in display order.
export function rectHits(rects: Record<string, Box>, box: Box, order: string[]): string[] {
  return order.filter((k) => rects[k] && touches(rects[k], box))
}
// base: the selection when the drag began. Without Cmd, Ctrl or Shift the rectangle replaces it.
export function rectSelect(base: Sel, hits: string[], additive: boolean, order: string[]): Sel {
  const keys = additive ? inOrder(uniq([...base.keys, ...hits]), order) : hits
  return { keys, anchor: hits[0] ?? (additive ? base.anchor : null) }
}
// A drag shorter than this is a click on open space, which clears the selection.
export const DRAG_SLOP = 4
export const movedFar = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => Math.abs(a.x - b.x) > DRAG_SLOP || Math.abs(a.y - b.y) > DRAG_SLOP

// ---------------------------------------------------------------- arrow keys over a grid
// cols: how many items sit on one row (1 for the list view). Returns the key the cursor lands on.
export function cursorMove(order: string[], cols: number, cur: string | null, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'): string | null {
  if (!order.length) return null
  const i = cur ? order.indexOf(cur) : -1
  if (i < 0) return key === 'ArrowUp' || key === 'End' || key === 'ArrowLeft' ? order[order.length - 1] : order[0]
  const step = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -cols : key === 'ArrowDown' ? cols : 0
  if (key === 'Home') return order[0]
  if (key === 'End') return order[order.length - 1]
  return order[Math.min(order.length - 1, Math.max(0, i + step))]
}
