// Pointer drag to reorder a list of rows, no library. Mouse and pen only: a finger on the phone scrolls, so touch
// reorders through the row menu. The list container carries data-drag-list, each row data-row-id.
import { useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, MouseEvent as RMouseEvent } from 'react'

const THRESHOLD = 5

// Which gap (0..n) of the rows a pointer at `y` is nearest to: the count of rows whose middle is above it.
export const gapAt = (mids: readonly number[], y: number): number => mids.filter((m) => m < y).length

export function useRowDrag(onDrop: (id: string, gap: number) => void) {
  const [drag, setDrag] = useState<{ id: string; gap: number } | null>(null)
  const st = useRef<{ id: string; x: number; y: number; active: boolean; gap: number } | null>(null)
  const swallow = useRef(false)
  const end = () => { st.current = null; setDrag(null) }
  const rowProps = (id: string) => ({
    'data-row-id': id,
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch' || e.button !== 0) return
      st.current = { id, x: e.clientX, y: e.clientY, active: false, gap: 0 }
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      const s = st.current
      if (!s || s.id !== id) return
      if (!s.active) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < THRESHOLD) return
        s.active = true
        // Capture only once it is a drag, so a plain click still lands on the row's own button.
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      }
      const list = e.currentTarget.closest('[data-drag-list]')
      const rows = list ? [...list.querySelectorAll<HTMLElement>('[data-row-id]')] : []
      s.gap = gapAt(rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 }), e.clientY)
      setDrag({ id, gap: s.gap })
    },
    onPointerUp: () => {
      const s = st.current
      if (s?.active) {
        swallow.current = true
        window.setTimeout(() => { swallow.current = false }, 0)
        onDrop(s.id, s.gap)
      }
      end()
    },
    onPointerCancel: end,
    onClickCapture: (e: RMouseEvent) => { if (swallow.current) { e.preventDefault(); e.stopPropagation() } },
  })
  // The class of the drop line for the row at `index` of `count`: a bar above it, or below the last row.
  const indicator = (index: number, count: number): string => {
    if (!drag) return ''
    const line = 'after:pointer-events-none after:absolute after:inset-x-2 after:h-0.5 after:rounded-full after:bg-primary '
    if (drag.gap === index) return line + 'after:-top-px'
    if (drag.gap === count && index === count - 1) return line + 'after:-bottom-px'
    return ''
  }
  return { drag, rowProps, indicator }
}
