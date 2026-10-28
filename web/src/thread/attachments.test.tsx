// @vitest-environment happy-dom
// Attachments in the composer: chips for any file, drag and paste, the image editor (Save replaces the file), the 1 GB
// confirmation, the 5 GB refusal, the chunked path above 256 MB, upload-then-send order, and messages that carry files.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Composer } from './Composer'
import { defaultUploader } from './useAttachments'
import type { Uploader } from './useAttachments'
import type { ImageLoader } from './AttachmentEditor'
import { GB, MB } from '@/lib/chunked'
import * as chunked from '@/lib/chunked'
import * as library from '@/lib/library'
import type { Attachment, MessageAttachment } from '@/lib/types'

vi.mock('@/lib/chunked', async (orig) => ({ ...(await orig<typeof import('@/lib/chunked')>()), uploadChunked: vi.fn(async () => ({ ok: true, status: 201, body: { files: [{ id: 'chunk-row', name: 'huge.mov', kind: 'video/quicktime', size: 300 * 1024 * 1024 }] } })) }))
vi.mock('@/lib/library', async (orig) => ({ ...(await orig<typeof import('@/lib/library')>()), uploadFile: vi.fn(async () => ({ ok: true, status: 201, body: { files: [{ id: 'single-row', name: 'a.bin', kind: 'application/octet-stream', size: 100 }] } })) }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
}
const fileOf = (name: string, type = '', size?: number) => {
  const f = new File(['data'], name, { type })
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return f
}
const rowFor = (f: File): Attachment => ({ id: 'id-' + f.name, name: f.name, kind: f.type || 'application/octet-stream', size: f.size })

interface Harness {
  el: HTMLElement
  sent: { text: string; atts?: MessageAttachment[] }[]
  uploads: string[]
  notices: string[]
  uploaded: File[]
  unmount: () => Promise<void>
}
async function mount(opts: { uploader?: Uploader; loader?: ImageLoader; member?: boolean } = {}): Promise<Harness> {
  const h: Harness = { el: document.createElement('div'), sent: [], uploads: [], notices: [], uploaded: [], unmount: async () => {} }
  document.body.appendChild(h.el)
  const uploader: Uploader =
    opts.uploader ??
    (async (f) => {
      h.uploads.push(f.name)
      h.uploaded.push(f)
      return { ok: true, status: 201, body: { files: [{ id: 'id-' + f.name, name: f.name, kind: f.type, size: f.size } as never] } }
    })
  const root = createRoot(h.el)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <Composer lane="hardware" person="marvin" title="Hardware" isDm={false} member={opts.member ?? true} sessionMissing={false} quote={null} onClearQuote={() => {}} onSend={(text, _q, atts) => h.sent.push({ text, atts })} focusToken={0} notify={(t) => h.notices.push(t)} uploader={uploader} imageLoader={opts.loader} />
      </TooltipProvider>,
    )
  })
  h.unmount = () => act(async () => root.unmount())
  return h
}
const q = (el: ParentNode, sel: string) => el.querySelector(sel) as HTMLElement | null
const qa = (el: ParentNode, sel: string) => [...el.querySelectorAll(sel)] as HTMLElement[]
const pick = async (h: Harness, files: File[]) => {
  const input = q(h.el, '[data-testid=attach-input]') as HTMLInputElement
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  await settle()
}
const click = async (t: Element) => {
  await act(async () => { t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  await settle()
}
const chipNames = (h: Harness) => qa(h.el, '[data-testid=attach-chip]').map((c) => c.getAttribute('aria-label'))
const submit = async (h: Harness) => {
  await act(async () => { (q(h.el, 'button[type=submit]') as HTMLButtonElement).click() })
  await settle()
}

beforeEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
  window.matchMedia = ((m: string) => ({ matches: false, media: m, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  if (!('ResizeObserver' in globalThis)) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('attach chips', () => {
  it('the attach button opens the file chooser, and files of any type become chips with a remove button', async () => {
    const h = await mount()
    const input = q(h.el, '[data-testid=attach-input]') as HTMLInputElement
    const open = vi.spyOn(input, 'click')
    await click(q(h.el, '[data-testid=attach-button]')!)
    expect(open).toHaveBeenCalled()
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('') // any type
    await pick(h, [fileOf('shot.png', 'image/png'), fileOf('capture.pcapng'), fileOf('notes.md', 'text/markdown')])
    expect(chipNames(h)).toEqual(['Edit shot.png', 'Edit capture.pcapng', 'Edit notes.md'])
    await click(q(h.el, 'button[aria-label="Remove capture.pcapng"]')!)
    expect(chipNames(h)).toEqual(['Edit shot.png', 'Edit notes.md'])
    // the send button wakes up with only files and no text
    expect((q(h.el, 'button[type=submit]') as HTMLButtonElement).disabled).toBe(false)
    await h.unmount()
  })
  it('a drop and a paste on the composer add chips, and nothing else sees the files', async () => {
    const h = await mount()
    const zone = q(h.el, '[data-testid=composer-drop]')!
    const f1 = fileOf('dropped.zip', 'application/zip')
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown }
    drop.dataTransfer = { types: ['Files'], files: [f1] }
    await act(async () => { q(h.el, 'textarea')!.dispatchEvent(drop) })
    await settle()
    expect(drop.defaultPrevented).toBe(true)
    const f2 = fileOf('pasted.png', 'image/png')
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: unknown }
    paste.clipboardData = { files: [f2], items: [{ kind: 'file', getAsFile: () => f2 }] }
    await act(async () => { q(h.el, 'textarea')!.dispatchEvent(paste) })
    await settle()
    expect(paste.defaultPrevented).toBe(true)
    expect(chipNames(h)).toEqual(['Edit dropped.zip', 'Edit pasted.png'])
    expect(zone.getAttribute('data-dragging')).toBe('false')
    await h.unmount()
  })
  it('a non-member cannot add files', async () => {
    const h = await mount({ member: false })
    expect((q(h.el, '[data-testid=attach-button]') as HTMLButtonElement).disabled).toBe(true)
    await h.unmount()
  })
})

describe('the editor', () => {
  const ctx = new Proxy({} as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => {}), set: (t, k: string, v) => ((t[k] = v), true) })
  const loader: ImageLoader = async () => ({ source: {} as CanvasImageSource, w: 800, h: 600 })
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) { cb(new Blob(['edited-png'], { type: 'image/png' })) })
  })
  it('an image chip opens sketch, highlight and crop tools; Save replaces the attachment with the edited PNG', async () => {
    const h = await mount({ loader })
    await pick(h, [fileOf('shot.jpg', 'image/jpeg')])
    await click(q(h.el, '[data-testid=attach-chip]')!)
    const dlg = q(document.body, '[data-testid=attachment-editor]')!
    expect(dlg).toBeTruthy()
    expect(qa(dlg, '[role=toolbar] button').map((b) => b.textContent).slice(0, 3)).toEqual(['Sketch', 'Highlight', 'Crop'])
    expect(qa(dlg, '[role=radio]').map((b) => b.getAttribute('aria-label'))).toEqual(['Red', 'Amber', 'Green', 'Blue', 'Ink'])
    expect(qa(dlg, '[role=radio]')[0].getAttribute('style')).toContain('var(--destructive)') // tokens, no colour values
    // draw one stroke, so Undo and Reset wake up
    const canvas = q(dlg, '[data-testid=editor-canvas]') as HTMLCanvasElement
    const ptr = (type: string, x: number, y: number) => { const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }); return act(async () => { canvas.dispatchEvent(e) }) }
    expect((q(dlg, '[data-testid=editor-undo]') as HTMLButtonElement).disabled).toBe(true)
    await ptr('pointerdown', 10, 10)
    await ptr('pointermove', 60, 60)
    await ptr('pointerup', 60, 60)
    expect((q(dlg, '[data-testid=editor-undo]') as HTMLButtonElement).disabled).toBe(false)
    await click(q(dlg, '[data-testid=editor-undo]')!)
    expect((q(dlg, '[data-testid=editor-undo]') as HTMLButtonElement).disabled).toBe(true)
    await click(q(dlg, '[data-testid=tool-crop]')!)
    expect(q(dlg, '[data-testid=crop-apply]')).toBeTruthy()
    await click(q(dlg, '[data-testid=editor-save]')!)
    expect(q(document.body, '[data-testid=attachment-editor]')).toBeNull() // closed
    // send: the file that uploads is the edited PNG, not the original
    await submit(h)
    expect(h.uploaded).toHaveLength(1)
    expect(h.uploaded[0].name).toBe('shot.png')
    expect(h.uploaded[0].type).toBe('image/png')
    expect(await h.uploaded[0].text()).toBe('edited-png')
    await h.unmount()
  })
  it('any other kind opens a preview or its metadata only', async () => {
    const h = await mount()
    await pick(h, [fileOf('notes.md', 'text/markdown')])
    await click(q(h.el, '[data-testid=attach-chip]')!)
    const dlg = q(document.body, '[data-testid=attachment-editor]')!
    expect(q(dlg, '[data-testid=image-editor]')).toBeNull()
    expect(q(dlg, '[data-testid=plain-preview]')!.textContent).toContain('notes.md')
    expect(q(dlg, '[data-testid=plain-text]')!.textContent).toBe('data')
    await click(q(dlg, '[data-testid=editor-close]')!)
    expect(q(document.body, '[data-testid=attachment-editor]')).toBeNull()
    expect(chipNames(h)).toEqual(['Edit notes.md']) // untouched
    await h.unmount()
  })
})

describe('limits', () => {
  it('over 1 GB asks first with the size and an estimate; Cancel drops the file, Attach keeps it', async () => {
    const h = await mount()
    await pick(h, [fileOf('movie.mov', 'video/quicktime', 2 * GB)])
    expect(chipNames(h)).toEqual([])
    const dlg = q(document.body, '[data-testid=big-file-confirm]')!
    expect(q(dlg, '[data-testid=big-file-text]')!.textContent).toMatch(/movie\.mov is 2\.00 GB.*about .*(seconds|minutes|h)/)
    await click(q(dlg, '[data-testid=big-file-cancel]')!)
    expect(chipNames(h)).toEqual([])
    await pick(h, [fileOf('movie.mov', 'video/quicktime', 2 * GB)])
    await click(q(document.body, '[data-testid=big-file-ok]')!)
    expect(chipNames(h)).toEqual(['Edit movie.mov'])
    await h.unmount()
  })
  it('exactly 1 GB needs no confirmation, and over 5 GB is refused outright', async () => {
    const h = await mount()
    await pick(h, [fileOf('one.bin', '', 1 * GB)])
    expect(q(document.body, '[data-testid=big-file-confirm]')).toBeNull()
    expect(chipNames(h)).toEqual(['Edit one.bin'])
    await pick(h, [fileOf('six.bin', '', 6 * GB)])
    expect(h.notices).toEqual(['six.bin is over the 5.00 GB limit'])
    expect(chipNames(h)).toEqual(['Edit one.bin'])
    await h.unmount()
  })
  it('chunked upload is chosen above 256 MB, the one-request upload below it', async () => {
    const big = fileOf('huge.mov', 'video/quicktime', 300 * MB)
    const r = await defaultUploader(big, 'hardware', () => {})
    expect(chunked.uploadChunked).toHaveBeenCalledTimes(1)
    expect(chunked.uploadChunked).toHaveBeenCalledWith(big, 'hardware', expect.objectContaining({ tags: ['chat'] }))
    expect(r.body.files?.[0].id).toBe('chunk-row')
    expect(library.uploadFile).not.toHaveBeenCalled()
    const small = fileOf('a.bin', '', 255 * MB)
    await defaultUploader(small, 'hardware', () => {})
    expect(library.uploadFile).toHaveBeenCalledTimes(1)
    const item = vi.mocked(library.uploadFile).mock.calls[0][0]
    expect(item).toMatchObject({ lane: 'hardware', tags: ['chat'], folder: '' }) // the lane's uploads root, tagged chat
    expect(chunked.uploadChunked).toHaveBeenCalledTimes(1)
  })
})

describe('sending', () => {
  it('uploads every file first, in order, with a batch bar, then posts the message with the ids', async () => {
    const order: string[] = []
    let release: () => void = () => {}
    const uploader: Uploader = async (f, _lane, pct) => {
      order.push('start ' + f.name)
      pct(50)
      if (f.name === 'b.zip') await new Promise<void>((r) => (release = r))
      order.push('end ' + f.name)
      return { ok: true, status: 201, body: { files: [rowFor(f) as never] } }
    }
    const h = await mount({ uploader })
    await pick(h, [fileOf('a.txt', 'text/plain'), fileOf('b.zip', 'application/zip')])
    const ta = q(h.el, 'textarea') as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'logs attached')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await submit(h)
    expect(h.sent).toEqual([]) // not yet: b.zip is still going up
    expect(q(h.el, '[data-testid=attach-batch-label]')!.textContent).toMatch(/^2 of 2, \d+%$/)
    expect((q(h.el, 'button[type=submit]') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { release() })
    await settle()
    expect(order).toEqual(['start a.txt', 'end a.txt', 'start b.zip', 'end b.zip'])
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].text).toBe('logs attached')
    expect(h.sent[0].atts?.map((a) => (a as Attachment).id)).toEqual(['id-a.txt', 'id-b.zip'])
    expect(chipNames(h)).toEqual([]) // cleared after sending
    await h.unmount()
  })
  it('a failed upload keeps the chips and the text, says why, and a retry skips the files already up', async () => {
    let failB = true
    const calls: string[] = []
    const uploader: Uploader = async (f) => {
      calls.push(f.name)
      if (f.name === 'b.zip' && failB) return { ok: false, status: 0, body: { error: 'network' } }
      return { ok: true, status: 201, body: { files: [rowFor(f) as never] } }
    }
    const h = await mount({ uploader })
    await pick(h, [fileOf('a.txt', 'text/plain'), fileOf('b.zip', 'application/zip')])
    await submit(h)
    expect(h.sent).toEqual([])
    expect(q(h.el, '[data-testid=attach-error]')!.textContent).toContain('No connection')
    expect(qa(h.el, '[data-testid=attach-chip]').map((c) => c.dataset.state)).toEqual(['done', 'error'])
    failB = false
    await submit(h)
    expect(calls).toEqual(['a.txt', 'b.zip', 'b.zip'])
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].text).toBe('')
    expect(h.sent[0].atts).toHaveLength(2)
    await h.unmount()
  })
})
