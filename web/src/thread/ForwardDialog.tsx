// Forward one or more messages to other lanes the person belongs to, with an optional note.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { LaneRow } from '@/lib/types'
import { useAgentName } from '@/lib/agent'

export function ForwardDialog({
  open,
  onOpenChange,
  count,
  lanes,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  // Only lanes the person is a member of.
  lanes: LaneRow[]
  onSend: (toLanes: string[], note: string) => Promise<string | null>
}) {
  const agent = useAgentName()
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setPicked([])
      setNote('')
      setError('')
    }
  }, [open])
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat(id)))
  const send = async () => {
    setBusy(true)
    const err = await onSend(picked, note)
    setBusy(false)
    if (err) setError(err)
    else onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="forward-dialog">
        <DialogHeader>
          <DialogTitle>{count === 1 ? 'Forward message' : 'Forward ' + count + ' messages'}</DialogTitle>
          <DialogDescription>Pick the lanes it goes to. It is posted as you, and {agent} in each lane sees it.</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label="Lanes">
          {lanes.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <Checkbox checked={picked.includes(l.id)} onCheckedChange={() => toggle(l.id)} data-testid={'forward-lane-' + l.id} aria-label={l.title} />
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                <span className="text-xs text-muted-foreground">{l.kind === 'dm' ? 'Direct' : 'Thread'}</span>
              </label>
            </li>
          ))}
        </ul>
        <Textarea aria-label="Note" placeholder="Add a note (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.currentTarget.value)} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!picked.length || busy} onClick={() => void send()}>
            Forward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
