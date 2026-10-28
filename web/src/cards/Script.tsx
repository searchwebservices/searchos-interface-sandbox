// script: a script Gilfoyle proposes. Inline: the code block with a target and cwd line and a badge, informational or
// executable. Surface: the Script Runner, with the code, target, cwd and the permissions it needs. Run is shown only
// when the script is executable AND the viewer is an owner; it posts the card action `run`, the console turns that into
// a prompt to the lane's session, the permission system raises the normal approval, and the output arrives later as a
// command_output card. The server enforces the same two conditions.
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/thread/CopyButton'
import { relTime } from '@/lib/time'
import { CardActions, CardFrame, ProvenanceLine, ResolutionLine } from './Frame'
import { useCardEnv } from './env'
import { asRec, asStr } from './util'
import type { CardProps, CardView, SurfaceProps } from './types'
import { useAgentName } from '@/lib/agent'

export interface ScriptView {
  target: string
  cwd: string
  language: string
  code: string
  executable: boolean
  permissions: string[]
}

export function scriptOf(data: unknown): ScriptView {
  const d = asRec(data)
  return {
    target: asStr(d.target),
    cwd: asStr(d.cwd),
    language: asStr(d.language),
    code: asStr(d.code),
    executable: d.executable === true,
    permissions: Array.isArray(d.permissions) ? d.permissions.map(String) : [],
  }
}

export function ModeBadge({ executable }: { executable: boolean }) {
  return (
    <Badge variant={executable ? 'default' : 'secondary'} data-testid="script-mode">
      {executable ? 'executable' : 'informational'}
    </Badge>
  )
}

function Code({ view, tall }: { view: ScriptView; tall?: boolean }) {
  return (
    <pre className={(tall ? 'max-h-[60vh]' : 'max-h-64') + ' overflow-auto rounded-md border bg-background p-2 font-mono text-xs'} data-testid="script-code">
      <code>{view.code}</code>
    </pre>
  )
}

export function ScriptInline({ card }: CardProps) {
  const v = scriptOf(card.data)
  return (
    <CardFrame card={card}>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground" data-testid="script-where">
        <ModeBadge executable={v.executable} />
        <span>target {v.target}</span>
        <span className="break-all">cwd {v.cwd}</span>
        {v.language && <span>{v.language}</span>}
      </div>
      <Code view={v} />
      <CardActions card={card} kinds={['open', 'copy']} />
    </CardFrame>
  )
}

// The Run button. Nothing at all unless the script is executable and the viewer is an owner.
export function RunButton({ card, view }: { card: CardView; view: ScriptView }) {
  const agent = useAgentName()
  const env = useCardEnv()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = card.actions.find((a) => a.kind === 'run')
  if (!view.executable || !run) return null
  if (!env.canAdmin) {
    return (
      <Badge variant="secondary" className="w-fit" data-testid="run-owner-only">
        Only an owner can run this
      </Badge>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={busy || card.state !== 'open'}
        data-testid="run-script"
        onClick={async () => {
          setBusy(true)
          setErr(await env.act(card, run))
          setBusy(false)
        }}
      >
        {run.label || 'Run'}
      </Button>
      <span className="text-xs text-muted-foreground">{agent} runs it through his shell, so you approve it first.</span>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}

export function ScriptSurface({ card }: SurfaceProps) {
  const env = useCardEnv()
  const v = scriptOf(card.data)
  const last = card.last_action
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="script-surface">
      <div className="flex items-center gap-2">
        <ModeBadge executable={v.executable} />
        <span className="text-sm text-muted-foreground">{v.executable ? 'Can be run by an owner.' : 'For reading. It cannot be run from here.'}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="font-mono text-muted-foreground">target</dt>
        <dd className="font-mono" data-testid="script-target">{v.target}</dd>
        <dt className="font-mono text-muted-foreground">cwd</dt>
        <dd className="font-mono break-all" data-testid="script-cwd">{v.cwd}</dd>
        <dt className="font-mono text-muted-foreground">language</dt>
        <dd className="font-mono">{v.language}</dd>
      </dl>
      <Code view={v} tall />
      <section>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Permissions</h4>
        {v.permissions.length ? (
          <ul className="flex flex-col gap-1 font-mono text-xs" data-testid="script-permissions">
            {v.permissions.map((p) => (
              <li key={p} className="break-all">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="script-no-permissions">
            None listed.
          </p>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={v.code} />
        <RunButton card={card} view={v} />
      </div>
      {last?.kind === 'run' && (
        <p className="text-xs text-muted-foreground" data-testid="script-last-run">
          Run requested {relTime(last.at, env.now || undefined)}. The output arrives in the thread as a command card.
        </p>
      )}
      <ResolutionLine card={card} />
      <ProvenanceLine card={card} />
    </div>
  )
}
