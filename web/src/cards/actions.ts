// Default actions per kind: the same table as console/lib/cards/index.js DEFAULT_ACTIONS (spec section 3).
import type { CardAction } from '@/lib/types'

const T: Record<string, CardAction[]> = {
  tool_run: [{ id: 'copy', label: 'Copy', kind: 'copy' }],
  command_output: [{ id: 'copy', label: 'Copy', kind: 'copy' }, { id: 'retry', label: 'Retry', kind: 'retry', scope: 'owner' }],
  metrics_snapshot: [{ id: 'open', label: 'Open', kind: 'open' }],
  approval: [{ id: 'approve', label: 'Approve', kind: 'approve', scope: 'owner' }, { id: 'deny', label: 'Deny', kind: 'deny', scope: 'owner' }],
  file_retrieval: [{ id: 'open', label: 'Open', kind: 'open' }, { id: 'download', label: 'Download', kind: 'download' }],
  requested_input: [{ id: 'submit', label: 'Submit', kind: 'submit', scope: 'member' }],
  config_diff: [{ id: 'approve', label: 'Approve', kind: 'approve', scope: 'owner' }, { id: 'deny', label: 'Deny', kind: 'deny', scope: 'owner' }],
  alert: [{ id: 'ack', label: 'Acknowledge', kind: 'ack', scope: 'member' }, { id: 'open', label: 'Open', kind: 'open' }],
  script: [{ id: 'open', label: 'Open', kind: 'open' }, { id: 'copy', label: 'Copy', kind: 'copy' }, { id: 'run', label: 'Run', kind: 'run', scope: 'owner' }],
  result_summary: [{ id: 'open', label: 'Open', kind: 'open' }],
}
export const defaultActionsFor = (kind: string): CardAction[] => (T[kind] ?? []).map((a) => ({ ...a }))
