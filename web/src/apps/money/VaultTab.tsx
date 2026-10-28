// Vault: every attachment across transactions and the inbox, as a grid. Filter by kind, search by name, preview in a
// dialog, download through the file route. The contract has no attachments list route, so the tab reads the ledger rows
// that carry attachments and fetches each one's detail (capped), then adds the inbox files.
import { useEffect, useMemo, useState } from 'react'
import { DownloadIcon, FileIcon, FileTextIcon, SearchIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EmptyState } from '../useAppApi'
import type { ApiState } from '../useAppApi'
import { fileUrl, inboxFileUrl, ledgerApi } from './api'
import { addDays, bytes, kindOfMime, vaultFromAttachment, vaultFromInbox } from './ledger'
import type { VaultFile, VaultKind } from './ledger'
import { todayMz } from './money'
import { FileViewer, Muted, useLoad } from './parts'

export const VAULT_CAP = 60
const KINDS: { id: VaultKind; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'image', label: 'Images' }, { id: 'pdf', label: 'PDFs' }, { id: 'other', label: 'Other' }]

async function loadVault(): Promise<{ ok: boolean; status: number; body: VaultFile[] }> {
  const today = todayMz()
  const [led, inbox] = await Promise.all([ledgerApi.list({ from: addDays(today, -365), to: today }), ledgerApi.inbox()])
  if (!led.ok) return { ok: false, status: led.status, body: [] }
  const withFiles = (Array.isArray(led.body?.rows) ? led.body.rows : []).filter((t) => t.attachment_count > 0).slice(0, VAULT_CAP)
  const details = await Promise.all(withFiles.map((t) => ledgerApi.get(t.id)))
  const files: VaultFile[] = []
  details.forEach((d, i) => { if (d.ok && Array.isArray(d.body?.attachments)) d.body.attachments.forEach((a) => files.push(vaultFromAttachment(a, withFiles[i]))) })
  // A matched receipt already shows up as the transaction's own attachment (same object), so only unmatched inbox files are added.
  if (inbox.ok && Array.isArray(inbox.body?.rows)) inbox.body.rows.filter((r) => r.status !== 'matched').forEach((r) => files.push(vaultFromInbox(r)))
  return { ok: true, status: 200, body: files.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) }
}

const srcOf = (f: VaultFile): string => (f.origin === 'inbox' ? inboxFileUrl(f.id) : fileUrl(f.id))

function Card({ f, onOpen }: { f: VaultFile; onOpen: () => void }) {
  const kind = kindOfMime(f.mime)
  const I = kind === 'pdf' ? FileTextIcon : FileIcon
  return (
    <li className="min-w-0 overflow-hidden rounded-lg border bg-card" data-testid="vault-item" data-id={f.id} data-kind={kind} data-origin={f.origin}>
      <button type="button" aria-label={'Preview ' + f.name} data-testid="vault-open" onClick={onOpen} className="flex h-28 w-full items-center justify-center overflow-hidden bg-secondary/40 hover:bg-secondary/70">
        {kind === 'image' ? <img src={srcOf(f)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <I className="size-8 text-muted-foreground" aria-hidden />}
      </button>
      <div className="grid gap-0.5 p-2">
        <span className="truncate text-sm font-medium" title={f.name}>{f.name}</span>
        <Muted className="truncate">{f.origin === 'inbox' ? 'Inbox' : 'Transaction'}: {f.origin_label}</Muted>
        <div className="flex items-center gap-2"><Muted className="flex-1">{bytes(f.size)}, {f.created_at.slice(0, 10)}</Muted>
          <a href={srcOf(f)} download={f.name} aria-label={'Download ' + f.name} data-testid="vault-download" className="text-primary hover:underline"><DownloadIcon className="size-3.5" /></a>
        </div>
      </div>
    </li>
  )
}

export function VaultTab({ onSelect }: { onSelect: (s: string) => void }) {
  const { state, reload } = useLoad(loadVault, [])
  const [kind, setKind] = useState<VaultKind>('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const files = state.kind === 'ok' ? state.data : []
  const shown = useMemo(() => files.filter((f) => (kind === 'all' || kindOfMime(f.mime) === kind) && (!q.trim() || (f.name + ' ' + f.origin_label).toLowerCase().includes(q.trim().toLowerCase()))), [files, kind, q])
  const open = files.find((f) => f.id === openId) ?? null
  useEffect(() => { onSelect('Vault, ' + (kind === 'all' ? 'all files' : kind + ' files') + (open ? ', open: ' + open.name : '')) }, [kind, open, onSelect])
  if (state.kind !== 'ok' && state.kind !== 'loading') return <EmptyState state={state as ApiState<unknown>} onRetry={reload} />
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="vault-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search vault" data-testid="vault-search" placeholder="Search files" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div role="tablist" aria-label="File kind" className="flex gap-1" data-testid="vault-kinds">
          {KINDS.map((k) => <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} data-testid={'vault-kind-' + k.id} onClick={() => setKind(k.id)} className={cn('rounded-md px-2.5 py-1 text-sm', kind === k.id ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground')}>{k.label}</button>)}
        </div>
        <Muted>{shown.length} of {files.length}</Muted>
      </div>
      {state.kind === 'loading' ? <p className="text-sm text-muted-foreground">Loading...</p> : shown.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground" data-testid="vault-empty">No files match.</p> : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="vault-grid">
          {shown.map((f) => <Card key={f.origin + f.id} f={f} onOpen={() => setOpenId(f.id)} />)}
        </ul>
      )}
      {open && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpenId(null) }}>
          <DialogContent className="sm:max-w-2xl" data-testid="vault-dialog">
            <DialogHeader><DialogTitle className="truncate pr-6">{open.name}</DialogTitle><DialogDescription>{open.origin === 'inbox' ? 'Inbox' : 'Transaction'}: {open.origin_label}</DialogDescription></DialogHeader>
            <FileViewer src={srcOf(open)} name={open.name} mime={open.mime} size={open.size} testid="vault-viewer" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
