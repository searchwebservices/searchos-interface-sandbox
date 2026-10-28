// The model behind the attachment image editor: strokes (pen and marker), one crop rectangle, an undo history, and the
// painting of all of it onto a 2D context. Coordinates are "working" pixels: the image scaled down so its long side is
// at most MAX_SIDE, which keeps a 48 MP phone photo editable. No colour values live here; the editor reads them from the
// theme tokens (see readTokens) at the moment it paints.

export const MAX_SIDE = 4096
export type Tool = 'sketch' | 'highlight' | 'crop'
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

export interface Pt {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Stroke {
  kind: 'sketch' | 'highlight'
  color: string
  width: number
  pts: Pt[]
}
type Entry = { type: 'stroke' } | { type: 'crop'; prev: Rect | null }
export interface EditState {
  strokes: Stroke[]
  crop: Rect | null
  history: Entry[]
}

export const emptyEdit = (): EditState => ({ strokes: [], crop: null, history: [] })
export const addStroke = (s: EditState, stroke: Stroke): EditState => ({ ...s, strokes: [...s.strokes, stroke], history: [...s.history, { type: 'stroke' }] })
export const applyCrop = (s: EditState, r: Rect): EditState => ({ ...s, crop: r, history: [...s.history, { type: 'crop', prev: s.crop }] })
export function undo(s: EditState): EditState {
  const last = s.history[s.history.length - 1]
  if (!last) return s
  const history = s.history.slice(0, -1)
  if (last.type === 'stroke') return { ...s, strokes: s.strokes.slice(0, -1), history }
  return { ...s, crop: last.prev, history }
}
export const reset = (): EditState => emptyEdit()
export const isDirty = (s: EditState): boolean => s.history.length > 0

// The working size of an image: scaled so the long side is at most MAX_SIDE.
export function workingSize(w: number, h: number): { w: number; h: number; scale: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale }
}

export const MIN_CROP = 24
export function clampRect(r: Rect, bw: number, bh: number, min = MIN_CROP): Rect {
  const w = Math.min(Math.max(r.w, min), bw)
  const h = Math.min(Math.max(r.h, min), bh)
  return { x: Math.min(Math.max(r.x, 0), bw - w), y: Math.min(Math.max(r.y, 0), bh - h), w, h }
}

// Drag one handle by (dx, dy). Edges move independently and cannot cross; 'move' shifts the whole rectangle.
export function dragHandle(r: Rect, handle: Handle, dx: number, dy: number, bw: number, bh: number, min = MIN_CROP): Rect {
  if (handle === 'move') return clampRect({ ...r, x: r.x + dx, y: r.y + dy }, bw, bh, min)
  let l = r.x
  let t = r.y
  let rt = r.x + r.w
  let b = r.y + r.h
  if (handle.includes('w')) l = Math.min(Math.max(0, l + dx), rt - min)
  if (handle.includes('e')) rt = Math.max(Math.min(bw, rt + dx), l + min)
  if (handle.includes('n')) t = Math.min(Math.max(0, t + dy), b - min)
  if (handle.includes('s')) b = Math.max(Math.min(bh, b + dy), t + min)
  return { x: l, y: t, w: rt - l, h: b - t }
}

// Which handle (if any) sits under a point. `reach` is the hit radius in working pixels.
export function hitHandle(r: Rect, p: Pt, reach: number): Handle | null {
  const xs: [number, 'w' | '' | 'e'][] = [[r.x, 'w'], [r.x + r.w / 2, ''], [r.x + r.w, 'e']]
  const ys: [number, 'n' | '' | 's'][] = [[r.y, 'n'], [r.y + r.h / 2, ''], [r.y + r.h, 's']]
  for (const [y, v] of ys) {
    for (const [x, h] of xs) {
      if (!v && !h) continue
      if (Math.abs(p.x - x) <= reach && Math.abs(p.y - y) <= reach) return (v + h) as Handle
    }
  }
  if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return 'move'
  return null
}

// ---------------------------------------------------------------- tokens
export interface Swatch {
  id: string
  label: string
  css: string
}
const TOKENS: { id: string; label: string; v: string }[] = [
  { id: 'destructive', label: 'Red', v: '--destructive' },
  { id: 'warn', label: 'Amber', v: '--warn' },
  { id: 'ok', label: 'Green', v: '--ok' },
  { id: 'primary', label: 'Blue', v: '--primary' },
  { id: 'foreground', label: 'Ink', v: '--foreground' },
]
// The colours the editor offers, resolved from the live theme so light and dark both work.
export function readTokens(root: Element = document.documentElement): Swatch[] {
  let cs: CSSStyleDeclaration | null = null
  try {
    cs = getComputedStyle(root)
  } catch {
    cs = null
  }
  return TOKENS.map((t) => ({ id: t.id, label: t.label, css: cs?.getPropertyValue(t.v).trim() || 'currentcolor' }))
}

// ---------------------------------------------------------------- painting
export const HIGHLIGHT_ALPHA = 0.38
export const HIGHLIGHT_SCALE = 4

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  if (!s.pts.length) return
  ctx.save()
  ctx.lineCap = s.kind === 'highlight' ? 'butt' : 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.globalAlpha = s.kind === 'highlight' ? HIGHLIGHT_ALPHA : 1
  ctx.lineWidth = s.kind === 'highlight' ? s.width * HIGHLIGHT_SCALE : s.width
  if (s.pts.length === 1) {
    ctx.beginPath()
    ctx.arc(s.pts[0].x, s.pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(s.pts[0].x, s.pts[0].y)
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y)
    ctx.stroke()
  }
  ctx.restore()
}

export interface PaintOptions {
  // The part of the working image to show (the canvas is view.w by view.h).
  view: Rect
  // While cropping: dim outside this rectangle and draw handles on it.
  cropGuide?: { rect: Rect; dim: string; line: string; reach: number }
}
export function paint(ctx: CanvasRenderingContext2D, image: CanvasImageSource, work: { w: number; h: number }, strokes: Stroke[], opts: PaintOptions): void {
  const { view } = opts
  ctx.save()
  ctx.clearRect(0, 0, view.w, view.h)
  ctx.translate(-view.x, -view.y)
  ctx.drawImage(image, 0, 0, work.w, work.h)
  for (const s of strokes) drawStroke(ctx, s)
  ctx.restore()
  const g = opts.cropGuide
  if (g) {
    const r = { x: g.rect.x - view.x, y: g.rect.y - view.y, w: g.rect.w, h: g.rect.h }
    ctx.save()
    ctx.fillStyle = g.dim
    ctx.globalAlpha = 0.55
    ctx.fillRect(0, 0, view.w, r.y)
    ctx.fillRect(0, r.y + r.h, view.w, view.h - (r.y + r.h))
    ctx.fillRect(0, r.y, r.x, r.h)
    ctx.fillRect(r.x + r.w, r.y, view.w - (r.x + r.w), r.h)
    ctx.globalAlpha = 1
    ctx.strokeStyle = g.line
    ctx.fillStyle = g.line
    ctx.lineWidth = Math.max(1, g.reach / 6)
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    const hs = g.reach * 0.6
    for (const [x, y] of [[r.x, r.y], [r.x + r.w / 2, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2], [r.x, r.y + r.h], [r.x + r.w / 2, r.y + r.h], [r.x + r.w, r.y + r.h]]) ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs)
    ctx.restore()
  }
}

// The name of the saved file: the same stem, .png.
export const pngName = (name: string): string => name.replace(/\.[A-Za-z0-9]{1,8}$/, '') + '.png'
