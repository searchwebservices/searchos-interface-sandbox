// The only module that imports pdfjs-dist. It is reached by a dynamic import from PdfPages, so the main bundle never
// carries it. The worker is bundled by Vite through ?url, no CDN.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfDoc {
  numPages: number
  // The page's size in CSS pixels at scale 1 (1-based), so the viewer can lay out pages it has not drawn yet.
  size: (n: number) => Promise<{ width: number; height: number }>
  // Draws one page into the canvas at the given scale (1 is 96 dpi). Resolves when painted; a newer render into the same
  // canvas cancels the older one, which then resolves without painting.
  render: (n: number, canvas: HTMLCanvasElement, scale: number) => Promise<void>
  destroy: () => void
}

export async function loadPdf(url: string): Promise<PdfDoc> {
  const task = pdfjs.getDocument({ url, withCredentials: true })
  const doc = await task.promise
  const running = new WeakMap<HTMLCanvasElement, { cancel: () => void }>()
  return {
    numPages: doc.numPages,
    async size(n) {
      const vp = (await doc.getPage(n)).getViewport({ scale: 1 })
      return { width: vp.width, height: vp.height }
    },
    async render(n, canvas, scale) {
      const page = await doc.getPage(n)
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
      const vp = page.getViewport({ scale: scale * dpr })
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no canvas context')
      running.get(canvas)?.cancel()
      const w = Math.floor(vp.width)
      const h = Math.floor(vp.height)
      // Draw off screen and copy over, so a page that is being redrawn never shows blank.
      const buf = document.createElement('canvas')
      buf.width = w
      buf.height = h
      const bctx = buf.getContext('2d')
      if (!bctx) throw new Error('no canvas context')
      const job = page.render({ canvasContext: bctx, viewport: vp })
      running.set(canvas, job)
      try {
        await job.promise
      } catch (e) {
        if ((e as { name?: string })?.name === 'RenderingCancelledException') return
        throw e
      }
      canvas.width = w
      canvas.height = h
      ctx.drawImage(buf, 0, 0)
    },
    destroy: () => void task.destroy(),
  }
}
