// One reducer over the console API: the initial loads, the local send states, and every frame on /api/stream.
// Pure (no clock, no storage): actions that need a time carry `now`. Nothing in here touches the DOM.
import type {
  AskItem,
  CardItem,
  ChangesItem,
  FormItem,
  Health,
  LaneRow,
  Me,
  MessageAttachment,
  PublicProfile,
  ReplyTo,
  StoredPrefs,
  RunItem,
  StreamEvent,
  TextMessage,
  ThreadItem,
} from './types'
import { clampWidth, defaultDock, emptyDock, enforceFixed, restore } from './dock'
import type { StandingId, DockState, DockSurface, SavedDock, Selection } from './dock'
import { agentName, DEFAULT_AGENT_NAME } from './agent'

export type SendState = 'sending' | 'failed'

export interface PendingSend {
  client_id: string
  text: string
  at: string
  reply_to?: ReplyTo
  attachments?: MessageAttachment[]
  state: SendState
  error?: string
}

export interface ThreadState {
  items: ThreadItem[]
  loaded: boolean
  // Streaming replies: OpenCode message id -> the text so far. The stored message replaces it on idle.
  streams: Record<string, string>
  pending: PendingSend[]
  // client_id -> ms when the server confirmed it (the UI shows "Delivered" for a moment).
  delivered: Record<string, number>
  // When the lane went busy, for a working row that has no run item yet.
  busySince: number | null
  // Form items by id (docs/forms-spec.md). The FormCard renders them; a thread snapshot is the truth for them.
  forms: Record<string, FormItem>
}

export interface HealthState {
  opencode: 'up' | 'down'
  down_for_s: number
  sessions?: Health['sessions']
  pending_asks?: number
  outbox?: number
  // Per agent runtime status, kept so shells need not refetch /api/health.
  agents?: Health['agents']
}

export interface Store {
  me: Me | null
  order: string[]
  lanes: Record<string, LaneRow>
  threads: Record<string, ThreadState>
  readAt: Record<string, string>
  health: HealthState | null
  // Bumped when an ask changes in a lane the person only approves, so the approval queue re-reads.
  approverTick?: number
  streamUp: boolean
  // Surfaces dock (docs/surfaces-spec.md), keyed by lane. In memory; the layout is also saved per device by the app.
  docks: Record<string, DockState>
  // The one selected resource of a lane, shared by every surface in it.
  selection: Record<string, Selection | null>
  // Surface state that must survive collapse, tab switches and lane switches: `${lane}|${surface id}`.
  surfaceState: Record<string, Record<string, unknown>>
  // Everyone's public profile (name, tag, avatar), and the signed-in person's own prefs (default plus per device).
  profiles: Record<string, PublicProfile>
  prefs: StoredPrefs | null
  // True when the last GET /api/lanes failed (cleared by the next one that works). Optional so older stores stay valid.
  lanesError?: boolean
}

export const emptyThread = (): ThreadState => ({
  items: [],
  loaded: false,
  streams: {},
  pending: [],
  delivered: {},
  busySince: null,
  forms: {},
})

export const initialStore = (): Store => ({
  me: null,
  order: [],
  lanes: {},
  threads: {},
  readAt: {},
  health: null,
  streamUp: false,
  docks: {},
  selection: {},
  surfaceState: {},
  profiles: {},
  prefs: null,
})

export type Action =
  | { type: 'me'; me: Me }
  | { type: 'lanes'; lanes: LaneRow[]; readAt?: Record<string, string> }
  | { type: 'lanes_failed' }
  | { type: 'thread'; lane: string; items: ThreadItem[]; now?: number }
  | { type: 'thread_merge'; lane: string; items: ThreadItem[] }
  | { type: 'frame'; ev: StreamEvent; now: number }
  | { type: 'profiles'; profiles: PublicProfile[] }
  | { type: 'my_prefs'; prefs: StoredPrefs }
  | { type: 'send_start'; lane: string; send: PendingSend }
  | { type: 'send_ok'; lane: string; client_id: string; message: TextMessage; now: number }
  | { type: 'send_fail'; lane: string; client_id: string; error: string }
  | { type: 'send_retry'; lane: string; client_id: string }
  | { type: 'send_drop'; lane: string; client_id: string }
  | { type: 'ask_answered'; lane: string; ask: AskItem }
  | { type: 'form_settled'; lane: string; form: FormItem }
  | { type: 'mark_read'; lane: string; at: string }
  | { type: 'health'; health: Health }
  | { type: 'stream_state'; up: boolean }
  | { type: 'dock_hydrate'; lane: string; saved: unknown; defaults?: StandingId[] | null; fixed?: StandingId[] | null }
  | { type: 'dock_move'; lane: string; id: string; by: -1 | 1 }
  | { type: 'dock_open'; lane: string; surface: DockSurface; expand?: boolean }
  | { type: 'dock_expand'; lane: string; id: string }
  | { type: 'dock_collapse'; lane: string }
  | { type: 'dock_close'; lane: string; id: string }
  | { type: 'dock_hide'; lane: string }
  | { type: 'dock_restore'; lane: string }
  | { type: 'dock_width'; lane: string; width: number }
  | { type: 'dock_auto'; lane: string; id: string }
  | { type: 'select'; lane: string; selection: Selection | null }
  | { type: 'surface_state'; lane: string; id: string; patch: Record<string, unknown> }

// ---------------------------------------------------------------- helpers

const thread = (s: Store, lane: string): ThreadState => s.threads[lane] ?? emptyThread()
const withThread = (s: Store, lane: string, t: ThreadState): Store => ({ ...s, threads: { ...s.threads, [lane]: t } })
const withLane = (s: Store, lane: string, patch: Partial<LaneRow>): Store =>
  s.lanes[lane] ? { ...s, lanes: { ...s.lanes, [lane]: { ...s.lanes[lane], ...patch } } } : s

// Runs and changes never count as conversation: not in the rail preview, the unread count or the message count.
export const THREAD_ONLY: ReadonlySet<string> = new Set(['run', 'changes', 'form', 'card'])
const isConversation = (m: ThreadItem): boolean => !THREAD_ONLY.has(m.role)

export const signerOf = (m: ThreadItem): string => ((m as { signature?: { person?: string } }).signature?.person ?? '')

export const pendingForms = (forms: Record<string, FormItem>): number => Object.values(forms).filter((f) => f.state === 'pending').length
const withForms = (s: Store, lane: string, t: ThreadState, forms: Record<string, FormItem>): Store =>
  withLane(withThread(s, lane, { ...t, forms }), lane, { forms: pendingForms(forms) })

const openAsks = (items: ThreadItem[]): number => items.filter((m) => m.role === 'ask' && m.state === 'open').length

function whoOf(m: ThreadItem, people?: Record<string, string>, agent: string = DEFAULT_AGENT_NAME): string {
  if (m.role === 'gilfoyle' || m.role === 'agent' || m.role === 'ask') return agent
  if (m.role === 'system') return 'Console'
  if (m.role === 'lane') return m.eyebrow || 'Lane message from ' + (m.from_lane || '?')
  const p = signerOf(m)
  return (people && people[p]) || p
}
const textOf = (m: ThreadItem): string => {
  if (m.role === 'ask') return m.ask.message || m.ask.action
  return 'text' in m ? String(m.text || '') : ''
}

const mentionsMe = (s: Store, m: ThreadItem): boolean => !!(s.me && 'mentions' in m && Array.isArray(m.mentions) && m.mentions.includes(s.me.person))

function previewAfter(s: Store, lane: string, m: ThreadItem): Store {
  const l = s.lanes[lane]
  if (!l || !isConversation(m)) return s
  const own = !!(s.me && signerOf(m) === s.me.person)
  return withLane(s, lane, {
    count: (l.count ?? 0) + 1,
    tail: (l.tail ?? []).concat({ at: m.at, own, ...(mentionsMe(s, m) ? { mention: true } : {}) }).slice(-60),
    last: { id: m.id, role: m.role, who: whoOf(m, undefined, agentName(l)), own, text: textOf(m).replace(/\s+/g, ' ').slice(0, 120), at: m.at },
  })
}

// Insert or replace by id. A run replaces the earlier run of the same turn, so a turn is always one item.
function upsert(items: ThreadItem[], m: ThreadItem): { items: ThreadItem[]; added: boolean } {
  let i = items.findIndex((x) => x.id === m.id)
  if (i < 0 && m.role === 'run' && m.run.turn_id) {
    i = items.findIndex((x) => x.role === 'run' && x.run.turn_id === m.run.turn_id)
  }
  if (i >= 0) {
    const next = items.slice()
    next[i] = m
    return { items: next, added: false }
  }
  return { items: items.concat(m), added: true }
}

function applyMessage(s: Store, lane: string, m: ThreadItem, now: number): Store {
  let t = thread(s, lane)
  if (m.role === 'form') {
    return withForms(s, lane, t, { ...t.forms, [m.id]: m })
  }
  // A text message that carries my pending client_id is my own send coming back: delivered.
  let delivered = t.delivered
  let pending = t.pending
  if (m.role === 'person' && m.client_id && pending.some((p) => p.client_id === m.client_id)) {
    pending = pending.filter((p) => p.client_id !== m.client_id)
    delivered = { ...delivered, [m.client_id]: now }
  }
  // The stored reply replaces the streaming one.
  let streams = t.streams
  const oc = 'oc_id' in m ? m.oc_id : undefined
  if (oc && streams[oc] !== undefined) {
    streams = { ...streams }
    delete streams[oc]
  }
  const u = upsert(t.items, m)
  t = { ...t, items: u.items, pending, delivered, streams }
  let next = withThread(s, lane, t)
  if (u.added) next = previewAfter(next, lane, m)
  if (m.role === 'ask') next = withLane(next, lane, { asks: openAsks(u.items) })
  return next
}

// ---------------------------------------------------------------- reducer

export function reduce(s: Store, a: Action): Store {
  switch (a.type) {
    case 'me':
      return { ...s, me: a.me }
    case 'lanes': {
      const lanes: Record<string, LaneRow> = {}
      for (const l of a.lanes) lanes[l.id] = { ...l, forms: pendingForms(s.threads[l.id]?.forms ?? {}) }
      const readAt = { ...s.readAt }
      for (const l of a.lanes) if (!readAt[l.id] && a.readAt?.[l.id]) readAt[l.id] = a.readAt[l.id]
      // First visit on this device: nothing is unread.
      for (const l of a.lanes) if (!readAt[l.id]) readAt[l.id] = l.last?.at || ''
      return { ...s, lanes, order: a.lanes.map((l) => l.id), readAt, ...(s.lanesError ? { lanesError: false } : {}) }
    }
    case 'lanes_failed':
      return s.lanesError ? s : { ...s, lanesError: true }
    case 'thread': {
      const t = thread(s, a.lane)
      // The snapshot is the truth for stored items; keep what only exists locally (pending sends, streams, forms).
      const streams = { ...t.streams }
      for (const it of a.items) if ('oc_id' in it && it.oc_id) delete streams[it.oc_id]
      // Forms: the snapshot replaces what we held (a reconnect resync), so a stale pending card settles.
      const forms: Record<string, FormItem> = {}
      for (const it of a.items) if (it.role === 'form') forms[it.id] = it
      const pending = t.pending.filter((p) => !a.items.some((x) => x.role === 'person' && x.client_id === p.client_id))
      const items = a.items.filter((x) => x.role !== 'form')
      return withForms(s, a.lane, { ...t, items, loaded: true, streams, pending }, forms)
    }
    case 'thread_merge': {
      // A page fetched around a deep-linked message joins what is already loaded; nothing is dropped.
      const t = thread(s, a.lane)
      const have = new Set(t.items.map((x) => x.id))
      const fresh = a.items.filter((x) => x.role !== 'form' && !have.has(x.id))
      if (!fresh.length) return s
      const items = t.items.concat(fresh).sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0))
      return withThread(s, a.lane, { ...t, items })
    }
    case 'frame':
      return frame(s, a.ev, a.now)
    case 'profiles': {
      const profiles: Record<string, PublicProfile> = {}
      for (const p of a.profiles) profiles[p.person_id] = p
      return { ...s, profiles }
    }
    case 'my_prefs':
      return { ...s, prefs: a.prefs }
    case 'send_start': {
      const t = thread(s, a.lane)
      return withThread(s, a.lane, { ...t, pending: t.pending.filter((p) => p.client_id !== a.send.client_id).concat(a.send) })
    }
    case 'send_ok': {
      const t = thread(s, a.lane)
      const pending = t.pending.filter((p) => p.client_id !== a.client_id)
      const delivered = { ...t.delivered, [a.client_id]: a.now }
      const s2 = withThread(s, a.lane, { ...t, pending, delivered })
      return applyMessage(s2, a.lane, a.message, a.now)
    }
    case 'send_fail': {
      const t = thread(s, a.lane)
      return withThread(s, a.lane, {
        ...t,
        pending: t.pending.map((p) => (p.client_id === a.client_id ? { ...p, state: 'failed', error: a.error } : p)),
      })
    }
    case 'send_retry': {
      const t = thread(s, a.lane)
      return withThread(s, a.lane, {
        ...t,
        pending: t.pending.map((p) => {
          if (p.client_id !== a.client_id) return p
          // The original is gone: send it plain, same client id.
          const { reply_to, ...rest } = p
          const keep = p.error === 'reply_to_not_found' ? rest : { ...rest, reply_to }
          return { ...keep, state: 'sending', error: undefined } as PendingSend
        }),
      })
    }
    case 'send_drop': {
      const t = thread(s, a.lane)
      return withThread(s, a.lane, { ...t, pending: t.pending.filter((p) => p.client_id !== a.client_id) })
    }
    case 'ask_answered': {
      const t = thread(s, a.lane)
      const items = t.items.map((x) => (x.id === a.ask.id ? a.ask : x))
      return withLane(withThread(s, a.lane, { ...t, items }), a.lane, { asks: openAsks(items) })
    }
    case 'form_settled': {
      const t = thread(s, a.lane)
      return withForms(s, a.lane, t, { ...t.forms, [a.form.id]: a.form })
    }
    case 'mark_read': {
      if (!a.at || a.at <= (s.readAt[a.lane] ?? '')) return s
      return { ...s, readAt: { ...s.readAt, [a.lane]: a.at } }
    }
    case 'health':
      return { ...s, health: { opencode: a.health.opencode, down_for_s: a.health.down_for_s ?? 0, sessions: a.health.sessions, pending_asks: a.health.pending_asks, outbox: a.health.outbox, agents: a.health.agents } }
    case 'stream_state':
      return { ...s, streamUp: a.up }
    case 'dock_hydrate': {
      // A dock already in memory wins: the saved layout only seeds a lane the first time it is opened.
      if (s.docks[a.lane]) return s
      const fallback = defaultDock(a.lane, s.lanes[a.lane]?.kind, a.fixed ?? a.defaults)
      const d = a.saved == null ? fallback : restore(a.saved, fallback)
      return withDock(s, a.lane, a.fixed ? enforceFixed(d, a.fixed) : d)
    }
    case 'dock_open': {
      const d = dockOf(s, a.lane)
      const expand = a.expand !== false
      const has = d.surfaces.some((x) => x.id === a.surface.id)
      const surfaces = has ? d.surfaces.map((x) => (x.id === a.surface.id ? { ...x, ...a.surface } : x)) : d.surfaces.concat(a.surface)
      return withDock(s, a.lane, { ...d, surfaces, active: expand ? a.surface.id : d.active, hidden: false, seq: d.seq + 1 })
    }
    case 'dock_expand': {
      const d = dockOf(s, a.lane)
      if (!d.surfaces.some((x) => x.id === a.id)) return s
      return withDock(s, a.lane, { ...d, active: a.id, hidden: false })
    }
    case 'dock_collapse': {
      const d = dockOf(s, a.lane)
      return d.active === null ? s : withDock(s, a.lane, { ...d, active: null })
    }
    case 'dock_close': {
      const d = dockOf(s, a.lane)
      const i = d.surfaces.findIndex((x) => x.id === a.id)
      if (i < 0) return s
      const surfaces = d.surfaces.filter((x) => x.id !== a.id)
      const active = d.active === a.id ? (surfaces[Math.min(i, surfaces.length - 1)]?.id ?? null) : d.active
      return withDock(s, a.lane, { ...d, surfaces, active })
    }
    case 'dock_move': {
      const d = dockOf(s, a.lane)
      const i = d.surfaces.findIndex((x) => x.id === a.id)
      const j = i + a.by
      if (i < 0 || j < 0 || j >= d.surfaces.length) return s
      const surfaces = d.surfaces.slice()
      ;[surfaces[i], surfaces[j]] = [surfaces[j], surfaces[i]]
      return withDock(s, a.lane, { ...d, surfaces })
    }
    case 'dock_hide': {
      const d = dockOf(s, a.lane)
      return d.hidden ? s : withDock(s, a.lane, { ...d, hidden: true })
    }
    case 'dock_restore': {
      const d = dockOf(s, a.lane)
      return d.hidden ? withDock(s, a.lane, { ...d, hidden: false, active: d.active ?? d.surfaces[0]?.id ?? null }) : s
    }
    case 'dock_width': {
      const d = dockOf(s, a.lane)
      const width = clampWidth(a.width)
      return width === d.width ? s : withDock(s, a.lane, { ...d, width })
    }
    case 'dock_auto': {
      const d = dockOf(s, a.lane)
      return d.auto.includes(a.id) ? s : withDock(s, a.lane, { ...d, auto: d.auto.concat(a.id) })
    }
    case 'select':
      return { ...s, selection: { ...s.selection, [a.lane]: a.selection } }
    case 'surface_state': {
      const key = a.lane + '|' + a.id
      return { ...s, surfaceState: { ...s.surfaceState, [key]: { ...s.surfaceState[key], ...a.patch } } }
    }
  }
}

// ---------------------------------------------------------------- dock helpers

const dockOf = (s: Store, lane: string): DockState => s.docks[lane] ?? defaultDock(lane, s.lanes[lane]?.kind)
const withDock = (s: Store, lane: string, d: DockState): Store => ({ ...s, docks: { ...s.docks, [lane]: d } })

export { emptyDock }
export type { SavedDock }

function frame(s: Store, ev: StreamEvent, now: number): Store {
  if (ev.type === 'profile_update') {
    const mine = !!s.me && ev.profile.person_id === s.me.person
    return { ...s, profiles: { ...s.profiles, [ev.profile.person_id]: ev.profile }, prefs: mine && ev.prefs ? ev.prefs : s.prefs }
  }
  if (ev.type === 'health') return { ...s, health: { ...s.health, opencode: ev.opencode, down_for_s: ev.down_for_s ?? 0, ...(ev.agents ? { agents: ev.agents } : {}) } }
  const lane = 'lane' in ev ? ev.lane : ''
  if (!lane) return s
  switch (ev.type) {
    case 'message':
      return applyMessage(s, lane, ev.message, now)
    case 'ask':
      return applyMessage(s, lane, ev.ask, now)
    case 'ask_update': {
      const t = thread(s, lane)
      const items = t.items.map((x) =>
        x.id === ev.id && x.role === 'ask'
          ? { ...x, state: ev.state, replied_by: ev.replied_by ?? x.replied_by, replied_at: ev.replied_at ?? x.replied_at }
          : x,
      )
      return withLane(withThread(s, lane, { ...t, items }), lane, { asks: openAsks(items) })
    }
    case 'approver_ask':
      return { ...s, approverTick: (s.approverTick ?? 0) + 1 }
    case 'asks':
      return withLane(s, lane, { asks: ev.open })
    case 'busy': {
      const t = thread(s, lane)
      const busySince = ev.busy ? (t.busySince ?? now) : null
      return withLane(withThread(s, lane, { ...t, busySince }), lane, { busy: ev.busy })
    }
    case 'removed': {
      const t = thread(s, lane)
      if (!t.items.some((x) => x.id === ev.id) && !t.forms[ev.id]) return s
      const forms = { ...t.forms }
      delete forms[ev.id]
      const items = t.items.filter((x) => x.id !== ev.id)
      return withLane(withForms(s, lane, { ...t, items }, forms), lane, { asks: openAsks(items) })
    }
    case 'run_update': {
      const t = thread(s, lane)
      const i = t.items.findIndex((x) => x.id === ev.id)
      if (i < 0) return s
      const items = t.items.slice()
      items[i] = { ...(items[i] as RunItem), run: ev.run }
      return withThread(s, lane, { ...t, items })
    }
    case 'stream': {
      const t = thread(s, lane)
      return withThread(s, lane, { ...t, streams: { ...t.streams, [ev.message_id]: ev.text } })
    }
    case 'stream_end': {
      const t = thread(s, lane)
      if (t.streams[ev.message_id] === undefined) return s
      const streams = { ...t.streams }
      delete streams[ev.message_id]
      return withThread(s, lane, { ...t, streams })
    }
    case 'session':
      return withLane(s, lane, { session_missing: ev.state === 'missing' })
    case 'form': {
      const t = thread(s, lane)
      return withForms(s, lane, t, { ...t.forms, [ev.form.id]: ev.form })
    }
    case 'card':
      return applyMessage(s, lane, ev.card, now)
    case 'card_update': {
      const t = thread(s, lane)
      const i = t.items.findIndex((x) => x.id === ev.id && x.role === 'card')
      if (i < 0) return s
      const items = t.items.slice()
      const cur = items[i] as CardItem
      items[i] = { ...cur, card: { ...cur.card, state: ev.state, resolution: ev.resolution ?? cur.card.resolution, last_action: ev.last_action ?? cur.card.last_action } }
      return withThread(s, lane, { ...t, items })
    }
    case 'form_update': {
      const t = thread(s, lane)
      const cur = t.forms[ev.id]
      if (!cur) return s
      const { type: _type, lane: _lane, id: _id, ...rest } = ev
      void _type
      void _lane
      void _id
      return withForms(s, lane, t, { ...t.forms, [ev.id]: { ...cur, ...rest } as FormItem })
    }
    default:
      return s
  }
}

// ---------------------------------------------------------------- selectors

export const runsOf = (t: ThreadState): RunItem[] => t.items.filter((x): x is RunItem => x.role === 'run')
export const openRun = (t: ThreadState): RunItem | null => {
  const open = runsOf(t).filter((r) => r.run.status === 'running')
  return open.length ? open[open.length - 1] : null
}
export const changesOf = (t: ThreadState): ChangesItem[] => t.items.filter((x): x is ChangesItem => x.role === 'changes')

// ONE working row per turn: the lane is busy, or a run of an open turn exists.
export const isWorking = (lane: LaneRow | undefined, t: ThreadState): boolean => !!lane?.busy || !!openRun(t)
export const workingSince = (t: ThreadState): number | null => openRun(t)?.run.started ?? t.busySince

// Items the thread lists: an open run is not a row of its own, the working row stands in for it.
export const listed = (t: ThreadState): ThreadItem[] => t.items.filter((x) => !(x.role === 'run' && x.run.status === 'running'))

// What the thread lists: stored items plus the forms, in time order (forms are kept apart so a snapshot can replace them).
export const feedOf = (t: ThreadState): ThreadItem[] => {
  const forms = Object.values(t.forms)
  if (!forms.length) return listed(t)
  return [...listed(t), ...forms].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

export const unreadCount = (s: Store, laneId: string): number => {
  const l = s.lanes[laneId]
  const since = s.readAt[laneId] ?? ''
  return l ? (l.tail ?? []).filter((e) => !e.own && e.at > since).length : 0
}
// Unread messages that name the signed-in person, from the lane's tail (the console flags them).
export const unreadMentions = (s: Store, laneId: string): number => {
  const l = s.lanes[laneId]
  const since = s.readAt[laneId] ?? ''
  return l ? (l.tail ?? []).filter((e) => e.mention && !e.own && e.at > since).length : 0
}
export const totalMentions = (s: Store): number => s.order.reduce((n, id) => n + unreadMentions(s, id), 0)
export const totalAsks = (s: Store): number => s.order.reduce((n, id) => n + (s.lanes[id]?.asks ?? 0), 0)
export const totalForms = (s: Store): number => s.order.reduce((n, id) => n + (s.lanes[id]?.forms ?? 0), 0)
export const totalUnread = (s: Store): number => s.order.reduce((n, id) => n + unreadCount(s, id), 0)

export const isMember = (s: Store, laneId: string): boolean => !!(s.me && s.lanes[laneId]?.members.includes(s.me.person))
export const isOwnerOrAdmin = (s: Store): boolean => !!s.me && (s.me.role === 'owner' || s.me.role === 'admin')

// The tab title: "[2 asks] (3) SearchOS". onlyLane counts one lane only (Marvin's one chat); omitted, every lane counts.
export function tabTitle(s: Store, onlyLane?: string | null): string {
  const scoped = onlyLane !== undefined
  const ids = scoped ? s.order.filter((id) => id === onlyLane) : s.order
  const asks = ids.reduce((n, id) => n + (s.lanes[id]?.asks ?? 0), 0)
  const n = ids.reduce((m, id) => m + unreadCount(s, id), 0)
  const at = ids.reduce((m, id) => m + unreadMentions(s, id), 0)
  return (asks ? `[${asks} ${asks === 1 ? 'ask' : 'asks'}] ` : '') + (at ? `@${at > 99 ? '99+' : at} ` : '') + (n ? `(${n > 99 ? '99+' : n}) ` : '') + 'SearchOS'
}

export const dockFor = (s: Store, lane: string): DockState => dockOf(s, lane)
export const selectionOf = (s: Store, lane: string): Selection | null => s.selection[lane] ?? null
export const surfaceStateOf = (s: Store, lane: string, id: string): Record<string, unknown> => s.surfaceState[lane + '|' + id] ?? {}
