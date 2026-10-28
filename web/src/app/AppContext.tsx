// Wires the store to the console: initial loads, the one /api/stream, health, and the actions the UI calls.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as api from '@/lib/api'
import { connect } from '@/lib/stream'
import * as prefs from '@/lib/prefs'
import type { RailPrefs, RailState } from '@/lib/rail'
import { initialStore, reduce } from '@/lib/store'
import type { Store } from '@/lib/store'
import { readDefaultsOverride, saveOf } from '@/lib/dock'
import type { DockState, DockSurface, Selection, StandingId } from '@/lib/dock'
import { isContext } from '@/lib/types'
import type { Decision, MessageAttachment, MyProfile, ReplyTo, StoredPrefs, ThreadItem } from '@/lib/types'
import { applyEffective, effectivePrefs } from '@/lib/profile'
import { registerNames } from '@/lib/time'
import type { Values } from '@/lib/forms'
import { agentName } from '@/lib/agent'

// The surfaces dock (docs/surfaces-spec.md). Every call is per lane; the layout is saved per device by the provider.
export interface DockApi {
  hydrate: (lane: string, fixed?: StandingId[]) => void
  open: (lane: string, surface: DockSurface, expand?: boolean) => void
  expand: (lane: string, id: string) => void
  collapse: (lane: string) => void
  close: (lane: string, id: string) => void
  hide: (lane: string) => void
  move: (lane: string, id: string, by: -1 | 1) => void
  restore: (lane: string) => void
  setWidth: (lane: string, width: number) => void
  markAuto: (lane: string, id: string) => void
  select: (lane: string, selection: Selection | null) => void
  patchSurface: (lane: string, id: string, patch: Record<string, unknown>) => void
}

interface AppApi {
  store: Store
  dock: DockApi
  loadThread: (lane: string) => Promise<void>
  mergeThread: (lane: string, items: ThreadItem[]) => void
  send: (lane: string, text: string, replyTo?: ReplyTo, attachments?: MessageAttachment[]) => void
  retry: (lane: string, clientId: string) => void
  discard: (lane: string, clientId: string) => void
  answerAsk: (lane: string, itemId: string, requestId: string, d: Decision) => Promise<string | null>
  answerForm: (lane: string, formId: string, answer: Values) => Promise<FormOutcome>
  cancelForm: (lane: string, formId: string) => Promise<FormOutcome>
  refreshHealth: () => Promise<void>
  // Load the lane list and the signed-in person again (the retry after a failed GET /api/lanes).
  reloadLanes: () => Promise<void>
  cardAction: (lane: string, cardId: string, actionId: string) => Promise<string | null>
  stop: (lane: string) => Promise<string | null>
  deleteLocal: (lane: string, id: string) => Promise<string | null>
  markRead: (lane: string, at: string) => void
  pinned: string[]
  togglePin: (lane: string) => void
  // Bay's rail: the state of each collapsible section (key absent = open). Saved per person and device.
  railSections: Record<string, RailState>
  setRailSection: (key: string, state: RailState) => void
  // Drag and menu order of the Apps rows and Jared's Bay lanes (ids). Saved per person and device.
  appOrder: string[]
  bayLaneOrder: string[]
  setRailOrder: (key: 'appOrder' | 'bayLaneOrder', ids: string[]) => void
  quickReport: () => void
  toast: (text: string) => void
  // Forward messages of `lane` to other lanes the person belongs to. Resolves to an error text or null.
  forward: (lane: string, ids: string[], toLanes: string[], note?: string) => Promise<string | null>
  // Save the profile: name, tag, and prefs for this device ('device') or every device ('all').
  saveProfile: (patch: ProfilePatch) => Promise<ProfileOutcome>
  uploadAvatar: (png: Blob) => Promise<string | null>
  removeAvatar: () => Promise<string | null>
}

export interface ProfilePatch {
  name?: string
  tag?: string
  prefs?: { scope: 'device' | 'all'; values: Record<string, unknown> }
}
export interface ProfileOutcome {
  error: string | null
  fields?: Record<string, string>
}

export interface FormOutcome {
  error: string | null
  fields?: Record<string, string>
}

const Ctx = createContext<AppApi | null>(null)
export const useApp = (): AppApi => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

// GET/PUT /api/me/profile answer with this device's slice; the store keeps default plus per device.
const storedOf = (m: MyProfile): StoredPrefs => ({ default: m.prefs.default ?? {}, devices: m.device_id ? { [m.device_id]: m.prefs.device ?? {} } : {} })

const newClientId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reduce, undefined, initialStore)
  const storeRef = useRef(store)
  storeRef.current = store
  const [pinnedState, setPinned] = useReducer((_: string[], v: string[]) => v, [])
  // The rail's section states (Bay's sidebar), per person and device: the profile prefs are the source, localStorage the first paint.
  const [railSections, setRailSections] = useState<Record<string, RailState>>({})
  const [orders, setOrders] = useState<{ appOrder: string[]; bayLaneOrder: string[] }>({ appOrder: [], bayLaneOrder: [] })
  const railRef = useRef<RailPrefs>({})
  railRef.current = { sections: railSections, pins: pinnedState, ...(orders.appOrder.length ? { appOrder: orders.appOrder } : {}), ...(orders.bayLaneOrder.length ? { bayLaneOrder: orders.bayLaneOrder } : {}) }
  const [toastText, setToastText] = useState('')
  const toastTimer = useRef(0)
  const toast = useCallback((text: string) => {
    setToastText(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastText(''), 2200)
  }, [])
  const savedDocks = useRef(new Map<string, DockState>())
  const payloads = useRef(new Map<string, { lane: string; text: string; reply_to?: ReplyTo; attachments?: MessageAttachment[] }>())

  const loadLanes = useCallback(async () => {
    const [m, l] = await Promise.all([api.me(), api.lanes()])
    if (m.ok && 'person' in m.body) {
      dispatch({ type: 'me', me: m.body })
      setPinned(prefs.get<string[]>(prefs.keys.pinned(m.body.person), []))
      setRailSections(prefs.get<Record<string, RailState>>(prefs.keys.rail(m.body.person), {}))
      setOrders(prefs.get(prefs.keys.railOrder(m.body.person), { appOrder: [], bayLaneOrder: [] }))
    }
    if (l.ok && Array.isArray(l.body)) {
      const person = m.ok && 'person' in m.body ? m.body.person : ''
      dispatch({ type: 'lanes', lanes: l.body, readAt: prefs.get<Record<string, string>>(prefs.keys.read(person), {}) })
    } else {
      dispatch({ type: 'lanes_failed' })
    }
  }, [])

  const loadProfiles = useCallback(async () => {
    const [ps, mine] = await Promise.all([api.profiles(), api.myProfile()])
    if (ps.ok && Array.isArray(ps.body)) dispatch({ type: 'profiles', profiles: ps.body })
    if (mine.ok && (mine.body as MyProfile).prefs) dispatch({ type: 'my_prefs', prefs: storedOf(mine.body as MyProfile) })
  }, [])

  const loadThread = useCallback(async (lane: string) => {
    const r = await api.messages(lane)
    if (r.ok && Array.isArray(r.body)) dispatch({ type: 'thread', lane, items: r.body })
  }, [])

  const mergeThread = useCallback((lane: string, items: ThreadItem[]) => dispatch({ type: 'thread_merge', lane, items }), [])

  const loadHealth = useCallback(async () => {
    const r = await api.health()
    if (r.ok && r.body.opencode) dispatch({ type: 'health', health: r.body })
  }, [])

  useEffect(() => {
    void loadLanes()
    void loadHealth()
    void loadProfiles()
    const t = setInterval(() => void loadHealth(), 30000)
    return () => clearInterval(t)
  }, [loadLanes, loadHealth, loadProfiles])

  // Profile names win over people.json names everywhere displayName is used.
  useEffect(() => {
    registerNames(Object.fromEntries(Object.values(store.profiles).map((p) => [p.person_id, p.name])))
  }, [store.profiles])

  // The effective prefs of this person on this device, applied live (a second tab or device follows through the stream).
  const effective = useMemo(() => effectivePrefs(store.prefs, store.me?.device_id), [store.prefs, store.me?.device_id])
  useEffect(() => {
    applyEffective(effective)
  }, [effective])
  // Pins and section states saved in the profile win over the local cache (a second tab or device follows through the stream).
  const meId = store.me?.person
  useEffect(() => {
    const r = effective.rail
    if (!r || !meId) return
    if (Array.isArray(r.pins)) { setPinned(r.pins); prefs.set(prefs.keys.pinned(meId), r.pins) }
    if (r.sections) { setRailSections(r.sections); prefs.set(prefs.keys.rail(meId), r.sections) }
    if (Array.isArray(r.appOrder) || Array.isArray(r.bayLaneOrder)) {
      const o = { appOrder: r.appOrder ?? [], bayLaneOrder: r.bayLaneOrder ?? [] }
      setOrders(o)
      prefs.set(prefs.keys.railOrder(meId), o)
    }
  }, [effective, meId])

  // The one stream. On a reconnect, resync the rail and every thread already loaded.
  useEffect(() => {
    return connect({
      onEvent: (ev) => dispatch({ type: 'frame', ev, now: Date.now() }),
      onUp: (reconnect) => {
        dispatch({ type: 'stream_state', up: true })
        if (reconnect) {
          void loadLanes()
          void loadHealth()
          void loadProfiles()
          for (const id of Object.keys(storeRef.current.threads)) void loadThread(id)
        }
      },
      onDown: () => dispatch({ type: 'stream_state', up: false }),
    })
  }, [loadLanes, loadHealth, loadProfiles, loadThread])

  // Persist the read marks per person, per device.
  useEffect(() => {
    if (store.me && Object.keys(store.readAt).length) prefs.set(prefs.keys.read(store.me.person), store.readAt)
  }, [store.readAt, store.me])

  // Persist each lane's dock layout per person, per device. Layout only; try/catch lives in prefs.
  useEffect(() => {
    const person = store.me?.person
    if (!person) return
    for (const [lane, d] of Object.entries(store.docks)) {
      if (savedDocks.current.get(lane) === d) continue
      savedDocks.current.set(lane, d)
      prefs.set(prefs.keys.dock(person, lane), saveOf(d))
    }
  }, [store.docks, store.me])

  const dock = useMemo<DockApi>(
    () => ({
      hydrate: (lane, fixed) => {
        const person = storeRef.current.me?.person
        if (!person || storeRef.current.docks[lane]) return
        dispatch({ type: 'dock_hydrate', lane, saved: prefs.get<unknown>(prefs.keys.dock(person, lane), null), defaults: readDefaultsOverride(prefs.get<unknown>(prefs.keys.dockDefaults(person, lane), null)), fixed: fixed ?? null })
      },
      open: (lane, surface, expand) => dispatch({ type: 'dock_open', lane, surface, expand }),
      expand: (lane, id) => dispatch({ type: 'dock_expand', lane, id }),
      collapse: (lane) => dispatch({ type: 'dock_collapse', lane }),
      close: (lane, id) => dispatch({ type: 'dock_close', lane, id }),
      hide: (lane) => dispatch({ type: 'dock_hide', lane }),
      move: (lane, id, by) => dispatch({ type: 'dock_move', lane, id, by }),
      restore: (lane) => dispatch({ type: 'dock_restore', lane }),
      setWidth: (lane, width) => dispatch({ type: 'dock_width', lane, width }),
      markAuto: (lane, id) => dispatch({ type: 'dock_auto', lane, id }),
      select: (lane, selection) => dispatch({ type: 'select', lane, selection }),
      patchSurface: (lane, id, patch) => dispatch({ type: 'surface_state', lane, id, patch }),
    }),
    [],
  )

  const transmit = useCallback(async (lane: string, clientId: string) => {
    const p = payloads.current.get(clientId)
    if (!p) return
    const r = await api.send(lane, { text: p.text, client_id: clientId, ...(p.reply_to ? { reply_to: p.reply_to } : {}), ...(p.attachments?.length ? { attachments: p.attachments.map((a) => (isContext(a) ? { mode: 'context' as const, ref: a.ref, kind: a.kind, name: a.name, ...(a.lane ? { lane: a.lane } : {}) } : { id: a.id })) } : {}) })
    if (r.ok && r.body.message) {
      payloads.current.delete(clientId)
      dispatch({ type: 'send_ok', lane, client_id: clientId, message: r.body.message, now: Date.now() })
    } else {
      const err = r.status === 0 ? 'no_connection' : ((r.body as { error?: string }).error ?? 'error')
      dispatch({ type: 'send_fail', lane, client_id: clientId, error: err })
    }
  }, [])

  const send = useCallback(
    (lane: string, text: string, replyTo?: ReplyTo, attachments?: MessageAttachment[]) => {
      const clientId = newClientId()
      payloads.current.set(clientId, { lane, text, reply_to: replyTo, attachments })
      dispatch({
        type: 'send_start',
        lane,
        send: { client_id: clientId, text, at: new Date().toISOString(), reply_to: replyTo, ...(attachments?.length ? { attachments } : {}), state: 'sending' },
      })
      void transmit(lane, clientId)
    },
    [transmit],
  )

  const retry = useCallback(
    (lane: string, clientId: string) => {
      const p = payloads.current.get(clientId)
      const failed = storeRef.current.threads[lane]?.pending.find((x) => x.client_id === clientId)
      if (p && failed?.error === 'reply_to_not_found') delete p.reply_to
      dispatch({ type: 'send_retry', lane, client_id: clientId })
      void transmit(lane, clientId) // the same client id: the server is idempotent on it
    },
    [transmit],
  )

  const discard = useCallback((lane: string, clientId: string) => {
    payloads.current.delete(clientId)
    dispatch({ type: 'send_drop', lane, client_id: clientId })
  }, [])

  const answerAsk = useCallback(
    async (lane: string, itemId: string, requestId: string, d: Decision) => {
      const r = await api.replyAsk(lane, requestId, d)
      const body = r.body as { ask?: import('@/lib/types').AskItem; error?: string; reason?: string }
      if (r.ok && body.ask) {
        dispatch({ type: 'ask_answered', lane, ask: body.ask })
        return null
      }
      const err = body.error ?? 'error'
      if (err === 'already_answered' || err === 'ask_gone') void loadThread(lane)
      void itemId
      return err === 'owners_only'
        ? 'Only an owner can answer this.'
        : err === 'always_not_allowed'
          ? 'Always is not allowed here' + (body.reason ? ': ' + body.reason : '') + '. Allow once instead.'
          : err === 'already_answered' || err === 'ask_gone'
            ? 'Already answered elsewhere.'
            : 'Not sent: ' + err
    },
    [loadThread],
  )

  const formOutcome = useCallback(
    (lane: string, r: { ok: boolean; body: unknown }): FormOutcome => {
      const body = r.body as { form?: import('@/lib/types').FormItem; error?: string; fields?: Record<string, string> }
      if (r.ok && body.form) {
        dispatch({ type: 'form_settled', lane, form: body.form })
        return { error: null }
      }
      const err = body.error ?? 'error'
      if (err === 'already_answered' || err === 'form_gone') void loadThread(lane)
      const text =
        err === 'invalid_answer'
          ? 'Some answers need another look.'
          : err === 'not_a_member'
            ? 'Only members of this lane can answer.'
            : err === 'already_answered' || err === 'form_gone'
              ? 'Already answered elsewhere.'
              : err === 'no_session' || err === 'opencode_not_configured'
                ? agentName(storeRef.current.lanes[lane]) + ' is not reachable right now.'
                : 'Not sent: ' + err
      return { error: text, fields: body.fields }
    },
    [loadThread],
  )
  const answerForm = useCallback(async (lane: string, formId: string, answer: Values) => formOutcome(lane, await api.replyForm(lane, formId, answer)), [formOutcome])
  const cancelForm = useCallback(async (lane: string, formId: string) => formOutcome(lane, await api.cancelForm(lane, formId)), [formOutcome])

  const cardAction = useCallback(
    async (lane: string, cardId: string, actionId: string) => {
      const r = await api.cardAction(lane, cardId, actionId)
      if (r.ok && r.body.card) {
        dispatch({ type: 'frame', ev: { type: 'card', lane, card: r.body.card }, now: Date.now() })
        return null
      }
      const err = r.body.error ?? 'error'
      if (err === 'already_resolved') void loadThread(lane)
      return err === 'owners_only'
        ? 'Only an owner can do this.'
        : err === 'not_a_member'
          ? 'Only members of this lane can do this.'
          : err === 'already_resolved'
            ? 'Already handled elsewhere.'
            : 'Not sent: ' + err
    },
    [loadThread],
  )

  const stop = useCallback(async (lane: string) => {
    const r = await api.interrupt(lane)
    return r.ok ? null : 'Not stopped: ' + ((r.body as { error?: string }).error ?? 'error')
  }, [])

  const deleteLocal = useCallback(async (lane: string, id: string) => {
    const r = await api.removeLocal(lane, id)
    if (r.ok) {
      dispatch({ type: 'frame', ev: { type: 'removed', lane, id }, now: Date.now() })
      return null
    }
    return 'Not deleted: ' + ((r.body as { error?: string }).error ?? 'error')
  }, [])

  const forward = useCallback(async (lane: string, ids: string[], toLanes: string[], note?: string) => {
    const r = await api.forward(lane, { message_ids: ids, to_lanes: toLanes, ...(note?.trim() ? { note: note.trim() } : {}) })
    if (r.ok && Array.isArray(r.body.forwarded)) return null
    const err = r.body.error ?? 'error'
    return err === 'not_a_member' ? 'You can only forward to lanes you belong to.' : err === 'no_such_message' ? 'One of those messages is gone.' : 'Not forwarded: ' + err
  }, [])

  const profileOutcome = useCallback((r: { ok: boolean; body: unknown }): ProfileOutcome => {
    const body = r.body as MyProfile & { error?: string; fields?: Record<string, string> }
    if (r.ok && body.profile) {
      dispatch({ type: 'frame', ev: { type: 'profile_update', profile: body.profile, prefs: storedOf(body) }, now: Date.now() })
      return { error: null }
    }
    return { error: body.error === 'invalid' ? 'Some fields need another look.' : 'Not saved: ' + (body.error ?? 'error'), fields: body.fields }
  }, [])

  const saveProfile = useCallback(
    async (patch: ProfilePatch) => {
      const body: Parameters<typeof api.saveProfile>[0] = {}
      if (patch.name !== undefined) body.name = patch.name
      if (patch.tag !== undefined) body.tag = patch.tag
      if (patch.prefs) {
        // Every device means the person-level default, and this device's own override is cleared so the default shows through.
        body.prefs =
          patch.prefs.scope === 'all'
            ? { default: patch.prefs.values, device: Object.fromEntries(Object.keys(patch.prefs.values).map((k) => [k, null])) }
            : { device: patch.prefs.values }
      }
      return profileOutcome(await api.saveProfile(body))
    },
    [profileOutcome],
  )
  const uploadAvatar = useCallback(async (png: Blob) => {
    const r = await api.uploadAvatar(png)
    if (r.ok && r.body.profile) {
      dispatch({ type: 'frame', ev: { type: 'profile_update', profile: r.body.profile, prefs: storedOf(r.body) }, now: Date.now() })
      return null
    }
    return r.body.error === 'png_only' ? 'The picture must be a PNG.' : r.body.error === 'too_large' ? 'That picture is too large.' : 'Not saved: ' + (r.body.error ?? 'error')
  }, [])
  const removeAvatar = useCallback(async () => {
    const r = await api.removeAvatar()
    if (r.ok && r.body.profile) {
      dispatch({ type: 'frame', ev: { type: 'profile_update', profile: r.body.profile, prefs: storedOf(r.body) }, now: Date.now() })
      return null
    }
    return 'Not removed: ' + (r.body.error ?? 'error')
  }, [])

  const markRead = useCallback((lane: string, at: string) => dispatch({ type: 'mark_read', lane, at }), [])

  const saveRail = useCallback(
    (next: RailPrefs) => {
      void saveProfile({ prefs: { scope: 'device', values: { rail: next } } })
    },
    [saveProfile],
  )
  const togglePin = useCallback(
    (lane: string) => {
      const person = storeRef.current.me?.person
      if (!person) return
      const cur = prefs.get<string[]>(prefs.keys.pinned(person), railRef.current.pins ?? [])
      const next = cur.includes(lane) ? cur.filter((x) => x !== lane) : cur.concat(lane)
      prefs.set(prefs.keys.pinned(person), next)
      setPinned(next)
      saveRail({ ...railRef.current, pins: next })
    },
    [saveRail],
  )
  const setRailSection = useCallback(
    (key: string, state: RailState) => {
      const person = storeRef.current.me?.person
      const sections = { ...railRef.current.sections, [key]: state }
      if (state === 'open') delete sections[key]
      setRailSections(sections)
      if (person) prefs.set(prefs.keys.rail(person), sections)
      saveRail({ ...railRef.current, sections })
    },
    [saveRail],
  )

  const setRailOrder = useCallback(
    (key: 'appOrder' | 'bayLaneOrder', ids: string[]) => {
      const person = storeRef.current.me?.person
      const o = { appOrder: railRef.current.appOrder ?? [], bayLaneOrder: railRef.current.bayLaneOrder ?? [], [key]: ids }
      setOrders(o)
      if (person) prefs.set(prefs.keys.railOrder(person), o)
      saveRail({ ...railRef.current, [key]: ids })
    },
    [saveRail],
  )

  // Quick action "Report": sends "report" to the hardware lane (the digest).
  const quickReport = useCallback(() => send('hardware', 'report'), [send])

  const value = useMemo<AppApi>(
    () => ({ store, dock, loadThread, mergeThread, send, retry, discard, answerAsk, answerForm, cancelForm, cardAction, refreshHealth: loadHealth, reloadLanes: loadLanes, stop, deleteLocal, markRead, pinned: pinnedState, togglePin, railSections, setRailSection, appOrder: orders.appOrder, bayLaneOrder: orders.bayLaneOrder, setRailOrder, quickReport, toast, forward, saveProfile, uploadAvatar, removeAvatar }),
    [store, loadThread, mergeThread, send, retry, discard, answerAsk, answerForm, cancelForm, cardAction, loadHealth, loadLanes, stop, deleteLocal, markRead, pinnedState, togglePin, railSections, setRailSection, orders, setRailOrder, quickReport, dock, forward, saveProfile, uploadAvatar, removeAvatar],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        role="status"
        className={'pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-md transition-opacity ' + (toastText ? 'opacity-100' : 'opacity-0')}
      >
        {toastText}
      </div>
    </Ctx.Provider>
  )
}
