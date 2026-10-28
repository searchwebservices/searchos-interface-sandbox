// The four optional details of a file (or of an upload batch): who it is for, a label, tags and notes. Shared by the
// inline upload form and the edit dialog on a file's menu, so both read the same.
import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export interface MetaDraft {
  assigned_to: string
  label: string
  tags: string
  notes: string
}
export const EMPTY_META: MetaDraft = { assigned_to: '', label: '', tags: '', notes: '' }
export interface Person {
  id: string
  name: string
}

const selectCls = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:coarse)]:h-11 dark:bg-input/30'

export function MetaFields({ value, onChange, people, testPrefix, focus }: { value: MetaDraft; onChange: (v: MetaDraft) => void; people: Person[]; testPrefix: string; focus?: keyof MetaDraft }) {
  const id = useId()
  const set = (k: keyof MetaDraft) => (v: string) => onChange({ ...value, [k]: v })
  const f = (k: keyof MetaDraft) => (el: HTMLElement | null) => {
    if (el && focus === k) queueMicrotask(() => el.focus())
  }
  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <label htmlFor={id + 'a'} className="text-xs font-medium text-muted-foreground">Assign to</label>
        <select id={id + 'a'} ref={f('assigned_to')} className={selectCls} value={value.assigned_to} onChange={(e) => set('assigned_to')(e.target.value)} data-testid={testPrefix + '-assign'}>
          <option value="">Nobody</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor={id + 'l'} className="text-xs font-medium text-muted-foreground">Label</label>
        <Input id={id + 'l'} ref={f('label')} maxLength={120} placeholder="A short name for what this is" value={value.label} onChange={(e) => set('label')(e.target.value)} data-testid={testPrefix + '-label'} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={id + 't'} className="text-xs font-medium text-muted-foreground">Tags</label>
        <Input id={id + 't'} ref={f('tags')} placeholder="Comma separated" value={value.tags} onChange={(e) => set('tags')(e.target.value)} data-testid={testPrefix + '-tags'} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={id + 'n'} className="text-xs font-medium text-muted-foreground">Notes</label>
        <Textarea id={id + 'n'} ref={f('notes')} maxLength={2000} rows={3} value={value.notes} onChange={(e) => set('notes')(e.target.value)} data-testid={testPrefix + '-notes'} />
      </div>
    </div>
  )
}
