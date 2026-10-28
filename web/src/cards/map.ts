// The older thread items, mapped INTO the registry without changing their storage (spec section 2):
// run = tool_run, ask = approval, form = requested_input, changes = config_diff, shell tool = command_output.
import type { AskItem, ChangesItem, FormItem, RunTool } from '@/lib/types'
import { defaultActionsFor } from './actions'
import { shellExit, toolKind } from '@/lib/tools'
import type { WorkGroup } from '@/lib/groups'
import type { CardView } from './types'

const prov = (tool: string, at: string): CardView['provenance'] => ({ source: 'tool', tool, at })

export function cardOfAsk(item: AskItem): CardView {
  const a = item.ask
  return {
    id: item.id,
    kind: 'approval',
    lane: item.lane,
    data: { request_id: a.request_id, action: a.action, resources: a.resources, message: a.message, ...(a.scope ? { scope: a.scope } : {}) },
    provenance: prov('permission', item.at),
    actions: defaultActionsFor('approval'),
    state: item.state === 'open' ? 'open' : 'done',
    at: item.at,
    source: { ask: item },
  }
}

export function cardOfForm(item: FormItem): CardView {
  return {
    id: item.id,
    kind: 'requested_input',
    lane: item.lane,
    data: { id: item.form.id, title: item.form.title, fields: item.form.fields, metadata: item.form.metadata },
    provenance: prov('ask_form', item.at),
    actions: defaultActionsFor('requested_input'),
    state: item.state === 'pending' ? 'open' : 'done',
    at: item.at,
    source: { form: item },
  }
}

export function cardOfChanges(item: ChangesItem): CardView {
  const unified = item.files.map((f) => `--- ${f.path}\n${f.diff}`).join('\n')
  return {
    id: item.id,
    kind: 'config_diff',
    lane: item.lane,
    data: { target: item.files.map((f) => f.path).join(', '), before: '', after: '', unified },
    provenance: prov('edit', item.at),
    actions: [],
    state: 'done',
    at: item.at,
    source: { changes: item },
  }
}

export function cardOfGroup(group: WorkGroup, lane: string): CardView {
  const first = group.runs[0]
  return {
    id: group.id,
    kind: 'tool_run',
    lane,
    data: { message_id: first ? first.run.message_id : group.id, status: group.failed ? 'failed' : group.interrupted ? 'interrupted' : 'done', started: group.started, ended: group.ended, tools: group.tools },
    provenance: prov('run', first ? first.at : new Date(group.started).toISOString()),
    actions: defaultActionsFor('tool_run'),
    state: 'done',
    at: first ? first.at : new Date(group.started).toISOString(),
    source: { group },
  }
}

// The shell tool card of a run, as a command_output card.
export function cardOfShellTool(tool: RunTool, lane: string, at: string): CardView | null {
  if (toolKind(tool.name) !== 'shell') return null
  const exit = Number(shellExit(tool))
  return {
    id: 'tool-' + tool.id,
    kind: 'command_output',
    lane,
    data: { command: tool.input_summary, stdout: tool.output_excerpt ?? '', stderr: '', exit: Number.isInteger(exit) ? exit : tool.status === 'ok' ? 0 : tool.status === 'failed' ? 1 : null },
    provenance: prov(tool.name, at),
    actions: defaultActionsFor('command_output'),
    state: 'done',
    at,
    source: { tool },
  }
}
