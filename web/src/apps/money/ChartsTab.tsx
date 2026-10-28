// Charts: 12 month invoiced vs paid, MRR by service, overdue aging. shadcn charts on recharts, theme tokens only.
import { useEffect } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { EmptyState } from '../useAppApi'
import type { ApiState } from '../useAppApi'
import { compact, moneyOf } from './money'
import type { OverviewBody } from './types'

const tip = (value: unknown, name: unknown) => <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{String(name)}</span><span className="font-mono font-medium">{moneyOf(Number(value))}</span></span>

function Panel({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-3" data-testid={'chart-' + id}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="pt-2">{children}</div>
    </section>
  )
}

const MONTHS: ChartConfig = { invoiced: { label: 'Invoiced', color: 'var(--chart-4)' }, paid: { label: 'Paid', color: 'var(--chart-1)' } }
const MRR: ChartConfig = { amount: { label: 'MRR', color: 'var(--chart-1)' } }
const AGING: ChartConfig = { total: { label: 'Overdue', color: 'var(--chart-3)' } }

export function ChartsTab({ state, reload, onSelect }: { state: ApiState<OverviewBody>; reload: () => void; onSelect: (s: string) => void }) {
  useEffect(() => { onSelect('Charts') }, [onSelect])
  const data = state.kind === 'ok' && state.data?.charts ? state.data.charts : null
  if (!data) return <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 0 } : state} onRetry={reload} />
  const rows = data.mrr_by_service
  return (
    <div className="grid gap-3 p-3 lg:grid-cols-2" data-testid="charts-tab">
      <Panel id="months" title="Invoiced vs paid, 12 months" note="Invoices by due month; paid is invoices paid plus cartera payments.">
        <ChartContainer config={MONTHS} className="aspect-auto h-64 w-full">
          <BarChart data={data.months} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={6} tickFormatter={(m: string) => m.slice(2)} interval="preserveStartEnd" />
            <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={compact} />
            <ChartTooltip content={<ChartTooltipContent formatter={tip} />} />
            <Bar dataKey="invoiced" fill="var(--color-invoiced)" radius={2} isAnimationActive={false} />
            <Bar dataKey="paid" fill="var(--color-paid)" radius={2} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </Panel>
      <Panel id="aging" title="Overdue aging" note="Days past due, open invoices only.">
        <ChartContainer config={AGING} className="aspect-auto h-64 w-full">
          <BarChart data={data.aging} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={compact} />
            <ChartTooltip content={<ChartTooltipContent formatter={tip} />} />
            <Bar dataKey="total" fill="var(--color-total)" radius={2} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
        <ul className="grid grid-cols-4 gap-2 pt-2 text-xs text-muted-foreground" data-testid="aging-counts">
          {data.aging.map((b) => <li key={b.key} data-key={b.key}>{b.label}: {b.count}</li>)}
        </ul>
      </Panel>
      <Panel id="mrr" title="MRR by service" note="Roster rows that count toward MRR.">
        {rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No MRR rows.</p> : (
          <ChartContainer config={MRR} className="aspect-auto w-full" style={{ height: Math.max(160, rows.length * 40 + 30) }}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={compact} />
              <YAxis type="category" dataKey="service" width={110} tickLine={false} axisLine={false} interval={0} tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + '...' : v)} />
              <ChartTooltip content={<ChartTooltipContent formatter={tip} />} />
              <Bar dataKey="amount" fill="var(--color-amount)" radius={2} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        )}
      </Panel>
    </div>
  )
}
