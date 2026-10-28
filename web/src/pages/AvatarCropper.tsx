// Square crop for the avatar: pick a jpg or png, pan and zoom inside a square, get a 256 px PNG back.
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cropRect } from '@/lib/profile'

const VIEW = 224
const OUT = 256
export const AVATAR_TYPES = ['image/jpeg', 'image/png']
export const AVATAR_SOURCE_MAX = 12 * 1024 * 1024

export function AvatarCropper({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (png: Blob) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [focus, setFocus] = useState({ x: 0.5, y: 0.5 })
  const [failed, setFailed] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null)

  useEffect(() => {
    setImg(null)
    setZoom(1)
    setFocus({ x: 0.5, y: 0.5 })
    setFailed(false)
    if (!file) return
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => setImg(i)
    i.onerror = () => setFailed(true)
    i.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const draw = (c: HTMLCanvasElement, size: number) => {
    const ctx = c.getContext('2d')
    if (!ctx || !img) return
    const r = cropRect(img.naturalWidth, img.naturalHeight, zoom, focus.x, focus.y)
    c.width = size
    c.height = size
    ctx.drawImage(img, r.sx, r.sy, r.side, r.side, 0, 0, size, size)
  }
  useEffect(() => {
    if (canvas.current) draw(canvas.current, VIEW)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom, focus])

  const move = (e: React.PointerEvent) => {
    if (!drag.current || !img) return
    const r = cropRect(img.naturalWidth, img.naturalHeight, zoom, 0.5, 0.5)
    // One screen pixel is side / VIEW source pixels; dragging right moves the window left.
    const k = r.side / VIEW
    setFocus({
      x: Math.min(1, Math.max(0, drag.current.fx - ((e.clientX - drag.current.x) * k) / img.naturalWidth)),
      y: Math.min(1, Math.max(0, drag.current.fy - ((e.clientY - drag.current.y) * k) / img.naturalHeight)),
    })
  }
  const use = () => {
    const out = document.createElement('canvas')
    draw(out, OUT)
    out.toBlob((b) => b && onDone(b), 'image/png')
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent data-testid="avatar-cropper">
        <DialogHeader>
          <DialogTitle>Crop your picture</DialogTitle>
          <DialogDescription>Drag to move, use the slider to zoom. It is saved as a square.</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            That file could not be read as a picture.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <canvas
              ref={canvas}
              width={VIEW}
              height={VIEW}
              className="touch-none rounded-full border bg-secondary"
              style={{ width: VIEW, height: VIEW, cursor: 'grab' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId)
                drag.current = { x: e.clientX, y: e.clientY, fx: focus.x, fy: focus.y }
              }}
              onPointerMove={move}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            />
            <input type="range" min={1} max={3} step={0.05} value={zoom} aria-label="Zoom" onChange={(e) => setZoom(Number(e.currentTarget.value))} className="w-56" />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!img || failed} onClick={use}>
            Use picture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
