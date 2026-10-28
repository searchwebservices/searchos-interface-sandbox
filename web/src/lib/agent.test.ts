import { describe, expect, it } from 'vitest'
import { agentName, DEFAULT_AGENT_NAME, isAgentRole } from './agent'
import { healthLine } from '@/pages/Health'

describe('agentName', () => {
  it('is Gilfoyle when the lane has no agent field', () => {
    expect(agentName({})).toBe('Gilfoyle')
    expect(agentName(undefined)).toBe('Gilfoyle')
    expect(agentName(null)).toBe('Gilfoyle')
    expect(agentName({ agent: null })).toBe('Gilfoyle')
    expect(agentName({ agent: {} })).toBe(DEFAULT_AGENT_NAME)
  })

  it('uses the lane agent name when there is one', () => {
    expect(agentName({ agent: { id: 'jared', name: 'Jared' } })).toBe('Jared')
  })

  it('threads into the health line without changing the default text', () => {
    expect(healthLine({ opencode: 'up', down_for_s: 0 })).toBe('Gilfoyle, online')
    expect(healthLine({ opencode: 'up', down_for_s: 0 }, 'Jared')).toBe('Jared, online')
    expect(healthLine({ opencode: 'down', down_for_s: 0 })).toBe('Gilfoyle, unreachable')
  })
})

describe('isAgentRole', () => {
  it("covers Gilfoyle's stored role and every other agent's role 'agent', and nothing else", () => {
    expect(isAgentRole('gilfoyle')).toBe(true)
    expect(isAgentRole('agent')).toBe(true)
    for (const r of ['person', 'lane', 'system', 'ask', undefined]) expect(isAgentRole(r)).toBe(false)
  })
})
