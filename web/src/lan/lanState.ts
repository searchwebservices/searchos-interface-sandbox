// The LAN view state both the #/lan page and the Network topology dock surface read: the lenses, the node spacing, the
// focused node and the open profile. One store, so a filter set in the dock is still set on the page (and the other way
// round), and both persist to the same per-person prefs key. While nobody is mounted the store holds nothing: the first
// view to mount loads it from prefs again.
import { useSyncExternalStore } from 'react'
import * as prefs from '@/lib/prefs'
import { clampSpacing, SPACING_DEFAULT } from './layout'
import { ACT_ORDER, CLASS_ORDER, CONN_ORDER, NO_LENS, TYPE_ORDER, type Lens } from './model'

export interface LanUi {
  person: string | undefined
  lens: Lens
  spacing: number
  focus: string | null
  open: string | null
}

const arr = <T,>(v: unknown, ok: readonly T[]): T[] => (Array.isArray(v) ? v.filter((x): x is T => ok.includes(x as T)) : [])

export function loadSaved(person: string | undefined): Pick<LanUi, 'lens' | 'spacing'> {
  const raw = person ? prefs.get<{ lens?: Partial<Lens>; spacing?: number } | null>(prefs.keys.lan(person), null) : null
  const l = (raw?.lens ?? {}) as Partial<Lens>
  return {
    lens: {
      classes: arr(l.classes, [...CLASS_ORDER, 'none'] as const),
      types: arr(l.types, TYPE_ORDER),
      conns: arr(l.conns, CONN_ORDER),
      acts: arr(l.acts, ACT_ORDER),
      q: typeof l.q === 'string' ? l.q : '',
    },
    spacing: typeof raw?.spacing === 'number' ? clampSpacing(raw.spacing) : SPACING_DEFAULT,
  }
}

let ui: LanUi = { person: undefined, lens: NO_LENS, spacing: SPACING_DEFAULT, focus: null, open: null }
let loaded = false
let subs = 0
const listeners = new Set<() => void>()

function ensure(person: string | undefined): void {
  if (loaded && ui.person === person) return
  if (loaded && subs > 0 && ui.person !== undefined && person === undefined) return
  ui = { person, ...loadSaved(person), focus: null, open: null }
  loaded = true
}
function set(p: Partial<LanUi>): void {
  ui = { ...ui, ...p }
  if (ui.person && ('lens' in p || 'spacing' in p)) prefs.set(prefs.keys.lan(ui.person), { lens: ui.lens, spacing: ui.spacing })
  listeners.forEach((l) => l())
}
function subscribe(l: () => void): () => void {
  subs++
  listeners.add(l)
  return () => {
    listeners.delete(l)
    subs--
    if (subs === 0) loaded = false
  }
}

export interface LanUiApi extends LanUi {
  setLens: (l: Lens | ((l: Lens) => Lens)) => void
  setSpacing: (v: number) => void
  setFocus: (id: string | null) => void
  setOpen: (id: string | null) => void
}
const api: Omit<LanUiApi, keyof LanUi> = {
  setLens: (l) => set({ lens: typeof l === 'function' ? l(ui.lens) : l }),
  setSpacing: (v) => set({ spacing: clampSpacing(v) }),
  setFocus: (id) => set({ focus: id }),
  setOpen: (id) => set({ open: id }),
}

export function useLanUi(person: string | undefined): LanUiApi {
  ensure(person)
  const snap = useSyncExternalStore(subscribe, () => ui)
  return { ...snap, ...api }
}
