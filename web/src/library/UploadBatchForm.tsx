// The optional form for one upload batch: assign to a person, label, tags and notes. It appears right after files are
// picked, before they upload, and Skip uploads them with no details. Everything entered lands on every file of the batch
// and stays editable later from the file's menu.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { parseTagInput } from '@/lib/library'
import type { BatchMeta } from '@/lib/library'
import { EMPTY_META, MetaFields } from './MetaFields'
import type { MetaDraft, Person } from './MetaFields'

export function toBatchMeta(d: MetaDraft): BatchMeta | undefined {
  const meta: BatchMeta = {}
  if (d.assigned_to) meta.assigned_to = d.assigned_to
  if (d.label.trim()) meta.label = d.label.trim()
  const tags = parseTagInput(d.tags)
  if (tags.length) meta.tags = tags
  if (d.notes.trim()) meta.notes = d.notes.trim()
  return Object.keys(meta).length ? meta : undefined
}

export function UploadBatchForm({ count, folder, people, defaultTags = '', onSubmit, onSkip, onCancel }: { count: number; folder?: string; people: Person[]; defaultTags?: string; onSubmit: (meta: BatchMeta | undefined) => void; onSkip: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<MetaDraft>({ ...EMPTY_META, tags: defaultTags })
  const what = count === 1 ? '1 file' : count + ' files'
  return (
    <form
      className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3"
      aria-label="Upload details"
      data-testid="batch-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(toBatchMeta(draft))
      }}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{what} ready{folder ? ' for ' + folder : ''}</p>
        <p className="text-xs text-muted-foreground">Add details if they help. All of it is optional, and you can edit it later from the file's menu.</p>
      </div>
      <MetaFields value={draft} onChange={setDraft} people={people} testPrefix="batch" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="[@media(pointer:coarse)]:h-11" data-testid="batch-submit">Upload {what}</Button>
        <Button type="button" size="sm" variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={onSkip} data-testid="batch-skip">Skip details</Button>
        <Button type="button" size="sm" variant="ghost" className="[@media(pointer:coarse)]:h-11" onClick={onCancel} data-testid="batch-cancel">Cancel</Button>
      </div>
    </form>
  )
}
