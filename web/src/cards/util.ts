import type { CardView } from './types'

export function fmtBytes(n: unknown): string {
  const b = typeof n === 'number' && isFinite(n) && n >= 0 ? n : 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

// The folders the console serves (console/lib/files.js). A path elsewhere is shown but not offered for download.
const SERVED = ['book/', 'docs/', 'registry/', 'console/data/uploads/']
export const downloadable = (path: string): boolean => SERVED.some((p) => path.startsWith(p)) && !path.split('/').includes('..')

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

// One line for a card, for lists (related cards) and sheet titles.
export function summaryOf(card: Pick<CardView, 'kind' | 'data'>): string {
  const d = rec(card.data)
  switch (card.kind) {
    case 'alert':
    case 'metrics_snapshot':
    case 'requested_input':
    case 'result_summary':
      return str(d.title)
    case 'script':
      return str(d.target)
    case 'command_output':
      return str(d.command)
    case 'file_retrieval': {
      const n = Array.isArray(d.files) ? d.files.length : 0
      return `${n} ${n === 1 ? 'file' : 'files'}`
    }
    case 'config_diff':
      return str(d.target)
    case 'approval':
      return str(d.action)
    case 'tool_run': {
      const n = Array.isArray(d.tools) ? d.tools.length : 0
      return `${n} ${n === 1 ? 'tool' : 'tools'}`
    }
    default:
      return ''
  }
}

export const KIND_LABEL: Record<string, string> = {
  tool_run: 'Tool run',
  command_output: 'Command',
  metrics_snapshot: 'Metrics',
  approval: 'Approval',
  file_retrieval: 'Files',
  requested_input: 'Questions',
  config_diff: 'Change',
  alert: 'Alert',
  script: 'Script',
  result_summary: 'Result',
}

export const asRec = rec
export const asStr = str
