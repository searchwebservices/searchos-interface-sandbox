// Universal search helpers: the local half of the matching (lanes, pages, surfaces, people, LAN devices), the recent
// searches kept per device, and the group vocabulary. The server half is GET /api/search (api.search).
import { STANDING, STANDING_TITLE } from './dock'
import type { StandingId } from './dock'
import type { LanDevice, LaneRow } from './types'

export type GroupId = 'lanes' | 'messages' | 'files' | 'devices' | 'people' | 'surfaces' | 'pages'
export const GROUP_ORDER: GroupId[] = ['lanes', 'messages', 'files', 'devices', 'people', 'surfaces', 'pages']
export const GROUP_LABEL: Record<GroupId, string> = { lanes: 'Lanes', messages: 'Messages', files: 'Files', devices: 'Devices', people: 'People', surfaces: 'Surfaces', pages: 'Pages' }
// Each group shows this many before "More".
export const GROUP_CAP = 5
export const RECENT_MAX = 8
export const DEBOUNCE_MS = 220
export const MIN_REMOTE = 2

export const norm = (s: unknown): string => String(s ?? '').toLowerCase()
export const matches = (q: string, ...fields: unknown[]): boolean => {
  const n = norm(q).trim()
  return !!n && fields.some((f) => norm(f).includes(n))
}

export type PageId = 'devices' | 'lan' | 'health' | 'library' | 'profile'
export const PAGES: { id: PageId; title: string; words: string; admin?: boolean }[] = [
  { id: 'devices', title: 'Devices', words: 'approve revoke browsers laptops phones', admin: true },
  { id: 'lan', title: 'LAN', words: 'network map topology wifi router' },
  { id: 'health', title: 'Health', words: 'status gilfoyle opencode sessions' },
  { id: 'library', title: 'Library', words: 'files uploads documents' },
  { id: 'profile', title: 'Profile', words: 'your name avatar settings theme font' },
]

export const matchLanes = (q: string, lanes: LaneRow[]): LaneRow[] => lanes.filter((l) => matches(q, l.title, l.id, l.last?.text))
export const matchPages = (q: string, admin: boolean) => PAGES.filter((p) => (!p.admin || admin) && matches(q, p.title, p.words))
export const matchSurfaces = (q: string): { id: StandingId; title: string }[] => STANDING.filter((id) => matches(q, STANDING_TITLE[id], id)).map((id) => ({ id, title: STANDING_TITLE[id] }))
export const matchLan = (q: string, devices: LanDevice[]): LanDevice[] => devices.filter((d) => matches(q, d.label, d.vendor, d.mac, d.last_ip))
export const matchPeople = (q: string, people: { id: string; name: string }[]) => people.filter((p) => matches(q, p.name, p.id))

// ---- recent searches, per device (localStorage is per browser profile, which is the device)
const RECENT_KEY = 'sov.search.recent'
export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}
export function pushRecent(q: string): string[] {
  const t = q.trim()
  if (t.length < 2) return readRecent()
  const next = [t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  return next
}
export function clearRecent(): void {
  try { localStorage.removeItem(RECENT_KEY) } catch { /* ignore */ }
}
