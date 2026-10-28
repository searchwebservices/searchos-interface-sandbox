// Universal search (Bay, 2026-10-27): one modal over lanes, messages, files, devices, people, surfaces and pages.
// Cmd K and the button in every header open it. The local groups answer on every keystroke; messages, files and
// console devices come from GET /api/search, debounced. Each group shows a few rows and a "More" row.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ActivityIcon, ClockIcon, FileIcon, LayoutPanelLeftIcon, LibraryIcon, MessageSquareIcon, MessageSquareTextIcon, NetworkIcon, ServerIcon, UserIcon, UserCircleIcon, XIcon } from 'lucide-react'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import * as api from '@/lib/api'
import { standingSurface } from '@/lib/dock'
import { clearRecent, DEBOUNCE_MS, GROUP_CAP, GROUP_LABEL, GROUP_ORDER, matchLan, matchLanes, matchPages, matchPeople, matchSurfaces, MIN_REMOTE, pushRecent, readRecent } from '@/lib/search'
import type { GroupId } from '@/lib/search'
import { isOwnerOrAdmin } from '@/lib/store'
import type { LanDevice } from '@/lib/types'
import { displayName, relTime } from '@/lib/time'
import { useApp } from './AppContext'
import { go, useRoute } from './router'

interface Row {
  group: GroupId
  key: string
  title: string
  sub?: string
  icon: ReactNode
  run: () => void
}

const PAGE_ICON = { devices: <ServerIcon />, lan: <NetworkIcon />, health: <ActivityIcon />, library: <LibraryIcon />, profile: <UserCircleIcon /> }

// onlyLane scopes the modal to one lane (Marvin's one chat): no lane list, no other lane's messages or files, no
// lane-opening people rows. `undefined` is the ordinary modal; `null` is scoped with no lane to show.
export function SearchModal({ open, onOpenChange, onlyLane }: { open: boolean; onOpenChange: (v: boolean) => void; onlyLane?: string | null }) {
  const { store, dock, toast } = useApp()
  const route = useRoute()
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<api.SearchResults['results']>({})
  const [loading, setLoading] = useState(false)
  const [lan, setLan] = useState<LanDevice[]>([])
  const [more, setMore] = useState<Set<GroupId>>(new Set())
  const [recent, setRecent] = useState<string[]>(() => readRecent())
  const seq = useRef(0)
  const lanLoaded = useRef(false)
  const admin = isOwnerOrAdmin(store)
  const scoped = onlyLane !== undefined

  // Cmd or Ctrl K toggles it from anywhere.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onOpenChange])

  // Fresh each time it opens; the LAN list is fetched once, the first time.
  useEffect(() => {
    if (!open) return
    setQ('')
    setRemote({})
    setMore(new Set())
    setRecent(readRecent())
    if (!lanLoaded.current) {
      lanLoaded.current = true
      void api.lanSummary().then((r) => { if (r.ok && Array.isArray(r.body.devices)) setLan(r.body.devices) })
    }
  }, [open])

  // Debounced server search. A newer keystroke makes an older answer stale.
  useEffect(() => {
    const t = q.trim()
    const mine = ++seq.current
    if (!open || t.length < MIN_REMOTE) {
      setRemote({})
      setLoading(false)
      return
    }
    setLoading(true)
    const id = window.setTimeout(() => {
      void api.search(t).then((r) => {
        if (mine !== seq.current) return
        setRemote(r.ok ? r.body.results ?? {} : {})
        setLoading(false)
      })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [q, open])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  const done = useCallback((fn: () => void) => () => {
    setRecent(pushRecent(q))
    close()
    fn()
  }, [q, close])

  const laneId = scoped ? (onlyLane ?? '') : route.name === 'lane' ? route.id : (store.order.find((id) => store.lanes[id]?.kind === 'dm') ?? store.order[0] ?? '')
  const openSurface = useCallback((lane: string, id: Parameters<typeof standingSurface>[0], then?: () => void) => {
    if (!lane) return
    if (route.name !== 'lane' || route.id !== lane) go({ name: 'lane', id: lane })
    dock.open(lane, standingSurface(id), true)
    then?.()
  }, [dock, route])

  const rows = useMemo<Row[]>(() => {
    const t = q.trim()
    const out: Row[] = []
    const all = t === ''
    const lanes = scoped ? [] : store.order.map((id) => store.lanes[id]).filter(Boolean)
    for (const l of all ? lanes : matchLanes(t, lanes)) {
      out.push({ group: 'lanes', key: l.id, title: l.title, sub: l.kind === 'dm' ? 'Direct' : 'Thread', icon: <MessageSquareIcon />, run: done(() => go({ name: 'lane', id: l.id })) })
    }
    for (const m of (remote.messages?.items ?? []).filter((x) => !scoped || x.lane === onlyLane)) {
      out.push({ group: 'messages', key: m.id, title: m.snippet, sub: [m.lane_title, m.who, relTime(m.at)].filter(Boolean).join(' · '), icon: <MessageSquareTextIcon />, run: done(() => go({ name: 'lane', id: m.lane, msg: m.id })) })
    }
    for (const f of (remote.files?.items ?? []).filter((x) => !scoped || x.lane === onlyLane)) {
      const lane = f.lane
      const key = f.source + ':' + (f.id ?? f.path)
      out.push({
        group: 'files',
        key,
        title: f.name,
        sub: (f.source === 'library' ? 'Library' : 'Repo') + (f.folder ? ' · ' + f.folder : f.path ? ' · ' + f.path : '') + ' · ' + (store.lanes[lane]?.title ?? lane),
        icon: <FileIcon />,
        run: done(() => openSurface(lane, 'files', () => dock.select(lane, { kind: 'file', id: f.path ?? f.name, label: f.name }))),
      })
    }
    for (const d of remote.devices?.items ?? []) {
      out.push({ group: 'devices', key: 'dev:' + d.id, title: d.name, sub: [d.person ? displayName(d.person) : '', d.ip, d.mac].filter(Boolean).join(' · '), icon: <ServerIcon />, run: done(() => go({ name: d.lan ? 'lan' : 'devices' })) })
    }
    for (const d of matchLan(t, lan)) {
      out.push({ group: 'devices', key: 'lan:' + d.mac, title: d.label || d.vendor || d.mac, sub: ['LAN', d.last_ip, d.mac].filter(Boolean).join(' · '), icon: <NetworkIcon />, run: done(() => go({ name: 'lan' })) })
    }
    const people = (store.me?.people ?? Object.values(store.profiles).map((p) => ({ id: p.person_id, name: p.name }))).map((p) => ({ id: p.id, name: store.profiles[p.id]?.name || p.name || displayName(p.id) }))
    for (const p of matchPeople(t, people)) {
      const mine = p.id === store.me?.person
      const shared = scoped ? undefined : store.order.find((id) => store.lanes[id]?.kind === 'group' && store.lanes[id].members.includes(p.id))
      out.push({
        group: 'people',
        key: p.id,
        title: p.name,
        sub: mine ? 'You' : shared ? 'Open ' + (store.lanes[shared]?.title ?? shared) : 'Person',
        icon: <UserIcon />,
        run: done(() => (mine ? go({ name: 'profile' }) : shared ? go({ name: 'lane', id: shared }) : toast('No shared lane with ' + p.name))),
      })
    }
    for (const s of matchSurfaces(t)) {
      out.push({ group: 'surfaces', key: s.id, title: s.title, sub: 'Opens in ' + (store.lanes[laneId]?.title ?? 'this lane'), icon: <LayoutPanelLeftIcon />, run: done(() => openSurface(laneId, s.id)) })
    }
    for (const p of matchPages(t, admin)) {
      out.push({ group: 'pages', key: p.id, title: p.title, icon: PAGE_ICON[p.id], run: done(() => go({ name: p.id })) })
    }
    return out
  }, [q, store, remote, lan, admin, laneId, scoped, onlyLane, done, openSurface, dock, toast])

  // Answers arrive in two waves (local rows at once, the server's later), so the selection follows the list: whenever the
  // rows change it goes back to the first one, which is what Enter opens.
  const [sel, setSel] = useState('')
  const sig = rows.map((r) => r.group + ':' + r.key).join('|')
  useEffect(() => {
    setSel(rows.length ? rows[0].group + ':' + rows[0].key : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  const total = (g: GroupId) => {
    const n = rows.filter((r) => r.group === g).length
    // The server knows how many matched in all; "More" counts those too.
    const srv = scoped ? undefined : g === 'messages' ? remote.messages?.total : g === 'files' ? remote.files?.total : undefined
    return Math.max(n, srv ?? 0)
  }
  const showRecent = q.trim() === '' && recent.length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search lanes, messages, files, devices, people, surfaces and pages"
      className="max-md:top-0! max-md:bottom-auto! max-md:h-dvh! max-md:max-h-dvh! max-md:rounded-none! max-md:pb-[env(safe-area-inset-bottom)] sm:max-w-xl"
    >
      <Command shouldFilter={false} loop value={sel} onValueChange={setSel} data-testid="search-modal" className="h-auto max-md:h-full">
        {/* Filtering is ours: the server and the groups decide what matches, cmdk only moves the selection. */}
        <CommandInputShell q={q} setQ={setQ} />
        <CommandListShell>
          {showRecent && (
            <CommandGroup heading="Recent searches" data-testid="search-recent">
              {recent.map((r) => (
                <CommandItem key={r} value={'recent:' + r} onSelect={() => setQ(r)}>
                  <ClockIcon />
                  <span>{r}</span>
                </CommandItem>
              ))}
              <CommandItem value="recent:clear" onSelect={() => { clearRecent(); setRecent([]) }}>
                <XIcon />
                <span className="text-muted-foreground">Clear recent searches</span>
              </CommandItem>
            </CommandGroup>
          )}
          {showRecent && <CommandSeparator />}
          {GROUP_ORDER.map((g) => {
            const list = rows.filter((r) => r.group === g)
            if (!list.length) return null
            const expanded = more.has(g)
            const shown = expanded ? list : list.slice(0, GROUP_CAP)
            const left = total(g) - shown.length
            return (
              <CommandGroup key={g} heading={GROUP_LABEL[g]} data-testid={'search-group-' + g}>
                {shown.map((r) => (
                  <CommandItem key={r.key} value={g + ':' + r.key} onSelect={r.run} data-testid="search-row">
                    {r.icon}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.title}</span>
                      {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                    </span>
                  </CommandItem>
                ))}
                {left > 0 && (
                  <CommandItem value={g + ':more'} onSelect={() => setMore((s) => new Set(s).add(g))} data-testid={'search-more-' + g}>
                    <span className="text-muted-foreground">More {GROUP_LABEL[g].toLowerCase()} ({left})</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )
          })}
          {!loading && q.trim().length >= MIN_REMOTE && rows.length === 0 && <CommandEmpty>Nothing matches "{q.trim()}".</CommandEmpty>}
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground" data-testid="search-loading">Searching...</div>}
        </CommandListShell>
      </Command>
    </CommandDialog>
  )
}

function CommandInputShell({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  return <CommandInput value={q} onValueChange={setQ} placeholder="Search lanes, messages, files, devices, people" autoFocus />
}
function CommandListShell({ children }: { children: ReactNode }) {
  return <CommandList className="max-h-[60dvh] max-md:max-h-none max-md:flex-1">{children}</CommandList>
}
