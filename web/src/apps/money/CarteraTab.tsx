// Cartera: the entries by bucket with the semaphore, expandable payment history, and the one write (mark paid).
import { useEffect, useMemo, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { call } from '@/lib/api'
import { Pill } from '../tiles'
import { EmptyState, useAppApi } from '../useAppApi'
import { Pager } from './Pager'
import { KIND_LABEL, SEM_LABEL, SEM_TONE, groupCartera, moneyOf, pageOf, payKinds, todayMz } from './money'
import type { CarteraFilter } from './money'
import type { CarteraBody, CarteraRow, PayKind, Semaphore } from './types'

const FIELD = 'h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-xs text-muted-foreground">{children}</span>

export function MarkPaidDialog({ entry, today, onClose, onDone }: { entry: CarteraRow; today: string; onClose: () => void; onDone: () => void }) {
  const kinds = payKinds(entry)
  const [kind, setKind] = useState<PayKind>(kinds[0]?.kind ?? 'monthly')
  const [amount, setAmount] = useState(String(kinds[0]?.amount ?? entry.monthly_amount))
  const [month, setMonth] = useState(today.slice(0, 7))
  const [paidAt, setPaidAt] = useState(today)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pick = (k: PayKind) => { setKind(k); setAmount(String(kinds.find((x) => x.kind === k)?.amount ?? '')) }
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) && (kind !== 'monthly' || /^\d{4}-\d{2}$/.test(month))
  const submit = async () => {
    if (!valid || busy) return
    setBusy(true); setErr('')
    const r = await call<{ error?: string }>('/api/apps/money/cartera/' + encodeURIComponent(entry.id) + '/paid', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, amount: n, paid_at: paidAt, ...(kind === 'monthly' ? { period: month + '-01' } : {}) }),
    })
    setBusy(false)
    if (r.ok) { onDone(); return }
    setErr(r.status === 409 ? 'That payment is already recorded.' : r.status === 403 ? 'Admins only.' : r.status === 503 ? 'The database is not reachable right now.' : 'Could not record it (' + (r.status || 'network') + ').')
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="markpaid-dialog">
        <DialogHeader>
          <DialogTitle>Mark paid: {entry.company_name}</DialogTitle>
          <DialogDescription>Records the payment and moves the entry. Nothing is deleted.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">Kind
            <select aria-label="Kind" data-testid="markpaid-kind" className={FIELD} value={kind} onChange={(e) => pick(e.target.value as PayKind)}>
              {kinds.map((k) => <option key={k.kind} value={k.kind}>{KIND_LABEL[k.kind]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Amount (MXN)
            <Input aria-label="Amount" data-testid="markpaid-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {kind === 'monthly' && (
            <label className="grid gap-1 text-xs text-muted-foreground">Period
              <input aria-label="Period" data-testid="markpaid-period" type="month" className={FIELD} value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
          )}
          <label className="grid gap-1 text-xs text-muted-foreground">Paid on
            <input aria-label="Paid on" data-testid="markpaid-date" type="date" className={FIELD} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </label>
          <p className="text-sm" data-testid="markpaid-summary">Record {valid ? moneyOf(n) : 'an amount'}, {KIND_LABEL[kind].toLowerCase()}{kind === 'monthly' ? ' for ' + month : ''}, paid {paidAt}?</p>
          {err && <p className="text-sm text-destructive" role="alert" data-testid="markpaid-error">{err}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" data-testid="markpaid-confirm" disabled={!valid || busy} onClick={() => void submit()}>{busy ? 'Saving...' : 'Mark paid'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Entry({ e, open, onToggle, onPay }: { e: CarteraRow; open: boolean; onToggle: () => void; onPay: () => void }) {
  const canPay = payKinds(e).length > 0
  return (
    <li className="py-1" data-testid="cartera-row" data-id={e.id} data-semaphore={e.semaphore}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" aria-expanded={open} aria-label={(open ? 'Collapse ' : 'Expand ') + e.company_name} data-testid="cartera-toggle" onClick={onToggle} className="flex min-w-0 flex-1 basis-56 items-center gap-2 py-1.5 text-left">
          {open ? <ChevronDownIcon className="size-4 shrink-0" /> : <ChevronRightIcon className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium">{e.company_name}</span>{e.closing && <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground" data-testid="cartera-closing">closing</span>}</span>
            <span className="block truncate text-xs text-muted-foreground">{[e.contact_name, e.billing_mode, e.billing_state].filter(Boolean).join(' / ')}</span>
          </span>
        </button>
        <Pill tone={SEM_TONE[e.semaphore]}>{SEM_LABEL[e.semaphore]}</Pill>
        <span className="w-32 text-right font-mono text-sm" data-testid="cartera-amount">{moneyOf(e.monthly_amount, e.currency)}</span>
        <span className="hidden w-28 text-xs text-muted-foreground sm:block">Next {e.next_payment_estimate ?? 'not set'}</span>
        <span className="hidden w-28 text-xs text-muted-foreground md:block">Last {e.last_payment_at ?? 'no payments'}</span>
        {canPay ? <Button type="button" size="xs" variant="outline" data-testid="cartera-markpaid" onClick={onPay}>Mark paid</Button> : <span className="w-[4.5rem]" />}
      </div>
      {open && (
        <div className="mb-2 ml-6 grid gap-2 rounded-md border bg-card p-3 text-sm" data-testid="cartera-detail">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
            <div><Muted>Last paid period</Muted><div>{e.last_paid_period ?? '-'}</div></div>
            <div><Muted>Next payment</Muted><div>{e.next_payment_estimate ?? '-'}</div></div>
            <div><Muted>Build total</Muted><div>{e.build_total ? moneyOf(e.build_total) : '-'}</div></div>
            <div><Muted>Bucket</Muted><div>{e.bucket}</div></div>
            <div><Muted>Deposit</Muted><div>{e.build_deposit_amount != null ? moneyOf(e.build_deposit_amount) + (e.build_deposit_paid_at ? ', paid ' + e.build_deposit_paid_at : ', unpaid') : '-'}</div></div>
            <div><Muted>Final</Muted><div>{e.build_final_amount != null ? moneyOf(e.build_final_amount) + (e.build_final_paid_at ? ', paid ' + e.build_final_paid_at : ', unpaid') : '-'}</div></div>
          </div>
          {e.notes && <p className="whitespace-pre-wrap text-muted-foreground" data-testid="cartera-notes">{e.notes}</p>}
          <div>
            <Muted>Payment history ({e.payments.length})</Muted>
            {e.payments.length === 0 ? <p className="text-muted-foreground">No payments recorded.</p> : (
              <ul className="divide-y" data-testid="cartera-history">
                {e.payments.slice(0, 24).map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-x-3 py-1"><span className="w-28">{p.paid_at}</span><span className="w-32">{KIND_LABEL[p.kind]}</span><span className="font-mono">{moneyOf(p.amount)}</span>{p.period && <Muted>{p.period.slice(0, 7)}</Muted>}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

const SEMS: ('all' | Semaphore)[] = ['all', 'verde', 'amarillo', 'rojo', 'stripe']

export function CarteraTab({ onChanged, onSelect }: { onChanged: () => void; onSelect: (s: string) => void }) {
  const { state, reload } = useAppApi<CarteraBody>('/api/apps/money/cartera')
  const [filter, setFilter] = useState<CarteraFilter>({ bucket: 'all', semaphore: 'all', q: '' })
  const [openId, setOpenId] = useState<string | null>(null)
  const [paying, setPaying] = useState<CarteraRow | null>(null)
  const [pages, setPages] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [flash, setFlash] = useState('')
  const data = state.kind === 'ok' && state.data?.groups ? state.data : null
  const groups = useMemo(() => data ? groupCartera(data.groups, filter) : [], [data, filter])
  const selected = data ? Object.values(data.groups).flat().find((r) => r.id === openId) : undefined
  useEffect(() => { onSelect('Cartera' + (selected ? ', open entry: ' + selected.company_name + ' (' + SEM_LABEL[selected.semaphore] + ')' : '') + (filter.q.trim() ? ', filter: ' + filter.q.trim() : '') + (filter.semaphore !== 'all' ? ', semaphore ' + filter.semaphore : '') + (filter.bucket !== 'all' ? ', bucket ' + filter.bucket : '')) }, [selected, filter, onSelect])
  if (!data) return <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 0 } : state} onRetry={reload} />
  const setF = (p: Partial<CarteraFilter>) => { setFilter((f) => ({ ...f, ...p })); setPages({}) }
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="cartera-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 max-w-sm flex-1">
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search cartera" data-testid="cartera-search" placeholder="Search cartera" className="pl-8" value={filter.q} onChange={(e) => setF({ q: e.target.value })} />
        </div>
        <select aria-label="Bucket" data-testid="cartera-bucket" className={FIELD} value={filter.bucket} onChange={(e) => setF({ bucket: e.target.value })}>
          <option value="all">All buckets</option>{groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <select aria-label="Semaphore" data-testid="cartera-semaphore" className={FIELD} value={filter.semaphore} onChange={(e) => setF({ semaphore: e.target.value as CarteraFilter['semaphore'] })}>
          {SEMS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All states' : SEM_LABEL[s]}</option>)}
        </select>
        <Muted>MRR {moneyOf(data.totals.mrr)}, collected {moneyOf(data.totals.cobrado)}{data.totals.cobrado_usd ? ' + ' + moneyOf(data.totals.cobrado_usd, 'USD') : ''}, pending {moneyOf(data.totals.pendiente)}</Muted>
      </div>
      {flash && <p className="text-sm text-ok" role="status" data-testid="cartera-flash">{flash}</p>}
      {groups.map(({ key: bucket, label, rows, collapsed }) => {
        const open = !collapsed || !!expanded[bucket]
        return (
          <section key={bucket} className="rounded-lg border bg-card" data-testid={'cartera-' + bucket} data-count={rows.length} data-collapsed={!open}>
            {collapsed ? (
              <h2 className="border-b text-sm font-semibold">
                <button type="button" aria-expanded={open} data-testid={'cartera-' + bucket + '-toggle'} onClick={() => setExpanded((x) => ({ ...x, [bucket]: !x[bucket] }))} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                  {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}{label}<span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{rows.length}</span>
                </button>
              </h2>
            ) : (
              <h2 className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">{label}<span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{rows.length}</span></h2>
            )}
            {open && (rows.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">Nothing matches.</p> : (
              <ul className="divide-y px-3">
                {pageOf(rows, pages[bucket] ?? 0).map((e) => <Entry key={e.id} e={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} onPay={() => setPaying(e)} />)}
              </ul>
            ))}
            {open && <div className="px-3"><Pager total={rows.length} page={pages[bucket] ?? 0} onPage={(p) => setPages((s) => ({ ...s, [bucket]: p }))} label={bucket} /></div>}
          </section>
        )
      })}
      {paying && <MarkPaidDialog entry={paying} today={data.today || todayMz()} onClose={() => setPaying(null)} onDone={() => { setFlash('Recorded for ' + paying.company_name + '.'); setPaying(null); reload(); onChanged() }} />}
    </div>
  )
}
