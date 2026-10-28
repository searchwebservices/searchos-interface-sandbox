// Swipe back from a lane to the lane list (phones). A swipe that starts at the left edge and travels right, mostly flat.
export const EDGE_PX = 28
export const MIN_DX = 72
export const MAX_DY = 56
export const MAX_MS = 700

export interface Touch2 { x: number; y: number; t: number }
export const isSwipeBack = (a: Touch2, b: Touch2): boolean => a.x <= EDGE_PX && b.x - a.x >= MIN_DX && Math.abs(b.y - a.y) <= MAX_DY && b.t - a.t <= MAX_MS
