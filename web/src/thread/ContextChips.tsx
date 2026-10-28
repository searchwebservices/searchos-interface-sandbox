// The context chips under the composer text: files and folders from Lane files the message will point at. A chip is
// not an upload: it has a link icon, the name and its path in Lane files, and no progress, size or editor.
import { LinkIcon, XIcon } from 'lucide-react'
import type { ContextAttachment } from '@/lib/types'
import { cn } from '@/lib/utils'

export const pathOf = (c: ContextAttachment): string => c.path ?? (c.kind === 'folder' ? c.ref : c.name)

export function ContextChips({ items, onRemove }: { items: ContextAttachment[]; onRemove: (c: ContextAttachment) => void }) {
  if (!items.length) return null
  return (
    <ul className="flex w-full min-w-0 flex-wrap gap-1.5 px-3 pt-3" aria-label="Files this message is about" data-testid="context-bar">
      {items.map((c) => (
        <li
          key={c.kind + ':' + c.ref}
          className={cn('inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-dashed bg-secondary py-1 pr-1 pl-2 text-xs text-secondary-foreground')}
          data-testid="context-chip"
          data-kind={c.kind}
          title={'Linked, not uploaded: ' + pathOf(c)}
        >
          <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate font-medium" data-testid="context-name">{c.name}</span>
          <span className="hidden min-w-0 max-w-40 truncate font-mono text-[0.6875rem] text-muted-foreground sm:inline" data-testid="context-path">{pathOf(c)}</span>
          <button type="button" aria-label={'Remove ' + c.name} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:p-2.5" onClick={() => onRemove(c)} data-testid="context-remove">
            <XIcon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}
