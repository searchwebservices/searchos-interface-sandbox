// The transaction sheet (Midday's transaction-sheet): details, category, note, internal toggle, attachments with upload and
// preview, exclude or archive. Every control writes straight through PATCH; the parent merges the result into its rows.
import { useEffect, useState } from 'react'
import { EyeIcon, PaperclipIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { fileUrl, ledgerApi } from './api'
import type { Account, Attachment, Category, Transaction, TransactionDetail, TxPatch } from './api'
import { TX_STATUS, bytes } from './ledger'
import { moneyOf } from './money'
import { CategoryOptions, Chip, DropZone, FIELD, FileViewer, Muted, useLoad, dataOf } from './parts'

const ERR = (s: number) => (s === 403 ? 'Admins only.' : s === 503 ? 'The database is not reachable right now.' : 'Could not save (' + (s || 'network') + ').')

export function TransactionSheet({ tx, categories, accounts, onClose, onPatched }: { tx: Transaction; categories: Category[]; accounts: Account[]; onClose: () => void; onPatched: (id: string, p: Partial<Transaction>) => void }) {
  const detail = useLoad<TransactionDetail>(() => ledgerApi.get(tx.id), [tx.id])
  const [extra, setExtra] = useState<Attachment[]>([])
  const [note, setNote] = useState(tx.note ?? '')
  const [preview, setPreview] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setNote(tx.note ?? ''); setExtra([]); setPreview(null); setErr('') }, [tx.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const d = dataOf(detail.state)
  const fetched = d && Array.isArray(d.attachments) ? d.attachments : []
  const attachments = [...fetched, ...extra.filter((e) => !fetched.some((f) => f.id === e.id))]
  const shown = attachments.find((a) => a.id === preview)
  const acct = accounts.find((a) => a.id === tx.account_id)

  const patch = async (p: TxPatch) => {
    setErr('')
    const r = await ledgerApi.patch(tx.id, p)
    if (!r.ok) { setErr(ERR(r.status)); return false }
    onPatched(tx.id, p as Partial<Transaction>)
    return true
  }
  const upload = async (files: File[]) => {
    setBusy(true); setErr('')
    for (const f of files) {
      const r = await ledgerApi.upload(tx.id, f)
      if (r.ok && r.body?.id) { setExtra((x) => [...x, r.body]); onPatched(tx.id, { attachment_count: attachments.length + 1 }) } else setErr(r.status === 413 ? 'That file is too large.' : ERR(r.status))
    }
    setBusy(false)
  }
  const st = TX_STATUS[tx.status]
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="tx-sheet" data-id={tx.id}>
        <SheetHeader>
          <SheetTitle className="truncate pr-6">{tx.name}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <span className={cn('font-mono text-base font-semibold', tx.amount > 0 ? 'text-ok' : 'text-foreground')} data-testid="tx-amount">{moneyOf(tx.amount, tx.currency)}</span>
            <Chip label={st.label} tone={st.tone} testid="tx-status" />
            {tx.status === 'pending' && tx.source === 'facturapi' && <Muted>PPD, waiting for the payment complemento</Muted>}
            <Muted>{tx.date}</Muted>
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="tx-facts">
            <div><Muted>Account</Muted><dd>{acct?.name ?? tx.account_name ?? tx.account_id ?? '-'}</dd></div>
            <div><Muted>Method</Muted><dd>{tx.method ?? '-'}</dd></div>
            <div><Muted>From / To</Muted><dd>{tx.counterparty_name ?? '-'}</dd></div>
            <div><Muted>Source</Muted><dd>{tx.source}{tx.source_id ? ' ' + tx.source_id : ''}</dd></div>
          </dl>
          <label className="grid gap-1 text-xs text-muted-foreground">Category
            <select aria-label="Category" data-testid="tx-category" className={FIELD} value={tx.category_slug ?? ''} onChange={(e) => void patch({ category_slug: e.target.value || null })}>
              <option value="">Uncategorised</option>
              <CategoryOptions categories={categories} />
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Note
            <textarea aria-label="Note" data-testid="tx-note" rows={3} className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== (tx.note ?? '')) void patch({ note: note || null }) }} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-primary" aria-label="Internal transfer" data-testid="tx-internal" checked={tx.internal} onChange={(e) => void patch({ internal: e.target.checked })} />
            <span>Internal transfer <Muted>(between our own accounts, left out of totals)</Muted></span>
          </label>
          <div className="flex flex-wrap gap-2">
            {tx.status === 'excluded' || tx.status === 'archived'
              ? <Button type="button" size="sm" variant="outline" data-testid="tx-restore" onClick={() => void patch({ status: 'posted' })}>{tx.status === 'excluded' ? 'Include again' : 'Unarchive'}</Button>
              : (<>
                <Button type="button" size="sm" variant="outline" data-testid="tx-exclude" onClick={() => void patch({ status: 'excluded' })}>Exclude</Button>
                <Button type="button" size="sm" variant="outline" data-testid="tx-archive" onClick={() => void patch({ status: 'archived' })}>Archive</Button>
              </>)}
          </div>
          <section className="grid gap-2" data-testid="tx-attachments">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><PaperclipIcon className="size-3.5" aria-hidden />Attachments <Muted>{attachments.length}</Muted></h3>
            {detail.state.kind === 'loading' && <Muted>Loading...</Muted>}
            {attachments.length > 0 && (
              <ul className="divide-y rounded-md border">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-2 py-1.5" data-testid="tx-attachment" data-id={a.id}>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <Muted>{bytes(a.size)}</Muted>
                    <Button type="button" size="icon-xs" variant="ghost" aria-label={'Preview ' + a.name} data-testid="tx-attachment-preview" onClick={() => setPreview(preview === a.id ? null : a.id)}><EyeIcon /></Button>
                  </li>
                ))}
              </ul>
            )}
            {shown && <FileViewer src={fileUrl(shown.id)} name={shown.name} mime={shown.mime} size={shown.size} testid="tx-viewer" />}
            <DropZone label="Drop a receipt or invoice" onFiles={(f) => void upload(f)} busy={busy} testid="tx-dropzone" compact />
          </section>
          {err && <p className="text-sm text-destructive" role="alert" data-testid="tx-error">{err}</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
