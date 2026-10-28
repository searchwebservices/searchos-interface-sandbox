// Pure layouts for the app canvases: a tree in, tile positions out. Positions are tile top-left corners in flow units.
// Only the expanded part of the tree is laid out, which is what keeps a 3000 node estate cheap.
export interface TreeLike {
  id: string
  children?: TreeLike[]
}
export interface Placed<T> {
  id: string
  node: T
  depth: number
  x: number
  y: number
  w: number
  h: number
  parent: string | null
}
export interface Edge { id: string; source: string; target: string; kind?: 'down' | 'bracket' }
export interface Layout<T> { nodes: Placed<T>[]; edges: Edge[] }
export interface LayoutOpts { w?: number; h?: number; gapX?: number; gapY?: number }

export const TILE_W = 180
export const TILE_H = 48

// Layered, left to right. Depth is the column; leaves take consecutive rows; a parent sits at the middle of its children.
export function layoutLayered<T extends TreeLike>(root: T, expanded: ReadonlySet<string>, opts: LayoutOpts = {}): Layout<T> {
  const w = opts.w ?? TILE_W
  const h = opts.h ?? TILE_H
  const gapX = opts.gapX ?? 120
  const gapY = opts.gapY ?? 24
  const nodes: Placed<T>[] = []
  const edges: Edge[] = []
  let row = 0
  // Iterative post-order would be longer than this; depth is bounded by the estate's own nesting, so recursion is fine.
  const place = (n: T, depth: number, parent: string | null): number => {
    const kids = expanded.has(n.id) ? ((n.children ?? []) as T[]) : []
    let y: number
    const at = nodes.length
    nodes.push({ id: n.id, node: n, depth, x: depth * (w + gapX), y: 0, w, h, parent })
    if (!kids.length) {
      y = row * (h + gapY)
      row += 1
    } else {
      const ys = kids.map((k) => {
        edges.push({ id: n.id + '>' + k.id, source: n.id, target: k.id })
        return place(k, depth + 1, n.id)
      })
      y = (ys[0] + ys[ys.length - 1]) / 2
    }
    nodes[at].y = y
    return y
  }
  place(root, 0, null)
  return { nodes, edges }
}

// Radial: the root in the middle, depth 1 on a ring, deeper levels on wider rings inside the sector of their parent.
// Tiles are centred on their ring point, so the returned x and y are shifted by half a tile.
export function layoutRadial<T extends TreeLike>(root: T, expanded: ReadonlySet<string>, opts: LayoutOpts = {}): Layout<T> {
  const w = opts.w ?? 180
  const h = opts.h ?? 60
  const ring = (opts.gapX ?? 0) || Math.max(w, h) + 40
  const nodes: Placed<T>[] = []
  const edges: Edge[] = []
  const count = (n: T): number => {
    const kids = expanded.has(n.id) ? ((n.children ?? []) as T[]) : []
    return kids.length ? kids.reduce((a, k) => a + count(k), 0) : 1
  }
  const kidsOf = (n: T): T[] => (expanded.has(n.id) ? ((n.children ?? []) as T[]) : [])
  // The first ring has to be wide enough that its tiles do not overlap: circumference >= tiles * (w + gap).
  const first = kidsOf(root).length
  const r1 = Math.max(ring * 1.3, (first * (w + 24)) / (2 * Math.PI))
  // Outer rings must also hold every leaf: leaves * average tile size around the circumference.
  const rLeaf = (count(root) * ((w + h) / 2 + 16)) / (2 * Math.PI)
  const put = (n: T, depth: number, a0: number, a1: number, parent: string | null) => {
    const mid = (a0 + a1) / 2
    const base = r1 + (depth - 1) * ring * 1.1
    const r = depth === 0 ? 0 : depth === 1 ? r1 : Math.max(base, rLeaf)
    nodes.push({ id: n.id, node: n, depth, x: Math.cos(mid) * r - w / 2, y: Math.sin(mid) * r - h / 2, w, h, parent })
    const kids = kidsOf(n)
    if (!kids.length) return
    const total = kids.reduce((a, k) => a + count(k), 0)
    let a = a0
    for (const k of kids) {
      const span = ((a1 - a0) * count(k)) / total
      edges.push({ id: n.id + '>' + k.id, source: n.id, target: k.id })
      put(k, depth + 1, a, a + span, n.id)
      a += span
    }
  }
  put(root, 0, -Math.PI / 2, (3 * Math.PI) / 2, null)
  return { nodes, edges }
}

export interface GridOpts { tileW?: number; tileH?: number; subW?: number; subH?: number; gap?: number; cols?: (n: number) => number }

// Top down, for a roster: the root on top, its children (clusters) side by side, each cluster's children in a grid, and
// each of those children's own children stacked underneath, indented, like a bracket. Exactly three levels below the root.
export function layoutGrid<T extends TreeLike>(root: T, opts: GridOpts = {}): Layout<T> {
  const w = opts.tileW ?? 200
  const h = opts.tileH ?? 64
  const sw = opts.subW ?? 168
  const sh = opts.subH ?? 36
  const gap = opts.gap ?? 24
  const indent = 24
  const colsFor = opts.cols ?? ((n: number) => Math.max(1, Math.min(n, 4)))
  const nodes: Placed<T>[] = []
  const edges: Edge[] = []
  const groups = (root.children ?? []) as T[]
  const headY = h + 72
  const bodyY = headY + h + 72
  let x = 0
  const heads: { id: string; cx: number }[] = []
  for (const g of groups) {
    const kids = (g.children ?? []) as T[]
    const cols = colsFor(kids.length)
    const rows = Math.ceil(kids.length / cols) || 1
    const rowH: number[] = []
    for (let r = 0; r < rows; r++) {
      let most = 0
      for (let c = 0; c < cols; c++) most = Math.max(most, (kids[r * cols + c]?.children ?? []).length)
      rowH.push(h + most * (sh + 8) + gap + 8)
    }
    const width = cols * (w + gap) - gap
    kids.forEach((k, i) => {
      const r = Math.floor(i / cols)
      const cx = x + (i % cols) * (w + gap)
      const cy = bodyY + rowH.slice(0, r).reduce((a, b) => a + b, 0)
      nodes.push({ id: k.id, node: k, depth: 2, x: cx, y: cy, w, h, parent: g.id })
      edges.push({ id: g.id + '>' + k.id, source: g.id, target: k.id, kind: 'down' })
      ;((k.children ?? []) as T[]).forEach((pr, j) => {
        nodes.push({ id: pr.id, node: pr, depth: 3, x: cx + indent, y: cy + h + 8 + j * (sh + 8), w: sw, h: sh, parent: k.id })
        edges.push({ id: k.id + '>' + pr.id, source: k.id, target: pr.id, kind: 'bracket' })
      })
    })
    nodes.push({ id: g.id, node: g, depth: 1, x: x + width / 2 - w / 2, y: headY, w, h, parent: root.id })
    edges.push({ id: root.id + '>' + g.id, source: root.id, target: g.id, kind: 'down' })
    heads.push({ id: g.id, cx: x + width / 2 })
    x += width + gap * 3
  }
  const total = Math.max(0, x - gap * 3)
  nodes.unshift({ id: root.id, node: root, depth: 0, x: total / 2 - w / 2, y: 0, w, h, parent: null })
  return { nodes, edges }
}
