// Overview: Midday's overview as a port. Period picker, revenue / expenses / profit / burn / runway widgets, revenue vs
// expenses chart, expenses by category, top counterparties, the accounts strip. Colours are theme tokens only.
import { useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { EmptyState } from '../useAppApi'
import type { ApiState } from '../useAppApi'
import { ChartsTab } from './ChartsTab'
import { ledgerApi } from './api'
import { PERIODS, periodRange, tokenColor } from './ledger'
import type { PeriodId } from './ledger'
import { moneyOf, todayMz } from './money'
import { FIELD, MonthsChart, Muted, Panel, dataOf, tipIn, useLoad } from './parts'
import type { OverviewBody } from './types'

function Widget({ id, label, value, sub, tone }: { id: string; label: string; value: string; sub?: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3" data-testid="ov-widget" data-id={id}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('truncate text-lg font-semibold', tone === 'bad' && 'text-destructive', tone === 'ok' && 'text-ok')}>{value}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function OverviewTab({ legacy, reloadLegacy, onSelect }: { legacy: ApiState<OverviewBody>; reloadLegacy: () => void; onSelect: (s: string) => void }) {
  const today = todayMz()
  const [period, setPeriod] = useState<PeriodId>('last-6')
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN')
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + '01', to: today })
  const range = useMemo(() => periodRange(period, today, custom), [period, today, custom])
  const { state, reload } = useLoad(() => ledgerApi.overview(range.from, range.to, currency), [range.from, range.to, currency])
  const accts = useLoad(() => ledgerApi.accounts(), [])
  const label = PERIODS.find((p) => p.id === period)?.label ?? period
  useEffect(() => { onSelect('Overview, ' + label + ' (' + range.from + ' to ' + range.to + '), ' + currency) }, [label, range, currency, onSelect])
  const d = dataOf(state)
  const ready = d && Array.isArray(d.by_month)
  const accountList = (dataOf(accts.state) ?? []).filter((a) => a.currency === currency)
  // The wire has no runway: cash on the enabled accounts of this currency over the monthly burn.
  const cash = accountList.filter((a) => a.enabled).reduce((s, a) => s + a.balance, 0)
  const runway = d && d.burn > 0 && cash > 0 ? cash / d.burn : null
  const spend = (d?.by_category ?? []).filter((c) => c.expenses > 0).sort((a, b) => b.expenses - a.expenses)
  const top = (d?.top_counterparties ?? []).filter((c) => c.revenue > 0)
  const tip = tipIn(currency)
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="overview-tab">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Period" data-testid="ov-period" className={FIELD} value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {period === 'custom' && (
          <>
            <input aria-label="From" data-testid="ov-from" type="date" className={FIELD} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <input aria-label="To" data-testid="ov-to" type="date" className={FIELD} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </>
        )}
        <div role="group" aria-label="Currency" className="flex rounded-md border p-0.5" data-testid="ov-currency">
          {(['MXN', 'USD'] as const).map((c) => <button key={c} type="button" aria-pressed={currency === c} data-testid={'ov-currency-' + c} onClick={() => setCurrency(c)} className={cn('rounded px-2.5 py-1 text-sm', currency === c ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground')}>{c}</button>)}
        </div>
        <Muted>{range.from} to {range.to}</Muted>
      </div>
      {!ready ? (state.kind === 'loading' ? <p className="p-4 text-sm text-muted-foreground">Loading...</p> : <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 0 } : state} onRetry={reload} />) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5" data-testid="ov-widgets">
            <Widget id="revenue" label="Revenue" value={moneyOf(d.revenue, currency)} />
            <Widget id="expenses" label="Expenses" value={moneyOf(d.expenses, currency)} />
            <Widget id="profit" label="Profit" value={moneyOf(d.profit, currency)} tone={d.profit < 0 ? 'bad' : 'ok'} />
            <Widget id="burn" label="Burn rate" value={moneyOf(d.burn, currency) + ' / mo'} />
            <Widget id="runway" label="Runway" value={runway == null ? 'n/a' : runway.toFixed(1) + ' months'} sub={runway == null ? (d.burn > 0 ? 'no cash balance on file' : 'no burn in range') : moneyOf(cash, currency) + ' cash'} tone={runway != null && runway < 3 ? 'bad' : undefined} />
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Revenue and expenses" note="By month" testid="ov-chart-months" className="lg:col-span-2">
              {d.by_month.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No months in this range.</p> : <MonthsChart data={d.by_month} currency={currency} />}
            </Panel>
            <Panel title="Expenses by category" testid="ov-chart-categories">
              {spend.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No expenses in this range.</p> : (
                <>
                  <ChartContainer config={{ amount: { label: 'Amount' } }} className="mx-auto h-40 w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent formatter={tip} nameKey="name" />} />
                      <Pie data={spend} dataKey="expenses" nameKey="name" innerRadius={36} stroke="var(--card)">
                        {spend.map((c, i) => <Cell key={c.slug} fill={tokenColor(c.color, i)} />)}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <ul className="mt-2 grid gap-1 text-sm" data-testid="ov-category-list">
                    {spend.map((c, i) => (
                      <li key={c.slug} className="flex items-center gap-2" data-slug={c.slug}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: tokenColor(c.color, i) }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="font-mono text-xs">{moneyOf(c.expenses, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Top counterparties" note="By revenue in range" testid="ov-top" className="lg:col-span-1">
              {top.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
                <ul className="grid gap-2" data-testid="ov-top-list">
                  {top.map((c) => {
                    const max = Math.max(...top.map((x) => x.revenue), 1)
                    return (
                      <li key={c.name} className="grid gap-1 text-sm" data-name={c.name}>
                        <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{c.name}</span><Muted>{c.count} tx</Muted><span className="font-mono text-xs">{moneyOf(c.revenue, currency)}</span></div>
                        <div className="h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: (c.revenue / max) * 100 + '%' }} /></div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
            <Panel title="Accounts" testid="ov-accounts" className="lg:col-span-2">
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="ov-account-list">
                {accountList.map((a) => (
                  <li key={a.id} className={cn('min-w-0 rounded-md border p-2', !a.enabled && 'opacity-60')} data-testid="ov-account" data-id={a.id}>
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span><Muted>{a.type}{a.enabled ? '' : ', off'}</Muted></div>
                    <div className={cn('font-mono text-sm', a.balance < 0 && 'text-destructive')}>{moneyOf(a.balance, a.currency)}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
      <ChartsTab state={legacy} reload={reloadLegacy} onSelect={() => undefined} />
    </div>
  )
}
