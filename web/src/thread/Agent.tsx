// Section 3 of docs/console-v2-spec.md: the working row, the collapsed run row, tool cards specialised by
// tool name, the ask card and the changes card.
import { useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { Loader } from '@/components/lattice-loader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CommandOutput } from '@/cards/CommandOutput'
import { useCardEnv } from '@/cards/env'
import { cardOfShellTool } from '@/cards/map'
import { useSurfaces } from '@/cards/surface-context'
import { Tool, ToolContent } from '@/components/ai-elements/tool'
import { CollapsibleTrigger } from '@/components/ui/collapsible'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/useNow'
import { fmtDuration } from '@/lib/time'
import { askGroupLine, askLine } from '@/lib/asks'
import { groupChanges } from '@/lib/groups'
import type { WorkGroup } from '@/lib/groups'
import { fileFor, isLongValue, shellExit, sourcesOf, toolArgs, toolDuration, toolKind } from '@/lib/tools'
import type { AskItem, ChangeFile, ChangesItem, Decision, RunTool, ThreadItem } from '@/lib/types'
import { useAgentName } from '@/lib/agent'

// ------------------------------------------------------------------ working row

export function WorkingRow({ since, canStop, onStop }: { since: number | null; canStop: boolean; onStop: () => void }) {
  const agent = useAgentName()
  const now = useNow(200)
  const [stopping, setStopping] = useState(false)
  return (
    <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground" data-testid="working-row">
      <Loader
        label={agent + ' is working'}
        status="working"
        showTimer
        color="currentColor"
        elapsed={since ? Math.max(0, (now - since) / 1000) : undefined}
      />
      {canStop && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={stopping}
          onClick={() => {
            setStopping(true)
            onStop()
            window.setTimeout(() => setStopping(false), 1500)
          }}
        >
          Stop
        </Button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ run row and tool list

const DENIED = /denied|rejected|not allowed|permission/i
export type DotState = 'running' | 'ok' | 'failed' | 'denied'
export const dotOf = (t: RunTool): DotState =>
  t.status === 'running' ? 'running' : t.status === 'ok' ? 'ok' : DENIED.test(t.output_excerpt || '') ? 'denied' : 'failed'

function StatusDot({ state }: { state: DotState }) {
  return (
    <span
      role="img"
      aria-label={state}
      title={state}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        state === 'running' && 'animate-pulse bg-primary',
        state === 'ok' && 'bg-ok',
        state === 'failed' && 'bg-destructive',
        state === 'denied' && 'bg-warn',
      )}
    />
  )
}

// One row per turn: all the tool work between two conversation messages, with the answered asks inline.
// The loader here is always in the static done or error state; only the working row animates.
export function WorkRow({ group, items, people, now }: { group: WorkGroup; items: ThreadItem[]; people: Record<string, string>; now: number }) {
  const agent = useAgentName()
  const [open, setOpen] = useState(false)
  const ms = Math.max(0, group.ended - group.started)
  const failed = group.failed || group.interrupted
  const n = group.tools.length
  const changes = groupChanges(items, group)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full" data-testid="run-row">
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-md py-1 text-left text-sm text-muted-foreground hover:text-foreground">
        <Loader
          label={agent + ' is working'}
          doneLabel={agent + ' worked:'}
          errorLabel={group.failed ? agent + ' failed:' : agent + ' stopped:'}
          status={failed ? 'error' : 'done'}
          showTimer={false}
          color="currentColor"
        />
        <span className="font-mono text-xs">
          {n} {n === 1 ? 'tool' : 'tools'}, {fmtDuration(ms)}
        </span>
        {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 flex flex-col gap-1 border-l pl-3">
          {group.members.flatMap((m) =>
            m.role === 'run'
              ? m.run.tools.map((t) => (
                  <li key={m.id + t.id}>
                    <ToolCard tool={t} changes={changes} />
                  </li>
                ))
              : [
                  <li key={m.id} className="px-1 py-1 text-xs text-muted-foreground" data-testid="ask-in-group">
                    {askGroupLine(m, people, now)}
                  </li>,
                ],
          )}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ------------------------------------------------------------------ tool card

export function ArgList({ args }: { args: { key: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {args.map((a) => (
        <ArgRow key={a.key} k={a.key} v={a.value} />
      ))}
    </dl>
  )
}
function ArgRow({ k, v }: { k: string; v: string }) {
  const [more, setMore] = useState(false)
  const long = isLongValue(v)
  return (
    <>
      <dt className="font-mono text-muted-foreground">{k}</dt>
      <dd className="min-w-0 font-mono break-all">
        {long && !more ? v.slice(0, 160) + '...' : v}
        {long && (
          <button type="button" className="ml-2 text-primary underline-offset-2 hover:underline" onClick={() => setMore(!more)}>
            {more ? 'less' : 'more'}
          </button>
        )}
      </dd>
    </>
  )
}

export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md border bg-background p-2 font-mono text-xs leading-snug" data-testid="diff">
      {diff.split('\n').map((l, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre-wrap break-all',
            l.startsWith('+') && !l.startsWith('+++') && 'bg-accent text-ok',
            l.startsWith('-') && !l.startsWith('---') && 'bg-accent text-destructive',
            l.startsWith('@@') && 'text-muted-foreground',
          )}
        >
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}

function Excerpt({ text }: { text?: string }) {
  if (!text) return <p className="text-xs text-muted-foreground">No result stored.</p>
  return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-background p-2 font-mono text-xs">{text}</pre>
}

// Opens the command_output surface (the full terminal) for a finished shell tool, when a surface host is mounted.
function OpenTerminal({ tool }: { tool: RunTool }) {
  const surfaces = useSurfaces()
  const env = useCardEnv()
  if (!surfaces || tool.status === 'running' || tool.sensitive) return null
  const card = cardOfShellTool(tool, env.lane, new Date(tool.started || Date.now()).toISOString())
  if (!card) return null
  return (
    <Button type="button" size="xs" variant="outline" className="self-start" onClick={() => surfaces.open(card)}>
      Open terminal
    </Button>
  )
}

function ToolBody({ tool, changes }: { tool: RunTool; changes: ChangesItem | null }) {
  const kind = toolKind(tool.name)
  const args = toolArgs(tool)
  if (kind === 'shell') {
    // The registry's command_output renderer (web/src/cards/CommandOutput.tsx): one renderer per kind.
    return (
      <div className="flex flex-col gap-2">
        <CommandOutput view={{ command: tool.input_summary, stdout: tool.output_excerpt ?? '', stderr: '', exit: shellExit(tool) }} />
        <OpenTerminal tool={tool} />
      </div>
    )
  }
  if (kind === 'edit') {
    const f = fileFor(changes, tool)
    return (
      <div className="flex flex-col gap-2" data-testid="file-edit-card">
        <ArgList args={args} />
        {f ? <FileDiff file={f} /> : <Excerpt text={tool.output_excerpt} />}
      </div>
    )
  }
  if (kind === 'web') {
    const links = sourcesOf(tool.output_excerpt)
    return (
      <div className="flex flex-col gap-2" data-testid="source-cards">
        <ArgList args={args} />
        {links.length ? (
          <Sources>
            <SourcesTrigger count={links.length} />
            <SourcesContent>
              {links.map((l) => (
                <div key={l.url} className="flex flex-col">
                  <Source href={l.url} target="_blank" rel="noopener noreferrer" title={l.title}>
                    <span className="font-medium">{l.title}</span>
                  </Source>
                  <span className="pl-6 font-mono text-xs text-muted-foreground">{l.host}</span>
                </div>
              ))}
            </SourcesContent>
          </Sources>
        ) : (
          <Excerpt text={tool.output_excerpt} />
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <ArgList args={args} />
      <Excerpt text={tool.output_excerpt} />
    </div>
  )
}

export function ToolCard({ tool, changes }: { tool: RunTool; changes: ChangesItem | null }) {
  const [open, setOpen] = useState(false)
  const d = toolDuration(tool)
  return (
    <Tool open={open} onOpenChange={setOpen} className="mb-0 border-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-accent">
        <StatusDot state={dotOf(tool)} />
        <span className="font-mono text-xs font-medium">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{tool.sensitive ? '[redacted]' : tool.input_summary}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{d == null ? '' : fmtDuration(d)}</span>
      </CollapsibleTrigger>
      <ToolContent className="px-2 pb-2">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{dotOf(tool)}</Badge>
          {d != null && <span>{fmtDuration(d)}</span>}
        </div>
        <ToolBody tool={tool} changes={changes} />
      </ToolContent>
    </Tool>
  )
}

// ------------------------------------------------------------------ ask card

export function AskCard({
  item,
  canAnswer,
  people,
  now,
  onAnswer,
}: {
  item: AskItem
  canAnswer: boolean
  people: Record<string, string>
  now?: number
  onAnswer: (d: Decision) => Promise<string | null>
}) {
  const agent = useAgentName()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const a = item.ask
  if (item.state !== 'open') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="ask-collapsed">
        <Badge variant="secondary">Ask</Badge>
        <span className="font-mono text-xs">{a.action}</span>
        <span>{askLine(item, people, now)}</span>
      </div>
    )
  }
  const answer = async (d: Decision) => {
    setBusy(true)
    setErr(await onAnswer(d))
    setBusy(false)
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3" data-testid="ask-card">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{agent + ' asks'}</div>
      <div className="font-mono text-sm">{a.action}</div>
      {a.scope && (
        <p className="font-mono text-xs text-muted-foreground" data-testid="ask-scope">
          {a.scope.host ? a.scope.host + ', ' : ''}
          {a.scope.command_class}
        </p>
      )}
      {a.resources.length > 0 && (
        <ul className="font-mono text-xs text-muted-foreground">
          {a.resources.map((r) => (
            <li key={r} className="break-all">
              {r}
            </li>
          ))}
        </ul>
      )}
      {a.message && <p className="text-sm">{a.message}</p>}
      {canAnswer ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void answer('once')}>
            Allow once
          </Button>
          {a.scope?.always_allowed === true && (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void answer('always')}>
              Always
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void answer('reject')}>
            Deny
          </Button>
        </div>
      ) : (
        <Badge variant="secondary" className="w-fit">
          Waiting on an owner
        </Badge>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ changes card

export function FileDiff({ file }: { file: ChangeFile }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent">
        {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
        <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
        <span className="font-mono text-ok">+{file.additions}</span>
        <span className="font-mono text-destructive">-{file.deletions}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        {file.diff ? <DiffView diff={file.diff} /> : <p className="text-xs text-muted-foreground">No diff stored.</p>}
        {file.truncated && <p className="mt-1 text-xs text-muted-foreground">Diff cut at 20 KB.</p>}
      </CollapsibleContent>
    </Collapsible>
  )
}
