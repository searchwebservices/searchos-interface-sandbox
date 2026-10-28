// One collapsed row per turn: every run item and answered ask item between two conversation messages folds into
// one group. Pure; the thread view renders the result.
import type { AskItem, RunData, RunItem, RunTool, ThreadItem } from './types'

const CONVERSATION = new Set(['person', 'gilfoyle', 'agent', 'lane', 'system', 'form'])

export interface WorkGroup {
  kind: 'work'
  id: string
  // Every member in thread order: runs and answered asks.
  members: (RunItem | AskItem)[]
  runs: RunItem[]
  tools: RunTool[]
  started: number
  ended: number
  failed: boolean
  interrupted: boolean
}
export type Row = { kind: 'item'; item: ThreadItem } | WorkGroup

const runEnd = (r: RunData): number => {
  const ends = [r.ended ?? 0, ...r.tools.map((t) => t.ended ?? 0)]
  return Math.max(r.started, ...ends)
}

export function makeGroup(members: (RunItem | AskItem)[]): WorkGroup {
  const runs = members.filter((m): m is RunItem => m.role === 'run')
  const tools = runs.flatMap((r) => r.run.tools)
  const started = Math.min(...runs.map((r) => r.run.started))
  const ended = Math.max(...runs.map((r) => runEnd(r.run)))
  return {
    kind: 'work',
    id: 'work-' + members[0].id,
    members,
    runs,
    tools,
    started,
    ended,
    failed: runs.some((r) => r.run.status === 'failed'),
    interrupted: runs.some((r) => r.run.status === 'interrupted'),
  }
}

// Open asks stay cards in place and end the group. A changes card inside a group is shown right after the group.
export function groupFeed(items: ThreadItem[]): Row[] {
  const rows: Row[] = []
  let cur: (RunItem | AskItem)[] = []
  let held: ThreadItem[] = []
  const flush = () => {
    if (cur.length) {
      if (cur.some((m) => m.role === 'run')) rows.push(makeGroup(cur))
      else for (const m of cur) rows.push({ kind: 'item', item: m })
    }
    for (const h of held) rows.push({ kind: 'item', item: h })
    cur = []
    held = []
  }
  for (const it of items) {
    if (it.role === 'run' || (it.role === 'ask' && it.state !== 'open')) cur.push(it)
    else if (it.role === 'changes' && cur.length) held.push(it)
    else {
      if (CONVERSATION.has(it.role) || it.role === 'ask' || it.role === 'changes' || it.role === 'card') flush()
      rows.push({ kind: 'item', item: it })
    }
  }
  flush()
  return rows
}

// The changes card that follows a group, for the edit tool cards.
export function groupChanges(items: ThreadItem[], g: WorkGroup) {
  for (let i = g.runs.length - 1; i >= 0; i--) {
    const idx = items.findIndex((x) => x.id === g.runs[i].id)
    for (let j = idx + 1; j < items.length && idx >= 0; j++) {
      const x = items[j]
      if (x.role === 'changes') return x
      if (x.role === 'run') break
    }
  }
  return null
}
