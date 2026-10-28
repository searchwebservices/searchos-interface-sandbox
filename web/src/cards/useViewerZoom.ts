// Zoom that belongs to the file viewer and nothing else. The browser's own zoom (Cmd plus / minus, ctrl wheel from a
// trackpad pinch, a two finger pinch on a touch screen) would scale the whole app shell, so while the viewer is in use
// those gestures are caught here, cancelled, and turned into the viewer's own zoom. The root font size and the stored
// zoom preference are never touched. Outside the viewer nothing is intercepted.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export interface ViewerZoom {
  // one keyboard or wheel step: +1 in, -1 out
  step: (dir: 1 | -1) => void
  fit: () => void
  // the scale a pinch starts from (1 = the fitted size)
  base: () => number
  // commit a finished pinch: base times the pinch ratio
  commit: (next: number) => void
}

const dist = (t: TouchList | { clientX: number; clientY: number }[]) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

export function useViewerZoom(root: RefObject<HTMLElement | null>, z: ViewerZoom, enabled: boolean): void {
  const zr = useRef(z)
  zr.current = z
  useEffect(() => {
    const el = root.current
    if (!enabled || !el) return
    const inside = () => !!document.activeElement && el.contains(document.activeElement)
    const target = () => el.querySelector<HTMLElement>('[data-zoom-target]')

    // Cmd or ctrl with + - 0, only while focus is in the viewer
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || !inside()) return
      const k = e.key
      if (k === '+' || k === '=') (e.preventDefault(), zr.current.step(1))
      else if (k === '-' || k === '_') (e.preventDefault(), zr.current.step(-1))
      else if (k === '0') (e.preventDefault(), zr.current.fit())
    }
    window.addEventListener('keydown', onKey, true)

    // ctrl wheel is how a trackpad pinch arrives; accumulate so one pinch is a few steps, not forty
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      acc += e.deltaY
      while (Math.abs(acc) >= 40) {
        zr.current.step(acc < 0 ? 1 : -1)
        acc -= Math.sign(acc) * 40
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    // two finger pinch: the pages scale with a transform while the fingers move, and the zoom commits when they lift
    let start = 0
    let base = 1
    let ratio = 1
    const reset = () => {
      const t = target()
      if (t) {
        t.style.transform = ''
        t.style.transformOrigin = ''
      }
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      start = dist(e.touches)
      base = zr.current.base()
      ratio = 1
    }
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return
      e.preventDefault()
      ratio = Math.min(4, Math.max(0.25, dist(e.touches) / start))
      const t = target()
      if (t) {
        t.style.transformOrigin = '50% 0'
        t.style.transform = `scale(${ratio})`
      }
    }
    const onEnd = () => {
      if (!start) return
      const r = ratio
      start = 0
      ratio = 1
      reset()
      if (Math.abs(r - 1) > 0.02) zr.current.commit(base * r)
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    // Safari reports a pinch as gesture events and zooms the page unless they are cancelled
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('gesturestart', stop)
    el.addEventListener('gesturechange', stop)
    el.addEventListener('gestureend', stop)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('gesturestart', stop)
      el.removeEventListener('gesturechange', stop)
      el.removeEventListener('gestureend', stop)
      reset()
    }
  }, [root, enabled])
}
