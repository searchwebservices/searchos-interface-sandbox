// alert. Inline: a severity strip with the title, the body and Acknowledge for members. Surface: the detail with the
// related cards of the same run. An alert is raised once and acknowledged by a person (spec section 5).
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { relTime } from '@/lib/time'
import { ProvenanceLine, ResolutionLine } from './Frame'
import { useCardEnv, useOpen } from './env'
import { asRec, asStr, KIND_LABEL, summaryOf } from './util'
import type { CardProps, CardView, SurfaceProps } from './types'

type Sev = 'info' | 'warn' | 'critical'
const sevOf = (data: unknown): Sev => {
  const s = asStr(asRec(data).severity)
  return s === 'critical' || s === 'warn' ? s : 'info'
}
// Strip colours come from tokens: primary, warn, destructive.
const STRIPE: Record<Sev, string> = { info: 'bg-primary', warn: 'bg-warn', critical: 'bg-destructive' }

export function AckButton({ card }: { card: CardView }) {
  const env = useCardEnv()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ack = card.actions.find((a) => a.kind === 'ack')
  if (!ack) return null
  if (card.state !== 'open') return null
  if (!env.isMember) {
    return (
      <Badge variant="secondary" className="w-fit">
        Members of this lane can acknowledge
      </Badge>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setErr(await env.act(card, ack))
          setBusy(false)
        }}
      >
        {ack.label}
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}

export function AlertInline({ card }: CardProps) {
  const env = useCardEnv()
  const open = useOpen()
  const d = asRec(card.data)
  const sev = sevOf(d)
  return (
    <section data-testid="card-alert" data-card-id={card.id} data-severity={sev} data-state={card.state} className={cn('flex w-full overflow-hidden rounded-lg border bg-card', card.state !== 'open' && 'opacity-80')}>
      <span aria-hidden data-testid="severity-strip" className={cn('w-1.5 shrink-0', STRIPE[sev])} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={sev === 'critical' ? 'destructive' : 'secondary'}>{sev}</Badge>
          <span className="text-sm font-medium">{asStr(d.title)}</span>
          {card.state === 'ack' && <Badge variant="secondary">Acknowledged</Badge>}
        </div>
        <p className="text-sm whitespace-pre-wrap">{asStr(d.body)}</p>
        <p className="text-xs text-muted-foreground">
          {asStr(d.source)}
          {asStr(d.since) ? ', since ' + relTime(asStr(d.since), env.now || undefined) : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <AckButton card={card} />
          <Button type="button" size="sm" variant="outline" onClick={() => open(card)}>
            Open
          </Button>
        </div>
        <ResolutionLine card={card} />
        <ProvenanceLine card={card} />
      </div>
    </section>
  )
}

export function relatedOf(card: CardView, all: CardView[]): CardView[] {
  const run = card.provenance.run_id
  if (!run) return []
  return all.filter((c) => c.id !== card.id && c.provenance.run_id === run)
}

export function AlertSurface({ card }: SurfaceProps) {
  const env = useCardEnv()
  const open = useOpen()
  const d = asRec(card.data)
  const sev = sevOf(d)
  const related = relatedOf(card, env.cards)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4" data-testid="alert-surface">
      <div className="flex items-stretch overflow-hidden rounded-lg border">
        <span aria-hidden className={cn('w-1.5 shrink-0', STRIPE[sev])} />
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <Badge variant={sev === 'critical' ? 'destructive' : 'secondary'}>{sev}</Badge>
            <span className="text-sm font-semibold">{asStr(d.title)}</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{asStr(d.body)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="font-mono text-muted-foreground">source</dt>
        <dd className="font-mono">{asStr(d.source)}</dd>
        {asStr(d.since) && (
          <>
            <dt className="font-mono text-muted-foreground">since</dt>
            <dd className="font-mono">{asStr(d.since)}</dd>
          </>
        )}
        <dt className="font-mono text-muted-foreground">raised</dt>
        <dd className="font-mono">{card.at}</dd>
        <dt className="font-mono text-muted-foreground">state</dt>
        <dd className="font-mono">{card.state}</dd>
      </dl>
      <AckButton card={card} />
      <ResolutionLine card={card} />
      <section>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Related cards</h4>
        {related.length ? (
          <ul className="flex flex-col divide-y rounded-md border" data-testid="related-cards">
            {related.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <Badge variant="secondary">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                <span className="min-w-0 flex-1 truncate">{summaryOf(c)}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => open(c)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="no-related">
            No other cards from the same run.
          </p>
        )}
      </section>
      <ProvenanceLine card={card} />
    </div>
  )
}

