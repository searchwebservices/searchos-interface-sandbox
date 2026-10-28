// Transactions: Midday's table. Date range, account, category, status and search; column visibility; row selection with
// bulk categorise and bulk status; the sheet on the right; manual add; sync. Rows page by cursor ("Load more").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Columns3Icon, PlusIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EmptyState, useAppApi } from '../useAppApi'
import type { ApiState } from '../useAppApi'
import { ledgerApi } from './api'
import type { Account, Category, LedgerQuery, LedgerTotals, Transaction, TxStatus } from './api'
import { COLUMNS, PERIODS, TX_STATUS, accountMap, categoryMap, loadColumns, periodRange, saveColumns, tokenColor } from './ledger'
import type { ColumnId, PeriodId } from './ledger'
import { moneyOf, todayMz } from './money'
import { CategoryOptions, Chip, FIELD, Muted, useRefs } from './parts'
import { TransactionSheet } from './TransactionSheet'

const STATUSES: ('' | TxStatus)[] = ['', 'posted', 'pending', 'excluded', 'archived']
// #/apps/money/transactions?status=pending (the home page's Classify) opens filtered, over a year so the pile is all there.
const statusFromHash = (): TxStatus | null => {
  const i = window.location.hash.indexOf('?')
  const s = i < 0 ? null : new URLSearchParams(window.location.hash.slice(i + 1)).get('status')
  return s && (STATUSES as string[]).includes(s) ? (s as TxStatus) : null
}

function AddDialog({ categories, accounts, onClose, onDone }: { categories: Category[]; accounts: Account[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [date, setDate] = useState(todayMz())
  const [cat, setCat] = useState('')
  const [acct, setAcct] = useState(() => (accounts.find((a) => a.enabled) ?? accounts[0])?.id ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(amount)
  const valid = name.trim().length > 0 && Number.isFinite(n) && n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !!acct
  const submit = async () => {
    if (!valid || busy) return
    setBusy(true); setErr('')
    const r = await ledgerApi.create({ name: name.trim(), amount: kind === 'expense' ? -n : n, date, account_id: acct, ...(cat ? { category_slug: cat } : {}), status: 'posted' })
    setBusy(false)
    if (r.ok) onDone(); else setErr('Could not add it (' + (r.status || 'network') + ').')
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="add-dialog">
        <DialogHeader><DialogTitle>Add transaction</DialogTitle><DialogDescription>A manual entry, for cash or anything the feeds do not see.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">Description<Input aria-label="Description" data-testid="add-name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">Type
              <select aria-label="Type" data-testid="add-kind" className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as 'expense' | 'income')}><option value="expense">Expense</option><option value="income">Income</option></select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">Amount<Input aria-label="Amount" data-testid="add-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">Account
            <select aria-label="Account" data-testid="add-account" className={FIELD} value={acct} onChange={(e) => setAcct(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">Date<input aria-label="Date" type="date" data-testid="add-date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Category
              <select aria-label="Category" data-testid="add-category" className={FIELD} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Uncategorised</option><CategoryOptions categories={categories} /></select>
            </label>
          </div>
          {err && <p className="text-sm text-destructive" role="alert" data-testid="add-error">{err}</p>}
        </div>
        <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" data-testid="add-confirm" disabled={!valid || busy} onClick={() => void submit()}>{busy ? 'Saving...' : 'Add'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TransactionsTab({ onSelect }: { onSelect: (s: string) => void }) {
  const today = todayMz()
  const { accounts, categories } = useRefs()
  const cats = useMemo(() => categoryMap(categories), [categories])
  const accts = useMemo(() => accountMap(accounts), [accounts])
  const [period, setPeriod] = useState<PeriodId>(() => (statusFromHash() ? 'last-12' : 'last-3'))
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<string>(() => statusFromHash() ?? '')
  const [q, setQ] = useState('')
  const [cols, setCols] = useState(loadColumns)
  const [colsOpen, setColsOpen] = useState(false)
  const [rows, setRows] = useState<Transaction[]>([])
  const [totals, setTotals] = useState<LedgerTotals | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [load, setLoad] = useState<ApiState<null>>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [ledgerEmpty, setLedgerEmpty] = useState(false)
  const stripe = useAppApi<unknown>('/api/apps/money/stripe')
  const fact = useAppApi<unknown>('/api/apps/money/facturapi')
  const notConfigured = [stripe.state, fact.state].some((x) => x.kind === 'unavailable' && !!x.error?.endsWith('_not_configured'))
  const seq = useRef(0)
  const range = useMemo(() => periodRange(period, today), [period, today])
  const query = useMemo<LedgerQuery>(() => ({ from: range.from, to: range.to, account, category, status: status || 'all', q: q.trim() }), [range, account, category, status, q])

  useEffect(() => {
    const mine = ++seq.current
    void ledgerApi.list(query).then((r) => {
      if (mine !== seq.current) return
      const b = r.body
      if (r.ok && Array.isArray(b?.rows)) { setRows(b.rows); setTotals(b.totals ?? null); setNext(b.next_cursor ?? null); setLoad({ kind: 'ok', data: null }); setPicked(new Set())
        if (b.rows.length === 0) void ledgerApi.list({ from: '2000-01-01', to: today, status: 'all' }).then((a) => { if (mine === seq.current) setLedgerEmpty(a.ok && Array.isArray(a.body?.rows) && a.body.rows.length === 0) })
        else setLedgerEmpty(false) }
      else if (r.status === 403) setLoad({ kind: 'forbidden' })
      else if (r.status === 503) setLoad({ kind: 'unavailable' })
      else setLoad({ kind: 'error', status: r.status })
    })
  }, [query, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!next) return
    const mine = seq.current
    const r = await ledgerApi.list({ ...query, cursor: next })
    if (mine !== seq.current) return
    if (r.ok && Array.isArray(r.body?.rows)) { setRows((x) => [...x, ...r.body.rows.filter((n) => !x.some((o) => o.id === n.id))]); setNext(r.body.next_cursor ?? null) }
  }
  const merge = useCallback((id: string, p: Partial<Transaction>) => setRows((x) => x.map((t) => (t.id === id ? { ...t, ...p } : t))), [])
  const reload = () => setTick((n) => n + 1)
  const open = rows.find((t) => t.id === openId) ?? null

  useEffect(() => {
    onSelect('Transactions, ' + range.from + ' to ' + range.to + (open ? ', open: ' + open.name + ' ' + moneyOf(open.amount, open.currency) + ' (' + open.status + ')' : '') + (picked.size ? ', ' + picked.size + ' selected' : '') + (q.trim() ? ', search: ' + q.trim() : ''))
  }, [range, open, picked.size, q, onSelect])

  const toggleCol = (id: ColumnId) => setCols((c) => { const n = { ...c, [id]: !c[id] }; saveColumns(n); return n })
  const allOn = rows.length > 0 && rows.every((t) => picked.has(t.id))
  const toggleRow = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const bulk = async (p: { category_slug?: string | null; status?: TxStatus }, what: string) => {
    const ids = [...picked]
    const res = await Promise.all(ids.map((id) => ledgerApi.patch(id, p)))
    const bad = res.filter((r) => !r.ok).length
    setFlash(bad ? 'Updated ' + (ids.length - bad) + ' of ' + ids.length + ', ' + bad + ' failed.' : 'Updated ' + ids.length + ' transactions: ' + what + '.')
    reload()
  }
  const sync = async () => { setSyncing(true); await ledgerApi.sync(); setSyncing(false); setFlash('Sync started.'); reload() }

  if (load.kind !== 'ok' && load.kind !== 'loading') return <EmptyState state={load} onRetry={reload} />
  const show = (id: ColumnId) => cols[id]
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="transactions-tab">
      <div className="flex flex-wrap items-center gap-2" data-testid="tx-filters">
        <div className="relative min-w-40 max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search transactions" data-testid="tx-search" placeholder="Search" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Period" data-testid="tx-period" className={FIELD} value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
          {PERIODS.filter((p) => p.id !== 'custom').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select aria-label="Account" data-testid="tx-account" className={FIELD} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select aria-label="Category" data-testid="tx-category-filter" className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option><CategoryOptions categories={categories} />
        </select>
        <select aria-label="Status" data-testid="tx-status-filter" className={FIELD} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? TX_STATUS[s].label : 'All statuses'}</option>)}
        </select>
        <div className="relative ml-auto flex gap-1">
          <Button type="button" size="sm" variant="outline" aria-expanded={colsOpen} data-testid="tx-columns-toggle" onClick={() => setColsOpen((o) => !o)}><Columns3Icon />Columns</Button>
          <Button type="button" size="sm" variant="outline" data-testid="tx-sync" disabled={syncing} onClick={() => void sync()}><RefreshCwIcon className={cn(syncing && 'animate-spin')} />Sync</Button>
          <Button type="button" size="sm" data-testid="tx-add" onClick={() => setAdding(true)}><PlusIcon />Add</Button>
          {colsOpen && (
            <div className="absolute top-9 right-0 z-20 grid w-48 gap-2 rounded-md border bg-popover p-3 shadow-md" role="group" aria-label="Columns" data-testid="tx-columns">
              {COLUMNS.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" data-testid={'col-' + c.id} checked={cols[c.id]} disabled={c.id === 'name' || c.id === 'amount'} onChange={() => toggleCol(c.id)} />{c.label}</label>
              ))}
            </div>
          )}
        </div>
      </div>
      {totals && Object.keys(totals.by_currency).length > 0 && (
        <div className="grid gap-0.5 text-sm" data-testid="tx-totals">
          {Object.entries(totals.by_currency).map(([cur, t]) => (
            <p key={cur} className="flex flex-wrap gap-x-4" data-currency={cur}>
              <span className="w-10 text-xs font-medium text-muted-foreground">{cur}</span>
              <span>Income <span className="font-mono text-ok">{moneyOf(t.income, cur)}</span></span>
              <span>Expenses <span className="font-mono">{moneyOf(t.expenses, cur)}</span></span>
              <span>Net <span className={cn('font-mono', t.net < 0 && 'text-destructive')}>{moneyOf(t.net, cur)}</span></span>
            </p>
          ))}
          <Muted>{totals.count} transactions in range, internal transfers left out</Muted>
        </div>
      )}
      {flash && <p className="text-sm text-ok" role="status" data-testid="tx-flash">{flash}</p>}
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-sm" data-testid="tx-bulk">
          <span className="font-medium" data-testid="tx-bulk-count">{picked.size} selected</span>
          <select aria-label="Categorise selected" data-testid="tx-bulk-category" className={FIELD} value="" onChange={(e) => { const v = e.target.value; if (v) void bulk({ category_slug: v === '__none' ? null : v }, v === '__none' ? 'uncategorised' : (cats[v]?.name ?? v)) }}>
            <option value="">Categorise...</option><option value="__none">Uncategorised</option><CategoryOptions categories={categories} />
          </select>
          <select aria-label="Set status of selected" data-testid="tx-bulk-status" className={FIELD} value="" onChange={(e) => { const v = e.target.value as TxStatus; if (v) void bulk({ status: v }, TX_STATUS[v].label.toLowerCase()) }}>
            <option value="">Set status...</option>{(['posted', 'excluded', 'archived'] as TxStatus[]).map((s) => <option key={s} value={s}>{TX_STATUS[s].label}</option>)}
          </select>
          <Button type="button" size="sm" variant="ghost" data-testid="tx-bulk-clear" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[34rem] text-sm" data-testid="tx-table">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-8 px-2 py-2"><input type="checkbox" className="size-4 accent-primary" aria-label="Select all" data-testid="tx-select-all" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((t) => t.id)))} /></th>
              {show('date') && <th className="px-2 py-2 font-medium">Date</th>}
              <th className="px-2 py-2 font-medium">Description</th>
              {show('category') && <th className="px-2 py-2 font-medium">Category</th>}
              {show('account') && <th className="hidden px-2 py-2 font-medium md:table-cell">Account</th>}
              {show('method') && <th className="px-2 py-2 font-medium">Method</th>}
              {show('counterparty') && <th className="px-2 py-2 font-medium">From / To</th>}
              {show('status') && <th className="px-2 py-2 font-medium">Status</th>}
              <th className="px-2 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {load.kind === 'loading' && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Loading...</td></tr>}
            {load.kind === 'ok' && rows.length === 0 && ledgerEmpty && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground" data-testid="tx-empty-ledger">
                <p>No transactions yet. Add one or run a sync.</p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button type="button" size="sm" variant="outline" data-testid="tx-empty-sync" disabled={syncing} onClick={() => void sync()}><RefreshCwIcon />Sync</Button>
                  <Button type="button" size="sm" data-testid="tx-empty-add" onClick={() => setAdding(true)}><PlusIcon />Add</Button>
                </div>
              </td></tr>
            )}
            {load.kind === 'ok' && rows.length === 0 && !ledgerEmpty && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground" data-testid="tx-empty">No transactions match.</td></tr>}
            {rows.map((t) => {
              const c = t.category_slug ? (cats[t.category_slug] ?? (t.category_name ? { name: t.category_name, color: t.category_color ?? '' } : undefined)) : undefined
              return (
                <tr key={t.id} data-testid="tx-row" data-id={t.id} data-status={t.status} data-pending={t.status === 'pending' ? 'true' : 'false'} data-selected={picked.has(t.id) ? 'true' : 'false'}
                  className={cn('cursor-pointer border-b last:border-0 hover:bg-accent/50', (t.status === 'excluded' || t.status === 'archived') && 'text-muted-foreground', t.status === 'pending' && 'bg-warn/5 shadow-[inset_2px_0_0_var(--warn)]', picked.has(t.id) && 'bg-accent/40')}
                  onClick={() => setOpenId(t.id)}>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="size-4 accent-primary" aria-label={'Select ' + t.name} data-testid="tx-select" checked={picked.has(t.id)} onChange={() => toggleRow(t.id)} /></td>
                  {show('date') && <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{t.date}</td>}
                  <td className="max-w-56 px-2 py-2"><div className="truncate font-medium" data-testid="tx-name">{t.name}</div>{t.attachment_count > 0 && <Muted>{t.attachment_count} file{t.attachment_count === 1 ? '' : 's'}</Muted>}{t.status === 'pending' && <Muted className="ml-2 text-warn" >{t.source === 'facturapi' ? 'awaiting payment complemento' : 'not settled yet'}</Muted>}{t.internal && <Muted className="ml-2">internal</Muted>}</td>
                  {show('category') && <td className="px-2 py-2" data-testid="tx-cat">{c ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: tokenColor(c.color) }} aria-hidden />{c.name}</span> : <Muted>{t.category_slug ?? 'Uncategorised'}</Muted>}</td>}
                  {show('account') && <td className="hidden px-2 py-2 text-xs md:table-cell">{accts[t.account_id ?? '']?.name ?? t.account_name ?? '-'}</td>}
                  {show('method') && <td className="px-2 py-2 text-xs">{t.method ?? '-'}</td>}
                  {show('counterparty') && <td className="px-2 py-2 text-xs">{t.counterparty_name ?? '-'}</td>}
                  {show('status') && <td className="px-2 py-2"><Chip label={TX_STATUS[t.status].label} tone={TX_STATUS[t.status].tone} testid="tx-status-chip" /></td>}
                  <td className={cn('whitespace-nowrap px-2 py-2 text-right font-mono', t.amount > 0 && 'text-ok')} data-testid="tx-amount-cell">{moneyOf(t.amount, t.currency)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {notConfigured && <p className="text-sm text-muted-foreground" data-testid="tx-connect">Connect Stripe and Facturapi to fill the ledger</p>}
      {next && <div className="flex justify-center"><Button type="button" variant="outline" size="sm" data-testid="tx-more" onClick={() => void loadMore()}>Load more</Button></div>}
      {open && <TransactionSheet tx={open} categories={categories} accounts={accounts} onClose={() => setOpenId(null)} onPatched={merge} />}
      {adding && <AddDialog categories={categories} accounts={accounts} onClose={() => setAdding(false)} onDone={() => { setAdding(false); setFlash('Transaction added.'); reload() }} />}
    </div>
  )
}
