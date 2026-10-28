// The profile popup every LAN view opens for a node: identity (name editable), status with Approve, Deny and Reset,
// assignment to a person, autosaved notes and "Select in lane". Actions are optimistic and roll back on failure (see
// useLanData). Members can read everything; owners and admins can change it.
import { useContext, useEffect, useRef, useState } from 'react'
import { CheckIcon, CrosshairIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { relTime } from '@/lib/time'
import './lan.css'
import { DockContext } from '@/dock/context'
import { CLASS_LABEL, CLASS_ORDER, findNode, isLanClass, STATUS_WORD, type LanNode } from './model'
import type { LanData } from './useLanData'

const NOTES_DELAY = 600

const Row = ({ k, v }: { k: string; v: string }) => (
  <>
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="font-mono break-all" data-testid={'profile-' + k.replace(/\s+/g, '-')}>{v || 'unknown'}</dd>
  </>
)

function Body({ node, data, onClose, drawer }: { node: LanNode; data: LanData; onClose: () => void; drawer: boolean }) {
  const dock = useContext(DockContext)
  const mac = node.mac
  const canAct = data.canWrite && !!node.device && !!mac
  const [name, setName] = useState(node.device?.label ?? '')
  const [notes, setNotes] = useState(node.assignment?.notes ?? '')
  const [msg, setMsg] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const latest = useRef({ mac, assign: data.assign })
  useEffect(() => {
    latest.current = { mac, assign: data.assign }
  })

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const text = pending.current
    pending.current = null
    if (text == null || !latest.current.mac) return
    void latest.current.assign(latest.current.mac, { notes: text }).then((r) => {
      if (r.ok) setSaved(true)
      else setMsg(r.error ?? 'The note was not saved.')
    })
  }
  // A pending note is written when the profile closes or another node opens.
  useEffect(() => () => flush(), [])

  const run = async (go: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    setMsg('')
    const r = await go()
    setBusy(false)
    if (!r.ok) setMsg(r.error ?? 'The change was not applied.')
  }

  const person = node.assignment?.person ?? ''
  const status = node.device?.status ?? ''
  const selectId = node.kind === 'box' ? 'box' : (mac ?? node.id)

  return (
    <div className="flex flex-col gap-4" data-testid="device-profile" data-node={node.id}>
      <DialogHeader>
        <div className={drawer ? 'flex items-center gap-2 pr-20' : 'flex items-center gap-2 pr-6'}>
          <DialogTitle className="min-w-0 flex-1 truncate">{node.label}</DialogTitle>
          <Badge variant={node.status === 'denied' ? 'destructive' : 'secondary'} data-testid="profile-status">{STATUS_WORD[node.status]}</Badge>
        </div>
        <DialogDescription>
          {node.inferred ? 'Drawn from the box address; lan-watch has no record of this one.' : node.kind === 'box' ? 'The box this console runs on.' : 'A device lan-watch has seen on the LAN.'}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <Row k="mac" v={mac ?? ''} />
        <Row k="vendor" v={node.vendor ?? ''} />
        <Row k="ip" v={node.ip ?? ''} />
        <Row k="mac type" v={node.device ? (node.isRandom ? 'randomized' : 'hardware') : ''} />
        <Row k="first seen" v={node.firstSeen ? relTime(node.firstSeen) : ''} />
        <Row k="last seen" v={node.lastSeen ? relTime(node.lastSeen) : ''} />
        <Row k="online" v={node.device ? (node.online ? 'yes' : 'no') : ''} />
      </dl>

      {canAct && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => data.act(mac!, 'rename', name))
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name this device" aria-label="Device name" data-testid="profile-label" />
          <Button type="submit" size="sm" variant="outline" disabled={busy || name.trim() === (node.device?.label ?? '')} data-testid="profile-save-name">
            Save name
          </Button>
        </form>
      )}

      {canAct && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
          <Button type="button" size="sm" disabled={busy || status === 'approved'} onClick={() => void run(() => data.act(mac!, 'approve'))} data-testid="profile-approve">
            Approve
          </Button>
          <Button type="button" size="sm" variant="destructive" disabled={busy || status === 'denied'} onClick={() => void run(() => data.act(mac!, 'deny'))} data-testid="profile-deny">
            Deny
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy || status === 'pending'} onClick={() => void run(() => data.act(mac!, 'reset'))} data-testid="profile-reset">
            Reset
          </Button>
        </div>
      )}
      {!canAct && node.device && <p className="text-xs text-muted-foreground">Only owners and admins can change a device.</p>}

      {mac && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Class
          <span className="flex items-center gap-2">
            <span className="lan-class-dot size-3 shrink-0 rounded-full border border-border" data-class={node.cls ?? 'none'} data-testid="profile-class-dot" />
            <select
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground disabled:opacity-50"
              value={node.cls ?? ''}
              disabled={!data.canWrite || busy}
              data-testid="profile-class"
              onChange={(e) => void run(() => data.assign(mac, { class: isLanClass(e.target.value) ? e.target.value : null }))}
            >
              <option value="">Unclassified</option>
              {CLASS_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CLASS_LABEL[c]}
                </option>
              ))}
            </select>
          </span>
        </label>
      )}

      {mac && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Assigned to
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground disabled:opacity-50"
            value={person}
            disabled={!data.canWrite || busy}
            data-testid="profile-person"
            onChange={(e) => void run(() => data.assign(mac, { person: e.target.value || null }))}
          >
            <option value="">Unassigned</option>
            {person && !data.people.some((p) => p.id === person) && <option value={person}>{person}</option>}
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {mac && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            Notes
            {saved && (
              <span className="flex items-center gap-1 text-ok" data-testid="profile-saved">
                <CheckIcon className="size-3" /> Saved
              </span>
            )}
          </span>
          <Textarea
            value={notes}
            readOnly={!data.canWrite}
            maxLength={2000}
            placeholder={data.canWrite ? 'Where it lives, who owns it, why it is here' : 'No notes'}
            data-testid="profile-notes"
            onChange={(e) => {
              setNotes(e.target.value)
              setSaved(false)
              pending.current = e.target.value
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(flush, NOTES_DELAY)
            }}
            onBlur={flush}
          />
        </label>
      )}

      {msg && (
        <p className="text-xs text-destructive" role="alert" data-testid="profile-error">
          {msg}
        </p>
      )}

      {dock && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          data-testid="profile-select-lane"
          onClick={() => {
            dock.select({ kind: 'device', id: selectId, label: node.label })
            onClose()
          }}
        >
          <CrosshairIcon /> Select in lane
        </Button>
      )}
    </div>
  )
}

// variant 'panel' (the Network topology dock surface): the same body as an overlay inside the surface, so it never
// leaves the dock and never covers the conversation. Esc or Close closes it; the map behind stays interactive.
function PanelProfile({ node, data, onClose }: { node: LanNode; data: LanData; onClose: () => void }) {
  return (
    <Dialog open modal={false}>
      <div
        className="absolute inset-y-0 right-0 z-10 w-[min(100%,22rem)] overflow-y-auto border-l bg-popover p-4 text-popover-foreground shadow-lg"
        role="region"
        aria-label={'Profile of ' + node.label}
        data-testid="device-panel"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <Button type="button" size="sm" variant="outline" className="absolute top-3 right-3 rounded-full" onClick={onClose} data-testid="profile-close">
          <XIcon /> Close
        </Button>
        <Body key={node.id} node={node} data={data} onClose={onClose} drawer />
      </div>
    </Dialog>
  )
}

// variant 'drawer' (the LAN page): a right sheet that does not take over the page. The map stays visible and
// interactive, no backdrop; clicking another node swaps the content; Esc or the Close pill closes it. 'dialog' (the
// narrow dock) keeps the modal popup.
export function DeviceProfile({ nodeId, data, onClose, variant = 'dialog' }: { nodeId: string | null; data: LanData; onClose: () => void; variant?: 'dialog' | 'drawer' | 'panel' }) {
  const node = nodeId ? findNode(data.model, nodeId) : undefined
  if (variant === 'panel') return node ? <PanelProfile node={node} data={data} onClose={onClose} /> : null
  if (variant === 'drawer') {
    return (
      <Sheet open={!!node} modal={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          showOverlay={false}
          showCloseButton={false}
          className="gap-0 overflow-y-auto p-4 sm:max-w-sm"
          data-testid="device-drawer"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Button type="button" size="sm" variant="outline" className="absolute top-3 right-3 rounded-full" onClick={onClose} data-testid="profile-close">
            <XIcon /> Close
          </Button>
          {node && <Body key={node.id} node={node} data={data} onClose={onClose} drawer />}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={!!node} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        {node && <Body key={node.id} node={node} data={data} onClose={onClose} drawer={false} />}
      </DialogContent>
    </Dialog>
  )
}
