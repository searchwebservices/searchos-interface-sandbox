// The chips under the composer text: AI Elements Attachment parts (an image thumb or a type icon, the name, a remove
// button) plus the upload state of each. Clicking a chip opens the editor.
import { AlertCircleIcon, CheckIcon } from 'lucide-react'
import { Attachment, AttachmentInfo, AttachmentPreview, AttachmentRemove, Attachments } from '@/components/ai-elements/attachments'
import { Progress } from '@/components/ui/progress'
import { fmtSize } from '@/lib/library'
import { cn } from '@/lib/utils'
import type { Att } from './useAttachments'

export function AttachmentChips({ items, busy, batch, onOpen, onRemove }: { items: Att[]; busy: boolean; batch: { pct: number; count: number; index: number }; onOpen: (a: Att) => void; onRemove: (key: string) => void }) {
  if (!items.length) return null
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 px-3 pt-3" data-testid="attach-bar">
      <Attachments variant="inline" className="w-full">
        {items.map((a) => (
          <Attachment
            key={a.key}
            data={{ type: 'file', id: a.key, url: a.previewUrl ?? '', mediaType: a.file.type || 'application/octet-stream', filename: a.file.name }}
            onRemove={a.state === 'uploading' ? undefined : () => onRemove(a.key)}
            role="button"
            tabIndex={0}
            aria-label={'Edit ' + a.file.name}
            title={a.error ?? a.file.name + ', ' + fmtSize(a.file.size)}
            data-testid="attach-chip"
            data-state={a.state}
            className={cn('max-w-full', a.state === 'error' && 'border-destructive text-destructive')}
            onClick={() => a.state !== 'uploading' && onOpen(a)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && a.state !== 'uploading') {
                e.preventDefault()
                onOpen(a)
              }
            }}
          >
            <AttachmentPreview />
            <AttachmentInfo className="max-w-48" />
            <span className="whitespace-nowrap font-mono text-[0.6875rem] text-muted-foreground" data-testid="attach-meta">
              {a.state === 'uploading' ? Math.round(a.progress) + '%' : a.state === 'done' ? '' : fmtSize(a.file.size)}
            </span>
            {a.state === 'done' && <CheckIcon className="size-3.5 text-ok" aria-label="Uploaded" />}
            {a.state === 'error' && <AlertCircleIcon className="size-3.5" aria-label={a.error ?? 'Failed'} />}
            <AttachmentRemove label={'Remove ' + a.file.name} className="opacity-100 [@media(pointer:coarse)]:size-8" />
          </Attachment>
        ))}
      </Attachments>
      {items.some((a) => a.state === 'error') && (
        <p role="alert" className="text-xs text-destructive" data-testid="attach-error">
          {items.find((a) => a.state === 'error')?.error}
        </p>
      )}
      {busy && (
        <div className="flex items-center gap-2" data-testid="attach-batch">
          <Progress value={batch.pct} className="h-1.5 flex-1" aria-label="Upload progress" />
          <span className="whitespace-nowrap font-mono text-[0.6875rem] text-muted-foreground" data-testid="attach-batch-label">
            {batch.index} of {batch.count}, {Math.round(batch.pct)}%
          </span>
        </div>
      )}
    </div>
  )
}
