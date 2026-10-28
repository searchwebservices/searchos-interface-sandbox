// The shared card registry as the web app sees it. The schemas, the envelope and the fixtures are the SAME JSON
// files the plugin tool and the console read (console/lib/cards), imported through the @cards alias, so there is
// one source of truth and no copy step. Only the validator below is a second implementation, and a parity test
// runs every fixture through both.
import tool_run from '@cards/schemas/tool_run.json'
import command_output from '@cards/schemas/command_output.json'
import metrics_snapshot from '@cards/schemas/metrics_snapshot.json'
import approval from '@cards/schemas/approval.json'
import file_retrieval from '@cards/schemas/file_retrieval.json'
import requested_input from '@cards/schemas/requested_input.json'
import config_diff from '@cards/schemas/config_diff.json'
import alert from '@cards/schemas/alert.json'
import script from '@cards/schemas/script.json'
import result_summary from '@cards/schemas/result_summary.json'
import envelope from '@cards/envelope.json'
import fixtures from '@cards/fixtures.json'
import type { Schema } from './validate'

export const KINDS = ['tool_run', 'command_output', 'metrics_snapshot', 'approval', 'file_retrieval', 'requested_input', 'config_diff', 'alert', 'script', 'result_summary'] as const
export type Kind = (typeof KINDS)[number]

export const SCHEMAS: Record<Kind, Schema> = {
  tool_run,
  command_output,
  metrics_snapshot,
  approval,
  file_retrieval,
  requested_input,
  config_diff,
  alert,
  script,
  result_summary,
} as unknown as Record<Kind, Schema>

export const ENVELOPE = envelope as unknown as Schema
export const FIXTURES = fixtures as unknown as Record<Kind, { valid: unknown; invalid: unknown }>
