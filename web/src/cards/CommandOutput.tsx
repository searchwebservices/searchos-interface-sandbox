// command_output: a command and what it printed. Inline is the compact terminal the shell tool card has always been
// (Output and Exit tabs); the surface is the full terminal with tabs. The shell tool card in Agent.tsx renders this
// same component, so there is one renderer per kind.
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyButton } from '@/thread/CopyButton'
import { asRec, asStr } from './util'
import { CardActions, CardFrame, copyTextOf } from './Frame'
import type { CardProps, SurfaceProps } from './types'

export interface CommandView {
  command: string
  stdout: string
  stderr: string
  exit: string
  cwd?: string
  host?: string
}

export function commandOf(data: unknown): CommandView {
  const d = asRec(data)
  const exit = typeof d.exit === 'number' ? String(d.exit) : d.exit === null ? 'running' : asStr(d.exit)
  return { command: asStr(d.command), stdout: asStr(d.stdout), stderr: asStr(d.stderr), exit, cwd: asStr(d.cwd) || undefined, host: asStr(d.host) || undefined }
}

function Out({ text, tall }: { text: string; tall?: boolean }) {
  if (!text) return <p className="text-xs text-muted-foreground">Nothing printed.</p>
  return (
    <pre className={(tall ? 'max-h-[60vh]' : 'max-h-64') + ' overflow-auto whitespace-pre-wrap break-all rounded-md border bg-background p-2 font-mono text-xs'}>{text}</pre>
  )
}

// The compact terminal. `copy` adds a Copy button that carries the command and its output.
export function CommandOutput({ view, copy }: { view: CommandView; copy?: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-testid="code-run-card">
      <pre className="overflow-x-auto rounded-md border bg-background p-2 font-mono text-xs">
        <span className="text-muted-foreground">$ </span>
        {view.command}
      </pre>
      <Tabs defaultValue="output">
        <TabsList>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="exit">Exit</TabsTrigger>
        </TabsList>
        <TabsContent value="output">
          <Out text={view.stdout || view.stderr} />
        </TabsContent>
        <TabsContent value="exit">
          <p className="font-mono text-xs">{view.exit}</p>
        </TabsContent>
      </Tabs>
      {copy && <CopyButton text={[view.command, view.stdout, view.stderr].filter(Boolean).join('\n')} className="self-start" />}
    </div>
  )
}

export function CommandInline({ card }: CardProps) {
  const view = commandOf(card.data)
  const failed = view.exit !== '0' && view.exit !== 'running'
  return (
    <CardFrame card={card}>
      <CommandOutput view={view} copy />
      {failed && view.stderr && <Out text={view.stderr} />}
      <CardActions card={card} kinds={['retry', 'open']} />
    </CardFrame>
  )
}

// The full terminal: output, errors, and the details of the run.
export function CommandSurface({ card }: SurfaceProps) {
  const v = commandOf(card.data)
  const [tab, setTab] = useState('output')
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="command-surface">
      <pre className="overflow-x-auto rounded-md border bg-background p-2 font-mono text-xs">
        <span className="text-muted-foreground">{v.host ? v.host + ' ' : ''}{v.cwd ? v.cwd + ' ' : ''}$ </span>
        {v.command}
      </pre>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="errors">Errors{v.stderr ? ' *' : ''}</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="output">
          <Out text={v.stdout} tall />
        </TabsContent>
        <TabsContent value="errors">
          <Out text={v.stderr} tall />
        </TabsContent>
        <TabsContent value="details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="font-mono text-muted-foreground">exit</dt>
            <dd className="font-mono">{v.exit}</dd>
            <dt className="font-mono text-muted-foreground">cwd</dt>
            <dd className="font-mono break-all">{v.cwd || 'not recorded'}</dd>
            <dt className="font-mono text-muted-foreground">host</dt>
            <dd className="font-mono">{v.host || 'not recorded'}</dd>
          </dl>
        </TabsContent>
      </Tabs>
      <div className="flex items-center gap-2">
        <CopyButton text={copyTextOf(card)} />
        <CardActions card={card} kinds={['retry']} />
      </div>
    </div>
  )
}
