// Customers: our clients (cartera) joined with what the ledger collected from them and what is still open on invoices.
// Name links to the client page. Midday's customers table, reduced to the columns Bay asked for.
import { useEffect, useMemo, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { call } from '@/lib/api'
import { EmptyState } from '../useAppApi'
import { ledgerApi } from './api'
import { addDays, buildCustomers } from './ledger'
import { moneyOf, todayMz } from './money'
import { Muted, dataOf, useLoad } from './parts'
import type { CarteraBody, InvoicesBody } from './types'

async function loadAll() {
  const today = todayMz()
  const [c, i, l] = await Promise.all([call<CarteraBody>('/api/apps/money/cartera'), call<InvoicesBody>('/api/apps/money/invoices'), ledgerApi.list({ from: addDays(today, -365), to: today })])
  if (!c.ok) return { ok: false as const, status: c.status, body: null as never }
  const carteraRows = Object.values(c.body?.groups ?? {}).flat()
  return { ok: true as const, status: 200, body: buildCustomers(carteraRows, i.ok && Array.isArray(i.body?.invoices) ? i.body.invoices : [], l.ok && Array.isArray(l.body?.rows) ? l.body.rows : []), ledger: l.ok }
}

export function CustomersTab({ onSelect }: { onSelect: (s: string) => void }) {
  const { state, reload } = useLoad(loadAll as () => Promise<{ ok: boolean; status: number; body: ReturnType<typeof buildCustomers> }>, [])
  const [q, setQ] = useState('')
  const [showFormer, setShowFormer] = useState(false)
  const rows = dataOf(state)
  const shown = useMemo(() => (rows ?? []).filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())), [rows, q])
  useEffect(() => { onSelect('Customers' + (q.trim() ? ', search: ' + q.trim() : '')) }, [q, onSelect])
  if (state.kind !== 'ok' && state.kind !== 'loading') return <EmptyState state={state} onRetry={reload} />
  const current = shown.filter((r) => !r.former)
  const former = shown.filter((r) => r.former)
  const mrr = current.reduce((s, r) => s + r.mrr, 0)
  const open = shown.reduce((s, r) => s + r.open_balance, 0)
  const row = (r: (typeof shown)[number]) => (
    <tr key={r.key} className="border-b last:border-0" data-testid="customer-row" data-key={r.key}>
                  <td className="px-3 py-2 font-medium">{r.id ? <a href={'#/apps/clients/' + encodeURIComponent(r.id)} data-testid="customer-link" className="hover:underline">{r.name}</a> : r.name}</td>
                  <td className="px-3 py-2 text-right font-mono" data-testid="customer-mrr">{r.mrr ? moneyOf(r.mrr) : '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground" data-testid="customer-last">{r.last_payment ?? 'none'}</td>
                  <td className={cn('px-3 py-2 text-right font-mono', r.open_balance > 0 && 'text-destructive')} data-testid="customer-open">{r.open_balance ? moneyOf(r.open_balance) : '-'}</td>
                  <td className="hidden px-3 py-2 text-right font-mono md:table-cell" data-testid="customer-collected">{r.collected ? moneyOf(r.collected) : '-'}</td>
                </tr>
  )
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="customers-tab">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-40 max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search customers" data-testid="customers-search" placeholder="Search customers" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Muted>{current.length} customers, MRR {moneyOf(mrr)}, open {moneyOf(open)}</Muted>
      </div>
      {state.kind === 'loading' ? <p className="text-sm text-muted-foreground">Loading...</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[32rem] text-sm" data-testid="customers-table">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 text-right font-medium">MRR</th><th className="px-3 py-2 font-medium">Last payment</th><th className="px-3 py-2 text-right font-medium">Open balance</th><th className="hidden px-3 py-2 text-right font-medium md:table-cell">Collected, 12 mo</th>
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground" data-testid="customers-empty">No customers match.</td></tr>}
              {current.map((r) => row(r))}
              {former.length > 0 && (
                <tr className="border-b bg-muted/30" data-testid="customers-former-head"><td colSpan={5} className="p-0">
                  <button type="button" aria-expanded={showFormer} data-testid="customers-former-toggle" onClick={() => setShowFormer((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {showFormer ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}Former and other ({former.length})
                  </button>
                </td></tr>
              )}
              {showFormer && former.map((r) => row(r))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
