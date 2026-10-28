// Bay's sidebar: one section per agent, Jared first, then Gilfoyle, then anything else. Inside a section the lanes go
// DMs, then (Jared only) Bay's lanes, then groups, then desks. A lane whose agent is not one of the two known ones lands in "Other".
import type { LaneRow } from '@/lib/types'
import { applyOrder } from '@/lib/rail'

export interface AgentGroup {
  id: string
  name: string
  avatar: string | null
  dms: LaneRow[]
  // Jared only: Bay's own lanes (jared-* DMs that are not Bay, Dani or Borja). Empty for every other agent.
  bayLanes: LaneRow[]
  groups: LaneRow[]
  desks: LaneRow[]
}

export const AGENT_ORDER = ['jared', 'gilfoyle'] as const
const DEFAULT_NAMES: Record<string, string> = { gilfoyle: 'Gilfoyle', jared: 'Jared' }
export const OTHER_ID = 'other'
const DIRECT_JARED = ['jared-bay', 'jared-dani', 'jared-borja']
const isBayLane = (lane: LaneRow, agent: string) => agent === 'jared' && lane.kind === 'dm' && lane.id.startsWith('jared-') && !DIRECT_JARED.includes(lane.id)
// One of Bay's own lanes under Jared, whatever the agent field says about other lanes.
export const isBayLaneRow = (lane: LaneRow): boolean => agentIdOf(lane) === 'jared' && isBayLane(lane, 'jared')

export const agentIdOf = (lane: LaneRow): string => lane.agent?.id || 'gilfoyle'

// `pins` (lane ids) and `order` (the saved bayLaneOrder) only order Bay's lanes: saved order, then pinned ones first.
export function groupLanes(lanes: LaneRow[], pins: readonly string[] = [], order: readonly string[] = []): AgentGroup[] {
  const by = new Map<string, AgentGroup>()
  for (const lane of lanes) {
    const known = (AGENT_ORDER as readonly string[]).includes(agentIdOf(lane))
    const id = known ? agentIdOf(lane) : OTHER_ID
    let g = by.get(id)
    if (!g) {
      g = { id, name: known ? DEFAULT_NAMES[id] : 'Other', avatar: null, dms: [], bayLanes: [], groups: [], desks: [] }
      by.set(id, g)
    }
    if (known && lane.agent?.name) g.name = lane.agent.name
    if (known && lane.agent?.avatar) g.avatar = lane.agent.avatar
    const kind = lane.kind as string
    if (isBayLane(lane, id)) g.bayLanes.push(lane)
    else if (kind === 'dm') g.dms.push(lane)
    else if (kind === 'desk') g.desks.push(lane)
    else g.groups.push(lane)
  }
  for (const g of by.values()) if (g.bayLanes.length && order.length) g.bayLanes = applyOrder(g.bayLanes, order)
  for (const g of by.values()) if (g.bayLanes.length && pins.length) g.bayLanes = [...g.bayLanes.filter((l) => pins.includes(l.id)), ...g.bayLanes.filter((l) => !pins.includes(l.id))]
  const rank = (id: string) => (id === OTHER_ID ? 99 : (AGENT_ORDER as readonly string[]).indexOf(id))
  return [...by.values()].sort((a, b) => rank(a.id) - rank(b.id))
}

export type AgentHealthMap = Record<string, { opencode: 'up' | 'down'; down_for_s?: number }>
export type AgentState = 'up' | 'down' | 'unknown'

// Per agent state from /api/health.agents. Gilfoyle falls back to the top level opencode field, which has always been his.
export function agentState(id: string, health: { opencode?: 'up' | 'down'; agents?: AgentHealthMap } | null): AgentState {
  if (!health) return 'unknown'
  const a = health.agents?.[id]
  if (a) return a.opencode
  if (id === 'gilfoyle' && health.opencode) return health.opencode
  return 'unknown'
}

const WORD: Record<AgentState, string> = { up: 'online', down: 'unreachable', unknown: 'checking' }

// "Gilfoyle online, Jared unreachable"
export function agentsLine(groups: Pick<AgentGroup, 'id' | 'name'>[], health: Parameters<typeof agentState>[1]): string {
  const shown = groups.filter((g) => g.id !== OTHER_ID)
  if (!shown.length) return 'Checking'
  return shown.map((g) => g.name + ' ' + WORD[agentState(g.id, health)]).join(', ')
}
