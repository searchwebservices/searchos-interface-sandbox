// The agent a lane talks to. Today every lane is Gilfoyle's; the console adds `agent: { id, name, avatar }` to
// /api/lanes entries when a lane belongs to another agent. A missing value is Gilfoyle, so nothing changes for
// any lane that exists today.
import { createContext, useContext } from 'react'

export const DEFAULT_AGENT_NAME = 'Gilfoyle'

export function agentName(lane?: { agent?: { id?: string; name?: string | null; avatar?: string | null } | null } | null): string {
  return lane?.agent?.name || DEFAULT_AGENT_NAME
}

// Lane scoped components read the name of the lane they render in. The shell provides the viewer's first DM
// lane by default and the thread view narrows it to the open lane.
export const AgentNameContext = createContext<string>(DEFAULT_AGENT_NAME)
export const useAgentName = (): string => useContext(AgentNameContext)

// A reply written by an agent: Gilfoyle's keep their stored role, any other agent's are role 'agent' plus its id.
export const isAgentRole = (role: string | undefined): boolean => role === 'gilfoyle' || role === 'agent'
