// result_summary: the completion card. Visually distinct from prose: a bordered panel with an accent strip, a
// heading that says it is a result, and one row per check with an ok mark. Inline keeps the checks short (the note
// shows only where a check failed); the surface expands every note and lists what was observed.
import { CheckIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProvenanceLine } from './Frame'
import { useOpen } from './env'
import { Button } from '@/components/ui/button'
import { asRec, asStr } from './util'
import type { CardProps, SurfaceProps } from './types'

export interface CheckView {
  label: string
  ok: boolean
  note: string
}
export interface SummaryView {
  title: string
  checks: CheckView[]
  observed: string[]
}

export function summaryViewOf(data: unknown): SummaryView {
  const d = asRec(data)
  const checks = (Array.isArray(d.checks) ? d.checks : []).map((c) => {
    const r = asRec(c)
    return { label: asStr(r.label), ok: r.ok === true, note: asStr(r.note) }
  })
  return { title: asStr(d.title), checks, observed: Array.isArray(d.observed) ? d.observed.map(String) : [] }
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      role="img"
      aria-label={ok ? 'passed' : 'failed'}
      data-ok={ok ? 'true' : 'false'}
      className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', ok ? 'border-ok text-ok' : 'border-destructive text-destructive')}
    >
      {ok ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
    </span>
  )
}

function Verdict({ checks }: { checks: CheckView[] }) {
  const bad = checks.filter((c) => !c.ok).length
  return <span className="text-xs text-muted-foreground">{bad ? `${bad} of ${checks.length} failed` : `${checks.length} of ${checks.length} passed`}</span>
}

export function SummaryInline({ card }: CardProps) {
  const open = useOpen()
  const v = summaryViewOf(card.data)
  const failed = v.checks.some((c) => !c.ok)
  return (
    <section data-testid="card-result_summary" data-card-id={card.id} data-failed={failed ? 'true' : 'false'} className="flex w-full overflow-hidden rounded-lg border bg-card">
      <span aria-hidden data-testid="result-strip" className={cn('w-1.5 shrink-0', failed ? 'bg-destructive' : 'bg-ok')} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Result</span>
          <span className="text-sm font-semibold">{v.title}</span>
          <Verdict checks={v.checks} />
        </div>
        <ul className="flex flex-col gap-1" data-testid="result-checks">
          {v.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" data-ok={c.ok ? 'true' : 'false'}>
              <Mark ok={c.ok} />
              <span className="min-w-0">
                {c.label}
                {!c.ok && c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => open(card)}>
            Open
          </Button>
        </div>
        <ProvenanceLine card={card} />
      </div>
    </section>
  )
}

export function SummarySurface({ card }: SurfaceProps) {
  const v = summaryViewOf(card.data)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4" data-testid="result-surface">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold">{v.title}</span>
        <Verdict checks={v.checks} />
      </div>
      <section>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Checks</h4>
        <ul className="flex flex-col divide-y rounded-md border" data-testid="result-checks">
          {v.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm" data-ok={c.ok ? 'true' : 'false'}>
              <Mark ok={c.ok} />
              <span className="min-w-0">
                {c.label}
                {c.note && (
                  <span className="block whitespace-pre-wrap text-xs text-muted-foreground" data-testid="check-note">
                    {c.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Observed</h4>
        {v.observed.length ? (
          <ul className="list-disc pl-5 text-sm" data-testid="result-observed">
            {v.observed.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing else was observed.</p>
        )}
      </section>
      <ProvenanceLine card={card} />
    </div>
  )
}
