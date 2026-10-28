// Pure helpers of the clients pages: sorting, filtering, the map tree and the tone words.
import type { AppProject, ClientRow } from '../types'
import type { Tone } from '../map/estate'

export type SortKey = 'client' | 'projects' | 'mrr' | 'health' | 'ball' | 'last_contact'
export type SortDir = 'asc' | 'desc'

export function healthTone(h?: string | null): Tone {
  const s = (h ?? '').toLowerCase()
  if (['green', 'good', 'healthy', 'ok'].includes(s)) return 'ok'
  if (['amber', 'yellow', 'warn', 'warning', 'watch', 'at_risk', 'at risk'].includes(s)) return 'warn'
  if (['red', 'bad', 'critical', 'unhealthy'].includes(s)) return 'bad'
  return 'idle'
}
const TONE_RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, idle: 3 }

const text = (s?: string | null) => (s ?? '').toLowerCase()
const time = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0)

function compare(a: ClientRow, b: ClientRow, key: SortKey): number {
  switch (key) {
    case 'client': return text(a.name).localeCompare(text(b.name))
    case 'projects': return a.projects.length - b.projects.length
    case 'mrr': return (a.mrr_mxn ?? 0) - (b.mrr_mxn ?? 0)
    case 'health': return TONE_RANK[healthTone(a.health)] - TONE_RANK[healthTone(b.health)]
    case 'ball': return text(a.ball).localeCompare(text(b.ball))
    case 'last_contact': return time(a.last_contact_at) - time(b.last_contact_at)
  }
}

// Ties fall back to the name so the order is stable.
export function sortClients(rows: ClientRow[], key: SortKey, dir: SortDir): ClientRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => sign * compare(a, b, key) || text(a.name).localeCompare(text(b.name)))
}

export function filterClients(rows: ClientRow[], q: string): ClientRow[] {
  const s = q.trim().toLowerCase()
  if (!s) return rows
  return rows.filter((r) => [r.name, r.company_name, r.industry, r.owner, r.tier, r.health, r.ball, r.status, ...r.projects.map((p) => p.name)].some((v) => text(v).includes(s)))
}

export interface MapNode {
  id: string
  kind: 'search' | 'cluster' | 'client' | 'project' | 'more'
  title: string
  client?: ClientRow
  project?: AppProject
  children?: MapNode[]
}

const CLUSTERS: { tone: ReturnType<typeof healthTone>; title: string }[] = [
  { tone: 'bad', title: 'Needs attention' },
  { tone: 'warn', title: 'Watch' },
  { tone: 'ok', title: 'Healthy' },
  { tone: 'idle', title: 'No health set' },
]
export const PROJECTS_SHOWN = 3

// Search in the middle, one cluster per health reading, the clients inside it (worst MRR risk first by name),
// and each client's first projects hanging off it. A client with more projects gets a "+N" tile.
export function clientsTree(rows: ClientRow[]): MapNode {
  const clients = (c: ClientRow): MapNode => {
    const projects: MapNode[] = c.projects.slice(0, PROJECTS_SHOWN).map((p) => ({ id: 'p:' + c.id + ':' + p.id, kind: 'project' as const, title: p.name, project: p, client: c }))
    if (c.projects.length > PROJECTS_SHOWN) projects.push({ id: 'm:' + c.id, kind: 'more', title: '+' + (c.projects.length - PROJECTS_SHOWN) + ' more', client: c })
    return { id: 'c:' + c.id, kind: 'client', title: c.name, client: c, children: projects }
  }
  const children: MapNode[] = []
  for (const cl of CLUSTERS) {
    const members = rows.filter((r) => healthTone(r.health) === cl.tone).sort((a, b) => a.name.localeCompare(b.name))
    if (members.length) children.push({ id: 'g:' + cl.tone, kind: 'cluster', title: cl.title, children: members.map(clients) })
  }
  return { id: 'search', kind: 'search', title: 'Search', children }
}

// Everything in the clients map is open: projects hang off their client from the start.
export function allOpen(root: MapNode): Set<string> {
  const out = new Set<string>()
  const walk = (n: MapNode) => { if (n.children?.length) { out.add(n.id); n.children.forEach(walk) } }
  walk(root)
  return out
}
