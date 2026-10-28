// metrics_snapshot. Inline: up to three mini panels with sparklines (shadcn chart on Recharts). Surface: one full
// chart per metric with a window picker. The picker only offers windows that exist in the data: `trend` is the
// series for data.window (named "recent" when the card gives no name) and each key of a metric's `series` is another.
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { CardActions, CardFrame } from './Frame'
import { useOpen } from './env'
import { asRec, asStr } from './util'
import type { CardProps, SurfaceProps } from './types'

export interface Metric {
  label: string
  value: string | number
  unit?: string
  trend?: number[]
  series?: Record<string, unknown>
  status?: 'ok' | 'warn' | 'critical'
}

const numbers = (v: unknown): number[] | null => (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as number[]) : null)

export function metricsOf(data: unknown): Metric[] {
  const list = asRec(data).metrics
  return Array.isArray(list) ? (list.filter((m) => m && typeof m === 'object') as Metric[]) : []
}
export const baseWindow = (data: unknown): string => asStr(asRec(data).window) || 'recent'

// Windows present in the data, the card's own first.
export function windowsOf(data: unknown): string[] {
  const ms = metricsOf(data)
  const out: string[] = []
  if (ms.some((m) => numbers(m.trend))) out.push(baseWindow(data))
  for (const m of ms) for (const [k, v] of Object.entries(asRec(m.series))) if (numbers(v) && !out.includes(k)) out.push(k)
  return out
}
export function seriesFor(m: Metric, win: string, data: unknown): number[] | null {
  const own = numbers(asRec(m.series)[win])
  if (own) return own
  return win === baseWindow(data) ? numbers(m.trend) : null
}

const colorOf = (status: Metric['status'], i: number): string =>
  status === 'critical' ? 'var(--destructive)' : status === 'warn' ? 'var(--chart-3)' : status === 'ok' ? 'var(--chart-2)' : `var(--chart-${(i % 5) + 1})`

function Spark({ values, color }: { values: number[]; color: string }) {
  const rows = values.map((v, i) => ({ i, v }))
  const config: ChartConfig = { v: { label: 'Value', color } }
  return (
    <ChartContainer config={config} className="aspect-auto h-10 w-full" data-testid="sparkline">
      <LineChart data={rows} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
        <Line dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  )
}

function StatusBadge({ status }: { status?: Metric['status'] }) {
  if (!status || status === 'ok') return null
  return <Badge variant={status === 'critical' ? 'destructive' : 'secondary'}>{status}</Badge>
}

export function MetricsInline({ card }: CardProps) {
  const open = useOpen()
  const ms = metricsOf(card.data)
  const shown = ms.slice(0, 3)
  const win = baseWindow(card.data)
  return (
    <CardFrame card={card}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-medium">{asStr(asRec(card.data).title)}</h3>
        {windowsOf(card.data).includes(win) && <span className="text-xs text-muted-foreground">{win}</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3" data-testid="metric-panels">
        {shown.map((m, i) => {
          const t = numbers(m.trend)
          return (
            <div key={m.label + i} className="flex min-w-0 flex-col gap-1 rounded-md border bg-background p-2" data-testid="metric-panel">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">{m.label}</span>
                <StatusBadge status={m.status} />
              </div>
              <div className="font-mono text-lg leading-none">
                {String(m.value)}
                {m.unit && <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span>}
              </div>
              {t ? <Spark values={t} color={colorOf(m.status, i)} /> : <div className="h-10" />}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ms.length > shown.length && <span className="text-xs text-muted-foreground">+{ms.length - shown.length} more</span>}
        <Button type="button" size="sm" variant="outline" onClick={() => open(card)}>
          Open
        </Button>
        <CardActions card={card} kinds={[]} />
      </div>
    </CardFrame>
  )
}

function MetricChart({ m, values, i }: { m: Metric; values: number[] | null; i: number }) {
  const config: ChartConfig = { v: { label: m.label, color: colorOf(m.status, i) } }
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3" data-testid="metric-chart">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{m.label}</span>
        <span className="font-mono text-sm">
          {String(m.value)}
          {m.unit && <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span>}
        </span>
      </div>
      <StatusBadge status={m.status} />
      {values ? (
        <ChartContainer config={config} className="aspect-auto h-40 w-full">
          <LineChart data={values.map((v, n) => ({ n, v }))} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="n" tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis width={44} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Line dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      ) : (
        <p className="text-xs text-muted-foreground">No data for this metric in this window.</p>
      )}
    </div>
  )
}

export function MetricsSurface({ card }: SurfaceProps) {
  const windows = windowsOf(card.data)
  const [win, setWin] = useState(windows[0] ?? baseWindow(card.data))
  const active = windows.includes(win) ? win : (windows[0] ?? win)
  const ms = metricsOf(card.data)
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4')} data-testid="metrics-surface">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{asStr(asRec(card.data).title)}</h3>
        {windows.length > 1 ? (
          <Tabs value={active} onValueChange={setWin} className="ml-auto">
            <TabsList data-testid="window-picker">
              {windows.map((w) => (
                <TabsTrigger key={w} value={w}>
                  {w}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          windows[0] && (
            <span className="ml-auto text-xs text-muted-foreground" data-testid="window-label">
              {windows[0]}
            </span>
          )
        )}
      </div>
      {ms.map((m, i) => (
        <MetricChart key={m.label + i} m={m} values={seriesFor(m, active, card.data)} i={i} />
      ))}
    </div>
  )
}
