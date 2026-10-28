// Auto layout for the #/lan canvas: gateway on top, the switch in the middle with the box beside it, then the devices
// in rows grouped by status. Pure; positions are node top-left corners in flow units.
import { STATUS_ORDER, STATUS_WORD, type LanModel, type LanNode, type NodeStatus } from './model'

export const NODE_W = 200
export const NODE_H = 76
const GAP_X = 24
const GAP_Y = 28
// The spacing slider scales the gaps between nodes (not the nodes, not the zoom): 1 is the default layout.
export const SPACING_MIN = 0.25
export const SPACING_MAX = 3
export const SPACING_STEP = 0.25
export const SPACING_DEFAULT = 1
export const clampSpacing = (v: number): number => (Number.isFinite(v) ? Math.min(SPACING_MAX, Math.max(SPACING_MIN, Math.round(v / SPACING_STEP) * SPACING_STEP)) : SPACING_DEFAULT)
const COLS = 6
const LABEL_H = 22

export interface LayoutNode {
  id: string
  type: 'lan' | 'group'
  position: { x: number; y: number }
  width: number
  height: number
  node?: LanNode
  title?: string
}
export interface LayoutEdge {
  id: string
  source: string
  target: string
  status: NodeStatus
}

export function layoutLan(model: LanModel, visible?: Set<string>, spacing = SPACING_DEFAULT): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const nodes: LayoutNode[] = []
  const k = clampSpacing(spacing)
  const gx = GAP_X * k
  const gy = GAP_Y * k
  const show = (n: LanNode) => !visible || visible.has(n.id)
  const fullW = COLS * NODE_W + (COLS - 1) * gx
  const cx = -NODE_W / 2
  nodes.push({ id: 'gateway', type: 'lan', position: { x: cx, y: 0 }, width: NODE_W, height: NODE_H, node: model.gateway })
  const y1 = NODE_H + gy * 2
  nodes.push({ id: 'switch', type: 'lan', position: { x: cx, y: y1 }, width: NODE_W, height: NODE_H, node: model.switch })
  nodes.push({ id: 'box', type: 'lan', position: { x: cx - NODE_W - gx * 3, y: y1 }, width: NODE_W, height: NODE_H, node: model.box })
  let y = y1 + NODE_H + gy * 2
  const edges: LayoutEdge[] = [
    { id: 'gateway-switch', source: 'gateway', target: 'switch', status: 'online' },
    { id: 'switch-box', source: 'switch', target: 'box', status: 'online' },
  ]
  for (const st of STATUS_ORDER) {
    const group = model.devices.filter((d) => d.status === st && show(d))
    if (!group.length) continue
    nodes.push({ id: 'group-' + st, type: 'group', position: { x: -fullW / 2, y }, width: fullW, height: LABEL_H, title: `${STATUS_WORD[st]} (${group.length})` })
    y += LABEL_H + 8
    for (let i = 0; i < group.length; i += COLS) {
      const row = group.slice(i, i + COLS)
      const w = row.length * NODE_W + (row.length - 1) * gx
      row.forEach((d, j) => {
        nodes.push({ id: d.id, type: 'lan', position: { x: -w / 2 + j * (NODE_W + gx), y }, width: NODE_W, height: NODE_H, node: d })
        edges.push({ id: 'switch-' + d.id, source: 'switch', target: d.id, status: d.status })
      })
      y += NODE_H + gy
    }
    y += gy / 2
  }
  return { nodes, edges }
}
