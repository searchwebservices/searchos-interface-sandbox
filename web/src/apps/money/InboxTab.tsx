// Inbox: receipts. Upload drop zone, list with status, the viewer, match to a transaction with suggestions by amount and
// date (plus a search for the rest), archive. Midday's inbox-view / suggested-match / match-transaction, on our routes.
import { useEffect, useMemo, useState } from 'react'
import { ArchiveIcon, CheckIcon, FileIcon, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EmptyState } from '../useAppApi'
import { inboxFileUrl, ledgerApi } from './api'
import type { InboxItem, InboxStatus, Transaction } from './api'
import { INBOX_STATUS, addDays, kindOfMime, suggestMatches } from './ledger'
import { moneyOf, todayMz } from './money'
import { Chip, DropZone, FileViewer, Muted, dataOf, useLoad } from './parts'

type Tab = 'all' | InboxStatus
const TABS: { id: Tab; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'new', label: 'New' }, { id: 'matched', label: 'Matched' }, { id: 'archived', label: 'Archived' }]

function MatchPanel({ item, onMatched }: { item: InboxItem; onMatched: (tx: Transaction) => void }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const from = item.date ? addDays(item.date, -14) : addDays(todayMz(), -90)
  const to = item.date ? addDays(item.date, 14) : todayMz()
  const near = useLoad(() => ledgerApi.list({ from, to }), [item.id, from, to])
  const found = useLoad(() => (q.trim() ? ledgerApi.list({ q: q.trim(), from: addDays(todayMz(), -365), to: todayMz() }) : Promise.resolve({ ok: true, status: 200, body: { rows: [], next_cursor: null, totals: { count: 0, by_currency: {} } } })), [q])
  const nearRows = dataOf(near.state)?.rows
  const suggestions = useMemo(() => suggestMatches(item, Array.isArray(nearRows) ? nearRows : []), [item, nearRows])
  const searched = q.trim() ? (dataOf(found.state)?.rows ?? []).slice(0, 8) : []
  const match = async (tx: Transaction) => {
    setErr('')
    const r = await ledgerApi.inboxPatch(item.id, { transaction_id: tx.id })
    if (r.ok) onMatched(tx); else setErr(r.status === 409 ? 'That transaction already has a receipt.' : 'Could not match (' + (r.status || 'network') + ').')
  }
  const line = (tx: Transaction, hint?: string) => (
    <li key={tx.id} className="flex items-center gap-2 py-1.5" data-testid="match-candidate" data-id={tx.id}>
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{tx.name}</span><Muted>{tx.date}{hint ? ', ' + hint : ''}</Muted></span>
      <span className="font-mono text-xs">{moneyOf(tx.amount, tx.currency)}</span>
      <Button type="button" size="xs" variant="outline" data-testid="match-confirm" onClick={() => void match(tx)}><CheckIcon />Match</Button>
    </li>
  )
  return (
    <section className="grid gap-2" data-testid="match-panel">
      <h3 className="text-sm font-semibold">Match to a transaction</h3>
      {near.state.kind === 'loading' ? <Muted>Looking for matches...</Muted> : suggestions.length === 0 ? <p className="text-xs text-muted-foreground" data-testid="match-none">No close matches by amount and date.</p> : (
        <ul className="divide-y rounded-md border px-2" data-testid="match-suggestions">{suggestions.map((s) => line(s.tx, s.reasons.join(', ')))}</ul>
      )}
      <Input aria-label="Search transactions to match" data-testid="match-search" placeholder="Search all transactions" value={q} onChange={(e) => setQ(e.target.value)} />
      {searched.length > 0 && <ul className="divide-y rounded-md border px-2" data-testid="match-results">{searched.map((tx) => line(tx))}</ul>}
      {err && <p className="text-sm text-destructive" role="alert" data-testid="match-error">{err}</p>}
    </section>
  )
}

export function InboxTab({ onSelect }: { onSelect: (s: string) => void }) {
  const [tab, setTab] = useState<Tab>('all')
  const { state, reload } = useLoad(() => ledgerApi.inbox(tab === 'all' ? undefined : tab), [tab])
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [err, setErr] = useState('')
  const rows = dataOf(state)?.rows
  const items = Array.isArray(rows) ? rows : []
  const open = items.find((i) => i.id === openId) ?? null
  const linked = useLoad(() => (open?.transaction_id ? ledgerApi.get(open.transaction_id) : Promise.resolve({ ok: true, status: 200, body: null as never })), [open?.transaction_id])
  useEffect(() => { onSelect('Inbox, ' + tab + (open ? ', open: ' + open.name + ' (' + open.status + ')' : '')) }, [tab, open, onSelect])

  const upload = async (files: File[]) => {
    setBusy(true); setErr('')
    let ok = 0
    for (const f of files) { const r = await ledgerApi.inboxUpload(f); if (r.ok) ok += 1; else setErr(r.status === 413 ? 'A file was too large.' : 'Could not upload ' + f.name + ' (' + (r.status || 'network') + ').') }
    setBusy(false)
    if (ok) { setFlash('Uploaded ' + ok + (ok === 1 ? ' file.' : ' files.')); reload() }
  }
  const archive = async (i: InboxItem, restore = false) => {
    const r = await ledgerApi.inboxPatch(i.id, restore ? { status: 'new' } : { status: 'archived' })
    if (r.ok) { setFlash(restore ? 'Restored.' : 'Archived.'); reload() } else setErr('Could not update (' + (r.status || 'network') + ').')
  }

  if (state.kind !== 'ok' && state.kind !== 'loading') return <EmptyState state={state} onRetry={reload} />
  const tx = dataOf(linked.state)
  return (
    <div className="grid min-w-0 gap-3 p-3 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" data-testid="inbox-tab">
      <div className="flex min-w-0 flex-col gap-3">
        <DropZone label="Drop receipts here" onFiles={(f) => void upload(f)} busy={busy} testid="inbox-dropzone" />
        <div role="tablist" aria-label="Inbox filter" className="flex gap-1" data-testid="inbox-tabs">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-testid={'inbox-tab-' + t.id} onClick={() => { setTab(t.id); setOpenId(null) }} className={cn('rounded-md px-2.5 py-1 text-sm', tab === t.id ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground')}>{t.label}</button>)}
        </div>
        {flash && <p className="text-sm text-ok" role="status" data-testid="inbox-flash">{flash}</p>}
        {err && <p className="text-sm text-destructive" role="alert" data-testid="inbox-error">{err}</p>}
        {state.kind === 'loading' ? <p className="text-sm text-muted-foreground">Loading...</p> : items.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="inbox-empty">Nothing here. Drop a receipt above.</p> : (
          <ul className="divide-y rounded-lg border bg-card" data-testid="inbox-list">
            {items.map((i) => {
              const I = kindOfMime(i.mime) === 'image' ? ImageIcon : FileIcon
              return (
                <li key={i.id}>
                  <button type="button" data-testid="inbox-row" data-id={i.id} data-status={i.status} aria-current={openId === i.id} onClick={() => setOpenId(i.id)} className={cn('flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-accent/50', openId === i.id && 'bg-accent/60')}>
                    <I className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.counterparty_name ?? i.name}</span><Muted>{i.date ?? 'no date'}{i.counterparty_name ? ', ' + i.name : ''}</Muted></span>
                    <span className="font-mono text-xs">{i.amount != null ? moneyOf(i.amount, i.currency ?? 'MXN') : '-'}</span>
                    <Chip label={INBOX_STATUS[i.status].label} tone={INBOX_STATUS[i.status].tone} testid="inbox-status" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="min-w-0" data-testid="inbox-detail">
        {!open ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Pick a receipt to see it.</p> : (
          <div className="grid gap-3 rounded-lg border bg-card p-3">
            <FileViewer src={inboxFileUrl(open.id)} name={open.name} mime={open.mime} size={open.size} testid="inbox-viewer" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-4">
              <div><Muted>Amount</Muted><dd>{open.amount != null ? moneyOf(open.amount, open.currency ?? 'MXN') : '-'}</dd></div>
              <div><Muted>Date</Muted><dd>{open.date ?? '-'}</dd></div>
              <div><Muted>From</Muted><dd>{open.counterparty_name ?? '-'}</dd></div>
              <div><Muted>Source</Muted><dd>{open.source}</dd></div>
            </dl>
            {open.status === 'matched' && <p className="text-sm" data-testid="inbox-matched">Matched to <span className="font-medium">{tx?.name ?? open.transaction_id}</span>{tx ? <Muted className="ml-2">{tx.date}, {moneyOf(tx.amount, tx.currency)}</Muted> : null}</p>}
            {open.status === 'new' && <MatchPanel item={open} onMatched={(t) => { setFlash('Matched to ' + t.name + '.'); reload() }} />}
            <div className="flex gap-2">
              {open.status === 'archived'
                ? <Button type="button" size="sm" variant="outline" data-testid="inbox-restore" onClick={() => void archive(open, true)}>Restore</Button>
                : <Button type="button" size="sm" variant="outline" data-testid="inbox-archive" onClick={() => void archive(open)}><ArchiveIcon />Archive</Button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
