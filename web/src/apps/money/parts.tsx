// Shared bits of the ledger tabs: the loader hook over api.ts, status chips, the file viewer and the drop zone.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DownloadIcon, FileIcon, UploadIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { compact, moneyOf } from './money'
import type { ApiResult } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Tone } from '../map/estate'
import { Pill } from '../tiles'
import type { ApiState } from '../useAppApi'
import { ledgerApi } from './api'
import type { Account, Category } from './api'
import { bytes, kindOfMime } from './ledger'

export const FIELD = 'h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
export const Muted = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('text-xs text-muted-foreground', className)}>{children}</span>

// Same state machine as useAppApi, over a function so ledger calls with query strings and refetches work.
export function useLoad<T>(fn: () => Promise<ApiResult<T>>, deps: unknown[]): { state: ApiState<T>; reload: () => void; setData: (d: T) => void } {
  const [state, setState] = useState<ApiState<T>>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let live = true
    void ref.current().then((r) => {
      if (!live) return
      const err = (r.body as { error?: string } | null)?.error
      if (r.ok) setState({ kind: 'ok', data: r.body })
      else if (r.status === 403) setState({ kind: 'forbidden' })
      else if (r.status === 503 || err === 'db_unavailable') setState({ kind: 'unavailable', error: err })
      else setState({ kind: 'error', status: r.status })
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const setData = useCallback((d: T) => setState({ kind: 'ok', data: d }), [])
  return { state, reload, setData }
}
export const dataOf = <T,>(s: ApiState<T>): T | null => (s.kind === 'ok' ? s.data : null)

export const Chip = ({ label, tone, testid }: { label: string; tone: Tone; testid?: string }) => <span data-testid={testid} data-tone={tone}><Pill tone={tone}>{label}</Pill></span>

export function Panel({ title, note, testid, children, className, actions }: { title: string; note?: string; testid: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn('si-card min-w-0 px-5 pt-4 pb-4', className)} data-testid={testid}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="si-label">{title}</h2>{note && <p className="si-src mt-1">{note}</p>}</div>
        {actions}
      </div>
      <div className="pt-2">{children}</div>
    </section>
  )
}

// Revenue versus expenses by month, the one chart shared by Overview and Home. Theme tokens only.
const MONTHS_CFG: ChartConfig = { revenue: { label: 'Revenue', color: 'var(--chart-2)' }, expenses: { label: 'Expenses', color: 'var(--chart-3)' } }
export const tipIn = (cur: string) => (value: unknown, name: unknown) => <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{String(name)}</span><span className="font-mono font-medium">{moneyOf(Number(value), cur)}</span></span>
export function MonthsChart({ data, currency = 'MXN', className = 'h-56 w-full', short = false }: { data: { month: string; revenue: number; expenses: number }[]; currency?: string; className?: string; short?: boolean }) {
  return (
    <ChartContainer config={MONTHS_CFG} className={className}>
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={short ? (m: string) => m.slice(2) : undefined} />
        <YAxis width={48} tickLine={false} axisLine={false} tickFormatter={compact} />
        <ChartTooltip content={<ChartTooltipContent formatter={tipIn(currency)} />} />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={3} isAnimationActive={false} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={3} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}

// A file shown inline: image, PDF, or a download line. src is the file route.
export function FileViewer({ src, name, mime, size, testid = 'file-viewer' }: { src: string; name: string; mime: string; size?: number; testid?: string }) {
  const kind = kindOfMime(mime)
  return (
    <div className="flex min-h-0 flex-col gap-2" data-testid={testid} data-kind={kind}>
      <div className="flex min-h-48 flex-1 items-center justify-center overflow-hidden rounded-md border bg-secondary/40">
        {kind === 'image' && <img src={src} alt={name} className="max-h-[60vh] max-w-full object-contain" data-testid="viewer-image" />}
        {kind === 'pdf' && <object data={src} type="application/pdf" aria-label={name} className="h-[60vh] w-full" data-testid="viewer-pdf"><a href={src} className="p-4 text-sm text-primary underline">Open {name}</a></object>}
        {kind === 'other' && <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground"><FileIcon className="size-8" aria-hidden /><span>No preview for this file type.</span></div>}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{name}{size != null ? ' , ' + bytes(size) : ''}</span>
        <a href={src} download={name} data-testid="viewer-download" className="inline-flex items-center gap-1 text-primary hover:underline"><DownloadIcon className="size-3" />Download</a>
      </div>
    </div>
  )
}

// Click or drop; calls onFiles with the dropped files. The hidden input carries the testid for tests.
export function DropZone({ label, onFiles, busy, testid = 'dropzone', compact }: { label: string; onFiles: (f: File[]) => void; busy?: boolean; testid?: string; compact?: boolean }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      data-testid={testid}
      data-over={over ? 'true' : 'false'}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = [...(e.dataTransfer?.files ?? [])]; if (f.length) onFiles(f) }}
      className={cn('flex items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors', compact ? 'px-3 py-2' : 'flex-col px-4 py-8', over && 'border-primary bg-accent text-foreground')}
    >
      <UploadIcon className="size-4" aria-hidden />
      <span>{busy ? 'Uploading...' : label}</span>
      <button type="button" className="rounded-md border px-2.5 py-1 text-foreground hover:bg-accent" disabled={busy} onClick={() => input.current?.click()}>Choose files</button>
      <input ref={input} type="file" multiple hidden aria-label={label} data-testid={testid + '-input'} onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onFiles(f) }} />
    </div>
  )
}

// Accounts and categories, loaded once per tab that needs the pickers. Failures leave the lists empty: the table still works.
export function useRefs(): { accounts: Account[]; categories: Category[] } {
  const a = useLoad(() => ledgerApi.accounts(), [])
  const c = useLoad(() => ledgerApi.categories(), [])
  const accounts = dataOf(a.state), categories = dataOf(c.state)
  return { accounts: Array.isArray(accounts) ? accounts : [], categories: Array.isArray(categories) ? categories : [] }
}

export function CategoryOptions({ categories }: { categories: Category[] }) {
  const by = Object.fromEntries(categories.map((c) => [c.slug, c]))
  return <>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.parent_slug && by[c.parent_slug] ? by[c.parent_slug].name + ' / ' + c.name : c.name}</option>)}</>
}
