import { useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clip'
import { displayName, relTime } from '@/lib/time'
import type { CardAction } from '@/lib/types'
import { useCardEnv, useOpen } from './env'
import type { CardView } from './types'
import { KIND_LABEL, summaryOf } from './util'

const SERVER_KINDS = new Set(['approve', 'deny', 'ack', 'retry', 'submit', 'run'])
const RESOLVING = new Set(['approve', 'deny', 'ack', 'submit'])

// Text a Copy action puts on the clipboard.
export function copyTextOf(card: CardView): string {
  const d = card.data as Record<string, unknown>
  if (card.kind === 'command_output') return [d.command, d.stdout, d.stderr].filter((x) => typeof x === 'string' && x).join('\n')
  if (card.kind === 'script') return String(d.code || '')
  if (card.kind === 'config_diff') return String(d.unified || d.after || d.target || '')
  return summaryOf(card) || JSON.stringify(card.data)
}

export function ProvenanceLine({ card, className }: { card: CardView; className?: string }) {
  const env = useCardEnv()
  const p = card.provenance
  const bits = [p.source + (p.tool ? ' ' + p.tool : ''), relTime(p.at, env.now || undefined)].filter(Boolean)
  return (
    <p className={cn('text-xs text-muted-foreground', className)} data-testid="provenance">
      Source: {bits.join(', ')}
      {p.refs?.length ? ' | ' + p.refs.map((r) => r.label).join(', ') : ''}
    </p>
  )
}

export function ResolutionLine({ card }: { card: CardView }) {
  const env = useCardEnv()
  const r = card.resolution
  if (!r) return null
  const who = r.by.person ? env.people[r.by.person] || displayName(r.by.person) : 'someone'
  return (
    <p className="text-xs text-muted-foreground" data-testid="resolution">
      {r.label || r.kind} by {who}
      {r.by.device_name ? ` (${r.by.device_name})` : ''}, {relTime(r.at, env.now || undefined)}
    </p>
  )
}

export function CardFrame({ card, children, className }: { card: CardView; children: ReactNode; className?: string }) {
  return (
    <section data-testid={'card-' + card.kind} data-card-id={card.id} className={cn('flex w-full flex-col gap-2 rounded-lg border bg-card p-3', className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND_LABEL[card.kind] ?? card.kind}</div>
      {children}
      <ResolutionLine card={card} />
      <ProvenanceLine card={card} />
    </section>
  )
}

// The card's actions as buttons. Server backed ones go through env.act (signed, scope checked on the server too).
export function CardActions({ card, kinds }: { card: CardView; kinds?: CardAction['kind'][] }) {
  const env = useCardEnv()
  const open = useOpen()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const list = card.actions.filter((a) => !kinds || kinds.includes(a.kind))
  if (!list.length) return null
  const ownerBlocked = list.some((a) => SERVER_KINDS.has(a.kind) && a.scope === 'owner' && !env.canAdmin)
  const run = async (a: CardAction) => {
    if (a.kind === 'open') return open(card)
    if (a.kind === 'copy') return env.toast((await copyText(copyTextOf(card))) ? 'Copied' : 'Could not copy')
    if (a.kind === 'download') return
    setBusy(true)
    setErr(await env.act(card, a))
    setBusy(false)
  }
  const visible = list.filter((a) => {
    if (!SERVER_KINDS.has(a.kind)) return a.kind !== 'download'
    if (a.scope === 'owner') return env.canAdmin
    return env.isMember
  })
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="card-actions">
      {visible.map((a) => (
        <Button
          key={a.id}
          type="button"
          size="sm"
          variant={a.kind === 'approve' || a.kind === 'ack' || a.kind === 'submit' ? 'default' : 'outline'}
          disabled={busy || (RESOLVING.has(a.kind) && card.state !== 'open')}
          onClick={() => void run(a)}
        >
          {a.label}
        </Button>
      ))}
      {ownerBlocked && card.state === 'open' && (
        <Badge variant="secondary" className="w-fit">
          Waiting on an owner
        </Badge>
      )}
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}
