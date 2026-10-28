// The card registry: kind -> { Inline, Surface, schema }. One renderer per kind. Inline is the compact card in the
// thread, Surface the full interaction opened from the card's open action. The surface registry knows nothing about
// where a surface is shown (see surfaces.tsx), so the dock can take it over without touching this file.
import { Component } from 'react'
import type { ComponentType, ErrorInfo, ReactNode } from 'react'
import { AlertInline, AlertSurface } from './Alert'
import { CommandInline, CommandSurface } from './CommandOutput'
import { FilesInline, FilesSurface } from './Files'
import { MetricsInline, MetricsSurface } from './Metrics'
import { ScriptInline, ScriptSurface } from './Script'
import { SummaryInline, SummarySurface } from './Summary'
import { ApprovalInline, ApprovalSurface, ConfigDiffInline, ConfigDiffSurface, RequestedInputInline, RequestedInputSurface, ToolRunInline, ToolRunSurface } from './Mapped'
import { KINDS, SCHEMAS } from './schemas'
import type { Kind } from './schemas'
import type { Schema } from './validate'
import { validateCard } from './validate'
import type { CardProps, CardView, SurfaceProps } from './types'
import { KIND_LABEL, summaryOf } from './util'

export interface CardKind {
  Inline: ComponentType<CardProps>
  Surface: ComponentType<SurfaceProps>
  schema: Schema
  title: (card: CardView) => string
  // How wide the surface wants to be. The host maps it to a size.
  width: 'md' | 'lg' | 'xl'
}

const title = (k: string) => (card: CardView) => (summaryOf(card) ? `${KIND_LABEL[k]}: ${summaryOf(card)}` : KIND_LABEL[k])

export const registry: Record<Kind, CardKind> = {
  tool_run: { Inline: ToolRunInline, Surface: ToolRunSurface, schema: SCHEMAS.tool_run, title: title('tool_run'), width: 'lg' },
  command_output: { Inline: CommandInline, Surface: CommandSurface, schema: SCHEMAS.command_output, title: title('command_output'), width: 'xl' },
  metrics_snapshot: { Inline: MetricsInline, Surface: MetricsSurface, schema: SCHEMAS.metrics_snapshot, title: title('metrics_snapshot'), width: 'xl' },
  approval: { Inline: ApprovalInline, Surface: ApprovalSurface, schema: SCHEMAS.approval, title: title('approval'), width: 'md' },
  file_retrieval: { Inline: FilesInline, Surface: FilesSurface, schema: SCHEMAS.file_retrieval, title: () => 'File preview', width: 'lg' },
  requested_input: { Inline: RequestedInputInline, Surface: RequestedInputSurface, schema: SCHEMAS.requested_input, title: title('requested_input'), width: 'lg' },
  config_diff: { Inline: ConfigDiffInline, Surface: ConfigDiffSurface, schema: SCHEMAS.config_diff, title: title('config_diff'), width: 'xl' },
  alert: { Inline: AlertInline, Surface: AlertSurface, schema: SCHEMAS.alert, title: title('alert'), width: 'md' },
  script: { Inline: ScriptInline, Surface: ScriptSurface, schema: SCHEMAS.script, title: () => 'Script Runner', width: 'lg' },
  result_summary: { Inline: SummaryInline, Surface: SummarySurface, schema: SCHEMAS.result_summary, title: title('result_summary'), width: 'md' },
}

export const entryOf = (kind: unknown): CardKind | undefined => (typeof kind === 'string' && (KINDS as readonly string[]).includes(kind) ? registry[kind as Kind] : undefined)

// A kind the registry does not know, or a card whose data does not fit its schema. Shows the raw kind name, never throws.
export function UnknownCard({ kind, reason }: { kind: unknown; reason?: string }) {
  const name = typeof kind === 'string' ? kind.slice(0, 80) : String(typeof kind)
  return (
    <div className="flex w-full flex-col gap-1 rounded-lg border border-dashed bg-card p-3 text-sm" data-testid="unknown-card" role="note">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{reason ? 'Card could not be shown' : 'Unknown card'}</div>
      <div>
        Kind: <code className="font-mono">{name}</code>
      </div>
      {reason && <div className="text-xs text-muted-foreground">{reason}</div>}
    </div>
  )
}

// A renderer that throws must not take the thread down with it.
class Boundary extends Component<{ kind: unknown; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('card render failed', err.message, info.componentStack ? '' : '')
  }
  render() {
    return this.state.failed ? <UnknownCard kind={this.props.kind} reason="This card could not be drawn." /> : this.props.children
  }
}

// Stored cards are checked against the shared schema before they draw. Mapped items (card.source) are not: their
// shape is the existing item, owned by the console.
function problem(card: CardView): string | null {
  if (card.source) return null
  const v = validateCard(card)
  return v.ok ? null : v.errors[0]
}

export function CardInline({ card }: { card: CardView }) {
  const e = entryOf(card?.kind)
  if (!e) return <UnknownCard kind={card?.kind} />
  const bad = problem(card)
  if (bad) return <UnknownCard kind={card.kind} reason={bad} />
  return (
    <Boundary kind={card.kind}>
      <e.Inline card={card} />
    </Boundary>
  )
}

export function CardSurface({ card, arg }: { card: CardView; arg?: unknown }) {
  const e = entryOf(card?.kind)
  if (!e) return <UnknownCard kind={card?.kind} />
  const bad = problem(card)
  if (bad) return <UnknownCard kind={card.kind} reason={bad} />
  return (
    <Boundary kind={card.kind}>
      <e.Surface card={card} arg={arg} />
    </Boundary>
  )
}
