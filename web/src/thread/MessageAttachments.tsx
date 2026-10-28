// The files a message carries, as the same tiles the Library and Lane files use (cached thumbnails, never the file),
// and the viewer they open in.
import { useContext, useState } from 'react'
import { FolderIcon, LinkIcon } from 'lucide-react'
import { DockContext } from '@/dock/context'
import { FileViewer, useLibraryFile } from '@/cards/FileViewer'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FileTile, fromAttachment } from '@/library/FileTile'
import { uploadsPrefix } from '@/lib/filetree'
import { isContext } from '@/lib/types'
import type { Attachment, ContextAttachment, MessageAttachment } from '@/lib/types'
import { fileKind } from '@/library/FileTile'
import { pathOf } from './ContextChips'

function AttachmentViewer({ a, lane, onClose }: { a: Attachment; lane: string; onClose: () => void }) {
  const { pv, row } = useLibraryFile(a.id)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[85vh] w-[min(96vw,1100px)] max-w-none grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none max-md:top-0! max-md:bottom-auto! max-md:h-dvh! max-md:max-h-dvh! max-md:w-screen! max-md:rounded-none! max-md:pt-[env(safe-area-inset-top)]! max-md:pb-[env(safe-area-inset-bottom)]!" showCloseButton={false} data-testid="attachment-viewer">
        <div className="relative flex min-h-0 flex-col">
        <DialogTitle className="sr-only">{a.name}</DialogTitle>
        <DialogDescription className="sr-only">Preview of an attached file</DialogDescription>
        <FileViewer f={{ id: a.id, name: a.name, path: 'console/data/uploads/' + lane + '/' + a.id + '/' + a.name, kind: a.kind, size: a.size, lane }} id={a.id} row={row} pv={pv} onClose={onClose}>
          {pv?.has_text ? <pre className="overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-2 text-xs" data-testid="file-content-text">{pv.text}</pre> : <p className="text-sm text-muted-foreground">{pv?.note ?? 'No preview for this file. Download it to open it.'}</p>}
        </FileViewer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Files a message points at without carrying them: a linked tile per file or folder under the text. Clicking one
// opens it inside Lane files (the dock), the folder at its place in the tree.
function ContextTiles({ items, lane }: { items: ContextAttachment[]; lane: string }) {
  const dock = useContext(DockContext)
  const open = (c: ContextAttachment) => {
    if (!dock) return
    if (c.kind === 'folder') return dock.openFolder(c.ref.split('/').filter(Boolean))
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(c.ref)
    const where = c.lane || lane
    const path = isId ? uploadsPrefix(where) + c.ref + '/' + c.name : c.ref
    dock.openFile({ name: c.name, path, kind: /\.([A-Za-z0-9]+)$/.exec(c.name)?.[1]?.toLowerCase() ?? 'file', size: 0, mtime: null, lane: where, source: isId ? 'upload' : 'repo', scope: 'lane' } as never, isId ? c.ref : undefined)
  }
  return (
    <div className="mt-2 flex w-full min-w-[12rem] flex-col gap-1 whitespace-normal" data-testid="msg-context">
      <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase" data-testid="context-eyebrow">About these files</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <li key={c.kind + ':' + c.ref} className="min-w-0 max-w-full">
            <button
              type="button"
              className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-dashed bg-card px-2.5 py-1.5 text-left text-xs outline-none hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
              onClick={() => open(c)}
              disabled={!dock}
              title={'Open in Lane files: ' + pathOf(c)}
              aria-label={'Open ' + c.name + ' in Lane files'}
              data-testid="context-tile"
              data-kind={c.kind}
              data-kind-name={c.kind === 'file' ? fileKind(c.name) : 'folder'}
            >
              {c.kind === 'folder' ? <FolderIcon className="size-4 shrink-0 text-muted-foreground" /> : <LinkIcon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium [overflow-wrap:anywhere]">{c.name}</span>
                <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">{pathOf(c)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MessageAttachments({ items, lane }: { items: MessageAttachment[]; lane: string }) {
  const [open, setOpen] = useState<Attachment | null>(null)
  if (!items.length) return null
  const ctx = items.filter(isContext)
  const files = items.filter((a): a is Attachment => !isContext(a))
  return (
    <>
      {files.length > 0 && (
        <ul className="mt-2 grid w-full min-w-[12rem] grid-cols-2 gap-2 whitespace-normal sm:grid-cols-3" data-testid="msg-attachments">
          {files.map((a) => (
            <FileTile key={a.id} item={fromAttachment(a)} layout="grid" actions={[]} onOpen={() => setOpen(a)} onAction={() => {}} />
          ))}
        </ul>
      )}
      {ctx.length > 0 && <ContextTiles items={ctx} lane={lane} />}
      {open && <AttachmentViewer a={open} lane={lane} onClose={() => setOpen(null)} />}
    </>
  )
}
