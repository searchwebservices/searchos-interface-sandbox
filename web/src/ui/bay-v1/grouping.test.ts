import { describe, expect, it } from 'vitest'
import { agentState, agentsLine, groupLanes, isBayLaneRow } from './grouping'
import { AGENT_LABELS, BAY_LABELS, afterClick, bayKey, stateOf } from '@/lib/rail'
import type { LaneRow } from '@/lib/types'

const lane = (id: string, kind: string, agent?: string): LaneRow =>
  ({ id, kind, title: id, members: [], ...(agent ? { agent: { id: agent, name: agent[0].toUpperCase() + agent.slice(1) } } : {}) }) as unknown as LaneRow

describe('groupLanes', () => {
  const lanes = [
    lane('jared-desk', 'desk', 'jared'),
    lane('hardware', 'group'),
    lane('jared-bay', 'dm', 'jared'),
    lane('gilfoyle-desk', 'desk', 'gilfoyle'),
    lane('dm-bay', 'dm'),
    lane('jared-ops', 'group', 'jared'),
    lane('stray', 'dm', 'mystery'),
    lane('jared-money', 'dm', 'jared'),
    lane('jared-arido', 'dm', 'jared'),
    lane('jared-dani', 'dm', 'jared'),
    lane('jared-borja', 'dm', 'jared'),
  ]
  const g = groupLanes(lanes)

  it('puts Jared first, Gilfoyle second, Other last', () => {
    expect(g.map((x) => x.id)).toEqual(['jared', 'gilfoyle', 'other'])
    expect(g[2].name).toBe('Other')
  })
  it('orders DMs, then groups, then desks inside an agent', () => {
    expect(g[1].dms.map((l) => l.id)).toEqual(['dm-bay'])
    expect(g[1].groups.map((l) => l.id)).toEqual(['hardware'])
    expect(g[1].desks.map((l) => l.id)).toEqual(['gilfoyle-desk'])
    expect(g[0].dms.map((l) => l.id)).toEqual(['jared-bay', 'jared-dani', 'jared-borja'])
    expect(g[0].bayLanes.map((l) => l.id)).toEqual(['jared-money', 'jared-arido'])
    expect(g[1].bayLanes).toEqual([])
    expect(g[0].groups.map((l) => l.id)).toEqual(['jared-ops'])
    expect(g[0].desks.map((l) => l.id)).toEqual(['jared-desk'])
  })
  it('sends a lane with an unknown agent to Other and drops empty groups', () => {
    expect(g[2].dms.map((l) => l.id)).toEqual(['stray'])
    expect(groupLanes([lane('dm-bay', 'dm')]).map((x) => x.id)).toEqual(['gilfoyle'])
  })
})

describe('Bay lanes and pins', () => {
  const all = [lane('jared-bay', 'dm', 'jared'), lane('jared-command', 'dm', 'jared'), lane('jared-money', 'dm', 'jared'), lane('jared-growth', 'dm', 'jared'), lane('jared-dani', 'dm', 'jared')]
  it('knows which rows are Bay lanes', () => {
    expect(all.map(isBayLaneRow)).toEqual([false, true, true, true, false])
    expect(isBayLaneRow(lane('jared-ops', 'group', 'jared'))).toBe(false)
    expect(isBayLaneRow(lane('hardware', 'group'))).toBe(false)
  })
  it('puts pinned Bay lanes first and keeps the rest in order', () => {
    expect(groupLanes(all)[0].bayLanes.map((l) => l.id)).toEqual(['jared-command', 'jared-money', 'jared-growth'])
    expect(groupLanes(all, ['jared-growth', 'jared-money'])[0].bayLanes.map((l) => l.id)).toEqual(['jared-money', 'jared-growth', 'jared-command'])
  })
})

describe('rail states', () => {
  it('defaults to open, clicks between open and closed, and labels the half state per section', () => {
    expect(stateOf(undefined, 'jared')).toBe('open')
    expect(stateOf({ jared: 'half' }, 'jared')).toBe('half')
    expect(stateOf({ jared: 'bogus' as never }, 'jared')).toBe('open')
    expect(afterClick('open')).toBe('closed')
    expect(afterClick('half')).toBe('closed')
    expect(afterClick('closed')).toBe('open')
    expect(AGENT_LABELS.half).toBe('DM only')
    expect(BAY_LABELS.half).toBe('Pinned only')
    expect(bayKey('jared')).toBe('jared:bay')
  })
})

describe('agent state', () => {
  it('reads /api/health.agents and falls back to the top level field for Gilfoyle', () => {
    const h = { opencode: 'up' as const, agents: { jared: { opencode: 'down' as const } } }
    expect(agentState('jared', h)).toBe('down')
    expect(agentState('gilfoyle', h)).toBe('up')
    expect(agentState('jared', { opencode: 'up' })).toBe('unknown')
    expect(agentState('gilfoyle', null)).toBe('unknown')
  })
  it('writes the footer line', () => {
    const groups = [{ id: 'gilfoyle', name: 'Gilfoyle' }, { id: 'jared', name: 'Jared' }, { id: 'other', name: 'Other' }]
    expect(agentsLine(groups, { opencode: 'up', agents: { gilfoyle: { opencode: 'up' }, jared: { opencode: 'down' } } })).toBe('Gilfoyle online, Jared unreachable')
  })
})
