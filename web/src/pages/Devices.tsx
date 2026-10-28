// Section 5 of docs/console-v2-spec.md: /v2/#/devices. Owners and admins only. Same API as console/lib/views.js
// devicesPage: POST /api/devices/:id {action: approve|deny}, POST /api/devices/:id/revoke.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NavTrigger } from '@/app/NavTrigger'
import { useApp } from '@/app/AppContext'
import { SearchButton } from '@/app/SearchButton'
import { PersonAvatar } from '@/components/PersonAvatar'
import * as api from '@/lib/api'
import { isOwnerOrAdmin } from '@/lib/store'
import { displayName, parseUA, relTime, shortId } from '@/lib/time'
import type { Device, LanAssignment, LanClass, PendingDevice } from '@/lib/types'
import { CLASS_LABEL, CLASS_ORDER, HOUSE_PEOPLE, isLanClass } from '@/lan/model'
import '@/lan/lan.css'

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 border-b px-3 py-2">
      <NavTrigger />
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {children}
        <SearchButton />
      </div>
    </header>
  )
}

function PendingCard({ d, people, onDone }: { d: PendingDevice; people: { id: string; name: string }[]; onDone: (msg: string | null) => void }) {
  const [person, setPerson] = useState(d.door && people.some((p) => p.id === d.door) ? d.door : (people[0]?.id ?? ''))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const act = async (run: () => Promise<{ ok: boolean; body: { error?: string } }>) => {
    setBusy(true)
    const r = await run()
    setBusy(false)
    onDone(r.ok ? null : (r.body.error ?? 'error'))
  }
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-3" data-testid="pending-device" data-id={d.id}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-secondary px-1.5 py-0.5 text-xs" title="Pending id">
          {shortId(d.id)}
        </code>
        <span className="text-sm font-medium">{parseUA(d.ua)}</span>
        {d.door && <Badge variant="secondary">door: {d.door}</Badge>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{d.ip || 'no IP'}</span>
        <span>{d.mac || 'no MAC yet'}</span>
        <span>first seen {d.first_seen ? relTime(d.first_seen) : 'never'}</span>
        {d.lanwatch_name && <span>lan-watch: {d.lanwatch_name}</span>}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void act(() => api.approveDevice(d.id, person, name))
        }}
      >
        <Select value={person} onValueChange={setPerson}>
          <SelectTrigger size="sm" aria-label="Assign to" className="w-40">
            <SelectValue placeholder="Assign to" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input aria-label="Device name" placeholder="Marvin iPhone" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-48" />
        <Button type="submit" size="sm" disabled={busy || !person || !name.trim()}>
          Approve
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => api.denyDevice(d.id))}>
          Deny
        </Button>
      </form>
    </li>
  )
}

// `approvedOnly`: a shell that has no use for the approval queue (Marvin's) lists the approved devices and nothing else.
export function DevicesPage({ approvedOnly = false }: { approvedOnly?: boolean } = {}) {
  const { store, toast } = useApp()
  const allowed = isOwnerOrAdmin(store)
  const [pending, setPending] = useState<PendingDevice[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loaded, setLoaded] = useState(false)
  // Console devices are classified through the same assignment record as LAN devices, keyed by their MAC.
  const [classes, setClasses] = useState<Record<string, LanAssignment>>({})

  const people = useMemo(() => {
    // Sovereign's house network: only Marvin and Bay can be assigned a device.
    if (store.me?.people?.length) return store.me.people.filter((p) => HOUSE_PEOPLE.includes(p.id))
    const ids = new Set<string>()
    for (const id of store.order) for (const p of store.lanes[id].members) if (HOUSE_PEOPLE.includes(p)) ids.add(p)
    return [...ids].map((id) => ({ id, name: displayName(id) }))
  }, [store.me, store.order, store.lanes])
  // A profile name wins over the name in people.json.
  const nameOf = (id: string) => store.profiles[id]?.name ?? people.find((p) => p.id === id)?.name ?? displayName(id)

  const load = useCallback(async () => {
    const [d, p, a] = await Promise.all([api.devices(), approvedOnly ? null : api.pendingDevices(), api.lanAssignments()])
    if (d.ok && Array.isArray(d.body)) setDevices(d.body)
    if (a.ok && a.body && typeof a.body === 'object') {
      const { error: _e, ...map } = a.body
      void _e
      setClasses(map as Record<string, LanAssignment>)
    }
    // The console may not serve a pending list over JSON yet: no list is an empty list, not an error.
    setPending(p && p.ok && Array.isArray(p.body) ? p.body.filter((x) => x.status !== 'approved') : [])
    setLoaded(true)
  }, [approvedOnly])
  useEffect(() => {
    if (allowed) void load()
  }, [allowed, load])

  const classify = async (mac: string, cls: LanClass | null) => {
    const key = mac.toLowerCase()
    const prev = classes[key]
    setClasses((c) => ({ ...c, [key]: { ...(c[key] ?? { person: null, notes: '', updated_by: null, updated_at: null }), class: cls } }))
    const r = await api.putLanAssignment(key, { class: cls })
    if (r.ok) {
      const { error: _e, ...entry } = r.body
      void _e
      setClasses((c) => ({ ...c, [key]: entry as LanAssignment }))
    } else {
      setClasses((c) => {
        const next = { ...c }
        if (prev) next[key] = prev
        else delete next[key]
        return next
      })
      toast('Not done: ' + (r.body.error ?? 'class not saved'))
    }
  }

  const done = (ok: string) => (err: string | null) => {
    toast(err ? 'Not done: ' + err : ok)
    void load()
  }

  if (!allowed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title="Devices" />
        <p className="mx-auto w-full max-w-[760px] px-4 py-10 text-sm text-muted-foreground" data-testid="owners-only">
          Owners only. Device approval is for owners and admins.
        </p>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="devices-page">
      <PageHeader title="Devices" />
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
        {!approvedOnly && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending</h2>
            {pending.length ? (
              <ul className="flex flex-col gap-3">
                {pending.map((d) => (
                  <PendingCard key={d.id} d={d} people={people} onDone={done('Device updated')} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{loaded ? 'No devices waiting for approval.' : 'Loading...'}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Or approve from your DM lane: <code>approve device &lt;pending-id&gt; as &lt;person&gt; "&lt;device name&gt;"</code>
            </p>
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved</h2>
          {devices.length ? (
            <ul className="flex flex-col divide-y rounded-lg border" data-testid="approved-list">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 p-3" data-testid="approved-device" data-id={d.id}>
                  <PersonAvatar id={d.person_id} name={nameOf(d.person_id)} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {d.name} <span className="font-mono text-xs font-normal text-muted-foreground">{shortId(d.id)}</span>
                    </p>
                    <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      <span>{nameOf(d.person_id)}</span>
                      <span>{d.last_ip || 'no IP yet'}</span>
                      <span>{d.last_mac || 'no MAC yet'}</span>
                      <span>seen {d.last_seen ? relTime(d.last_seen) : 'never'}</span>
                    </p>
                  </div>
                  <ClassPicker mac={d.last_mac ?? null} value={d.last_mac ? classes[d.last_mac.toLowerCase()]?.class ?? null : null} onPick={(c) => d.last_mac && void classify(d.last_mac, c)} />
                  <RevokeButton onRevoke={async () => done('Device revoked')((await api.revokeDevice(d.id)).ok ? null : 'revoke failed')} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{loaded ? 'No approved devices yet.' : 'Loading...'}</p>
          )}
        </section>
        <Badge variant="secondary" className="self-start">
          {devices.length} approved{approvedOnly ? '' : ', ' + pending.length + ' pending'}
        </Badge>
      </div>
    </div>
  )
}

function RevokeButton({ onRevoke }: { onRevoke: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Revoke this device? It loses access at once.')) return
        setBusy(true)
        await onRevoke()
        setBusy(false)
      }}
    >
      Revoke
    </Button>
  )
}

function ClassPicker({ mac, value, onPick }: { mac: string | null; value: LanClass | null; onPick: (c: LanClass | null) => void }) {
  const cls = isLanClass(value) ? value : null
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground" data-class={cls ?? undefined}>
      <span className="lan-class-dot size-2.5 rounded-full border border-border" aria-hidden />
      <span className="sr-only">Class</span>
      <select
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground disabled:opacity-50"
        value={cls ?? ''}
        disabled={!mac}
        title={mac ? undefined : 'No MAC yet: a device is classified by its MAC address'}
        aria-label="Class"
        data-testid="device-class"
        onChange={(e) => onPick(isLanClass(e.target.value) ? e.target.value : null)}
      >
        <option value="">Unclassified</option>
        {CLASS_ORDER.map((c) => (
          <option key={c} value={c}>
            {CLASS_LABEL[c]}
          </option>
        ))}
      </select>
    </label>
  )
}
