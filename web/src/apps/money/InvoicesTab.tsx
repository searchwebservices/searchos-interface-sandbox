// Invoices: invoices, facturas and the MRR roster (read only), then the Stripe and Facturapi sections.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DownloadIcon, ExternalLinkIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Pill } from '../tiles'
import { InvoiceSheet } from './InvoiceSheet'
import { INVOICE_STATUS } from './ledger'
import { Chip } from './parts'
import { ledgerApi } from './api'
import { EmptyState, useAppApi } from '../useAppApi'
import type { ApiState } from '../useAppApi'
import { Pager } from './Pager'
import { moneyOf, pageOf, todayMz } from './money'
import type { FacturapiBody, InvoiceRow, InvoicesBody, MrrRow, StripeBody } from './types'
import type { Tone } from '../map/estate'

const Muted = ({ children }: { children: ReactNode }) => <span className="text-xs text-muted-foreground">{children}</span>
const FIELD = 'h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card" data-testid={'section-' + id} data-count={count ?? ''}>
      <h2 className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">{title}{count != null && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{count}</span>}</h2>
      <div className="px-3 pb-2">{children}</div>
    </section>
  )
}
const Row = ({ children, testid }: { children: ReactNode; testid: string }) => <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid={testid}>{children}</li>
const Name = ({ children }: { children: ReactNode }) => <span className="min-w-0 flex-1 basis-44 truncate font-medium">{children}</span>

// The quiet line shown while a processor has no key on the console.
function Connect({ who, envName }: { who: string; envName: string }) {
  return <p className="py-3 text-sm text-muted-foreground" data-testid={'connect-' + who.toLowerCase()}>Connect {who}: set <code>{envName}</code> on the console and this section fills in.</p>
}
function ExternalState<T>({ state, who, envName, reload, children }: { state: ApiState<T>; who: string; envName: string; reload: () => void; children: (d: T) => ReactNode }) {
  if (state.kind === 'loading') return <p className="py-3 text-sm text-muted-foreground">Loading...</p>
  if (state.kind === 'unavailable' && state.error === who.toLowerCase() + '_not_configured') return <Connect who={who} envName={envName} />
  if (state.kind === 'ok') return <>{children(state.data)}</>
  return <div className="py-3 text-sm text-muted-foreground" data-testid={'failed-' + who.toLowerCase()}>{who} did not answer. <button type="button" className="underline" onClick={reload}>Try again</button></div>
}
const Ext = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">{children}<ExternalLinkIcon className="size-3" /></a>

// Mark an invoice paid: the date, one confirm. The console says when it cannot write invoices yet (migration 0024).
function InvoicePaidDialog({ inv, onClose, onDone }: { inv: InvoiceRow; onClose: () => void; onDone: () => void }) {
  const today = todayMz()
  const [paidAt, setPaidAt] = useState(today)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async () => {
    if (busy) return
    setBusy(true); setErr('')
    const r = await ledgerApi.invoicePaid(inv.id, paidAt)
    setBusy(false)
    if (r.ok) onDone()
    else if (r.body?.error === 'invoices_not_writable') setErr('The console cannot write invoices yet. Once Bay runs migration 0024 this works.')
    else if (r.status === 409) setErr('That invoice is already marked paid.')
    else setErr('Could not record it (' + (r.status || 'network') + ').')
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="invoicepaid-dialog">
        <DialogHeader><DialogTitle>Mark paid</DialogTitle><DialogDescription>{inv.client_name ?? 'No client'}, {moneyOf(inv.amount, inv.currency)}. The invoice closes with this date.</DialogDescription></DialogHeader>
        <label className="grid gap-1 text-xs text-muted-foreground">Paid on<input aria-label="Paid on" type="date" data-testid="invoicepaid-date" className={FIELD} value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} /></label>
        {err && <p className="text-sm text-destructive" role="alert" data-testid="invoicepaid-error">{err}</p>}
        <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" data-testid="invoicepaid-confirm" disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)} onClick={() => void submit()}>{busy ? 'Saving...' : 'Mark paid'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InvoiceList({ rows, onOpen, onPay }: { rows: InvoiceRow[]; onOpen: (i: InvoiceRow) => void; onPay: (i: InvoiceRow) => void }) {
  const [filter, setFilter] = useState<'all' | 'open' | 'overdue' | 'paid'>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const shown = useMemo(() => rows.filter((r) => (filter === 'all' || (filter === 'open' ? r.state === 'open' || r.state === 'overdue' : r.state === filter)) && (!q.trim() || (r.client_name ?? '').toLowerCase().includes(q.trim().toLowerCase()))), [rows, filter, q])
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <div className="relative min-w-40 max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search invoices" data-testid="invoice-search" placeholder="Client" className="pl-8" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
        </div>
        <select aria-label="Invoice state" data-testid="invoice-filter" className={FIELD} value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(0) }}>
          <option value="all">All</option><option value="open">Open</option><option value="overdue">Overdue</option><option value="paid">Paid</option>
        </select>
      </div>
      {shown.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No invoices match.</p> : (
        <ul className="divide-y" data-testid="invoice-rows">
          {pageOf(shown, page).map((i) => (
            <Row key={i.id} testid="invoice-row">
              <Name><button type="button" className="max-w-full truncate text-left hover:underline" data-testid="invoice-open" onClick={() => onOpen(i)}>{i.client_name ?? 'No client'}</button></Name>
              <Chip label={INVOICE_STATUS[i.state].label} tone={INVOICE_STATUS[i.state].tone} testid="invoice-chip" />
              {i.state === 'overdue' && <Muted>{i.days_overdue} d late</Muted>}
              <span className="w-32 text-right font-mono">{moneyOf(i.amount, i.currency)}</span>
              <Muted>due {i.due_date ?? '-'}{i.paid_date ? ', paid ' + i.paid_date : ''}</Muted>
              {i.state === 'overdue' && <Button type="button" size="xs" variant="outline" data-testid="invoice-markpaid" onClick={() => onPay(i)}>Mark paid</Button>}
            </Row>
          ))}
        </ul>
      )}
      <Pager total={shown.length} page={page} onPage={setPage} label="Invoices" />
    </>
  )
}

function Paged<T>({ rows, render, testid, empty }: { rows: T[]; render: (r: T) => ReactNode; testid: string; empty: string }) {
  const [page, setPage] = useState(0)
  if (!rows.length) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>
  return (
    <>
      <ul className="divide-y" data-testid={testid}>{pageOf(rows, page).map(render)}</ul>
      <Pager total={rows.length} page={page} onPage={setPage} label={testid} />
    </>
  )
}

const chips = (m: MrrRow): { label: string; tone: Tone }[] => [
  m.counts_in_mrr ? { label: 'counts in MRR', tone: 'ok' } : { label: 'not in MRR', tone: 'idle' },
  ...(m.billing_paused ? [{ label: 'billing paused', tone: 'warn' as Tone }] : []),
  ...(m.archived ? [{ label: 'archived', tone: 'idle' as Tone }] : []),
]

export function InvoicesTab({ onSelect }: { onSelect: (s: string) => void }) {
  const { state, reload } = useAppApi<InvoicesBody>('/api/apps/money/invoices')
  const stripe = useAppApi<StripeBody>('/api/apps/money/stripe')
  const fact = useAppApi<FacturapiBody>('/api/apps/money/facturapi')
  const [openInv, setOpenInv] = useState<InvoiceRow | null>(null)
  const [payInv, setPayInv] = useState<InvoiceRow | null>(null)
  useEffect(() => { onSelect('Invoices' + (openInv ? ', open invoice: ' + (openInv.client_name ?? 'no client') + ' ' + moneyOf(openInv.amount, openInv.currency) + ' (' + openInv.state + ')' : '')) }, [openInv, onSelect])
  const data = state.kind === 'ok' && Array.isArray(state.data?.invoices) ? state.data : null
  if (!data) return <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 0 } : state} onRetry={reload} />
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="invoices-tab">
      <Section id="invoices" title="Invoices" count={data.totals.invoices}><InvoiceList rows={data.invoices} onOpen={setOpenInv} onPay={setPayInv} /></Section>
      <Section id="facturas" title="Facturas" count={data.facturas.length}>
        <Paged rows={data.facturas} testid="factura-rows" empty="No facturas." render={(f) => (
          <Row key={f.id} testid="factura-row">
            <Name>{f.folio ?? '-'} <span className="font-normal text-muted-foreground">{f.receptor ?? ''}</span></Name>
            <Muted>{f.emisor ?? ''}</Muted>
            <span className="hidden w-28 text-right font-mono text-xs text-muted-foreground md:block">{moneyOf(f.subtotal)}</span>
            <span className="hidden w-24 text-right font-mono text-xs text-muted-foreground md:block">IVA {moneyOf(f.iva)}</span>
            <span className="w-32 text-right font-mono">{moneyOf(f.total)}</span>
            <Pill tone={/vigent|valid|stamp|timbr/i.test(f.status ?? '') ? 'ok' : /cancel/i.test(f.status ?? '') ? 'bad' : 'idle'}>{f.status ?? 'unknown'}</Pill>
            <Muted>{f.fecha ?? ''}</Muted>
          </Row>
        )} />
      </Section>
      <Section id="mrr" title="MRR roster" count={data.mrr_roster.length}>
        <Paged rows={data.mrr_roster} testid="mrr-rows" empty="No roster rows." render={(m) => (
          <Row key={m.id} testid="mrr-row">
            <Name>{m.client_name} <span className="font-normal text-muted-foreground">{m.service ?? ''}</span></Name>
            <span className="flex flex-wrap gap-1">{chips(m).map((c) => <Pill key={c.label} tone={c.tone}>{c.label}</Pill>)}</span>
            <span className="w-32 text-right font-mono">{moneyOf(m.amount_mxn, m.currency)}</span>
          </Row>
        )} />
      </Section>
      <Section id="stripe" title="Stripe">
        <ExternalState state={stripe.state} who="Stripe" envName="STRIPE_SECRET_KEY" reload={stripe.reload}>{(s) => (
          <div data-testid="stripe-data">
            <Muted>Last {s.charges.length} charges</Muted>
            <ul className="divide-y">
              {s.charges.map((c) => (
                <Row key={c.id} testid="stripe-charge">
                  <Name><Ext href={c.url}>{c.email ?? c.description ?? c.id}</Ext></Name>
                  <Pill tone={c.status === 'succeeded' ? 'ok' : c.status === 'failed' ? 'bad' : 'idle'}>{c.status ?? 'unknown'}</Pill>
                  <span className="w-32 text-right font-mono">{moneyOf(c.amount, c.currency.toUpperCase())}</span>
                  <Muted>{c.created?.slice(0, 10) ?? ''}</Muted>
                </Row>
              ))}
            </ul>
            <div className="pt-2"><Muted>Active subscriptions ({s.subscriptions.length})</Muted></div>
            <ul className="divide-y">
              {s.subscriptions.map((u) => (
                <Row key={u.id} testid="stripe-sub">
                  <Name><Ext href={u.url}>{u.id}</Ext></Name>
                  <Pill tone="ok">{u.status ?? ''}</Pill>
                  <span className="w-40 text-right font-mono">{moneyOf(u.amount, (u.currency ?? 'MXN').toUpperCase())}{u.interval ? ' / ' + u.interval : ''}</span>
                  <Muted>renews {u.current_period_end?.slice(0, 10) ?? '-'}</Muted>
                </Row>
              ))}
            </ul>
          </div>
        )}</ExternalState>
      </Section>
      <Section id="facturapi" title="Facturapi">
        <ExternalState state={fact.state} who="Facturapi" envName="FACTURAPI_SECRET_KEY" reload={fact.reload}>{(f) => (
          <div data-testid="facturapi-data">
            <Muted>Last {f.invoices.length} invoices</Muted>
            <ul className="divide-y">
              {f.invoices.map((i) => (
                <Row key={i.id} testid="facturapi-row">
                  <Name>{i.folio ?? i.id} <span className="font-normal text-muted-foreground">{i.receptor ?? ''}</span></Name>
                  <Pill tone={i.status === 'valid' ? 'ok' : i.status === 'canceled' ? 'bad' : 'idle'}>{i.status ?? 'unknown'}</Pill>
                  <span className="w-32 text-right font-mono">{moneyOf(i.total, i.currency)}</span>
                  <Muted>{i.created?.slice(0, 10) ?? ''}</Muted>
                  <a href={i.pdf} download className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><DownloadIcon className="size-3" />PDF</a>
                  <a href={i.xml} download className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><DownloadIcon className="size-3" />XML</a>
                </Row>
              ))}
            </ul>
          </div>
        )}</ExternalState>
      </Section>
      {payInv && <InvoicePaidDialog inv={payInv} onClose={() => setPayInv(null)} onDone={() => { setPayInv(null); reload() }} />}
      {openInv && <InvoiceSheet inv={openInv} facturas={data.facturas} stripe={stripe.state.kind === 'ok' ? stripe.state.data : null} facturapi={fact.state.kind === 'ok' ? fact.state.data : null} onClose={() => setOpenInv(null)} />}
    </div>
  )
}
