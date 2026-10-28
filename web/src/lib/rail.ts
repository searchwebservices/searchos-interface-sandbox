// Bay's rail: each agent section and Jared's "Bay's lanes" sub-section has three states. 'half' is "DM only" on an agent
// section and "Pinned only" on Bay's lanes. Saved in the profile prefs (per person and device) next to the pinned lanes.
export type RailState = 'open' | 'half' | 'closed'
export interface RailPrefs {
  sections?: Record<string, RailState>
  pins?: string[]
  // Apps rail order (app ids) and Jared's Bay lanes order (lane ids); ids not listed append in their default order.
  appOrder?: string[]
  bayLaneOrder?: string[]
}
export const RAIL_STATES: readonly RailState[] = ['open', 'half', 'closed']
export const bayKey = (agent: string) => agent + ':bay'

export const stateOf = (sections: Record<string, RailState> | undefined, key: string): RailState => {
  const v = sections?.[key]
  return v === 'half' || v === 'closed' ? v : 'open'
}
// A click on the header row: closed opens, anything else closes.
export const afterClick = (s: RailState): RailState => (s === 'closed' ? 'open' : 'closed')

export const AGENT_LABELS: Record<RailState, string> = { open: 'Open', half: 'DM only', closed: 'Collapse' }
export const BAY_LABELS: Record<RailState, string> = { open: 'Open', half: 'Pinned only', closed: 'Collapse' }

// Orders `items` by `order` (ids). Ids not in the order, or new ones, append in their own order; unknown ids in the order are dropped.
export function applyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[] | undefined): T[] {
  const rank = new Map((order ?? []).map((id, i) => [id, i]))
  const known = items.filter((i) => rank.has(i.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  return [...known, ...items.filter((i) => !rank.has(i.id))]
}
// Moves `id` to index `to` of `ids` (clamped). The reducer behind drag drop, Move up, Move down and Move to top.
export function moveId(ids: readonly string[], id: string, to: number): string[] {
  const from = ids.indexOf(id)
  if (from < 0) return [...ids]
  const out = ids.filter((x) => x !== id)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, id)
  return out
}
export const stepId = (ids: readonly string[], id: string, delta: number): string[] => moveId(ids, id, ids.indexOf(id) + delta)
// Drop a dragged id into the gap before item `gap` (0..n) of the current list.
export function dropAt(ids: readonly string[], id: string, gap: number): string[] {
  const from = ids.indexOf(id)
  return moveId(ids, id, gap > from ? gap - 1 : gap)
}
