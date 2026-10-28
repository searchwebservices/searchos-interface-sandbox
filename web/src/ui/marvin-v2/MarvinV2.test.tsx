// @vitest-environment happy-dom
// Marvin's one-chat shell end to end: one lane reachable, the Help cheat sheet, click to fill, pins that persist.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'

// The shell's content comes from cheatsheet.ts; the tests bring their own so they do not move with the copy.
vi.mock('./cheatsheet', () => ({
  CHEATSHEET: [
    {
      id: 'net',
      title: 'Network checks',
      blurb: 'What is on the LAN.',
      items: [
        { id: 'lan-now', label: 'What is on the LAN', prompt: 'Give me the LAN picture.', why: 'Counts first.' },
        { id: 'ping-host', label: 'Ping a host', prompt: 'Ping <ip> and tell me the loss.' },
      ],
    },
    {
      id: 'gear',
      title: 'Gear',
      blurb: 'Boxes.',
      items: [
        { id: 'disk', label: 'Disk space', prompt: 'How full is the disk?' },
        { id: 'copy-file', label: 'Copy a file', prompt: 'Copy <file> to <device> now.' },
      ],
    },
  ],
}))

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
const L = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, title: id, members: ['marvin'], count: 0, asks: 0, tail: [], last: null, ...extra })
const LANES = [L('dm-marvin', 'dm'), L('ops-room', 'group'), L('jared-desk', 'desk', { agent: { id: 'jared', name: 'Jared' } }), L('rules-room', 'group')]

// What the server holds for this person on this device, so a second mount reads back what the first saved.
let serverDevice: Record<string, unknown> = {}
const profileBody = () => ({ profile: { person_id: 'marvin', name: 'Marvin', tag: 'marvin', avatar: null, editable: true }, prefs: { default: {}, device: serverDevice, effective: serverDevice }, device_id: 'd' })
const calls = () => (fetch as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls
const saved = () => calls().filter((c) => c[0] === '/api/me/profile' && c[1]?.method === 'PUT').map((c) => JSON.parse(String(c[1]!.body)).prefs.device.help_pins as string[])
const sentMessages = () => calls().filter((c) => /\/api\/lanes\/[^/]+\/messages$/.test(c[0]) && c[1]?.method === 'POST')

function stub(opts: { lanes?: unknown[]; ui?: string; role?: string; lanesFail?: () => boolean; messages?: unknown[]; health?: Record<string, unknown>; extra?: (url: string) => unknown } = {}) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/me/profile') {
      if (init?.method === 'PUT') serverDevice = { ...serverDevice, ...JSON.parse(String(init.body)).prefs.device }
      return json(profileBody())
    }
    if (url === '/api/me') return json({ person: 'marvin', role: opts.role ?? 'owner', device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, ui: opts.ui ?? 'marvin-v2' })
    if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0, ...opts.health })
    if (url === '/api/lanes') return opts.lanesFail?.() ? Promise.resolve(new Response('boom', { status: 500 })) : json(opts.lanes ?? LANES)
    const more = opts.extra?.(url)
    if (more !== undefined) return json(more)
    if (url.startsWith('/api/library/status')) return json({ counts: {}, queue: [] })
    if (url.endsWith('/messages')) return json(opts.messages ?? [])
    if (url.startsWith('/api/library')) return json([])
    return json({})
  }))
}

beforeEach(() => {
  serverDevice = {}
  window.location.hash = '#/'
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  try { localStorage.clear() } catch { /* ignore */ }
  document.body.innerHTML = ''
})

const tick = (ms = 10) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
async function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  for (let i = 0; i < 8; i++) await tick()
  return { el, root }
}
const q = (id: string, scope: ParentNode = document) => scope.querySelector('[data-testid="' + id + '"]') as HTMLElement | null
const qa = (id: string, scope: ParentNode = document) => [...scope.querySelectorAll('[data-testid="' + id + '"]')] as HTMLElement[]
const composer = () => document.getElementById('v2-composer') as HTMLTextAreaElement
const click = (n: HTMLElement) => act(async () => { n.click() })
const key = (k: string, target: EventTarget = document.body) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
const sheet = () => q('cheat-sheet')
const item = (id: string) => document.querySelector('[data-testid="cheat-item"][data-item="' + id + '"]') as HTMLElement

describe('marvin-v2: one chat', () => {
  it('shows one chat and the tools, no lane list, no groups, no desks, no apps', async () => {
    const { el, root } = await mount()
    expect(window.location.hash).toBe('#/lanes/dm-marvin')
    expect(qa('chat-row', el).length).toBe(1)
    expect(q('rail-direct', el)).toBeNull()
    expect(q('rail-threads', el)).toBeNull()
    expect(q('lane-menu')).toBeNull()
    const nav = (q('rail-tools', el)!.textContent ?? '')
    for (const w of ['Devices', 'LAN', 'Health', 'Library', 'Help']) expect(nav).toContain(w)
    for (const w of ['Standards', 'Report', 'Jared', 'ops-room', 'rules-room', 'CRM', 'Money']) expect(el.textContent).not.toContain(w)
    expect(q('profile-link', el)).not.toBeNull()
    expect(q('lane-header', el)).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('titles the chat like an inbox DM: just the agent, no lane title, badge or members', async () => {
    const { el, root } = await mount()
    const h = q('lane-header', el)!
    expect(q('lane-title', h)!.textContent).toBe('Gilfoyle')
    expect(h.textContent).not.toContain('Direct')
    expect(h.querySelector('[aria-label="Members"]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('sends every other lane route, and the apps and engines routes, to the one chat', async () => {
    for (const hash of ['#/lanes/ops-room', '#/lanes/jared-desk', '#/lanes/nope', '#/apps/pm', '#/apps/crm/x', '#/engines', '#/lanes/rules-room/m/abc']) {
      window.location.hash = hash
      const { el, root } = await mount()
      expect(window.location.hash, hash).toBe('#/lanes/dm-marvin')
      expect(el.textContent).not.toContain('ops-room')
      expect(q('lane-title', el)?.textContent).toBe('Gilfoyle')
      await act(async () => root.unmount())
      document.body.innerHTML = ''
    }
  })

  it('leaves the tool pages alone and strips a foreign lane from a library link', async () => {
    window.location.hash = '#/health'
    let m = await mount()
    expect(window.location.hash).toBe('#/health')
    await act(async () => m.root.unmount())
    document.body.innerHTML = ''
    window.location.hash = '#/library/ops-room'
    m = await mount()
    expect(window.location.hash).toBe('#/library')
    await act(async () => m.root.unmount())
  })

  it('keeps a deep link to a message in the one chat', async () => {
    window.location.hash = '#/lanes/dm-marvin/m/abc'
    const { root } = await mount()
    expect(window.location.hash).toBe('#/lanes/dm-marvin/m/abc')
    await act(async () => root.unmount())
  })

  it('says so when the person has no direct line to Gilfoyle, and still offers the tools', async () => {
    stub({ lanes: [L('ops-room', 'group'), L('jared-desk', 'desk', { agent: { id: 'jared', name: 'Jared' } })] })
    const { el, root } = await mount()
    expect(q('no-chat', el)?.textContent).toContain('No chat yet')
    expect(q('chat-row', el)).toBeNull()
    expect(el.textContent).not.toContain('ops-room')
    expect(q('help-nav', el)).not.toBeNull()
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: Help', () => {
  it('opens from the header button and the sidebar, and closes with Esc', async () => {
    const { root } = await mount()
    expect(sheet()).toBeNull()
    await click(q('help-button')!)
    expect(sheet()?.textContent).toContain('Cheat sheet')
    expect(qa('cheat-section').map((s) => s.getAttribute('data-section'))).toEqual(['net', 'gear'])
    expect(qa('cheat-section')[0].textContent).toContain('Network checks')
    await key('Escape', sheet()!)
    await tick(250)
    expect(sheet()).toBeNull()
    await click(q('help-nav')!)
    expect(sheet()).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('opens with ? when focus is not in a field, and not when it is', async () => {
    const { root } = await mount()
    await key('?', composer())
    expect(sheet()).toBeNull()
    await key('?')
    expect(sheet()).not.toBeNull()
    await key('Escape', sheet()!)
    await tick(250)
    expect(sheet()).toBeNull()
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', ctrlKey: true, bubbles: true })) })
    expect(sheet()).toBeNull()
    await act(async () => root.unmount())
  })

  it('a click puts the prompt in the composer, unsent, focused with the caret at the end', async () => {
    const { root } = await mount()
    await click(q('help-button')!)
    await click(q('cheat-use', item('lan-now'))!)
    await tick()
    expect(sheet()).toBeNull()
    expect(composer().value).toBe('Give me the LAN picture.')
    expect(document.activeElement).toBe(composer())
    expect([composer().selectionStart, composer().selectionEnd]).toEqual([24, 24])
    expect(JSON.parse(localStorage.getItem('sov.draft.v1.marvin.dm-marvin') ?? '""')).toBe('Give me the LAN picture.')
    expect(sentMessages().length).toBe(0)
    await act(async () => root.unmount())
  })

  it('selects a <placeholder> so it can be typed over', async () => {
    const { root } = await mount()
    await click(q('help-button')!)
    await click(q('cheat-use', item('ping-host'))!)
    await tick()
    const v = composer().value
    expect(v).toBe('Ping <ip> and tell me the loss.')
    expect(v.slice(composer().selectionStart, composer().selectionEnd)).toBe('<ip>')
    await act(async () => root.unmount())
  })

  it('keeps what was typed and puts the prompt under it; an unedited suggestion is replaced', async () => {
    const { root } = await mount()
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      set.call(composer(), 'my own note')
      composer().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(q('help-button')!)
    await click(q('cheat-use', item('lan-now'))!)
    await tick()
    expect(composer().value).toBe('my own note\n\nGive me the LAN picture.')
    await act(async () => root.unmount())
    document.body.innerHTML = ''
    localStorage.setItem('sov.draft.v1.marvin.dm-marvin', JSON.stringify('Give me the LAN picture.'))
    const m = await mount()
    await click(q('help-button')!)
    await click(q('cheat-use', item('disk'))!)
    await tick()
    expect(composer().value).toBe('How full is the disk?')
    await act(async () => m.root.unmount())
  })

  it('from another page a click goes to the chat and fills it there', async () => {
    window.location.hash = '#/health'
    const { root } = await mount()
    await key('?')
    await click(q('cheat-use', item('lan-now'))!)
    await tick()
    expect(window.location.hash).toBe('#/lanes/dm-marvin')
    expect(composer().value).toBe('Give me the LAN picture.')
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: pins', () => {
  it('a pin shows under Pinned, as a chip above the composer, and is saved per person and device', async () => {
    const { root } = await mount()
    expect(q('pin-chips')).toBeNull()
    await click(q('help-button')!)
    expect(q('cheat-pinned')).toBeNull()
    await click(q('cheat-pin', item('ping-host'))!)
    await tick()
    expect(qa('cheat-item', q('cheat-pinned')!).map((n) => n.getAttribute('data-item'))).toEqual(['ping-host'])
    expect(qa('pin-chip').map((n) => n.textContent)).toEqual(['Ping a host'])
    expect(saved()).toEqual([['ping-host']])
    expect(serverDevice).toEqual({ help_pins: ['ping-host'] })
    expect(JSON.parse(localStorage.getItem('sov.help.pins.v1.marvin') ?? '[]')).toEqual(['ping-host'])
    // The chip sits in the chat, above the composer, and is clickable the same way.
    expect(q('pin-chips')!.compareDocumentPosition(composer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await key('Escape', sheet()!)
    await tick(250)
    await click(q('pin-chip')!)
    await tick()
    expect(composer().value).toBe('Ping <ip> and tell me the loss.')
    expect(composer().value.slice(composer().selectionStart, composer().selectionEnd)).toBe('<ip>')
    await act(async () => root.unmount())
  })

  it('pins come back after a reload from the saved prefs, even with the device cache gone', async () => {
    let m = await mount()
    await click(q('help-button')!)
    await click(q('cheat-pin', item('disk'))!)
    await click(q('cheat-pin', item('lan-now'))!)
    await tick()
    expect(saved().pop()).toEqual(['disk', 'lan-now'])
    await act(async () => m.root.unmount())
    document.body.innerHTML = ''
    localStorage.clear()
    m = await mount()
    expect(qa('pin-chip').map((n) => n.getAttribute('data-item'))).toEqual(['disk', 'lan-now'])
    await act(async () => m.root.unmount())
  })

  it('unpinning in the sheet removes the chip and saves the shorter list', async () => {
    const { root } = await mount()
    await click(q('help-button')!)
    await click(q('cheat-pin', item('disk'))!)
    await click(q('cheat-pin', item('lan-now'))!)
    await tick()
    expect(qa('pin-chip').length).toBe(2)
    await click(q('cheat-unpin', q('cheat-pinned')!)!)
    await tick()
    expect(qa('pin-chip').map((n) => n.getAttribute('data-item'))).toEqual(['lan-now'])
    expect(saved().pop()).toEqual(['lan-now'])
    await click(q('cheat-unpin', q('cheat-pinned')!)!)
    await tick()
    expect(q('pin-chips')).toBeNull()
    expect(q('cheat-pinned')).toBeNull()
    expect(saved().pop()).toEqual([])
    await act(async () => root.unmount())
  })

  it('ignores a pin whose suggestion is gone from the cheat sheet', async () => {
    serverDevice = { help_pins: ['gone', 'disk'] }
    const { root } = await mount()
    expect(qa('pin-chip').map((n) => n.getAttribute('data-item'))).toEqual(['disk'])
    await act(async () => root.unmount())
  })
})

describe('marvin-v1 is unchanged', () => {
  it('still lists the lanes, has no Help and no chips', async () => {
    stub({ ui: 'marvin-v1' })
    const { el, root } = await mount()
    expect(q('rail-direct', el)).not.toBeNull()
    expect(q('rail-threads', el)).not.toBeNull()
    expect(q('help-button')).toBeNull()
    expect(q('help-nav')).toBeNull()
    expect(q('pin-chips')).toBeNull()
    await key('?')
    expect(sheet()).toBeNull()
    window.location.hash = '#/lanes/ops-room'
    await tick()
    expect(window.location.hash).toBe('#/lanes/ops-room')
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: nothing of the other lanes leaks', () => {
  it('Cmd K never lists another lane', async () => {
    const { el, root } = await mount()
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })) })
    for (let i = 0; i < 3; i++) await tick()
    const modal = q('search-modal')
    expect(modal).not.toBeNull()
    expect(q('search-group-lanes')).toBeNull()
    for (const w of ['ops-room', 'jared-desk', 'rules-room']) expect(document.body.textContent, w).not.toContain(w)
    expect(el.isConnected).toBe(true)
    await act(async () => root.unmount())
  })

  it('the Library has no lane filter and no upload-to-lane choice', async () => {
    window.location.hash = '#/library'
    const { el, root } = await mount()
    expect(q('library-page', el)).not.toBeNull()
    expect(q('lane-filter', el)).toBeNull()
    expect(q('upload-lane', el)).toBeNull()
    expect(el.textContent).not.toContain('ops-room')
    await act(async () => root.unmount())
  })

  it('the Help sheet clears the notch and the home indicator on a phone', async () => {
    const { root } = await mount()
    await act(async () => { q('help-button')?.click() })
    for (let i = 0; i < 3; i++) await tick()
    expect(sheet()?.className).toContain('max-md:pt-[env(safe-area-inset-top)]')
    expect(sheet()?.innerHTML).toContain('env(safe-area-inset-bottom)')
    await act(async () => root.unmount())
  })
})

// ---------------------------------------------------------------- polish round: scoping, placeholders, retry, phone

const unreadTail = (n: number) => Array.from({ length: n }, (_, i) => ({ at: '2026-10-28T10:0' + i + ':00Z', own: false }))
const type = (v: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(composer(), v)
  composer().dispatchEvent(new Event('input', { bubbles: true }))
})
const press = async (k: string, target: HTMLElement, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  await act(async () => { target.dispatchEvent(e) })
  return e
}
const fillFrom = async (id: string) => {
  await click(q('help-button')!)
  await click(q('cheat-use', item(id))!)
  await tick()
}

describe('marvin-v2: tab title counts the one chat only', () => {
  const lanes = [L('dm-marvin', 'dm'), L('ops-room', 'group', { tail: unreadTail(3), asks: 2 })]
  it('ignores unread, mentions and asks of other lanes', async () => {
    stub({ lanes })
    const { root } = await mount()
    expect(document.title).toBe('SearchOS')
    await act(async () => root.unmount())
  })

  it('marvin-v1 still counts every lane', async () => {
    stub({ lanes, ui: 'marvin-v1' })
    window.location.hash = '#/'
    const { root } = await mount()
    expect(document.title).toBe('[2 asks] (3) SearchOS')
    await act(async () => root.unmount())
  })

  it('counts the one chat itself while it is not the open lane (a tool page)', async () => {
    stub({ lanes: [L('dm-marvin', 'dm', { tail: unreadTail(2) }), L('ops-room', 'group', { tail: unreadTail(5) })] })
    window.location.hash = '#/health'
    const { root } = await mount()
    expect(document.title).toBe('(2) SearchOS')
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: Health lists only the one chat', () => {
  const health = { sessions: { 'dm-marvin': 'ok', 'ops-room': 'ok', 'jared-desk': 'missing' }, pending_asks: 7 }
  const lanes = [L('dm-marvin', 'dm', { asks: 1 }), L('ops-room', 'group', { asks: 4 }), L('jared-desk', 'desk', { agent: { id: 'jared', name: 'Jared' }, asks: 2 })]
  it('one session row, the chat asks, no other lane anywhere', async () => {
    stub({ lanes, health })
    window.location.hash = '#/health'
    const { el, root } = await mount()
    expect(qa('health-sessions', el).length).toBe(1)
    expect(el.querySelectorAll('[data-testid="health-sessions"] li').length).toBe(1)
    expect(q('health-asks', el)!.textContent).toContain('1')
    expect(q('health-asks', el)!.textContent).not.toContain('7')
    expect(q('health-page', el)!.textContent).not.toContain('ops-room')
    expect(q('health-page', el)!.textContent).not.toContain('jared-desk')
    await act(async () => root.unmount())
  })

  it('marvin-v1 still lists every lane and the global ask count', async () => {
    stub({ lanes, health, ui: 'marvin-v1' })
    window.location.hash = '#/health'
    const { el, root } = await mount()
    expect(el.querySelectorAll('[data-testid="health-sessions"] li').length).toBe(3)
    expect(q('health-asks', el)!.textContent).toContain('7')
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: no Forward', () => {
  const messages = [{ id: 'a1', lane: 'dm-marvin', at: '2026-10-28T09:00:00Z', role: 'gilfoyle', text: 'The rack is warm.' }]
  const menu = () => [...document.querySelectorAll('[data-testid=message-menu] [role=menuitem]')].map((i) => i.textContent)
  const openMenu = async () => {
    const r = document.querySelector('[data-id="a1"]') as HTMLElement
    await act(async () => { r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })) })
    await tick()
  }

  it('the message menu and the selection bar have no Forward, and no dialog exists', async () => {
    stub({ messages })
    const { el, root } = await mount()
    await openMenu()
    expect(menu()).toContain('Select')
    expect(menu()).not.toContain('Forward')
    await click([...document.querySelectorAll('[data-testid=message-menu] [role=menuitem]')].find((i) => i.textContent === 'Select') as HTMLElement)
    await tick()
    const bar = q('selection-bar', el)!
    expect(bar).not.toBeNull()
    const labels = [...bar.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toContain('Copy')
    expect(labels.some((l) => l?.includes('Forward'))).toBe(false)
    expect(q('forward-dialog')).toBeNull()
    await act(async () => root.unmount())
  })

  it('marvin-v1 keeps Forward', async () => {
    stub({ messages, ui: 'marvin-v1' })
    window.location.hash = '#/lanes/dm-marvin'
    const { root } = await mount()
    await openMenu()
    expect(menu()).toContain('Forward')
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: cheat sheet placeholders', () => {
  it('Tab jumps to the next unfilled token while one exists, then behaves normally', async () => {
    const { root } = await mount()
    await fillFrom('copy-file')
    const sel = () => composer().value.slice(composer().selectionStart, composer().selectionEnd)
    expect(sel()).toBe('<file>')
    let e = await press('Tab', composer())
    expect(e.defaultPrevented).toBe(true)
    expect(sel()).toBe('<device>')
    // <file> is still unfilled: the next Tab wraps back to it.
    e = await press('Tab', composer())
    expect(e.defaultPrevented).toBe(true)
    expect(sel()).toBe('<file>')
    // Fill both by hand: nothing is left, so Tab is the browser's again.
    await type('Copy a.txt to box now.')
    e = await press('Tab', composer())
    expect(e.defaultPrevented).toBe(false)
    await act(async () => root.unmount())
  })

  it('a lone token that is already selected does not trap Tab; Shift Tab is left alone', async () => {
    const { root } = await mount()
    await fillFrom('ping-host')
    let e = await press('Tab', composer())
    expect(e.defaultPrevented).toBe(false)
    await fillFrom('copy-file')
    e = await press('Tab', composer(), { shiftKey: true })
    expect(e.defaultPrevented).toBe(false)
    await act(async () => root.unmount())
  })

  it('Tab is normal in a composer that never got a cheat sheet fill', async () => {
    const { root } = await mount()
    await type('Ping <ip> please')
    const e = await press('Tab', composer())
    expect(e.defaultPrevented).toBe(false)
    await act(async () => root.unmount())
  })

  it('sending with an unfilled token warns first and needs a second Enter', async () => {
    const { root } = await mount()
    await fillFrom('ping-host')
    expect(q('placeholder-warning')).toBeNull()
    await press('Enter', composer())
    await tick()
    expect(sentMessages().length).toBe(0)
    expect(q('placeholder-warning')?.textContent).toContain('<ip>')
    expect(q('placeholder-warning')?.textContent).toContain('Enter again')
    expect(composer().value).toBe('Ping <ip> and tell me the loss.')
    await press('Enter', composer())
    await tick(30)
    expect(sentMessages().length).toBe(1)
    expect(JSON.parse(String(sentMessages()[0][1]!.body)).text).toBe('Ping <ip> and tell me the loss.')
    expect(q('placeholder-warning')).toBeNull()
    await act(async () => root.unmount())
  })

  it('editing the text after the warning clears it and asks again; a filled prompt sends at once', async () => {
    const { root } = await mount()
    await fillFrom('ping-host')
    await press('Enter', composer())
    await tick()
    expect(q('placeholder-warning')).not.toBeNull()
    await type('Ping <ip> and tell me the loss, please.')
    expect(q('placeholder-warning')).toBeNull()
    await press('Enter', composer())
    await tick()
    expect(sentMessages().length).toBe(0)
    expect(q('placeholder-warning')).not.toBeNull()
    await type('Ping 10.0.0.5 and tell me the loss.')
    expect(q('placeholder-warning')).toBeNull()
    await press('Enter', composer())
    await tick(30)
    expect(sentMessages().length).toBe(1)
    await act(async () => root.unmount())
  })

  it('a message typed by hand with angle brackets sends at once', async () => {
    const { root } = await mount()
    await type('is <b> a tag?')
    await press('Enter', composer())
    await tick(30)
    expect(sentMessages().length).toBe(1)
    expect(q('placeholder-warning')).toBeNull()
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: a failed lane list is a retry, not an empty account', () => {
  it('shows the retry state, never "No chat yet", and recovers on Try again', async () => {
    let fail = true
    stub({ lanesFail: () => fail })
    const { el, root } = await mount()
    expect(q('lanes-failed', el)).not.toBeNull()
    expect(q('no-chat', el)).toBeNull()
    expect(el.textContent).not.toContain('No chat yet')
    expect(q('lanes-retry', el)).not.toBeNull()
    fail = false
    await click(q('lanes-retry', el)!)
    for (let i = 0; i < 4; i++) await tick()
    expect(q('lanes-failed', el)).toBeNull()
    expect(window.location.hash).toBe('#/lanes/dm-marvin')
    expect(q('lane-header', el)).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('a lane list that loaded without a Gilfoyle chat still says No chat yet', async () => {
    stub({ lanes: [L('ops-room', 'group')] })
    const { el, root } = await mount()
    expect(q('no-chat', el)).not.toBeNull()
    expect(q('lanes-failed', el)).toBeNull()
    await act(async () => root.unmount())
  })

  it('a failed refresh after the chat loaded does not replace the chat', async () => {
    let fail = false
    stub({ lanesFail: () => fail })
    const { el, root } = await mount()
    expect(q('lane-header', el)).not.toBeNull()
    fail = true
    await act(async () => { await (fetch as unknown as (u: string) => Promise<Response>)('/api/lanes') })
    expect(q('lanes-failed', el)).toBeNull()
    expect(q('lane-header', el)).not.toBeNull()
    await act(async () => root.unmount())
  })
})

describe('marvin-v2 on a phone', () => {
  const phone = () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true })
    window.matchMedia = ((query: string) => {
      const m = /max-width:\s*([\d.]+)px/.exec(query)
      return { matches: !!m && 390 <= Number(m[1]), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
    }) as unknown as typeof window.matchMedia
  }
  afterEach(() => { Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true }) })

  it('has the tab bar items and the one chat, and no other lane anywhere', async () => {
    phone()
    stub({ lanes: [L('dm-marvin', 'dm', { tail: unreadTail(2) }), L('ops-room', 'group', { tail: unreadTail(3) }), L('jared-desk', 'desk', { agent: { id: 'jared', name: 'Jared' } })] })
    window.location.hash = '#/health'
    const { el, root } = await mount()
    expect(q('mobile-shell', el)).not.toBeNull()
    expect(el.querySelector('[data-sidebar=sidebar]')).toBeNull()
    const tabs = q('mobile-tabs', el)!
    expect([...tabs.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Chat2', 'Devices', 'LAN', 'Health', 'Library', 'Help', 'Profile'])
    expect(qa('chat-row', el).length).toBe(0)
    expect(q('rail-direct', el)).toBeNull()
    expect(q('rail-threads', el)).toBeNull()
    for (const w of ['ops-room', 'jared-desk', 'Jared']) expect(el.textContent, w).not.toContain(w)
    expect(document.title).toBe('(2) SearchOS')
    await act(async () => { q('tab-chat', el)!.click() })
    for (let i = 0; i < 3; i++) await tick()
    expect(window.location.hash).toBe('#/lanes/dm-marvin')
    for (const w of ['ops-room', 'jared-desk']) expect(el.textContent, w).not.toContain(w)
    await act(async () => root.unmount())
  })

  it('every other lane route lands on the one chat on a phone too', async () => {
    phone()
    window.location.hash = '#/lanes/ops-room'
    const { el, root } = await mount()
    expect(window.location.hash).toBe('#/lanes/dm-marvin')
    expect(el.textContent).not.toContain('ops-room')
    await act(async () => root.unmount())
  })
})

const contextMenu = async (n: HTMLElement) => {
  await act(async () => { n.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })) })
  await tick()
}
const menuItems = (id: string) => [...document.querySelectorAll('[data-testid="' + id + '"] [role=menuitem]')].map((i) => i.textContent)
const SAVED = (surfaces: { id: string; kind: string; title: string; cardKind?: string }[], active: string | null) => JSON.stringify({ v: 1, surfaces, active, hidden: false, width: 420, auto: [] })
const tabIds = () => qa('dock-tab').map((t) => t.getAttribute('data-surface'))

describe('marvin-v2: fixed dock, no Find', () => {
  it('has no Surfaces menu and no Find button, and keeps the dock toggle', async () => {
    const { el, root } = await mount()
    expect(q('surfaces-menu', el)).toBeNull()
    expect(q('find-button', el)).toBeNull()
    expect(q('dock-toggle', el)).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('Cmd F is left to the browser and opens no find bar', async () => {
    const { root } = await mount()
    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true })
    await act(async () => { document.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(false)
    expect(document.querySelector('[data-testid=find-bar]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('always holds Network topology, Interface health, Scratchpad and Lane files, in that order, never approvals', async () => {
    const { root } = await mount()
    expect(tabIds()).toEqual(['topology', 'iface', 'scratch', 'files'])
    expect(qa('dock-tab').map((t) => t.getAttribute('title'))).toEqual(['Network topology', 'Interface health', 'Scratchpad', 'Lane files'])
    await act(async () => root.unmount())
  })

  it('a saved layout and a defaults override that list approvals only do not change the four', async () => {
    localStorage.setItem('sov.dock.v1.marvin.dm-marvin', SAVED([{ id: 'approvals', kind: 'standing', title: 'Approval queue' }], 'approvals'))
    localStorage.setItem('sov.dock.defaults.v1.marvin.dm-marvin', JSON.stringify(['approvals']))
    const { root } = await mount()
    expect(tabIds()).toEqual(['topology', 'iface', 'scratch', 'files'])
    expect(document.querySelector('[data-testid=dock-panel][data-surface=approvals]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('a saved layout that dropped some of them gets them back, and a saved card tab stays', async () => {
    localStorage.setItem('sov.dock.v1.marvin.dm-marvin', SAVED([{ id: 'files', kind: 'standing', title: 'Lane files' }, { id: 'card:c1', kind: 'card', title: 'Alert', cardKind: 'alert' }], 'files'))
    const { root } = await mount()
    expect(tabIds()).toEqual(['topology', 'iface', 'scratch', 'files', 'card:c1'])
    await act(async () => root.unmount())
  })

  it('offers no Close and no default entry on the four, but still Close on a card tab', async () => {
    localStorage.setItem('sov.dock.v1.marvin.dm-marvin', SAVED([{ id: 'card:c1', kind: 'card', title: 'Alert', cardKind: 'alert' }], null))
    const { root } = await mount()
    for (const id of ['topology', 'iface', 'scratch', 'files']) {
      await contextMenu(qa('dock-tab').find((t) => t.getAttribute('data-surface') === id)!)
      const items = menuItems('surface-menu')
      expect(items, id).not.toContain('Close')
      expect(items.join('|'), id).not.toMatch(/default/i)
      expect(items, id).toContain('Hide dock')
      await key('Escape')
      await tick()
    }
    await contextMenu(qa('dock-tab').find((t) => t.getAttribute('data-surface') === 'card:c1')!)
    expect(menuItems('surface-menu')).toContain('Close')
    await act(async () => root.unmount())
  })

  it('marvin-v1 keeps the Surfaces menu and Find', async () => {
    stub({ ui: 'marvin-v1' })
    const { el, root } = await mount()
    expect(q('surfaces-menu', el)).not.toBeNull()
    expect(q('find-button', el)).not.toBeNull()
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: right click menus in the left panel', () => {
  it('the chat row opens Open chat, Open Help and Copy link, plus Mark as read only when there is unread', async () => {
    stub({ lanes: [L('dm-marvin', 'dm', { tail: unreadTail(2) })] })
    window.location.hash = '#/health'
    const { el, root } = await mount()
    await contextMenu(q('chat-row', el)!)
    expect(menuItems('chat-menu')).toEqual(['Open chat', 'Open Help', 'Mark as read', 'Copy link to chat'])
    await key('Escape')
    await tick()
    await act(async () => root.unmount())
    document.body.innerHTML = ''
    window.location.hash = '#/health'
    stub()
    const m = await mount()
    await contextMenu(q('chat-row', m.el)!)
    expect(menuItems('chat-menu')).toEqual(['Open chat', 'Open Help', 'Copy link to chat'])
    await act(async () => m.root.unmount())
  })

  it('Open chat navigates, Open Help raises the cheat sheet, Mark as read clears the badge', async () => {
    stub({ lanes: [L('dm-marvin', 'dm', { tail: unreadTail(2) })] })
    window.location.hash = '#/health'
    const { el, root } = await mount()
    expect(q('unread-badge', el)).not.toBeNull()
    await contextMenu(q('chat-row', el)!)
    await click(document.querySelector('[data-testid=chat-menu] [data-action=read]') as HTMLElement)
    await tick()
    expect(q('unread-badge', el)).toBeNull()
    await contextMenu(q('chat-row', el)!)
    await click(document.querySelector('[data-testid=chat-menu] [data-action=open]') as HTMLElement)
    await tick()
    expect(window.location.hash).toBe('#/lanes/dm-marvin')
    await contextMenu(q('chat-row', el)!)
    await click(document.querySelector('[data-testid=chat-menu] [data-action=help]') as HTMLElement)
    expect(sheet()).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('a tool row offers Open, Open in new tab and Copy link; new tab opens the page hash URL', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const { el, root } = await mount()
    const row = el.querySelector('[data-testid="rail-tools"] li:nth-child(2)') as HTMLElement
    expect(row.textContent).toContain('LAN')
    await contextMenu(row)
    expect(menuItems('tool-lan-menu')).toEqual(['Open', 'Open in new tab', 'Copy link'])
    await click(document.querySelector('[data-testid=tool-lan-menu] [data-action=tab]') as HTMLElement)
    expect(open).toHaveBeenCalledWith(location.origin + location.pathname + '#/lan', '_blank', 'noopener')
    await contextMenu(row)
    await click(document.querySelector('[data-testid=tool-lan-menu] [data-action=open]') as HTMLElement)
    expect(window.location.hash).toBe('#/lan')
    await act(async () => root.unmount())
  })

  it('every tool row has a menu, Help has only Open Help, and each has a hover kebab', async () => {
    const { el, root } = await mount()
    for (const id of ['devices', 'lan', 'health', 'library']) {
      await contextMenu(el.querySelector('[data-testid="tool-' + id + '-kebab"]')!.parentElement as HTMLElement)
      expect(menuItems('tool-' + id + '-menu'), id).toEqual(['Open', 'Open in new tab', 'Copy link'])
      await key('Escape')
      await tick()
    }
    await contextMenu(q('help-nav', el)!.parentElement as HTMLElement)
    expect(menuItems('tool-help-menu')).toEqual(['Open Help'])
    expect(q('tool-help-kebab', el)).not.toBeNull()
    await act(async () => root.unmount())
  })
})

describe('marvin-v2: Devices shows approved devices only', () => {
  const device = { id: 'dev-approved-1', name: 'Marvin laptop', person_id: 'marvin', last_ip: '10.0.0.5', last_mac: 'aa:bb:cc:dd:ee:ff', last_seen: null }
  const extra = (url: string) => (url === '/api/devices' ? [device] : url === '/api/devices/pending' ? [{ id: 'pending-xyz-123', ua: 'Mozilla/5.0', ip: '10.0.0.9', status: 'pending' }] : undefined)
  it('no pending rows, no approve hint, badge says approved only, and the pending list is never fetched', async () => {
    stub({ extra })
    window.location.hash = '#/devices'
    const { el, root } = await mount()
    expect(qa('approved-device', el).length).toBe(1)
    expect(qa('pending-device', el).length).toBe(0)
    expect(el.textContent).not.toContain('Pending')
    expect(el.textContent).not.toContain('approve from your DM lane')
    expect(el.textContent).toContain('1 approved')
    expect(el.textContent).not.toContain('pending')
    expect(calls().some((c) => c[0] === '/api/devices/pending')).toBe(false)
    await act(async () => root.unmount())
  })

  it('marvin-v1 still shows the pending section', async () => {
    stub({ extra, ui: 'marvin-v1' })
    window.location.hash = '#/devices'
    const { el, root } = await mount()
    expect(qa('pending-device', el).length).toBe(1)
    expect(el.textContent).toContain('1 approved, 1 pending')
    await act(async () => root.unmount())
  })
})
