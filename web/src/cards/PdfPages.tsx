// The pdf viewer's pages: every page in one continuous vertical scroll, each drawn lazily as it nears the screen, fit to
// the width by default. The viewer (FileViewer) owns the footer bar; this component owns the pages and exposes the live
// page number, the zoom and the commands through `ctl`. pdfjs lives in ./pdf-engine, loaded by a dynamic import only when
// a pdf is opened. When loading or rendering fails, onFail lets the caller show the extracted text instead.
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { PdfDoc } from './pdf-engine'

export interface PdfControl {
  goTo: (page: number) => void
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  setScale: (z: number) => void
  scale: () => number
  scrollBy: (dy: number) => void
  pageSize: () => number
}
export interface PdfState {
  pages: number
  page: number
  scale: number
  fit: boolean
}
const MIN = 0.25
const MAX = 4
const STEP = 0.25
const GAP = 12
const PAD = 16
export const clampScale = (z: number): number => Math.min(MAX, Math.max(MIN, +z.toFixed(2)))
// The page the reader is on: the last page whose top has scrolled past a third of the way down the screen.
export function currentPage(tops: number[], scrollTop: number, viewport: number): number {
  const line = scrollTop + viewport * 0.35
  let cur = 1
  for (let i = 0; i < tops.length; i++) if (tops[i] <= line) cur = i + 1
  return cur
}

function Page({ doc, n, scale, size, root, onFail }: { doc: PdfDoc; n: number; scale: number; size: { width: number; height: number }; root: React.RefObject<HTMLDivElement | null>; onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  const [own, setOwn] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !box.current) return
    const io = new IntersectionObserver((es) => es.forEach((e) => setSeen(e.isIntersecting)), { root: root.current, rootMargin: '800px 0px' })
    io.observe(box.current)
    return () => io.disconnect()
  }, [root])
  // The page's own size once it is known (pages in one file can differ), else the first page's.
  useEffect(() => {
    if (!seen || own) return
    let live = true
    void doc.size(n).then((s) => live && setOwn(s)).catch(() => {})
    return () => {
      live = false
    }
  }, [seen, own, doc, n])
  useEffect(() => {
    if (!seen || !ref.current) return
    let live = true
    doc.render(n, ref.current, scale).catch(() => live && onFail())
    return () => {
      live = false
    }
  }, [seen, doc, n, scale, onFail])
  const s = own ?? size
  return (
    <div ref={box} className="relative shrink-0 bg-white shadow-sm" style={{ width: Math.round(s.width * scale), height: Math.round(s.height * scale) }} data-testid="pdf-page" data-page={n}>
      <canvas ref={ref} className="block size-full" aria-label={'Page ' + n} />
    </div>
  )
}

export function PdfPages({ url, onFail, ctl, onState, className }: { url: string; onFail: () => void; ctl?: Ref<PdfControl>; onState?: (s: PdfState) => void; className?: string }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [first, setFirst] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [wide, setWide] = useState(0)
  const [cur, setCur] = useState(1)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let live = true
    let loaded: PdfDoc | null = null
    import('./pdf-engine')
      .then((m) => m.loadPdf(url))
      .then(async (d) => {
        if (!live) return d.destroy()
        loaded = d
        const s = await d.size(1).catch(() => ({ width: 612, height: 792 }))
        if (!live) return
        setFirst(s)
        setDoc(d)
      })
      .catch(() => live && onFail())
    return () => {
      live = false
      loaded?.destroy()
    }
  }, [url, onFail])

  // The width the pages fit to follows the scroller, so a resized dock refits.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setWide(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  const fitScale = first && wide > 2 * PAD ? clampScale((wide - 2 * PAD) / first.width) : 1
  const scale = zoom === 'fit' ? fitScale : zoom
  const pages = doc?.numPages ?? 0

  const tops = useCallback((): number[] => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [], (el) => el.offsetTop), [])
  const onScroll = useCallback(() => {
    const el = wrap.current
    if (!el) return
    setCur(currentPage(tops(), el.scrollTop, el.clientHeight))
  }, [tops])
  const goTo = useCallback(
    (n: number) => {
      const el = wrap.current
      const t = Math.min(Math.max(1, n), pages || 1)
      const top = tops()[t - 1]
      if (el && top !== undefined) {
        el.scrollTop = Math.max(0, top - GAP)
        el.dispatchEvent(new Event('scroll'))
      }
      setCur(t)
    },
    [tops, pages],
  )
  const zoomBy = useCallback((d: number) => setZoom(clampScale(scale + d)), [scale])
  useImperativeHandle(
    ctl,
    () => ({
      goTo,
      zoomIn: () => zoomBy(STEP),
      zoomOut: () => zoomBy(-STEP),
      fit: () => setZoom('fit'),
      setScale: (z) => setZoom(clampScale(z)),
      scale: () => scale,
      scrollBy: (dy) => {
        const el = wrap.current
        if (!el) return
        if (typeof el.scrollBy === 'function') el.scrollBy({ top: dy })
        else el.scrollTop += dy
      },
      pageSize: () => wrap.current?.clientHeight ?? 600,
    }),
    [goTo, zoomBy, scale],
  )
  useEffect(() => {
    onState?.({ pages, page: Math.min(cur, Math.max(pages, 1)), scale, fit: zoom === 'fit' })
  }, [onState, pages, cur, scale, zoom])

  // A zoom keeps the reader on the same page.
  const keep = useRef(1)
  useEffect(() => {
    keep.current = cur
  })
  useEffect(() => {
    if (doc && keep.current > 1) goTo(keep.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale])

  if (!doc || !first) return <p className="p-4 text-sm text-muted-foreground" data-testid="pdf-loading">Loading pages...</p>
  return (
    <div ref={wrap} onScroll={onScroll} className={className ?? 'relative flex min-h-0 flex-1 flex-col items-center gap-3 overflow-auto bg-muted px-4 pb-24 pt-3'} style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }} data-testid="pdf-scroll" data-pages={pages}>
      <div className="flex w-full flex-col items-center gap-3" data-zoom-target data-testid="pdf-pages">
        {Array.from({ length: pages }, (_, i) => (
          <Page key={i + 1} doc={doc} n={i + 1} scale={scale} size={first} root={wrap} onFail={onFail} />
        ))}
      </div>
    </div>
  )
}
