// Marvin's console has exactly one chat: the viewer's direct lane with Gilfoyle. These helpers pick it and say where any
// other route should go instead. No React in here.
import type { Store } from '@/lib/store'
import type { LaneRow } from '@/lib/types'
import type { Route } from '@/app/router'

const isGilfoyleDm = (l: LaneRow | undefined): l is LaneRow => !!l && l.kind === 'dm' && (l.agent?.id ?? 'gilfoyle') === 'gilfoyle'

// The one chat. Several candidates (an owner can see more than their own) resolve to the one the viewer is a member of,
// then dm-<person>, then the first.
export function pickOneLane(s: Store): LaneRow | null {
  const all = s.order.map((id) => s.lanes[id]).filter(isGilfoyleDm)
  if (!all.length) return null
  const me = s.me?.person
  return all.find((l) => me && l.members.includes(me) && l.id === 'dm-' + me) ?? all.find((l) => me && l.members.includes(me)) ?? all.find((l) => l.id === 'dm-' + me) ?? all[0]
}

// Where a route must go in this shell, or null when it may stay. With no chat (oneId null) nothing redirects to it.
export function redirectFor(route: Route, oneId: string | null): Route | null {
  if (route.name === 'library' && route.lane && route.lane !== oneId) return { name: 'library' }
  if (!oneId) return null
  if (route.name === 'home') return { name: 'lane', id: oneId }
  if (route.name === 'lane') return route.id === oneId ? null : { name: 'lane', id: oneId }
  if (route.name === 'devices' || route.name === 'lan' || route.name === 'health' || route.name === 'library' || route.name === 'profile') return null
  return { name: 'lane', id: oneId }
}
