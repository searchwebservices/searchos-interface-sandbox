// #/apps/money[/home|overview|transactions|inbox|invoices|cartera|vault|customers]: Home by default (its own cards say the
// numbers once), the KPI strip on every other tab, then the tab. Admin only, like Clients. The router only knows cartera,
// invoices and charts, so the tab lives in the hash segment, read here (charts opens Overview). A query after the segment
// (#/apps/money/transactions?status=pending) is the tab's to read.
import { useCallback, useEffect, useState } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AppPage } from '../AppPage'
import { EmptyState, useAppApi } from '../useAppApi'
import { CarteraTab } from './CarteraTab'
import { CustomersTab } from './CustomersTab'
import { HomeTab } from './HomeTab'
import { InboxTab } from './InboxTab'
import { InvoicesTab } from './InvoicesTab'
import { OverviewTab } from './OverviewTab'
import { TransactionsTab } from './TransactionsTab'
import { VaultTab } from './VaultTab'
import { moneyOf } from './money'
import type { OverviewBody } from './types'

type Tab = 'home' | 'overview' | 'transactions' | 'inbox' | 'invoices' | 'cartera' | 'vault' | 'customers'
const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' }, { id: 'overview', label: 'Overview' }, { id: 'transactions', label: 'Transactions' }, { id: 'inbox', label: 'Inbox' }, { id: 'invoices', label: 'Invoices' },
  { id: 'cartera', label: 'Cartera' }, { id: 'vault', label: 'Vault' }, { id: 'customers', label: 'Customers' },
]
const tabFromHash = (): Tab => {
  const seg = /^#\/apps\/money\/?([a-z]*)/.exec(window.location.hash)?.[1]
  return TABS.find((t) => t.id === seg)?.id ?? (seg === 'charts' ? 'overview' : 'home')
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3" data-testid="money-stat" data-label={label}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('truncate text-lg font-semibold', tone === 'bad' && 'text-destructive')}>{value}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

// The tab prop is the router's own reading of the hash (cartera, invoices, charts) and is ignored: the hash segment decides.
export function MoneyPage(_props: { tab?: string } = {}) {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  useEffect(() => {
    const on = () => setTab(tabFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const overview = useAppApi<OverviewBody>('/api/apps/money')
  const [tick, setTick] = useState(0)
  const reloadAll = useCallback(() => { overview.reload(); setTick((n) => n + 1) }, [overview])
  const [sel, setSel] = useState('')
  const onSelect = useCallback((s: string) => setSel(s), [])
  const ok = overview.state.kind === 'ok' && overview.state.data?.kpis ? overview.state.data.kpis : null
  const tabs = (
    <div role="tablist" aria-label="Money" className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 pt-2" data-testid="money-tabs">
      {TABS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-testid={'tab-' + t.id} onClick={() => { setTab(t.id); window.location.hash = '#/apps/money/' + t.id }}
          className={cn('-mb-px shrink-0 border-b-2 px-3 py-2 text-sm', tab === t.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{t.label}</button>
      ))}
    </div>
  )
  return (
    <AppPage
      testid="apps-money-page"
      crumbs={[{ label: 'Apps' }, { label: 'Money' }]}
      title="Money"
      context={'Money, ' + (sel || tab + ' tab')}
      actions={<Button type="button" size="icon-xs" variant="ghost" aria-label="Refresh money" onClick={reloadAll}><RefreshCwIcon /></Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {ok && tab !== 'home' && (
          <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-3 xl:grid-cols-5" data-testid="money-strip">
            <Stat label="MRR" value={moneyOf(ok.mrr_mxn)} />
            <Stat label="Collected this month" value={moneyOf(ok.collected_month)} sub={(ok.collected_count ?? 0) + ' payments, ' + ok.month + (ok.collected_usd ? ' + ' + moneyOf(ok.collected_usd, 'USD') : '')} />
            <Stat label="Open invoices" value={moneyOf(ok.open_invoices.total)} sub={ok.open_invoices.count + ' open'} />
            <Stat label="Overdue" value={moneyOf(ok.overdue.total)} sub={ok.overdue.count + ' overdue'} tone={ok.overdue.count ? 'bad' : undefined} />
            <Stat label="Commissions due" value={moneyOf(ok.commissions_due.total)} sub={ok.commissions_due.count + ' payouts'} />
          </div>
        )}
        {tabs}
        {tab === 'home' && <HomeTab refresh={tick} onChanged={overview.reload} onSelect={onSelect} />}
        {tab === 'overview' && (overview.state.kind === 'ok' && !ok ? <EmptyState state={{ kind: 'error', status: 0 }} onRetry={overview.reload} /> : overview.state.kind !== 'ok' && overview.state.kind !== 'loading' ? <EmptyState state={overview.state} onRetry={overview.reload} /> : <OverviewTab legacy={overview.state} reloadLegacy={overview.reload} onSelect={onSelect} />)}
        {tab === 'transactions' && <TransactionsTab onSelect={onSelect} />}
        {tab === 'inbox' && <InboxTab onSelect={onSelect} />}
        {tab === 'invoices' && <InvoicesTab onSelect={onSelect} />}
        {tab === 'cartera' && <CarteraTab onChanged={overview.reload} onSelect={onSelect} />}
        {tab === 'vault' && <VaultTab onSelect={onSelect} />}
        {tab === 'customers' && <CustomersTab onSelect={onSelect} />}
      </div>
    </AppPage>
  )
}
