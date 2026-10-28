// @vitest-environment happy-dom
// The File Preview: the card id of a long-named file, and the pdf viewer that is loaded only when a pdf is opened.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardSurface } from './registry'
import { CardEnvContext, defaultCardEnv } from './env'
import { validateCard } from './validate'
import { fileCard } from '@/dock/DockHost'
import { ViewerHostContext } from './viewer-context'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const engine = vi.hoisted(() => ({ loads: 0, fail: false, pages: 3, renders: [] as [number, number][] }))
vi.mock('./pdf-engine', () => {
  engine.loads++
  return {
    loadPdf: async () => {
      if (engine.fail) throw new Error('bad pdf')
      return {
        numPages: engine.pages,
        size: async () => ({ width: 600, height: 800 }),
        render: async (n: number, _c: unknown, scale: number) => { engine.renders.push([n, scale]) },
        destroy: () => {},
      }
    },
  }
})

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const mount = async (node: React.ReactNode) => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(<CardEnvContext.Provider value={defaultCardEnv}>{node}</CardEnvContext.Provider>))
  return el
}
const ID = '0b9f4c2e-1111-4222-8333-444455556666'
const row = (name: string, path = 'console/data/uploads/hardware/' + ID + '/' + name) => ({ name, path, kind: name.split('.').pop() ?? 'file', size: 400000, mtime: '2026-10-26T08:00:00Z', lane: 'hardware', source: 'upload' as const, scope: 'lane' as const })
const preview = (kind: string, text: string) => ({ id: ID, name: 'f', kind, status: 'processed', size: 5, text, truncated: false, has_text: !!text, previewable: kind === 'application/pdf', needs_parser: false, note: null, fail_reason: null })
const stubFetch = (kind: string, text: string) =>
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(preview(kind, text)), { status: 200 }))))

describe('file viewer: pdf', () => {
  let visible: Array<() => void> = []
  class FakeIO {
    cb: (e: { isIntersecting: boolean }[]) => void
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { this.cb = cb }
    observe() { visible.push(() => this.cb([{ isIntersecting: true }])) }
    disconnect() {}
  }
  const showAll = () => act(async () => { visible.forEach((f) => f()); await new Promise((r) => setTimeout(r, 10)) })
  const get = (el: Element, id: string) => el.querySelector(`[data-testid=${id}]`) as HTMLElement
  const press = (el: Element, key: string, init: KeyboardEventInit = {}) => act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })) })
  const PAGE_H = 820
  beforeEach(() => {
    visible = []
    engine.fail = false
    engine.pages = 3
    engine.renders = []
    vi.stubGlobal('IntersectionObserver', FakeIO)
    // happy-dom has no layout: give the scroller a width and height and every page a position
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 332 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 })
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get() { const p = Number((this as HTMLElement).dataset?.page ?? 0); return p ? (p - 1) * PAGE_H : 0 } })
  })
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetTop
  })
  const openPdf = async (name = 'plan.pdf') => {
    stubFetch('application/pdf', 'extracted words')
    const close = vi.fn()
    const el = await mount(
      <ViewerHostContext.Provider value={{ close }}>
        <CardSurface card={fileCard('hardware', row(name))} arg={0} />
      </ViewerHostContext.Provider>,
    )
    await tick()
    return { el, close }
  }

  it('does not load the pdf module for a text file, loads it when a pdf is opened', async () => {
    engine.loads = 0
    stubFetch('text/markdown', 'plain notes')
    await mount(<CardSurface card={fileCard('hardware', row('notes.md'))} arg={0} />)
    await tick()
    expect(engine.loads).toBe(0)
    act(() => root?.unmount())
    root = null
    await openPdf()
    expect(engine.loads).toBe(1)
  })
  it('renders every page in one continuous scroll, fit to the width, with no header block above the pages', async () => {
    const { el } = await openPdf()
    expect(el.querySelectorAll('[data-testid=pdf-page]').length).toBe(3)
    expect(get(el, 'pdf-counter').textContent).toBe('1 / 3')
    expect(get(el, 'pdf-zoom').textContent).toBe('50%') // (332 - 32) / 600
    expect(get(el, 'pdf-fit').getAttribute('aria-pressed')).toBe('true')
    const root0 = get(el, 'file-preview')
    expect(root0.firstElementChild).toBe(get(el, 'pdf-scroll')) // the pages are the first thing in the surface
    expect(el.querySelector('h3')).toBeNull()
  })
  it('draws a page only when it nears the screen', async () => {
    const { el } = await openPdf()
    expect(engine.renders).toEqual([])
    await showAll()
    expect(engine.renders.map((r) => r[0]).sort()).toEqual([1, 2, 3])
    expect(engine.renders[0][1]).toBe(0.5)
    expect(el.querySelectorAll('canvas').length).toBe(3)
  })
  it('the page counter follows the scroll, and clicking it jumps to a page', async () => {
    const { el } = await openPdf()
    const sc = get(el, 'pdf-scroll')
    await act(async () => { sc.scrollTop = 1700; sc.dispatchEvent(new Event('scroll')) })
    expect(get(el, 'pdf-counter').textContent).toBe('3 / 3')
    await act(async () => { sc.scrollTop = 900; sc.dispatchEvent(new Event('scroll')) })
    expect(get(el, 'pdf-counter').textContent).toBe('2 / 3')
    await act(async () => { sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll')) })
    await act(async () => get(el, 'pdf-page-indicator').click())
    const input = get(el, 'pdf-jump-input') as HTMLInputElement
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '3'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await press(input, 'Enter')
    expect(sc.scrollTop).toBe(2 * PAGE_H - 12)
    expect(get(el, 'pdf-counter').textContent).toBe('3 / 3')
  })
  it('zoom out, zoom in and fit width change the percent and redraw at the new scale', async () => {
    const { el } = await openPdf()
    await showAll()
    engine.renders = []
    await act(async () => get(el, 'pdf-zoom-in').click())
    expect(get(el, 'pdf-zoom').textContent).toBe('75%')
    expect(get(el, 'pdf-fit').getAttribute('aria-pressed')).toBe('false')
    await showAll()
    expect(engine.renders.some((r) => r[1] === 0.75)).toBe(true)
    await act(async () => get(el, 'pdf-zoom-out').click())
    await act(async () => get(el, 'pdf-zoom-out').click())
    expect(get(el, 'pdf-zoom').textContent).toBe('25%')
    expect(get(el, 'pdf-zoom-out').hasAttribute('disabled')).toBe(true)
    await act(async () => get(el, 'pdf-fit').click())
    expect(get(el, 'pdf-zoom').textContent).toBe('50%')
  })
  it('footer: Text toggles the extracted text, Info opens the details, Download and Copy path and Close are there', async () => {
    const writes: string[] = []
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (t: string) => { writes.push(t) } } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const { el, close } = await openPdf()
    expect(el.querySelector('[data-testid=pdf-text-panel]')).toBeNull()
    await act(async () => get(el, 'viewer-text').click())
    expect(get(el, 'pdf-text-panel').textContent).toContain('extracted words')
    await act(async () => get(el, 'viewer-text').click())
    expect(el.querySelector('[data-testid=pdf-text-panel]')).toBeNull()
    expect(get(el, 'file-download').getAttribute('href')).toBe('/api/library/' + ID + '/download')
    await act(async () => get(el, 'viewer-copy').click())
    expect(writes).toEqual([row('plan.pdf').path])
    await act(async () => get(el, 'viewer-info').click())
    const info = document.body.querySelector('[data-testid=viewer-info-popover]')!
    for (const k of ['kind', 'size', 'lane', 'path', 'uploader', 'state', 'label', 'assigned', 'notes']) expect(info.querySelector(`[data-testid=info-${k}]`), k).toBeTruthy()
    expect(info.querySelector('[data-testid=info-lane]')!.textContent).toBe('hardware')
    await act(async () => get(el, 'viewer-close').click())
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('keyboard: arrows and page keys scroll, Cmd plus and minus zoom, Esc closes', async () => {
    const { el, close } = await openPdf()
    const view = get(el, 'file-preview')
    const sc = get(el, 'pdf-scroll')
    await press(view, 'ArrowDown')
    expect(sc.scrollTop).toBe(60)
    await press(view, 'ArrowUp')
    expect(sc.scrollTop).toBe(0)
    await press(view, 'PageDown')
    expect(sc.scrollTop).toBe(630)
    await press(view, 'PageUp')
    expect(sc.scrollTop).toBe(0)
    await press(view, '+', { metaKey: true })
    expect(get(el, 'pdf-zoom').textContent).toBe('75%')
    await press(view, '-', { ctrlKey: true })
    expect(get(el, 'pdf-zoom').textContent).toBe('50%')
    await press(view, 'Escape')
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('zoom is the viewer\'s own: Cmd plus and minus are cancelled and zoom the pages while focused, the app root size and the zoom pref are never touched', async () => {
    document.documentElement.style.fontSize = '115%'
    localStorage.setItem('sov.zoom', '1.15')
    const { el } = await openPdf()
    await showAll()
    const view = get(el, 'file-preview')
    view.focus()
    expect(document.activeElement).toBe(view)
    const ev = (key: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    const plus = ev('+', { metaKey: true })
    await act(async () => { window.dispatchEvent(plus) })
    expect(plus.defaultPrevented).toBe(true)
    expect(get(el, 'pdf-zoom').textContent).toBe('75%')
    const minus = ev('-', { ctrlKey: true })
    await act(async () => { window.dispatchEvent(minus) })
    expect(minus.defaultPrevented).toBe(true)
    expect(get(el, 'pdf-zoom').textContent).toBe('50%')
    expect(document.documentElement.style.fontSize).toBe('115%')
    expect(localStorage.getItem('sov.zoom')).toBe('1.15')
  })
  it('Cmd plus is left to the browser when the viewer does not have focus', async () => {
    const { el } = await openPdf()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const plus = new KeyboardEvent('keydown', { key: '+', metaKey: true, bubbles: true, cancelable: true })
    await act(async () => { window.dispatchEvent(plus) })
    expect(plus.defaultPrevented).toBe(false)
    expect(get(el, 'pdf-zoom').textContent).toBe('50%')
  })
  it('ctrl wheel (a trackpad pinch) over the pages zooms the viewer and is cancelled; a plain wheel scrolls', async () => {
    const { el } = await openPdf()
    const sc = get(el, 'file-preview')
    const wheel = (deltaY: number, ctrlKey: boolean) => {
      const e = new Event('wheel', { bubbles: true, cancelable: true })
      Object.defineProperties(e, { deltaY: { value: deltaY }, ctrlKey: { value: ctrlKey }, metaKey: { value: false } })
      return e
    }
    const pinch = wheel(-60, true)
    await act(async () => { sc.dispatchEvent(pinch) })
    expect(pinch.defaultPrevented).toBe(true)
    expect(get(el, 'pdf-zoom').textContent).toBe('75%')
    const plain = wheel(60, false)
    await act(async () => { sc.dispatchEvent(plain) })
    expect(plain.defaultPrevented).toBe(false)
    expect(get(el, 'pdf-zoom').textContent).toBe('75%')
  })
  it('a two finger pinch scales the pages with a transform and commits the zoom on release, without touching the root', async () => {
    document.documentElement.style.fontSize = '115%'
    const { el } = await openPdf()
    const view = get(el, 'file-preview')
    const touch = (type: string, a: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: 100 - a / 2, clientY: 100 }, { clientX: 100 + a / 2, clientY: 100 }] })
      return e
    }
    const start = touch('touchstart', 100)
    await act(async () => { view.dispatchEvent(start) })
    expect(start.defaultPrevented).toBe(true)
    const move = touch('touchmove', 200)
    await act(async () => { view.dispatchEvent(move) })
    expect(move.defaultPrevented).toBe(true)
    expect(get(el, 'pdf-pages').style.transform).toBe('scale(2)')
    await act(async () => { view.dispatchEvent(touch('touchend', 0)) })
    expect(get(el, 'pdf-pages').style.transform).toBe('')
    expect(get(el, 'pdf-zoom').textContent).toBe('100%') // 50% x 2
    expect(get(el, 'pdf-scroll').style.touchAction).toBe('pan-x pan-y')
    expect(document.documentElement.style.fontSize).toBe('115%')
  })
  it('falls back to the processed text when the pdf cannot be loaded, the footer stays', async () => {
    engine.fail = true
    const { el } = await openPdf('broken.pdf')
    await tick()
    expect(get(el, 'pdf-fallback')).toBeTruthy()
    expect(get(el, 'file-content-text').textContent).toBe('extracted words')
    expect(get(el, 'viewer-close')).toBeTruthy()
    expect(el.querySelector('[data-testid=pdf-zoom]')).toBeNull()
  })
})

describe('file viewer: images and text', () => {
  const get = (el: Element, id: string) => el.querySelector(`[data-testid=${id}]`) as HTMLElement
  it('an image fills the frame with fit, zoom, info, download and close, and no page counter', async () => {
    stubFetch('image/png', '')
    const close = vi.fn()
    const el = await mount(
      <ViewerHostContext.Provider value={{ close }}>
        <CardSurface card={fileCard('hardware', row('shot.png'))} arg={0} />
      </ViewerHostContext.Provider>,
    )
    await tick()
    expect(get(el, 'image-view').getAttribute('src')).toBe('/api/library/' + ID + '/download?inline=1')
    expect(get(el, 'file-preview').getAttribute('data-mode')).toBe('image')
    expect(el.querySelector('[data-testid=pdf-page-indicator]')).toBeNull()
    expect(el.querySelector('[data-testid=viewer-text]')).toBeNull()
    expect(get(el, 'pdf-zoom').textContent).toBe('100%')
    await act(async () => get(el, 'pdf-zoom-in').click())
    expect(get(el, 'pdf-zoom').textContent).toBe('125%')
    expect(get(el, 'image-view').style.width).toBe('125%')
    await act(async () => get(el, 'pdf-fit').click())
    expect(get(el, 'pdf-zoom').textContent).toBe('100%')
    await act(async () => get(el, 'viewer-info').click())
    expect(document.body.querySelector('[data-testid=viewer-info-popover]')).toBeTruthy()
    await act(async () => get(el, 'viewer-close').click())
    expect(close).toHaveBeenCalled()
    expect(get(el, 'file-download')).toBeTruthy()
  })
  it('a text file keeps summary, content and details inside the same frame, with the footer', async () => {
    stubFetch('text/markdown', 'plain notes')
    const el = await mount(<CardSurface card={fileCard('hardware', row('notes.md'))} arg={0} />)
    await tick()
    expect(get(el, 'file-preview').getAttribute('data-mode')).toBe('text')
    expect(get(el, 'file-content-text').textContent).toBe('plain notes')
    expect(get(el, 'file-meta')).toBeTruthy()
    expect(get(el, 'viewer-bar')).toBeTruthy()
    expect(el.querySelector('[data-testid=pdf-zoom]')).toBeNull()
  })
})

describe('card id of a previewed file', () => {
  it('a file with a 150 character name builds a valid card and opens in the File Preview', async () => {
    const name = 'x'.repeat(146) + '.md'
    const card = fileCard('hardware', row(name))
    expect(card.id.length).toBeLessThanOrEqual(100)
    expect(validateCard(card).ok).toBe(true)
    stubFetch('text/markdown', 'text')
    const el = await mount(<CardSurface card={card} arg={0} />)
    expect(el.querySelector('[data-testid=file-preview]')!.textContent).toContain(name)
    expect(el.textContent).not.toContain('longer than')
    expect(el.textContent?.toLowerCase()).not.toContain('could not be shown')
  })
  it('the envelope allows an id up to 200 characters and no more', () => {
    const card = fileCard('hardware', row('a.md'))
    expect(validateCard({ ...card, id: 'f'.repeat(200) }).ok).toBe(true)
    expect(validateCard({ ...card, id: 'f'.repeat(201) }).ok).toBe(false)
  })
})

