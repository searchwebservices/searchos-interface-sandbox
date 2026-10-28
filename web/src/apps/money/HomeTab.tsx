// Home: where we stop guessing. The kit's "answer first" head (eyebrow MONEY, the status sentence as the title), "Needs a
// touch" with one action a row, four same-size Metric cards, Jared's opener; then this month in sentences, six months of
// revenue versus expenses and the next thirty days. Everything comes from GET /api/apps/money/home; the page formats only
// the card amounts. Quiet: one font, one accent, nothing blinking. Cards and chips are the kit's (.si-card, .si-pill).
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { askJared } from '../jared'
import { EmptyState } from '../useAppApi'
import { MarkPaidDialog } from './CarteraTab'
import { ledgerApi } from './api'
import { moneyOf, todayMz } from './money'
import { FIELD, MonthsChart, Muted, Panel, dataOf, useLoad } from './parts'
import type { CarteraRow, HomeBody, HomeCard, TouchAction, TouchRow } from './types'

const ACTION_LABEL: Record<TouchAction, string> = { mark_paid: 'Mark paid', draft_reminder: 'Draft reminder', classify: 'Classify', match: 'Match', open: 'Open', open_invoices: 'Open invoices' }
const go = (tab: string, query?: string) => { window.location.hash = '#/apps/money/' + tab + (query ? '?' + query : '') }

// Mark an invoice paid: the date, one confirm. The console says when it cannot write invoices yet (migration 0024).
function InvoicePaidDialog({ row, today, onClose, onDone }: { row: TouchRow; today: string; onClose: () => void; onDone: () => void }) {
  const [paidAt, setPaidAt] = useState(today)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async () => {
    if (busy || !row.invoice_id) return
    setBusy(true); setErr('')
    const r = await ledgerApi.invoicePaid(row.invoice_id, paidAt)
    setBusy(false)
    if (r.ok) onDone()
    else if (r.body?.error === 'invoices_not_writable') setErr('The console cannot write invoices yet. Once Bay runs migration 0024 this works.')
    else if (r.status === 409) setErr('That invoice is already marked paid.')
    else setErr('Could not record it (' + (r.status || 'network') + ').')
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="invoicepaid-dialog">
        <DialogHeader><DialogTitle>Mark paid</DialogTitle><DialogDescription>{row.client_name}, {moneyOf(row.amount ?? 0, row.currency)}. The invoice closes with this date.</DialogDescription></DialogHeader>
        <label className="grid gap-1 text-xs text-muted-foreground">Paid on<input aria-label="Paid on" type="date" data-testid="invoicepaid-date" className={FIELD} value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} /></label>
        {err && <p className="text-sm text-destructive" role="alert" data-testid="invoicepaid-error">{err}</p>}
        <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" data-testid="invoicepaid-confirm" disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)} onClick={() => void submit()}>{busy ? 'Saving...' : 'Mark paid'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// The cash position has no bank feed: a person types a balance per account.
function BalanceDialog({ accounts, onClose, onDone }: { accounts: HomeBody['accounts']; onClose: () => void; onDone: () => void }) {
  const list = accounts.filter((a) => a.enabled)
  const [id, setId] = useState(list[0]?.id ?? '')
  const [value, setValue] = useState(() => (list[0] && list[0].balance !== 0 ? String(list[0].balance) : ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const n = Number(value)
  const valid = !!id && value.trim() !== '' && Number.isFinite(n)
  const pick = (v: string) => { setId(v); const a = list.find((x) => x.id === v); setValue(a && a.balance !== 0 ? String(a.balance) : '') }
  const submit = async () => {
    if (!valid || busy) return
    setBusy(true); setErr('')
    const r = await ledgerApi.setBalance(id, n)
    setBusy(false)
    if (r.ok) onDone(); else setErr('Could not save it (' + (r.status || 'network') + ').')
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="balance-dialog">
        <DialogHeader><DialogTitle>Add balance</DialogTitle><DialogDescription>What the account holds today. Runway follows from this.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">Account
            <select aria-label="Account" data-testid="balance-account" className={FIELD} value={id} onChange={(e) => pick(e.target.value)}>{list.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Balance<Input aria-label="Balance" data-testid="balance-amount" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></label>
          {err && <p className="text-sm text-destructive" role="alert" data-testid="balance-error">{err}</p>}
        </div>
        <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" data-testid="balance-confirm" disabled={!valid || busy} onClick={() => void submit()}>{busy ? 'Saving...' : 'Save'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Same size, same three lines: label, whole pesos, one sentence (the strip and Overview keep the cents). The cash card
// carries the "add balance" chip on its sentence line.
// The kit's Metric card: head (Label), big value, then the context line last (interface system v2, section 8).
function Card({ id, label, card, currency = 'MXN', action }: { id: string; label: string; card: HomeCard; currency?: string; action?: ReactNode }) {
  return (
    <div className="si-card flex min-h-32 min-w-[13rem] shrink-0 snap-start flex-col px-5 pt-4 pb-3.5 @md:min-w-0" data-testid="home-card" data-id={id}>
      <span className="si-label">{label}</span>
      <div className={cn('mt-2 text-[1.75rem] leading-none font-medium tracking-tight tabular-nums', card.tone === 'bad' && 'text-destructive')}>{moneyOf(Math.round(card.amount), currency)}</div>
      <div className="si-src mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-3"><span data-testid="home-card-sub">{card.sub}</span>{action}</div>
    </div>
  )
}

// The agent's avatar is tinted accent-subtle; the person's own stays neutral (kit section 9).
const J = () => <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary ring-1 ring-primary/35" aria-hidden>J</span>

export function HomeTab({ refresh, onChanged, onSelect }: { refresh: number; onChanged: () => void; onSelect: (s: string) => void }) {
  const { state, reload } = useLoad(() => ledgerApi.home(), [refresh])
  const [payingInvoice, setPayingInvoice] = useState<TouchRow | null>(null)
  const [payingEntry, setPayingEntry] = useState<CarteraRow | null>(null)
  const [balance, setBalance] = useState(false)
  const [flash, setFlash] = useState('')
  const d = dataOf(state)
  const ready = d && typeof d.status === 'string' && Array.isArray(d.touch)
  useEffect(() => { onSelect('Home' + (d && ready ? ', ' + d.status : '')) }, [ready, d, onSelect])
  if (!ready) return state.kind === 'loading' ? <p className="p-4 text-sm text-muted-foreground">Loading...</p> : <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 0 } : state} onRetry={reload} />
  const today = d.as_of || todayMz()
  const done = (what: string) => { setFlash(what); setPayingInvoice(null); setPayingEntry(null); setBalance(false); reload(); onChanged() }
  const act = (row: TouchRow, a: TouchAction) => {
    if (a === 'mark_paid') { if (row.kind === 'invoice') setPayingInvoice(row); else if (row.entry) setPayingEntry(row.entry) }
    else if (a === 'draft_reminder') askJared(row.prefill ?? 'Draft a payment reminder for ' + (row.client_name ?? 'this client') + '.')
    else if (a === 'classify') go('transactions', 'status=pending')
    else if (a === 'match') go('inbox')
    else if (a === 'open') go('cartera')
    else go('invoices')
  }
  return (
    <div className="@container mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-5 pb-8" data-testid="home-tab">
      {/* Answer first (kit section 1): eyebrow, then the status sentence as the page title. */}
      <header className="pb-1" data-testid="home-head">
        <p className="si-eyebrow" data-testid="home-eyebrow">Money</p>
        <h1 className="si-title max-w-[34ch]" data-testid="home-status">{d.status}</h1>
        {flash && <p className="mt-3 text-sm text-ok" role="status" data-testid="home-flash">{flash}</p>}
      </header>

      <section className="si-card" data-testid="home-touch" data-count={d.touch.length}>
        <h2 className="si-label border-b px-5 py-3">Needs a touch</h2>
        {d.touch.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground" data-testid="home-touch-empty">{d.touch_empty?.text ?? 'Nothing needs you.'}</p>
        ) : (
          <ul className="divide-y">
            {d.touch.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-sm" data-testid="touch-row" data-kind={row.kind}>
                <span className="min-w-0 flex-1 basis-56">{row.text}</span>
                <span className="flex shrink-0 gap-1.5">
                  {row.actions.map((a) => <Button key={a} type="button" size="sm" variant={a === row.actions[0] ? 'outline' : 'ghost'} className={cn('rounded-full', a === row.actions[0] ? 'bg-transparent hover:bg-transparent hover:border-foreground/60' : 'text-muted-foreground hover:text-foreground')} data-testid="touch-action" data-action={a} onClick={() => act(row, a)}>{ACTION_LABEL[a]}</Button>)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-1 @md:mx-0 @md:grid @md:grid-cols-2 @md:overflow-visible @md:px-0 @md:pb-0 @3xl:grid-cols-4" data-testid="home-cards">
        <Card id="mrr" label="MRR" card={d.cards.mrr} />
        <Card id="collected" label="Collected this month" card={d.cards.collected} />
        <Card id="overdue" label="Overdue" card={d.cards.overdue} />
        <Card id="cash" label="Cash position" card={d.cards.cash} action={<button type="button" className="si-pill border bg-transparent text-foreground hover:border-foreground/60" data-testid="home-add-balance" onClick={() => setBalance(true)}>add balance</button>} />
      </div>

      <section className="si-card flex flex-wrap items-center gap-3 px-5 py-4" data-testid="home-jared">
        <J />
        <p className="min-w-0 flex-1 basis-64 text-sm" data-testid="home-jared-text">{d.jared.text}</p>
        <Button type="button" size="sm" variant="outline" className="rounded-full bg-transparent hover:bg-transparent hover:border-foreground/60" data-testid="home-ask-jared" onClick={() => askJared(d.jared.ask)}>Ask Jared about this</Button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="This month" note={d.this_month.month} testid="home-month">
          <ul className="grid gap-1 text-sm" data-testid="home-income">
            {d.this_month.income.length === 0 ? <li className="text-muted-foreground">{d.this_month.income_text}</li> : d.this_month.income.map((i) => <li key={i.name}>{i.text}</li>)}
          </ul>
          <ul className="mt-3 grid gap-1 border-t pt-3 text-sm" data-testid="home-expenses">
            {d.this_month.expenses.length === 0 ? <li className="text-muted-foreground">{d.this_month.expenses_text}</li> : d.this_month.expenses.map((e) => <li key={e.slug}>{e.text}</li>)}
          </ul>
        </Panel>
        <Panel title="Six months" note={'Revenue and expenses, MXN. Burn ' + moneyOf(d.burn) + ' a month.'} testid="home-chart">
          {d.chart.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing on the ledger yet.</p> : <MonthsChart data={d.chart} className="h-48 w-full" short />}
        </Panel>
      </div>

      <Panel title="Expected next 30 days" testid="home-expected">
        {d.expected.length === 0 ? <p className="text-sm text-muted-foreground">No payment expected in the next thirty days.</p> : (
          <ul className="grid gap-1 text-sm">
            {d.expected.map((e) => <li key={e.entry_id + e.date} className="flex items-center gap-2" data-testid="home-expected-row" data-kind={e.kind}><span className="min-w-0 flex-1">{e.text}</span><Muted>{e.days === 0 ? 'today' : 'in ' + e.days + (e.days === 1 ? ' day' : ' days')}</Muted></li>)}
          </ul>
        )}
      </Panel>

      {payingInvoice && <InvoicePaidDialog row={payingInvoice} today={today} onClose={() => setPayingInvoice(null)} onDone={() => done('Recorded: ' + (payingInvoice.client_name ?? 'invoice') + ' paid.')} />}
      {payingEntry && <MarkPaidDialog entry={payingEntry} today={today} onClose={() => setPayingEntry(null)} onDone={() => done('Recorded for ' + payingEntry.company_name + '.')} />}
      {balance && <BalanceDialog accounts={d.accounts} onClose={() => setBalance(false)} onDone={() => done('Balance saved.')} />}
    </div>
  )
}
