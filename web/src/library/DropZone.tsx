// The Library drop zone: files, folders (drag a folder, or the folder picker) and paste. Everything it accepts goes
// to onPick as { file, folder } pairs; the queue decides when to upload.
import { useRef, useState } from 'react'
import { FolderUpIcon, UploadCloudIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { collectFromPaste, collectFromTransfer, relFolder } from '@/lib/library'
import type { Picked } from '@/lib/library'
import { useAgentName } from '@/lib/agent'

export function DropZone({ onPick, disabled }: { onPick: (picked: Picked[]) => void; disabled?: boolean }) {
  const agent = useAgentName()
  const [over, setOver] = useState(false)
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const take = (p: Picked[]) => {
    if (p.length && !disabled) onPick(p)
  }
  return (
    <div
      data-testid="drop-zone"
      tabIndex={0}
      role="group"
      aria-label="Drop files here, or paste"
      className={cn('flex min-w-0 flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-5 text-center text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50', over ? 'border-primary bg-muted' : 'bg-card', disabled && 'opacity-60')}
      onDragEnter={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void collectFromTransfer(e.dataTransfer).then(take)
      }}
      onPaste={(e) => {
        const p = collectFromPaste(e.clipboardData)
        if (p.length) {
          e.preventDefault()
          take(p)
        }
      }}
    >
      <UploadCloudIcon className="size-6 text-muted-foreground" />
      <p className="font-medium">Drop files or a folder here, or click in and paste</p>
      <p className="text-xs text-muted-foreground">Uploading stores a file. It changes nothing about {agent} until you index it into recall.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" size="sm" variant="outline" className="[@media(pointer:coarse)]:h-11" disabled={disabled} onClick={() => filesRef.current?.click()}>
          <UploadCloudIcon />
          Choose files
        </Button>
        <Button type="button" size="sm" variant="outline" className="[@media(pointer:coarse)]:h-11" disabled={disabled} onClick={() => folderRef.current?.click()}>
          <FolderUpIcon />
          Choose a folder
        </Button>
      </div>
      <input
        ref={filesRef}
        type="file"
        multiple
        hidden
        data-testid="drop-input"
        onChange={(e) => {
          take(Array.from(e.target.files ?? []).map((file) => ({ file, folder: '' })))
          e.target.value = ''
        }}
      />
      <input
        ref={folderRef}
        type="file"
        multiple
        hidden
        data-testid="drop-folder-input"
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={(e) => {
          take(Array.from(e.target.files ?? []).map((file) => ({ file, folder: relFolder(file) })))
          e.target.value = ''
        }}
      />
    </div>
  )
}
