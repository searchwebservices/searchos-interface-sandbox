// The dock replaces the Sheet as the place surfaces are shown (docs/surfaces-spec.md section 1). It provides the same
// SurfaceApi the Sheet host did, so the card registry and the cards are untouched: a card's Open asks the host and the
// host puts the surface in the dock. State per lane lives in the store; the layout is saved per device by the app.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '@/app/AppContext'
import { entryOf } from '@/cards/registry'
import { SurfaceContext } from '@/cards/surface-context'
import type { SurfaceApi } from '@/cards/surface-context'
import type { CardView } from '@/cards/types'
import { dockFor, selectionOf } from '@/lib/store'
import { dirOfPath } from '@/lib/filetree'
import { defaultDock, effectiveDefaults, readDefaultsOverride, standingSurface } from '@/lib/dock'
import * as prefs from '@/lib/prefs'
import type { DockSurface, Selection, StandingId } from '@/lib/dock'
import type { CardObject, LaneFileRow } from '@/lib/types'
import { DockContext } from './context'
import type { DockApiForLane } from './context'
import { useNarrow } from './hooks'

export const cardSurface = (card: CardView, arg?: unknown): DockSurface => ({
  id: 'card:' + card.id,
  kind: 'card',
  cardKind: String(card.kind),
  title: entryOf(card.kind)?.title(card) ?? String(card.kind),
  ...(arg !== undefined ? { arg } : {}),
})

// A file picked in Lane files opens in the File Preview, inside Lane files: the same view a file_retrieval card opens,
// on a card made for the one file.
// A card id is capped by the envelope, a path is not: the id is a short hash of the path.
export function shortHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export function fileCard(lane: string, row: LaneFileRow, id?: string): CardObject {
  const at = row.mtime || new Date().toISOString()
  return {
    id: 'file:' + shortHash(row.path),
    kind: 'file_retrieval',
    lane,
    data: { files: [{ ...(id ? { id } : {}), name: row.name, path: row.path, kind: row.kind, size: row.size, lane: row.lane }] },
    provenance: { source: 'person', at },
    actions: [{ id: 'open', label: 'Open', kind: 'open' }, { id: 'download', label: 'Download', kind: 'download' }],
    state: 'done',
    at,
  }
}

export function DockProvider({ laneId, cards, loaded, fixed, children }: { laneId: string; cards: CardView[]; loaded: boolean; fixed?: StandingId[]; children: ReactNode }) {
  const { store, dock } = useApp()
  const fixedKey = fixed?.join(',') ?? ''
  const fixedList = useMemo(() => (fixedKey ? (fixedKey.split(',') as StandingId[]) : null), [fixedKey])
  const stored = dockFor(store, laneId)
  // A fixed dock shows its own surfaces from the first paint, not the lane's built-in set until the layout hydrates.
  const seed = useMemo(() => (fixedList ? defaultDock(laneId, store.lanes[laneId]?.kind, fixedList) : null), [fixedList, laneId, store.lanes])
  const state = fixedList && !store.docks[laneId] && seed ? seed : stored
  const selection = selectionOf(store, laneId)
  const narrow = useNarrow()
  const [sheetOpen, setSheetOpen] = useState(false)
  const person = store.me?.person
  const kind = store.lanes[laneId]?.kind
  const [defaultsVer, setDefaultsVer] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => fixedList ?? effectiveDefaults(laneId, kind, person ? readDefaultsOverride(prefs.get<unknown>(prefs.keys.dockDefaults(person, laneId), null)) : null), [laneId, kind, person, defaultsVer, fixedList])
  const setDefault = useCallback(
    (id: StandingId, on: boolean) => {
      if (!person || fixedList) return
      const next = on ? (defaults.includes(id) ? defaults : [...defaults, id]) : defaults.filter((x) => x !== id)
      prefs.set(prefs.keys.dockDefaults(person, laneId), next)
      setDefaultsVer((v) => v + 1)
    },
    [person, laneId, defaults, fixedList],
  )
  // The saved layout (with the cards already auto opened) is in the store before anything auto opens.
  const hydrated = !!store.docks[laneId]

  // Seed from this device's saved layout the first time the lane is opened.
  useEffect(() => {
    if (person) dock.hydrate(laneId, fixedList ?? undefined)
  }, [person, laneId, dock, fixedList])

  // A surface opened while the dock is a bottom sheet raises the sheet.
  useEffect(() => {
    if (narrow && state.seq > 0) setSheetOpen(true)
  }, [state.seq, narrow])

  // A card whose open action is `auto: true` opens its surface once per device, never again on a reload. When
  // several are waiting only the newest opens; the others are marked so they do not pile up later.
  const waiting = useMemo(
    () => cards.filter((c) => c.state === 'open' && c.actions.some((a) => a.kind === 'open' && a.auto === true) && !state.auto.includes(c.id)),
    [cards, state.auto],
  )
  const waitingKey = waiting.map((c) => c.id).join(',')
  useEffect(() => {
    if (!person || !hydrated || !loaded || !waiting.length) return
    for (const c of waiting) dock.markAuto(laneId, c.id)
    openCard(waiting[waiting.length - 1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey, person, hydrated, loaded, laneId])

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const cardById = useCallback((id: string) => byId.get(id), [byId])
  const recentCards = useCallback((n: number) => cards.filter((c) => !c.source).slice(-n), [cards])

  // A file_retrieval card opens inside Lane files, one level below the folder the file is in. Every other card keeps
  // its own tab.
  const openFileView = useCallback(
    (card: CardView, arg: number) => {
      const f = (card.data as { files?: { name?: string; path?: string }[] } | null)?.files?.[arg]
      dock.patchSurface(laneId, 'files', { view: { card, arg }, dir: f?.path ? dirOfPath(f.path, laneId) : [] })
      dock.open(laneId, standingSurface('files'))
      if (f?.path) dock.select(laneId, { kind: 'file', id: f.path, label: f.name ?? f.path })
    },
    [dock, laneId],
  )
  const openCard = useCallback(
    (card: CardView, arg?: unknown) => (card.kind === 'file_retrieval' ? openFileView(card, typeof arg === 'number' && arg >= 0 ? arg : 0) : dock.open(laneId, cardSurface(card, arg))),
    [dock, laneId, openFileView],
  )
  const surfaceApi = useMemo<SurfaceApi>(() => ({ open: openCard, close: () => dock.collapse(laneId) }), [openCard, dock, laneId])

  const api = useMemo<DockApiForLane>(
    () => ({
      lane: laneId,
      state,
      selection,
      narrow,
      sheetOpen,
      setSheetOpen,
      openStanding: (id: StandingId) => dock.open(laneId, standingSurface(id)),
      openFile: (row, id) => openFileView(fileCard(laneId, row, id) as CardView, 0),
      openFolder: (dir) => {
        dock.patchSurface(laneId, 'files', { view: null, dir })
        dock.open(laneId, standingSurface('files'))
      },
      openCard,
      cardById,
      recentCards,
      select: (sel: Selection | null) => dock.select(laneId, sel),
      hide: () => dock.hide(laneId),
      defaults,
      fixed: fixedList,
      setDefault,
      restore: () => (narrow ? setSheetOpen(true) : dock.restore(laneId)),
    }),
    [laneId, state, selection, narrow, sheetOpen, dock, openCard, openFileView, cardById, recentCards, defaults, fixedList, setDefault],
  )

  return (
    <SurfaceContext.Provider value={surfaceApi}>
      <DockContext.Provider value={api}>{children}</DockContext.Provider>
    </SurfaceContext.Provider>
  )
}
