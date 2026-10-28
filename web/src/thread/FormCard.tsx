// Section 4 of docs/console-v2-spec.md: the form card. A stream item {role:"form", form, state}. Pending: a top
// stepper (when metadata.pages exists), one page at a time with Back and Continue, per-page required checks,
// `when` rules live, Submit on the last page. Settled: one quiet line, driven by form_update frames.
import { useMemo, useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { relTime } from '@/lib/time'
import {
  answerOf,
  controlOf,
  firstBadPage,
  fieldsOf,
  hasPages,
  initialValues,
  inputTypeOf,
  isVisible,
  livePages,
  optionLabel,
  pageErrors,
  pagesOf,
  serverErrors,
  settledLine,
  stepperOf,
} from '@/lib/forms'
import type { Values } from '@/lib/forms'
import type { FormField, FormItem } from '@/lib/types'
import type { FormOutcome } from '@/app/AppContext'
import { useAgentName } from '@/lib/agent'

// A datetime-local input shows local time; the form value is an ISO string.
const toLocalInput = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 16)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function Stepper({ steps }: { steps: ReturnType<typeof stepperOf> }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto" aria-label="Steps" data-testid="form-stepper">
      {steps.map((st, n) => (
        <li key={st.index} className="flex items-center gap-2" data-state={st.state} aria-current={st.state === 'current' ? 'step' : undefined}>
          {n > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
          <span
            className={cn(
              'inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
              st.state === 'current' && 'border-primary bg-primary text-primary-foreground',
              st.state === 'done' && 'border-primary text-primary',
            )}
          >
            {st.state === 'done' ? <CheckIcon className="size-3.5" aria-label="Done" /> : n + 1}
          </span>
          <span className={cn('hidden text-xs sm:inline', st.state === 'current' ? 'font-medium' : 'text-muted-foreground')}>{st.label}</span>
        </li>
      ))}
    </ol>
  )
}

function FieldControl({ x, id, value, onChange, invalid }: { x: FormField; id: string; value: unknown; onChange: (v: unknown) => void; invalid: boolean }) {
  const c = controlOf(x)
  if (c === 'external') {
    return /^https?:\/\//.test(x.url ?? '') ? (
      <a className="break-all text-sm text-primary underline" href={x.url} target="_blank" rel="noopener noreferrer">
        {x.url}
      </a>
    ) : null
  }
  if (c === 'boolean') {
    return (
      <RadioGroup
        aria-labelledby={id + '-q'}
        className="flex flex-row gap-4"
        value={value === true ? 'yes' : value === false ? 'no' : ''}
        onValueChange={(v) => onChange(v === 'yes')}
      >
        {[
          ['yes', 'Yes'],
          ['no', 'No'],
        ].map(([v, label]) => (
          <div key={v} className="flex items-center gap-2">
            <RadioGroupItem value={v} id={`${id}-${v}`} />
            <Label htmlFor={`${id}-${v}`}>{label}</Label>
          </div>
        ))}
      </RadioGroup>
    )
  }
  if (c === 'radio') {
    return (
      <RadioGroup aria-labelledby={id + '-q'} value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
        {(x.options ?? []).map((o, i) => (
          <div key={o.value} className="flex items-start gap-2">
            <RadioGroupItem value={o.value} id={`${id}-o${i}`} className="mt-0.5" />
            <Label htmlFor={`${id}-o${i}`} className="flex flex-col items-start gap-0.5 font-normal">
              {optionLabel(o)}
              {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
            </Label>
          </div>
        ))}
      </RadioGroup>
    )
  }
  if (c === 'multiselect') {
    const cur = Array.isArray(value) ? (value as string[]) : []
    return (
      <div role="group" aria-labelledby={id + '-q'} className="grid gap-2">
        {(x.options ?? []).map((o, i) => (
          <div key={o.value} className="flex items-start gap-2">
            <Checkbox
              id={`${id}-o${i}`}
              className="mt-0.5"
              checked={cur.includes(o.value)}
              onCheckedChange={(on) => onChange(on === true ? [...cur.filter((v) => v !== o.value), o.value] : cur.filter((v) => v !== o.value))}
            />
            <Label htmlFor={`${id}-o${i}`} className="flex flex-col items-start gap-0.5 font-normal">
              {optionLabel(o)}
              {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
            </Label>
          </div>
        ))}
      </div>
    )
  }
  if (c === 'select') {
    return (
      <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
        <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
          <SelectValue placeholder={x.placeholder || 'Choose one'} />
        </SelectTrigger>
        <SelectContent>
          {(x.options ?? []).map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {optionLabel(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (c === 'textarea') {
    return (
      <Textarea id={id} rows={3} aria-invalid={invalid} placeholder={x.placeholder} maxLength={x.maxLength} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
    )
  }
  if (c === 'number') {
    return (
      <Input
        id={id}
        type="number"
        step={x.type === 'integer' ? 1 : 'any'}
        min={x.minimum}
        max={x.maximum}
        aria-invalid={invalid}
        placeholder={x.placeholder}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  }
  const dt = x.format === 'date-time'
  return (
    <Input
      id={id}
      type={inputTypeOf(x)}
      aria-invalid={invalid}
      placeholder={x.placeholder}
      maxLength={x.maxLength}
      value={typeof value === 'string' ? (dt ? toLocalInput(value) : value) : ''}
      onChange={(e) => {
        const raw = e.target.value
        if (dt && raw) {
          const d = new Date(raw)
          onChange(isNaN(d.getTime()) ? raw : d.toISOString())
        } else onChange(raw)
      }}
    />
  )
}

export function FormCard({
  item,
  canAnswer,
  people,
  onSubmit,
  onCancel,
}: {
  item: FormItem
  canAnswer: boolean
  people: Record<string, string>
  onSubmit: (answer: Values) => Promise<FormOutcome>
  onCancel: () => Promise<FormOutcome>
}) {
  const agent = useAgentName()
  const f = item.form
  const [vals, setVals] = useState<Values>(() => initialValues(f))
  const [pi, setPi] = useState(() => livePages(f, initialValues(f))[0] ?? 0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const pages = useMemo(() => pagesOf(f), [f])
  const byKey = useMemo(() => new Map(fieldsOf(f).map((x) => [x.key, x])), [f])

  if (item.state !== 'pending') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="form-collapsed">
        <Badge variant="secondary">Form</Badge>
        <span>{settledLine(item, people)}</span>
        <span>{f.title}</span>
        {item.replied_at && <span>{relTime(item.replied_at)}</span>}
      </div>
    )
  }

  const live = livePages(f, vals)
  const at = live.indexOf(pi)
  const last = at === live.length - 1 || at < 0
  const page = pages[pi] ?? pages[0]

  const setValue = (key: string, v: unknown) => {
    setVals((cur) => {
      const next = { ...cur }
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[key]
      else next[key] = v
      return next
    })
    setErrors((e) => {
      if (!e[key]) return e
      const n = { ...e }
      delete n[key]
      return n
    })
  }

  const go = (dir: number) => {
    const to = live[at + dir]
    if (to !== undefined) {
      setPi(to)
      setFail(null)
    }
  }
  const next = () => {
    const e = pageErrors(f, pi, vals)
    setErrors(e)
    if (!Object.keys(e).length) go(1)
  }
  const submit = async () => {
    const bad = firstBadPage(f, vals)
    if (bad >= 0) {
      setPi(bad)
      setErrors(pageErrors(f, bad, vals))
      return
    }
    setBusy(true)
    setFail(null)
    const r = await onSubmit(answerOf(f, vals))
    setBusy(false)
    if (r.error) {
      if (r.fields) {
        const se = serverErrors(f, r.fields)
        setErrors(se.errors)
        if (se.page >= 0) setPi(se.page)
      }
      setFail(r.error)
    }
  }
  const cancel = async () => {
    setBusy(true)
    const r = await onCancel()
    setBusy(false)
    if (r.error) setFail(r.error)
  }

  if (!canAnswer) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border bg-card p-3" data-testid="form-card">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{agent + ' asks'}</div>
        <div className="text-sm font-medium">{f.title}</div>
        <div className="text-xs text-warn">Waiting on a lane member</div>
      </div>
    )
  }

  return (
    <form
      className="flex w-full flex-col gap-4 rounded-lg border bg-card p-4"
      data-testid="form-card"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (last) void submit()
        else next()
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{agent + ' asks'}</div>
        <h3 className="text-base font-semibold">{f.title}</h3>
        {f.metadata?.intro && <p className="text-sm text-muted-foreground">{f.metadata.intro}</p>}
      </div>
      {hasPages(f) && live.length > 0 && <Stepper steps={stepperOf(f, vals, pi)} />}
      <div className="flex flex-col gap-4" data-testid="form-page">
        {page.heading && <h4 className="text-sm font-semibold">{page.heading}</h4>}
        {page.intro && <p className="text-sm text-muted-foreground">{page.intro}</p>}
        {page.keys.map((k) => {
          const x = byKey.get(k)
          if (!x || !isVisible(x, vals)) return null
          const id = `${item.id}-${x.key}`
          const err = errors[k]
          return (
            <div key={k} className="flex flex-col gap-1.5" data-key={k}>
              <div className="flex items-baseline gap-2">
                {controlOf(x) === 'text' || controlOf(x) === 'number' || controlOf(x) === 'textarea' || controlOf(x) === 'select' ? (
                  <Label htmlFor={id} id={id + '-q'}>
                    {x.title || x.key}
                  </Label>
                ) : (
                  <span id={id + '-q'} className="text-sm font-medium">
                    {x.title || x.key}
                  </span>
                )}
                {x.required && <span className="text-xs text-muted-foreground">required</span>}
              </div>
              {x.description && <p className="text-xs text-muted-foreground">{x.description}</p>}
              <FieldControl x={x} id={id} value={vals[k]} onChange={(v) => setValue(k, v)} invalid={!!err} />
              {err && (
                <p role="alert" className="text-xs text-destructive">
                  {err}
                </p>
              )}
            </div>
          )
        })}
      </div>
      {fail && (
        <p role="alert" className="text-sm text-destructive" data-testid="form-error">
          {fail}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void cancel()}>
          Cancel
        </Button>
        <span className="flex-1" />
        {at > 0 && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => go(-1)}>
            Back
          </Button>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          {last ? 'Submit' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
