// The dock's vocabulary (docs/surfaces-spec.md sections 1 and 2): which surfaces exist, which a lane starts with, and
// the saved layout shape. Pure data and small helpers, no DOM; the reducer in store.ts holds the state.
export const STANDING = ['topology', 'iface', 'files', 'approvals', 'scratch'] as const
export type StandingId = (typeof STANDING)[number]

export const STANDING_TITLE: Record<StandingId, string> = {
  topology: 'Network topology',
  iface: 'Interface health',
  files: 'Lane files',
  approvals: 'Approval queue',
  scratch: 'Scratchpad',
}

export const DOCK_MIN = 360
export const DOCK_MAX = 520
export const DOCK_DEFAULT = 420
export const clampWidth = (w: number): number => (Number.isFinite(w) ? Math.min(DOCK_MAX, Math.max(DOCK_MIN, Math.round(w))) : DOCK_DEFAULT)

// Default dock per lane. A starting set, not a rule: any surface opens in any lane the person can see.
export function defaultSurfaces(laneId: string, kind: 'dm' | 'group' | 'desk' | undefined): StandingId[] {
  if (laneId === 'hardware') return ['topology', 'iface', 'files']
  if (kind === 'dm' || kind === 'desk' || laneId.startsWith('dm-')) return ['approvals', 'scratch']
  if (laneId === 'standards') return ['files']
  if (laneId === 'lab') return ['scratch', 'files']
  return []
}

export const isStanding = (id: string): id is StandingId => (STANDING as readonly string[]).includes(id)

// One open surface. A standing surface is its id. A card surface is `card:<card id>`, resolved live from the thread.
// A file never has a tab of its own: it opens inside Lane files. Layouts saved before that (kind 'file', or a card tab
// for a file_retrieval card) are dropped on load.
export interface DockSurface {
  id: string
  kind: 'standing' | 'card'
  title: string
  // Which part of a card to show.
  arg?: unknown
  // The card's kind, for the tab icon.
  cardKind?: string
}

export const standingSurface = (id: StandingId): DockSurface => ({ id, kind: 'standing', title: STANDING_TITLE[id] })

export interface DockState {
  surfaces: DockSurface[]
  // The expanded one; null when all are collapsed to tabs.
  active: string | null
  hidden: boolean
  width: number
  // Bumped on every open, so a narrow screen can raise its sheet.
  seq: number
  // Card ids whose `auto` open action already fired on this device.
  auto: string[]
}

export const emptyDock = (): DockState => ({ surfaces: [], active: null, hidden: false, width: DOCK_DEFAULT, seq: 0, auto: [] })

// A per-device override of a lane's default set (sov.dock.defaults.v1.<person>.<lane>) wins over the built-in one.
export const effectiveDefaults = (laneId: string, kind: 'dm' | 'group' | 'desk' | undefined, override?: StandingId[] | null): StandingId[] =>
  override ?? defaultSurfaces(laneId, kind)

// Read a saved override defensively: anything that is not a list of standing ids is "no override".
export function readDefaultsOverride(saved: unknown): StandingId[] | null {
  if (!Array.isArray(saved)) return null
  return saved.filter((x, i): x is StandingId => typeof x === 'string' && isStanding(x) && saved.indexOf(x) === i)
}

export function defaultDock(laneId: string, kind: 'dm' | 'group' | 'desk' | undefined, override?: StandingId[] | null): DockState {
  const surfaces = effectiveDefaults(laneId, kind, override).map(standingSurface)
  return { ...emptyDock(), surfaces, active: surfaces[0]?.id ?? null }
}

// A shell with a fixed dock holds exactly these standing surfaces, whatever was saved or overridden. Card surfaces stay.
// Missing ones come first in the fixed order; a saved order among the present ones is kept.
export function enforceFixed(d: DockState, fixed: StandingId[]): DockState {
  const kept = d.surfaces.filter((s) => s.kind !== 'standing' || fixed.includes(s.id as StandingId))
  const missing = fixed.filter((id) => !kept.some((s) => s.id === id)).map(standingSurface)
  const surfaces = missing.length || kept.length !== d.surfaces.length ? [...missing, ...kept] : d.surfaces
  const active = d.active === null || surfaces.some((s) => s.id === d.active) ? d.active : (surfaces[0]?.id ?? null)
  return surfaces === d.surfaces && active === d.active ? d : { ...d, surfaces, active }
}

// What is saved in localStorage sov.dock.v1.<person>.<lane>: layout only. The contents come from the server.
export interface SavedDock {
  v: 1
  surfaces: DockSurface[]
  active: string | null
  hidden: boolean
  width: number
  auto: string[]
}

export const saveOf = (d: DockState): SavedDock => ({ v: 1, surfaces: d.surfaces, active: d.active, hidden: d.hidden, width: d.width, auto: d.auto.slice(-200) })

// Read a saved layout defensively: anything that does not fit falls back to the default.
export function restore(saved: unknown, fallback: DockState): DockState {
  const o = saved as Partial<SavedDock> | null
  if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.surfaces)) return fallback
  const surfaces: DockSurface[] = []
  for (const s of o.surfaces) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.title !== 'string') continue
    if (s.kind === 'standing' && isStanding(s.id)) surfaces.push(standingSurface(s.id))
    else if (s.kind === 'card' && s.id.startsWith('card:') && s.cardKind !== 'file_retrieval') surfaces.push({ id: s.id, kind: 'card', title: s.title.slice(0, 200), ...(typeof s.cardKind === 'string' ? { cardKind: s.cardKind.slice(0, 60) } : {}), ...(s.arg !== undefined ? { arg: s.arg } : {}) })
  }
  const active = typeof o.active === 'string' && surfaces.some((s) => s.id === o.active) ? o.active : null
  return {
    surfaces,
    active,
    hidden: o.hidden === true,
    width: clampWidth(Number(o.width)),
    seq: 0,
    auto: Array.isArray(o.auto) ? o.auto.filter((x): x is string => typeof x === 'string').slice(-200) : [],
  }
}

// The resource shared by every surface in a lane (a device, a file or a run). Per lane, not persisted.
export interface Selection {
  kind: 'device' | 'file' | 'run'
  id: string
  label: string
}
