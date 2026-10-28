// @vitest-environment happy-dom
// Phone widths (360 to 430 px): bottom tab bar instead of the sidebar, lane list as a page, composer in the thread,
// swipe back, bottom-sheet dialogs, and nothing wider than the screen. happy-dom has no layout, so width is asserted
// through the classes and inline sizes that would cause it, and through the stylesheet.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from '../App'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { isSwipeBack } from '@/lib/swipe'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeES {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() { setTimeout(() => this.onopen?.(), 0) }
  close() {}
}
const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } }))
const lanes = (lanesJson as { id: string; members: string[] }[]).map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: [] }))
const me = (lanesJson as { id: string; members: string[] }[]).find((l) => l.id === 'hardware')!.members[0]
const W = 390
const setWidth = (w: number) => { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }) }

// (max-width: Npx) answers from the pretend screen, so the dock's narrow (sheet) mode is on like it is on a phone.
const matchesWidth = (q: string) => { const m = /max-width:\s*([\d.]+)px/.exec(q); return !!m && window.innerWidth <= Number(m[1]) }

beforeEach(() => {
  setWidth(W)
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: matchesWidth(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/me') return json({ person: me, role: 'owner', device_id: 'd', device_name: 'Phone', ip: '1.1.1.1', mac: null, lanwatch_status: null })
      if (url === '/api/health') return json({ opencode: 'up', down_for_s: 0, sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/lanes') return json(lanes)
      if (url.startsWith('/api/library/status')) return json({ counts: {}, events: [], indexing: [] })
      if (url.startsWith('/api/library')) return json([])
      if (url.endsWith('/messages')) return json([{ id: 'm1', lane: 'standards', at: '2026-10-26T10:00:00Z', role: 'person', text: 'a very long line '.repeat(30), signature: { person: me, device_id: 'd', device_name: 'Phone' } }])
      return json({})
    }),
  )
})
afterEach(() => { vi.unstubAllGlobals(); setWidth(1024) })

const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) }) }
async function mount(hash: string) {
  window.location.hash = hash
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, root }
}
// No element carries a fixed width wider than the phone.
function tooWide(root: Element): string[] {
  const bad: string[] = []
  for (const n of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const st = (n as HTMLElement).style
    for (const prop of ['width', 'minWidth'] as const) {
      const m = /^([\d.]+)px$/.exec(st[prop] || '')
      if (m && Number(m[1]) > W) bad.push(n.tagName + ' ' + prop + ' ' + st[prop])
    }
    if (n.scrollWidth > W) bad.push(n.tagName + ' scrollWidth ' + n.scrollWidth)
  }
  return bad
}

describe('phone layout at 390 px', () => {
  it('home is the lane list with the tab bar and no sidebar', async () => {
    const { el, root } = await mount('#/')
    expect(el.querySelector('[data-testid=mobile-home]')).toBeTruthy()
    expect(el.querySelector('[data-testid=rail-direct]')).toBeTruthy()
    const tabs = el.querySelector('[data-testid=mobile-tabs]')!
    expect(tabs).toBeTruthy()
    expect([...tabs.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Lanes', 'LAN', 'Library', 'Devices', 'Profile'])
    expect(tabs.className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(el.querySelector('[data-sidebar=sidebar]')).toBeNull()
    expect(el.querySelector('[data-slot=sidebar-wrapper] [data-slot=sidebar]')).toBeNull()
    expect(window.location.hash).toBe('#/') // the phone's home does not jump into a thread
    expect(tooWide(el)).toEqual([])
    await act(async () => root.unmount())
  })

  it('a tab opens its page and the Library page has no overflow', async () => {
    const { el, root } = await mount('#/')
    await act(async () => { (el.querySelector('[data-testid=tab-library]') as HTMLElement).click() })
    await settle()
    expect(window.location.hash).toBe('#/library')
    expect(el.querySelector('[data-testid=tab-library]')?.getAttribute('aria-current')).toBe('page')
    expect(el.querySelector('[data-testid=mobile-tabs]')).toBeTruthy()
    const shell = el.querySelector('[data-testid=mobile-shell]')!
    expect(shell.className).toContain('overflow-hidden')
    expect(shell.className).toContain('inset-x-0')
    expect(tooWide(el)).toEqual([])
    await act(async () => root.unmount())
  })

  it('a thread fills the screen: composer present, no tab bar, Back to the list, long text cannot widen it', async () => {
    const { el, root } = await mount('#/lanes/standards')
    expect(el.querySelector('textarea')).toBeTruthy()
    expect(el.querySelector('[data-testid=composer-drop]')).toBeTruthy()
    expect(el.querySelector('[data-testid=mobile-tabs]')).toBeNull()
    expect(el.querySelector('[data-sidebar=sidebar]')).toBeNull()
    expect(el.querySelector('[data-testid=mobile-shell]')?.className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect((el.querySelector('[data-testid=mobile-shell]') as HTMLElement).style.height).toBe('var(--app-h, 100dvh)')
    expect(tooWide(el)).toEqual([])
    await act(async () => { (el.querySelector('[data-testid=mobile-back]') as HTMLElement).click() })
    await settle()
    expect(window.location.hash).toBe('#/')
    await act(async () => root.unmount())
  })

  it('a swipe from the left edge goes back to the list', async () => {
    const { el, root } = await mount('#/lanes/standards')
    const shell = el.querySelector('[data-testid=mobile-shell]') as HTMLElement
    const touch = (type: string, x: number, y: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[]; changedTouches: unknown[] }
      const t = [{ clientX: x, clientY: y }]
      e.touches = type === 'touchend' ? [] : t
      e.changedTouches = t
      return e
    }
    await act(async () => { shell.dispatchEvent(touch('touchstart', 200, 300)); shell.dispatchEvent(touch('touchend', 330, 300)) })
    expect(window.location.hash).toBe('#/lanes/standards') // not from the edge: no swipe back
    await act(async () => { shell.dispatchEvent(touch('touchstart', 10, 300)); shell.dispatchEvent(touch('touchend', 140, 310)) })
    await settle()
    expect(window.location.hash).toBe('#/')
    await act(async () => root.unmount())
  })

  it('the swipe rule: edge start, far enough, flat, quick', () => {
    expect(isSwipeBack({ x: 5, y: 100, t: 0 }, { x: 120, y: 110, t: 300 })).toBe(true)
    expect(isSwipeBack({ x: 60, y: 100, t: 0 }, { x: 200, y: 100, t: 300 })).toBe(false)
    expect(isSwipeBack({ x: 5, y: 100, t: 0 }, { x: 40, y: 100, t: 300 })).toBe(false)
    expect(isSwipeBack({ x: 5, y: 100, t: 0 }, { x: 140, y: 260, t: 300 })).toBe(false)
    expect(isSwipeBack({ x: 5, y: 100, t: 0 }, { x: 140, y: 100, t: 2000 })).toBe(false)
  })

  it('the LAN page pans the map without scrolling the page; a dialog is a bottom sheet with a handle', async () => {
    const { el, root } = await mount('#/lan')
    expect(el.querySelector('[data-testid=lan-route]')).toBeTruthy()
    await act(async () => root.unmount())
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r2 = createRoot(host)
    await act(async () => { r2.render(<Dialog open><DialogContent><DialogTitle>t</DialogTitle><DialogDescription>d</DialogDescription>body</DialogContent></Dialog>) })
    const c = document.querySelector('[data-slot=dialog-content]')!
    expect(c.className).toContain('max-md:bottom-0')
    expect(c.className).toContain('max-md:rounded-b-none')
    expect(c.className).toContain('max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]')
    expect(document.querySelector('[data-testid=sheet-handle]')?.className).toContain('md:hidden')
    await act(async () => r2.unmount())
  })

  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
  it('the stylesheet keeps the page from scrolling sideways and sizes tap targets, only under 768 px', () => {
    const at = css.indexOf('@media (max-width: 767.98px)')
    expect(at).toBeGreaterThan(0)
    const phone = css.slice(at)
    expect(phone).toContain('overflow-x: hidden')
    expect(phone).toContain('min-height: 2.75rem')
    expect(css.slice(0, at)).not.toContain('2.75rem')
  })
})
