// The editor behind a click on an attachment chip, before the message is sent. An image opens a canvas with sketch
// (pen), highlight (translucent marker), crop (handles), undo, reset and Save, which replaces the attachment with the
// edited PNG. Any other kind shows a preview or its metadata only. Colours are the theme tokens, read live.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CropIcon, HighlighterIcon, PencilIcon, RotateCcwIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtSize } from '@/lib/library'
import { addStroke, applyCrop, dragHandle, emptyEdit, hitHandle, isDirty, paint, pngName, readTokens, reset, undo, workingSize } from '@/lib/imageEdit'
import type { EditState, Handle, Pt, Rect, Stroke, Tool } from '@/lib/imageEdit'
import { cn } from '@/lib/utils'

export interface Loaded {
  source: CanvasImageSource
  w: number
  h: number
}
export type ImageLoader = (file: File) => Promise<Loaded>

// Decodes a File into something drawImage takes. createImageBitmap honours EXIF orientation; the <img> path is the fallback.
export const defaultLoader: ImageLoader = async (file) => {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bmp, w: bmp.width, h: bmp.height }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((ok, no) => {
      img.onload = () => ok()
      img.onerror = () => no(new Error('decode'))
      img.src = url
    })
    return { source: img, w: img.naturalWidth, h: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: 'sketch', label: 'Sketch', icon: <PencilIcon /> },
  { id: 'highlight', label: 'Highlight', icon: <HighlighterIcon /> },
  { id: 'crop', label: 'Crop', icon: <CropIcon /> },
]

function ImageEditor({ file, loader, onSave, onCancel }: { file: File; loader: ImageLoader; onSave: (f: File) => void; onCancel: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [st, setSt] = useState<EditState>(emptyEdit)
  const [tool, setTool] = useState<Tool>('sketch')
  const [colorId, setColorId] = useState('destructive')
  const [width, setWidth] = useState(4)
  const [draft, setDraft] = useState<Rect | null>(null) // the crop rectangle being dragged
  const [saving, setSaving] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const drag = useRef<{ handle: Handle; at: Pt } | null>(null)
  const swatches = useMemo(() => readTokens(), [])

  useEffect(() => {
    let alive = true
    setLoaded(null)
    setFailed(false)
    loader(file).then(
      (l) => alive && setLoaded(l),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [file, loader])

  const work = useMemo(() => (loaded ? workingSize(loaded.w, loaded.h) : null), [loaded])
  const full = useMemo<Rect | null>(() => (work ? { x: 0, y: 0, w: work.w, h: work.h } : null), [work])
  const cropping = tool === 'crop'
  const view = useMemo<Rect | null>(() => (full ? (cropping ? full : (st.crop ?? full)) : null), [full, cropping, st.crop])
  const color = swatches.find((s) => s.id === colorId)?.css ?? 'currentcolor'
  const widthPx = work ? Math.max(1.5, width * Math.max(1, work.w / 900)) : width

  const repaint = useCallback(() => {
    const el = canvas.current
    if (!el || !loaded || !work || !view) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const strokes = live.current ? [...st.strokes, live.current] : st.strokes
    const rect = draft ?? st.crop ?? full!
    const cs = getComputedStyle(document.documentElement)
    paint(ctx, loaded.source, work, strokes, {
      view,
      ...(cropping ? { cropGuide: { rect, dim: cs.getPropertyValue('--background').trim() || 'canvas', line: cs.getPropertyValue('--primary').trim() || 'currentcolor', reach: Math.max(10, work.w / 60) } } : {}),
    })
  }, [loaded, work, view, st, draft, cropping, full])

  useEffect(() => {
    const el = canvas.current
    if (el && view && (el.width !== Math.round(view.w) || el.height !== Math.round(view.h))) {
      el.width = Math.round(view.w)
      el.height = Math.round(view.h)
    }
    repaint()
  }, [view, repaint])

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const sx = r.width ? el.width / r.width : 1
    const sy = r.height ? el.height / r.height : 1
    return { x: (e.clientX - r.left) * sx + (view?.x ?? 0), y: (e.clientY - r.top) * sy + (view?.y ?? 0) }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!work || !full) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = point(e)
    if (tool === 'crop') {
      const rect = draft ?? st.crop ?? full
      const handle = hitHandle(rect, p, Math.max(14, work.w / 40))
      if (handle) {
        if (!draft) setDraft(rect)
        drag.current = { handle, at: p }
      }
      return
    }
    live.current = { kind: tool, color, width: widthPx, pts: [p] }
    repaint()
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!work || !full) return
    const p = point(e)
    if (live.current) {
      live.current.pts.push(p)
      repaint()
    } else if (drag.current) {
      const d = drag.current
      setDraft((cur) => dragHandle(cur ?? st.crop ?? full, d.handle, p.x - d.at.x, p.y - d.at.y, work.w, work.h))
      drag.current = { handle: d.handle, at: p }
    }
  }
  const up = () => {
    if (live.current) {
      const s = live.current
      live.current = null
      setSt((cur) => addStroke(cur, s))
    }
    drag.current = null
  }

  const commitCrop = (): EditState => {
    if (!draft || !full) return st
    const same = draft.x === 0 && draft.y === 0 && Math.round(draft.w) >= full.w && Math.round(draft.h) >= full.h
    setDraft(null)
    if (same && !st.crop) return st
    const next = applyCrop(st, draft)
    setSt(next)
    return next
  }
  const pick = (t: Tool) => {
    if (tool === 'crop' && t !== 'crop') setDraft(null)
    setTool(t)
  }

  const save = async () => {
    if (!loaded || !work || !full) return
    setSaving(true)
    try {
      const state = tool === 'crop' ? commitCrop() : st
      const out = state.crop ?? full
      const off = document.createElement('canvas')
      off.width = Math.round(out.w)
      off.height = Math.round(out.h)
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('no_canvas')
      paint(ctx, loaded.source, work, state.strokes, { view: out })
      const blob = await new Promise<Blob | null>((ok) => off.toBlob(ok, 'image/png'))
      if (!blob) throw new Error('no_blob')
      onSave(new File([blob], pngName(file.name), { type: 'image/png', lastModified: Date.now() }))
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (failed) return <p className="text-sm text-destructive" role="alert" data-testid="editor-error">This image could not be edited. You can still send it as it is.</p>
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="image-editor">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Image tools">
        {TOOLS.map((t) => (
          <Button key={t.id} type="button" size="sm" variant={tool === t.id ? 'secondary' : 'outline'} aria-pressed={tool === t.id} onClick={() => pick(t.id)} data-testid={'tool-' + t.id}>
            {t.icon}
            {t.label}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <div role="radiogroup" aria-label="Colour" className="flex items-center gap-1">
          {swatches.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={colorId === s.id}
              aria-label={s.label}
              onClick={() => setColorId(s.id)}
              className={cn('size-6 rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:size-9', colorId === s.id && 'ring-2 ring-ring ring-offset-2 ring-offset-background')}
              style={{ background: 'var(--' + s.id + ')' }}
              data-testid={'color-' + s.id}
            />
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Width
          <input type="range" min={1} max={20} value={width} onChange={(e) => setWidth(Number(e.currentTarget.value))} aria-label="Stroke width" data-testid="width" className="w-24" />
        </label>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button type="button" size="sm" variant="outline" disabled={!st.history.length} onClick={() => setSt(undo)} data-testid="editor-undo">
          <Undo2Icon />
          Undo
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!isDirty(st) && !draft} onClick={() => (setSt(reset()), setDraft(null))} data-testid="editor-reset">
          <RotateCcwIcon />
          Reset
        </Button>
        {cropping && (
          <Button type="button" size="sm" disabled={!draft} onClick={() => void commitCrop()} data-testid="crop-apply">
            Apply crop
          </Button>
        )}
      </div>
      <div className="flex max-h-[60vh] min-h-40 items-center justify-center overflow-auto rounded-md border bg-muted p-2">
        {loaded ? (
          <canvas
            ref={canvas}
            className={cn('max-h-[56vh] max-w-full touch-none object-contain', tool === 'crop' ? 'cursor-move' : 'cursor-crosshair')}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label="Image editing surface"
            data-testid="editor-canvas"
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} data-testid="editor-cancel">
          Cancel
        </Button>
        <Button type="button" disabled={!loaded || saving} onClick={() => void save()} data-testid="editor-save">
          Save
        </Button>
      </DialogFooter>
    </div>
  )
}

// A text start for a text kind, metadata for the rest.
function PlainPreview({ file, onClose }: { file: File; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const textual = file.type.startsWith('text/') || /\.(md|txt|csv|json|log|ya?ml|xml|html?|py|js|ts|tsx|sh)$/i.test(file.name)
  useEffect(() => {
    let alive = true
    if (textual && file.size <= 50 * 1024 * 1024) {
      file
        .slice(0, 4000)
        .text()
        .then((t) => alive && setText(t), () => {})
    }
    return () => {
      alive = false
    }
  }, [file, textual])
  const rows: [string, string][] = [
    ['name', file.name],
    ['type', file.type || 'unknown'],
    ['size', fmtSize(file.size)],
    ['modified', file.lastModified ? new Date(file.lastModified).toLocaleString() : '-'],
  ]
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="plain-preview">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-muted-foreground">{k}</dt>
            <dd className="font-mono [overflow-wrap:anywhere]">{v}</dd>
          </div>
        ))}
      </dl>
      {text !== null && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-2 text-xs" data-testid="plain-text">{text}</pre>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} data-testid="editor-close">
          Close
        </Button>
      </DialogFooter>
    </div>
  )
}

export function AttachmentEditor({ file, open, onOpenChange, onSave, loader = defaultLoader }: { file: File | null; open: boolean; onOpenChange: (o: boolean) => void; onSave: (f: File) => void; loader?: ImageLoader }) {
  const isImage = !!file && file.type.startsWith('image/') && file.type !== 'image/svg+xml'
  return (
    <Dialog open={open && !!file} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-testid="attachment-editor">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">{file?.name ?? 'Attachment'}</DialogTitle>
          <DialogDescription>{isImage ? 'Draw, highlight or crop. Save replaces the attachment with the edited PNG.' : 'This kind of file is sent as it is.'}</DialogDescription>
        </DialogHeader>
        {file && isImage && <ImageEditor key={file.name + file.size + file.lastModified} file={file} loader={loader} onSave={onSave} onCancel={() => onOpenChange(false)} />}
        {file && !isImage && <PlainPreview file={file} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
