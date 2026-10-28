// Dialogs behind the file menu: edit details (Label, Assign, Notes all land here, with the asked field focused) and
// Move to (a folder list for the lane). Both are plain controlled dialogs; the page decides what saving does.
import { useEffect, useState } from 'react'
import { FolderIcon, HomeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parseTagInput } from '@/lib/library'
import type { LibraryPatch } from '@/lib/api'
import type { LibraryRow } from '@/lib/library'
import { cn } from '@/lib/utils'
import { MetaFields } from './MetaFields'
import type { MetaDraft, Person } from './MetaFields'

export const draftOf = (r: LibraryRow): MetaDraft => ({ assigned_to: r.assigned_to ?? '', label: r.label ?? '', tags: (r.tags ?? []).join(', '), notes: r.notes ?? '' })

export function DetailsDialog({ rows, focus, people, onClose, onSave }: { rows: LibraryRow[]; focus?: keyof MetaDraft; people: Person[]; onClose: () => void; onSave: (patch: LibraryPatch) => void }) {
  const [draft, setDraft] = useState<MetaDraft>(() => (rows.length === 1 ? draftOf(rows[0]) : { assigned_to: '', label: '', tags: '', notes: '' }))
  useEffect(() => setDraft(rows.length === 1 ? draftOf(rows[0]) : { assigned_to: '', label: '', tags: '', notes: '' }), [rows])
  const many = rows.length > 1
  return (
    <Dialog open={rows.length > 0} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="details-dialog">
        <DialogHeader>
          <DialogTitle className="break-words">{many ? rows.length + ' files' : (rows[0]?.name ?? '')}</DialogTitle>
          <DialogDescription>{many ? 'Only the fields you fill in change, on every selected file.' : 'Label, who it is for, tags and notes.'}</DialogDescription>
        </DialogHeader>
        <MetaFields value={draft} onChange={setDraft} people={people} testPrefix="details" focus={focus} />
        <DialogFooter>
          <Button
            type="button"
            data-testid="details-save"
            onClick={() => {
              const p: LibraryPatch = {}
              if (!many || draft.assigned_to) p.assigned_to = draft.assigned_to || null
              if (!many || draft.label.trim()) p.label = draft.label.trim() || null
              if (!many || draft.tags.trim()) p.tags = parseTagInput(draft.tags)
              if (!many || draft.notes.trim()) p.notes = draft.notes.trim() || null
              onSave(p)
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MoveDialog({ open, names, folders, current, onClose, onPick }: { open: boolean; names: string; folders: string[]; current: string; onClose: () => void; onPick: (folder: string) => void }) {
  const [sel, setSel] = useState(current)
  useEffect(() => setSel(current), [current, open])
  const all = ['', ...folders]
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="move-dialog">
        <DialogHeader>
          <DialogTitle className="break-words">Move {names}</DialogTitle>
          <DialogDescription>Pick the folder it goes into.</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label="Folders">
          {all.map((f) => (
            <li key={f || 'root'} role="option" aria-selected={sel === f}>
              <button type="button" className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50', sel === f && 'bg-accent font-medium')} style={{ paddingLeft: 8 + (f ? f.split('/').length : 0) * 14 }} onClick={() => setSel(f)} data-testid="move-target" data-folder={f}>
                {f ? <FolderIcon className="size-4 shrink-0 text-muted-foreground" /> : <HomeIcon className="size-4 shrink-0 text-muted-foreground" />}
                <span className="[overflow-wrap:anywhere]">{f ? f.split('/').pop() : 'Uploads'}</span>
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" onClick={() => onPick(sel)} data-testid="move-confirm">Move here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
