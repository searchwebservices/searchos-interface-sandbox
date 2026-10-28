// The four kinds the older thread items map onto: tool_run (run), approval (ask), requested_input (form) and
// config_diff (changes). With `card.source` set they render the existing components, so a run, an ask, a form and a
// changes card look and behave as before. Without it (a card raised through the card tool) they render from data.
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/thread/CopyButton'
import { AskCard, DiffView, ToolCard, WorkRow } from '@/thread/Agent'
import { FormCard } from '@/thread/FormCard'
import { askLine } from '@/lib/asks'
import { groupChanges, makeGroup } from '@/lib/groups'
import { changesAfter } from '@/lib/tools'
import { displayName, fmtDuration, relTime } from '@/lib/time'
import type { RunData, RunItem } from '@/lib/types'
import { CardActions, CardFrame, copyTextOf } from './Frame'
import { useCardEnv } from './env'
import { beforeAfter, sideBySide } from './diff'
import type { SideRow } from './diff'
import { asRec, asStr } from './util'
import type { CardProps, CardView, SurfaceProps } from './types'

// ---------------------------------------------------------------- tool_run

function groupOf(card: CardView) {
  if (card.source?.group) return card.source.group
  const run = card.data as unknown as RunData
  const item: RunItem = { id: card.id, lane: card.lane, at: card.at, role: 'run', run: { ...run, tools: Array.isArray(run.tools) ? run.tools : [], started: Number(run.started) || Date.parse(card.at), ended: run.ended ?? null } }
  return makeGroup([item])
}

export function ToolRunInline({ card }: CardProps) {
  const env = useCardEnv()
  return <WorkRow group={groupOf(card)} items={env.items} people={env.people} now={env.now} />
}

export function ToolRunSurface({ card }: SurfaceProps) {
  const env = useCardEnv()
  const g = groupOf(card)
  const changes = groupChanges(env.items, g) ?? changesAfter(env.items, g.runs[0]?.id ?? '')
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="run-surface">
      <p className="text-sm text-muted-foreground">
        {g.tools.length} {g.tools.length === 1 ? 'tool' : 'tools'}, {fmtDuration(Math.max(0, g.ended - g.started))}
        {g.failed ? ', failed' : g.interrupted ? ', stopped' : ''}
      </p>
      <ul className="flex flex-col gap-1">
        {g.tools.map((t) => (
          <li key={t.id}>
            <ToolCard tool={t} changes={changes} />
          </li>
        ))}
      </ul>
      <CopyButton text={g.tools.map((t) => `${t.name} ${t.input_summary}`).join('\n')} className="self-start" />
    </div>
  )
}

// ---------------------------------------------------------------- approval

export function ApprovalInline({ card }: CardProps) {
  const env = useCardEnv()
  const ask = card.source?.ask
  if (ask) return <AskCard item={ask} canAnswer={env.canAdmin} people={env.people} now={env.now} onAnswer={(d) => env.legacy.answerAsk(ask, d)} />
  const d = asRec(card.data)
  const resources = Array.isArray(d.resources) ? (d.resources as unknown[]).map(String) : []
  return (
    <CardFrame card={card}>
      <div className="font-mono text-sm">{asStr(d.action)}</div>
      {resources.length > 0 && <ul className="font-mono text-xs text-muted-foreground">{resources.map((r) => <li key={r} className="break-all">{r}</li>)}</ul>}
      {asStr(d.message) && <p className="text-sm">{asStr(d.message)}</p>}
      <CardActions card={card} kinds={['approve', 'deny']} />
    </CardFrame>
  )
}

export function ApprovalSurface({ card }: SurfaceProps) {
  const env = useCardEnv()
  const ask = card.source?.ask
  const d = asRec(card.data)
  const resources = Array.isArray(d.resources) ? (d.resources as unknown[]).map(String) : []
  const history: string[] = [`Asked ${relTime(card.at, env.now || undefined)}`]
  if (ask && ask.state !== 'open') history.push(askLine(ask, env.people, env.now))
  else if (card.resolution) history.push(`${card.resolution.label || card.resolution.kind} by ${card.resolution.by.person ? env.people[card.resolution.by.person] || displayName(card.resolution.by.person) : 'someone'}`)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="approval-surface">
      <div className="font-mono text-sm">{asStr(d.action)}</div>
      {resources.length > 0 && <ul className="font-mono text-xs text-muted-foreground">{resources.map((r) => <li key={r} className="break-all">{r}</li>)}</ul>}
      {asStr(d.message) && <p className="text-sm">{asStr(d.message)}</p>}
      <section>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</h4>
        <ol className="flex flex-col gap-1 border-l pl-3 text-sm" data-testid="approval-history">
          {history.map((h, i) => <li key={i}>{h}</li>)}
        </ol>
      </section>
      {ask ? (
        <AskCard item={ask} canAnswer={env.canAdmin} people={env.people} now={env.now} onAnswer={(dec) => env.legacy.answerAsk(ask, dec)} />
      ) : (
        <CardActions card={card} kinds={['approve', 'deny']} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- requested_input

export function RequestedInputInline({ card }: CardProps) {
  const env = useCardEnv()
  const form = card.source?.form
  if (form) return <FormCard item={form} canAnswer={env.isMember} people={env.people} onSubmit={(a) => env.legacy.answerForm(form, a)} onCancel={() => env.legacy.cancelForm(form)} />
  const d = asRec(card.data)
  const n = Array.isArray(d.fields) ? d.fields.length : 0
  return (
    <CardFrame card={card}>
      <div className="text-sm font-medium">{asStr(d.title)}</div>
      <p className="text-xs text-muted-foreground">{n} {n === 1 ? 'question' : 'questions'}. Answer through ask_form; this card only lists them.</p>
    </CardFrame>
  )
}

export function RequestedInputSurface({ card }: SurfaceProps) {
  const env = useCardEnv()
  const form = card.source?.form
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4" data-testid="input-surface">
      {form ? (
        <FormCard item={form} canAnswer={env.isMember} people={env.people} onSubmit={(a) => env.legacy.answerForm(form, a)} onCancel={() => env.legacy.cancelForm(form)} />
      ) : (
        <RequestedInputInline card={card} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- config_diff

function Side({ rows }: { rows: SideRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-auto rounded-md border bg-border font-mono text-xs" data-testid="side-by-side">
      {rows.map((r, i) => (
        <div key={i} className="contents" data-kind={r.kind}>
          <div className={'min-h-5 whitespace-pre-wrap break-all bg-background px-2 ' + (r.kind === 'del' || r.kind === 'chg' ? 'bg-accent text-destructive' : r.kind === 'hunk' ? 'text-muted-foreground' : '')} data-side="left">{r.left ?? ' '}</div>
          <div className={'min-h-5 whitespace-pre-wrap break-all bg-background px-2 ' + (r.kind === 'add' || r.kind === 'chg' ? 'bg-accent text-ok' : r.kind === 'hunk' ? 'text-muted-foreground' : '')} data-side="right">{r.right ?? ' '}</div>
        </div>
      ))}
    </div>
  )
}

export function ConfigDiffInline({ card }: CardProps) {
  const d = asRec(card.data)
  const unified = asStr(d.unified)
  return (
    <CardFrame card={card}>
      <div className="font-mono text-sm break-all">{asStr(d.target)}</div>
      {asStr(d.reason) && <p className="text-sm">{asStr(d.reason)}</p>}
      {unified ? <DiffView diff={unified} /> : <p className="text-xs text-muted-foreground">Open for the before and after.</p>}
      <CardActions card={card} kinds={['approve', 'deny', 'open']} />
    </CardFrame>
  )
}

export function ConfigDiffSurface({ card }: SurfaceProps) {
  const d = asRec(card.data)
  const unified = asStr(d.unified)
  const rows = useMemo(() => (unified ? sideBySide(unified) : beforeAfter(asStr(d.before), asStr(d.after))), [unified, d.before, d.after])
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="diff-surface">
      <div className="font-mono text-sm break-all">{asStr(d.target)}</div>
      {asStr(d.reason) && <p className="text-sm">{asStr(d.reason)}</p>}
      <div className="grid grid-cols-2 gap-px px-2 text-xs font-medium text-muted-foreground"><span>Before</span><span>After</span></div>
      <Side rows={rows} />
      {!card.source?.changes && <CardActions card={card} kinds={['approve', 'deny']} />}
      <div className="flex items-center gap-2"><Badge variant="secondary">{card.state}</Badge><CopyButton text={copyTextOf(card)} label="Copy diff" /></div>
    </div>
  )
}
