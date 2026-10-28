// The upload queue: one row per file with real XHR progress, the pipeline state once the bytes land, and Retry on failed.
import { CheckIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { fmtSize } from '@/lib/library'
import type { QueueItem } from '@/lib/library'
import { cn } from '@/lib/utils'

function stateText(q: QueueItem): string {
  switch (q.state) {
    case 'queued':
      return 'Waiting'
    case 'uploading':
      return q.progress + '%'
    case 'processing':
      return q.status ? 'Uploaded, ' + q.status : 'Uploaded'
    case 'done':
      return q.status ?? 'Done'
    case 'failed':
    case 'refused':
      return q.error ?? 'Failed'
  }
}

export function UploadQueue({ items, onRetry, onRemove, onClear, headingLevel = 'h2' }: { items: QueueItem[]; onRetry: (key: string) => void; onRemove: (key: string) => void; onClear: () => void; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  if (!items.length) return null
  return (
    <section className="flex flex-col gap-1" data-testid="upload-queue" aria-label="Upload queue">
      <div className="flex items-center gap-2">
        <Heading className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Upload queue</Heading>
        <Button type="button" size="xs" variant="ghost" className="ml-auto [@media(pointer:coarse)]:h-11" onClick={onClear}>
          Clear finished
        </Button>
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {items.map((q) => (
          <li key={q.key} className="flex flex-col gap-1 px-3 py-2" data-testid="queue-row" data-state={q.state}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="min-w-0 flex-1 basis-40 break-words font-medium [overflow-wrap:anywhere]" title={q.folder ? q.folder + '/' + q.name : q.name}>
                {q.folder ? <span className="text-muted-foreground">{q.folder}/</span> : null}
                {q.name}
                {q.versionOf ? <span className="ml-1 text-xs text-muted-foreground">(new version)</span> : null}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{fmtSize(q.size)}</span>
              <span className={cn('min-w-16 text-xs', (q.state === 'failed' || q.state === 'refused') && 'text-destructive', q.state === 'done' && 'text-ok')} data-testid="queue-state" aria-live="polite">
                {q.state === 'done' && <CheckIcon className="mr-1 inline size-3" />}
                {stateText(q)}
              </span>
              {q.state === 'failed' && (
                <Button type="button" size="xs" variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => onRetry(q.key)}>
                  <RotateCcwIcon />
                  Retry
                </Button>
              )}
              {(q.state === 'failed' || q.state === 'refused' || q.state === 'done') && (
                <Button type="button" size="icon-xs" variant="ghost" className="[@media(pointer:coarse)]:size-11" aria-label={'Remove ' + q.name} onClick={() => onRemove(q.key)}>
                  <XIcon />
                </Button>
              )}
            </div>
            {(q.state === 'uploading' || q.state === 'queued') && <Progress value={q.progress} aria-label={'Uploading ' + q.name} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
