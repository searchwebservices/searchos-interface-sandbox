// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { addStroke, applyCrop, clampRect, dragHandle, drawStroke, emptyEdit, hitHandle, isDirty, MAX_SIDE, paint, pngName, readTokens, reset, undo, workingSize } from './imageEdit'
import type { Stroke } from './imageEdit'

const stroke = (kind: Stroke['kind'] = 'sketch'): Stroke => ({ kind, color: 'tok', width: 4, pts: [{ x: 1, y: 1 }, { x: 5, y: 5 }] })
function recorder() {
  const calls: string[] = []
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, k: string) => (k in props ? props[k] : (...a: unknown[]) => void calls.push(k + '(' + a.join(',') + ')')),
    set: (_, k: string, v) => {
      props[k] = v
      calls.push(k + '=' + String(v))
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('edit history', () => {
  it('undo walks back strokes and crops in order; reset clears everything', () => {
    let st = addStroke(emptyEdit(), stroke())
    st = applyCrop(st, { x: 10, y: 10, w: 50, h: 40 })
    st = addStroke(st, stroke('highlight'))
    expect(st.strokes).toHaveLength(2)
    expect(isDirty(st)).toBe(true)
    st = undo(st)
    expect(st.strokes).toHaveLength(1)
    expect(st.crop).toEqual({ x: 10, y: 10, w: 50, h: 40 })
    st = undo(st)
    expect(st.crop).toBeNull()
    st = undo(undo(st))
    expect(st).toEqual(emptyEdit())
    expect(reset()).toEqual(emptyEdit())
    expect(isDirty(addStroke(emptyEdit(), stroke()))).toBe(true)
  })
  it('a second crop undoes back to the first', () => {
    let st = applyCrop(emptyEdit(), { x: 0, y: 0, w: 80, h: 80 })
    st = applyCrop(st, { x: 5, y: 5, w: 20, h: 20 })
    expect(undo(st).crop).toEqual({ x: 0, y: 0, w: 80, h: 80 })
  })
})

describe('crop geometry', () => {
  it('working size caps the long side and keeps the ratio', () => {
    expect(workingSize(800, 600)).toEqual({ w: 800, h: 600, scale: 1 })
    const big = workingSize(8000, 6000)
    expect(big.w).toBe(MAX_SIDE)
    expect(big.h).toBe(3072)
  })
  it('handles move their own edges, cannot cross, and stay inside the image', () => {
    const r = { x: 20, y: 20, w: 60, h: 60 }
    expect(dragHandle(r, 'se', 10, 5, 200, 100)).toEqual({ x: 20, y: 20, w: 70, h: 65 })
    expect(dragHandle(r, 'nw', -50, -50, 200, 100)).toEqual({ x: 0, y: 0, w: 80, h: 80 })
    expect(dragHandle(r, 'e', -500, 0, 200, 100, 24).w).toBe(24)
    expect(dragHandle(r, 's', 0, 500, 200, 100).h).toBe(80)
    expect(dragHandle(r, 'move', 500, 500, 200, 100)).toEqual({ x: 140, y: 40, w: 60, h: 60 })
    expect(clampRect({ x: -5, y: 90, w: 500, h: 5 }, 200, 100)).toEqual({ x: 0, y: 76, w: 200, h: 24 })
  })
  it('finds the corner, the edge or the body under a point', () => {
    const r = { x: 20, y: 20, w: 60, h: 60 }
    expect(hitHandle(r, { x: 21, y: 19 }, 6)).toBe('nw')
    expect(hitHandle(r, { x: 50, y: 80 }, 6)).toBe('s')
    expect(hitHandle(r, { x: 50, y: 50 }, 6)).toBe('move')
    expect(hitHandle(r, { x: 150, y: 150 }, 6)).toBeNull()
  })
})

describe('painting', () => {
  it('a pen is opaque and round, a marker is translucent and four times as wide', () => {
    const pen = recorder()
    drawStroke(pen.ctx, stroke('sketch'))
    expect(pen.calls).toContain('globalAlpha=1')
    expect(pen.calls).toContain('lineWidth=4')
    expect(pen.calls).toContain('lineCap=round')
    const marker = recorder()
    drawStroke(marker.ctx, stroke('highlight'))
    expect(marker.calls).toContain('globalAlpha=0.38')
    expect(marker.calls).toContain('lineWidth=16')
    expect(marker.calls.some((c) => c.startsWith('stroke('))).toBe(true)
  })
  it('paints the image, then the strokes, translated into the crop view', () => {
    const { ctx, calls } = recorder()
    paint(ctx, {} as CanvasImageSource, { w: 100, h: 80 }, [stroke()], { view: { x: 10, y: 5, w: 50, h: 40 } })
    expect(calls).toContain('translate(-10,-5)')
    expect(calls.indexOf('drawImage([object Object],0,0,100,80)')).toBeLessThan(calls.indexOf('moveTo(1,1)'))
  })
  it('the crop guide dims the outside and draws eight handles', () => {
    const { ctx, calls } = recorder()
    paint(ctx, {} as CanvasImageSource, { w: 100, h: 80 }, [], { view: { x: 0, y: 0, w: 100, h: 80 }, cropGuide: { rect: { x: 10, y: 10, w: 40, h: 30 }, dim: 'd', line: 'l', reach: 10 } })
    expect(calls.filter((c) => c.startsWith('fillRect(')).length).toBe(4 + 8)
    expect(calls).toContain('strokeRect(10,10,40,30)')
  })
  it('reads the colours from the theme tokens, never from literals', () => {
    document.documentElement.style.setProperty('--destructive', 'test-token')
    const sw = readTokens()
    expect(sw.map((s) => s.id)).toEqual(['destructive', 'warn', 'ok', 'primary', 'foreground'])
    expect(sw[0].css).toBe('test-token')
    expect(sw[1].css).toBe('currentcolor') // unset token: a fallback, not a made-up colour
  })
  it('names the saved file as a png', () => {
    expect(pngName('IMG_0001.HEIC')).toBe('IMG_0001.png')
    expect(pngName('shot')).toBe('shot.png')
  })
})
