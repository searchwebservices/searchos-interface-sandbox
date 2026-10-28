// Pure helpers of the estate map: the tree index, what is expanded, the rows the tree panel shows, and arrow keys.
import type { EstateNode } from '../types'

export interface Indexed { node: EstateNode; parent: string | null; depth: number }

export function indexTree(root: EstateNode): Map<string, Indexed> {
  const out = new Map<string, Indexed>()
  const walk = (n: EstateNode, parent: string | null, depth: number) => {
    out.set(n.id, { node: n, parent, depth })
    for (const c of n.children ?? []) walk(c, n.id, depth + 1)
  }
  walk(root, null, 0)
  return out
}

// The root is open, so its groups are drawn around it; deeper levels open on click.
export function initialExpanded(root: EstateNode, levels = 1): Set<string> {
  const out = new Set<string>()
  const walk = (n: EstateNode, depth: number) => {
    if (depth >= levels || !n.children?.length) return
    out.add(n.id)
    for (const c of n.children) walk(c, depth + 1)
  }
  walk(root, 0)
  return out
}

export function ancestorsOf(index: Map<string, Indexed>, id: string): string[] {
  const out: string[] = []
  let p = index.get(id)?.parent ?? null
  while (p) {
    out.push(p)
    p = index.get(p)?.parent ?? null
  }
  return out
}

export const matches = (n: EstateNode, q: string): boolean => {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (n.title + ' ' + (n.subtitle ?? '') + ' ' + n.kind + ' ' + n.id).toLowerCase().includes(s)
}

export interface Row { node: EstateNode; depth: number; hasKids: boolean; open: boolean }

// The tree panel's rows. Without a query: the expanded part. With one: every match plus the path to it, all open.
export function visibleRows(root: EstateNode, expanded: ReadonlySet<string>, query: string): Row[] {
  const q = query.trim()
  const rows: Row[] = []
  if (!q) {
    const walk = (n: EstateNode, depth: number) => {
      const hasKids = !!n.children?.length
      const open = hasKids && expanded.has(n.id)
      rows.push({ node: n, depth, hasKids, open })
      if (open) for (const c of n.children!) walk(c, depth + 1)
    }
    walk(root, 0)
    return rows
  }
  const keep = (n: EstateNode): boolean => {
    let any = matches(n, q)
    for (const c of n.children ?? []) if (keep(c)) any = true
    if (any) keepSet.add(n.id)
    return any
  }
  const keepSet = new Set<string>()
  keep(root)
  const walk = (n: EstateNode, depth: number) => {
    if (!keepSet.has(n.id)) return
    const kids = (n.children ?? []).filter((c) => keepSet.has(c.id))
    rows.push({ node: n, depth, hasKids: kids.length > 0, open: kids.length > 0 })
    for (const c of kids) walk(c, depth + 1)
  }
  walk(root, 0)
  return rows
}

export interface KeyResult { selected: string; expanded: Set<string> }

// Tree keys: Down and Up walk the rows, Right opens (or steps into) a node, Left closes (or steps out to the parent).
export function onTreeKey(key: string, rows: Row[], selected: string, expanded: ReadonlySet<string>, index: Map<string, Indexed>): KeyResult | null {
  if (!rows.length) return null
  const at = Math.max(0, rows.findIndex((r) => r.node.id === selected))
  const next = new Set(expanded)
  const cur = rows[at]
  if (key === 'ArrowDown') return { selected: rows[Math.min(rows.length - 1, selected ? at + 1 : 0)].node.id, expanded: next }
  if (key === 'ArrowUp') return { selected: rows[Math.max(0, at - 1)].node.id, expanded: next }
  if (key === 'ArrowRight') {
    if (cur.hasKids && !cur.open) { next.add(cur.node.id); return { selected: cur.node.id, expanded: next } }
    if (cur.hasKids && rows[at + 1]) return { selected: rows[at + 1].node.id, expanded: next }
    return { selected: cur.node.id, expanded: next }
  }
  if (key === 'ArrowLeft') {
    if (cur.hasKids && cur.open) { next.delete(cur.node.id); return { selected: cur.node.id, expanded: next } }
    return { selected: index.get(cur.node.id)?.parent ?? cur.node.id, expanded: next }
  }
  return null
}

export type Tone = 'ok' | 'warn' | 'bad' | 'idle'
const OK = ['up', 'ok', 'active', 'running', 'healthy', 'online', 'enabled', 'live', 'alive', 'green']
const WARN = ['warn', 'warning', 'degraded', 'stale', 'pending', 'paused', 'slow', 'amber']
const BAD = ['down', 'failed', 'error', 'dead', 'crashed', 'unreachable', 'offline', 'red', 'broken']
export function statusTone(status?: string | null): Tone {
  const s = (status ?? '').toLowerCase()
  if (OK.includes(s)) return 'ok'
  if (WARN.includes(s)) return 'warn'
  if (BAD.includes(s)) return 'bad'
  return 'idle'
}

export function metaValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

export function countNodes(root: EstateNode): number {
  let n = 0
  const walk = (x: EstateNode) => { n += 1; for (const c of x.children ?? []) walk(c) }
  walk(root)
  return n
}

// Folders with hundreds of children never fan out at once: an open node shows its first PAGE children and a "+N more"
// tile that opens the next PAGE. `pages` says how many pages of a node are open (default 1).
export const PAGE = 20
export const MORE_PREFIX = 'more:'
export type ViewNode = EstateNode & { more?: { parent: string; hidden: number } }

export function limitedTree(root: EstateNode, expanded: ReadonlySet<string>, pages: ReadonlyMap<string, number>): ViewNode {
  const walk = (n: EstateNode): ViewNode => {
    if (!expanded.has(n.id) || !n.children?.length) return { ...n, children: undefined }
    const shown = Math.min(n.children.length, (pages.get(n.id) ?? 1) * PAGE)
    const kids: ViewNode[] = n.children.slice(0, shown).map(walk)
    const hidden = n.children.length - shown
    if (hidden > 0) kids.push({ id: MORE_PREFIX + n.id, kind: 'more', title: '+' + hidden + ' more', subtitle: 'show the next ' + Math.min(PAGE, hidden), more: { parent: n.id, hidden } })
    return { ...n, children: kids }
  }
  return walk(root)
}

// Pages that must be open so every ancestor's child on the way to `id` is drawn.
export function pagesToReveal(index: Map<string, Indexed>, id: string, pages: ReadonlyMap<string, number>): Map<string, number> {
  const next = new Map(pages)
  let cur = id
  let p = index.get(cur)?.parent ?? null
  while (p) {
    const at = index.get(p)!.node.children!.findIndex((c) => c.id === cur)
    const need = Math.floor(at / PAGE) + 1
    if ((next.get(p) ?? 1) < need) next.set(p, need)
    cur = p
    p = index.get(cur)?.parent ?? null
  }
  return next
}
