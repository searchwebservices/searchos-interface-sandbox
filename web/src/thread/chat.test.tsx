// @vitest-environment happy-dom
// Chat review 2026-10-27: message context menu (pointer and keyboard), multi-select and forward, @ mentions,
// profile form, group alignment. The console is mocked at fetch.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { activeMention, cropRect, filterCandidates, insertMention, mentionSegments, validateProfile } from '@/lib/profile'
import { initialStore, reduce, tabTitle, unreadMentions } from '@/lib/store'
import type { PublicProfile, TextMessage } from '@/lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeES {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() {
    emit = (o) => this.onmessage?.({ data: JSON.stringify(o) })
    setTimeout(() => this.onopen?.(), 0)
  }
  close() {}
}
let emit: (o: unknown) => void = () => {}
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))

const PROFILES: PublicProfile[] = [
  { person_id: 'marvin', name: 'Marvin Kucera', tag: 'marvin', avatar: null, editable: true },
  { person_id: 'bay', name: 'Bay Purcell', tag: 'bay', avatar: '/brand/avatars/bay.png?v=1', editable: true },
  { person_id: 'john', name: 'John', tag: 'john', avatar: null, editable: true },
  { person_id: 'gilfoyle', name: 'Gilfoyle', tag: 'gilfoyle', avatar: '/brand/gilfoyle-128.png', editable: false },
]
const LANES = [
  { id: 'dm-marvin', kind: 'dm', title: 'Marvin and Gilfoyle', members: ['marvin'] },
  { id: 'hardware', kind: 'group', title: 'Hardware', members: ['marvin', 'john', 'bay'] },
  { id: 'lab', kind: 'group', title: 'Lab', members: ['marvin', 'john', 'bay'] },
]
const m = (id: string, lane: string, at: string, role: string, text: string, person: string, extra = {}) => ({
  id, lane, at, role, text, signature: role === 'gilfoyle' ? undefined : { person, device_name: person === 'marvin' ? 'Laptop' : 'Bay Mac' }, ...extra,
})
let thread: unknown[] = []
const calls: { url: string; init?: RequestInit }[] = []
let saveReply: () => Promise<Response> = () => json({})

beforeEach(() => {
  calls.length = 0
  window.location.hash = '#/lanes/hardware'
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === '/api/me')
        return json({ person: 'marvin', role: 'owner', device_id: 'd1', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null, people: PROFILES.map((p) => ({ id: p.person_id, name: p.name })) })
      if (url === '/api/health') return json({ opencode: 'up', sessions: {}, pending_asks: 0, outbox: 0 })
      if (url === '/api/profiles') return json(PROFILES)
      if (url === '/api/me/profile' && (!init || !init.method || init.method === 'GET')) return json({ profile: PROFILES[0], prefs: { default: {}, device: {}, effective: {} }, device_id: 'd1' })
      if (url === '/api/me/profile') return saveReply()
      if (url === '/api/lanes')
        return json(LANES.map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: l.id === 'lab' ? [{ at: '2026-10-27T10:05:00Z', own: false, mention: true }, { at: '2026-10-27T10:06:00Z', own: false, mention: true }] : [] })))
      if (url.endsWith('/messages/forward')) return json({ forwarded: [{ lane: 'lab', messages: [], note: null, forwarded: true, reason: null }] }, 201)
      if (url.endsWith('/messages')) return json(thread)
      return json({})
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
async function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, unmount: () => act(async () => root.unmount()) }
}
const row = (el: HTMLElement, id: string) => el.querySelector('[data-id="' + id + '"]') as HTMLElement
const menuItems = () => [...document.querySelectorAll('[data-testid=message-menu] [role=menuitem]')].map((i) => i.textContent)
const contextMenu = async (target: HTMLElement) => {
  await act(async () => { target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })) })
  await settle()
}
const click = async (t: Element, init: MouseEventInit = {}) => {
  await act(async () => { t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })) })
  await settle()
}
const typeInto = async (ta: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, value)
    ta.setSelectionRange(value.length, value.length)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const key = async (t: Element, k: string, init: KeyboardEventInit = {}) => {
  await act(async () => { t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })) })
  await settle()
}

const convo = (): unknown[] => [
  m('a1', 'hardware', '2026-10-27T10:00:00Z', 'person', 'rack is warm', 'bay'),
  m('a2', 'hardware', '2026-10-27T10:01:00Z', 'gilfoyle', 'I will look at the fans.', 'gilfoyle'),
  m('a3', 'hardware', '2026-10-27T10:02:00Z', 'person', 'thanks @gilfoyle, ping @john too', 'marvin', { mentions: ['gilfoyle', 'john'] }),
  m('a4', 'hardware', '2026-10-27T10:03:00Z', 'person', 'on it', 'john'),
]

describe('message context menu', () => {
  it('opens on right click with the utility items, and on Shift F10 and the Menu key', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    await contextMenu(row(el, 'a1'))
    expect(menuItems()).toEqual(['Copy', 'Quote', 'Copy link', 'Forward', 'Select'])
    await key(document.body.querySelector('[data-testid=message-menu]') as HTMLElement, 'Escape')
    await unmount()
  })

  it('my own message adds Delete locally for an owner, a system line only offers Copy', async () => {
    thread = [...convo(), m('s1', 'hardware', '2026-10-27T10:04:00Z', 'system', 'Gilfoyle was compacted', '')]
    const { el, unmount } = await mount()
    await contextMenu(row(el, 'a3'))
    expect(menuItems()).toEqual(['Copy', 'Quote', 'Copy link', 'Forward', 'Delete locally', 'Select'])
    await unmount()
  })

  it('messages are focusable and the keyboard opens the same menu', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    const r = row(el, 'a1')
    expect(r.tabIndex).toBe(0)
    await key(r, 'F10', { shiftKey: true })
    expect(menuItems()).toContain('Forward')
    await unmount()
    const again = await mount()
    await key(row(again.el, 'a4'), 'ContextMenu')
    expect(menuItems()).toContain('Select')
    await again.unmount()
  })

  it('the hover row has a More button that opens the menu', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    const more = [...row(el, 'a1').querySelectorAll('button')].find((b) => b.textContent === 'More') as HTMLElement
    expect(more).toBeTruthy()
    await click(more)
    expect(menuItems()).toContain('Select')
    await unmount()
  })
})

describe('select and forward', () => {
  it('Select starts selection mode; click toggles, Shift click ranges, Cancel leaves', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    await contextMenu(row(el, 'a1'))
    await click([...document.querySelectorAll('[data-testid=message-menu] [role=menuitem]')].find((i) => i.textContent === 'Select')!)
    expect(el.querySelector('[data-testid=selection-bar]')).toBeTruthy()
    expect(el.querySelector('[data-testid=selection-count]')?.textContent).toBe('1 selected')
    expect(row(el, 'a1').getAttribute('data-selected')).toBe('true')
    await click(row(el, 'a3'))
    expect(el.querySelector('[data-testid=selection-count]')?.textContent).toBe('2 selected')
    await click(row(el, 'a3'), { ctrlKey: true })
    expect(el.querySelector('[data-testid=selection-count]')?.textContent).toBe('1 selected')
    await click(row(el, 'a4'), { shiftKey: true })
    // a1 was the anchor before the toggles; a3 was the last click, so the range runs a3..a4
    expect(el.querySelector('[data-testid=selection-count]')?.textContent).toBe('3 selected')
    await click([...el.querySelectorAll('[data-testid=selection-bar] button')].find((b) => b.textContent?.includes('Cancel'))!)
    expect(el.querySelector('[data-testid=selection-bar]')).toBeNull()
    await unmount()
  })

  it('Forward opens the dialog with my lanes and posts message_ids, to_lanes and the note', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    await contextMenu(row(el, 'a1'))
    await click([...document.querySelectorAll('[data-testid=message-menu] [role=menuitem]')].find((i) => i.textContent === 'Select')!)
    await click(row(el, 'a2'))
    await click([...el.querySelectorAll('[data-testid=selection-bar] button')].find((b) => b.textContent?.includes('Forward'))!)
    const dlg = document.querySelector('[data-testid=forward-dialog]') as HTMLElement
    expect(dlg).toBeTruthy()
    expect(dlg.textContent).toContain('Forward 2 messages')
    const send = [...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Forward') as HTMLButtonElement
    expect(send.disabled).toBe(true)
    await click(dlg.querySelector('[data-testid=forward-lane-lab]')!)
    const note = dlg.querySelector('textarea') as HTMLTextAreaElement
    await typeInto(note, 'see these')
    expect(send.disabled).toBe(false)
    await click(send)
    const post = calls.find((c) => c.url === '/api/lanes/hardware/messages/forward')
    expect(post).toBeTruthy()
    expect(JSON.parse(String(post!.init!.body))).toEqual({ message_ids: ['a1', 'a2'], to_lanes: ['lab'], note: 'see these' })
    expect(el.querySelector('[data-testid=selection-bar]')).toBeNull()
    await unmount()
  })

  it('a single message forwards from its own menu', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    await contextMenu(row(el, 'a4'))
    await click([...document.querySelectorAll('[data-testid=message-menu] [role=menuitem]')].find((i) => i.textContent === 'Forward')!)
    expect(document.querySelector('[data-testid=forward-dialog]')?.textContent).toContain('Forward message')
    await unmount()
  })

  it('a forwarded message shows the eyebrow above the quote', async () => {
    thread = [m('f1', 'hardware', '2026-10-27T10:00:00Z', 'person', 'rack is warm', 'marvin', { forwarded_from: { lane: 'lab', message_id: 'x', author: 'Bay Purcell', at: '2026-10-27T09:00:00Z' } })]
    const { el, unmount } = await mount()
    expect(el.querySelector('[data-testid=forwarded-eyebrow]')?.textContent).toBe('Forwarded from Lab, Bay Purcell')
    expect(el.querySelector('[data-testid=forwarded]')?.textContent).toContain('rack is warm')
    await unmount()
  })
})

describe('mentions', () => {
  it('typing @ in a group lane lists members and Gilfoyle; arrows and Enter insert @tag', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    const ta = el.querySelector('#v2-composer') as HTMLTextAreaElement
    await typeInto(ta, 'hello @')
    const opts = () => [...el.querySelectorAll('[data-testid=mention-option]')].map((o) => o.querySelector('span.truncate')!.textContent + (o.lastElementChild as HTMLElement).textContent)
    expect(opts()).toEqual(['Bay Purcell@bay', 'Gilfoyle@gilfoyle', 'John@john'])
    await typeInto(ta, 'hello @g')
    expect(opts()).toEqual(['Gilfoyle@gilfoyle'])
    await key(ta, 'Enter')
    expect(ta.value).toBe('hello @gilfoyle ')
    expect(el.querySelector('[data-testid=mention-list]')).toBeNull()
    await typeInto(ta, 'hi @')
    await key(ta, 'ArrowDown')
    expect(el.querySelectorAll('[data-testid=mention-option]')[1].getAttribute('aria-selected')).toBe('true')
    await key(ta, 'Escape')
    expect(el.querySelector('[data-testid=mention-list]')).toBeNull()
    await unmount()
  })

  it('a direct lane has no mention list', async () => {
    window.location.hash = '#/lanes/dm-marvin'
    thread = []
    const { el, unmount } = await mount()
    await typeInto(el.querySelector('#v2-composer') as HTMLTextAreaElement, '@')
    expect(el.querySelector('[data-testid=mention-list]')).toBeNull()
    await unmount()
  })

  it('confirmed mentions render as chips and everything else stays escaped text', async () => {
    thread = [
      ...convo(),
      m('a5', 'hardware', '2026-10-27T10:05:00Z', 'person', '<b>bold</b> @bay and a@bay.com', 'john', { mentions: ['bay'] }),
    ]
    const { el, unmount } = await mount()
    const chips = [...row(el, 'a3').querySelectorAll('[data-mention]')].map((c) => [c.getAttribute('data-mention'), c.textContent])
    expect(chips).toEqual([['gilfoyle', '@gilfoyle'], ['john', '@john']])
    const r5 = row(el, 'a5')
    expect(r5.querySelector('b')).toBeNull()
    expect(r5.textContent).toContain('<b>bold</b>')
    expect([...r5.querySelectorAll('[data-mention]')].map((c) => c.textContent)).toEqual(['@bay'])
    await unmount()
  })

  it('the lane row shows a distinct mention badge and the tab title counts them', async () => {
    thread = []
    const { el, unmount } = await mount()
    const badge = el.querySelector('[data-testid=rail-threads] [data-testid=mention-badge]')
    expect(badge?.textContent).toBe('@2')
    expect(document.title).toContain('@2')
    await unmount()
  })
})

describe('group layout', () => {
  it('mine sits right with You, everyone else left with a name and device; Gilfoyle left', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    expect(row(el, 'a3').getAttribute('data-align')).toBe('right')
    expect(row(el, 'a3').textContent).toContain('You')
    expect(row(el, 'a3').textContent).toContain('Laptop')
    expect(row(el, 'a1').getAttribute('data-align')).toBe('left')
    expect(row(el, 'a1').textContent).toContain('Bay Purcell')
    expect(row(el, 'a1').textContent).toContain('Bay Mac')
    expect(row(el, 'a4').getAttribute('data-align')).toBe('left')
    expect(row(el, 'a2').getAttribute('data-align')).toBe('left')
    // Bay has a picture, John has initials
    expect(row(el, 'a1').querySelector('[data-testid=person-avatar]')).toBeTruthy()
    expect(row(el, 'a4').querySelector('[data-testid=person-initials]')).toBeTruthy()
    await unmount()
  })

  it('a direct lane keeps mine right and Gilfoyle left, with my name rather than You', async () => {
    window.location.hash = '#/lanes/dm-marvin'
    thread = [m('d1', 'dm-marvin', '2026-10-27T10:00:00Z', 'person', 'hi', 'marvin'), m('d2', 'dm-marvin', '2026-10-27T10:01:00Z', 'gilfoyle', 'hello', 'gilfoyle')]
    const { el, unmount } = await mount()
    expect(row(el, 'd1').getAttribute('data-align')).toBe('right')
    expect(row(el, 'd1').textContent).not.toContain('You')
    expect(row(el, 'd2').getAttribute('data-align')).toBe('left')
    await unmount()
  })
})

describe('profile page', () => {
  it('validates the tag rules before saving and saves name and tag', async () => {
    window.location.hash = '#/profile'
    const { el, unmount } = await mount()
    const tag = el.querySelector('#profile-tag') as HTMLInputElement
    const name = el.querySelector('#profile-name') as HTMLInputElement
    const save = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Save') as HTMLButtonElement
    expect(tag.value).toBe('marvin')
    expect(save.disabled).toBe(true)
    const set = async (i: HTMLInputElement, v: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, v)
        i.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await set(tag, 'A')
    expect(el.querySelector('#profile-tag-err')?.textContent).toContain('2 to 24')
    await set(tag, 'bay')
    expect(el.querySelector('#profile-tag-err')?.textContent).toContain('already uses')
    await set(tag, 'gilfoyle')
    expect(el.querySelector('#profile-tag-err')?.textContent).toContain('Gilfoyle')
    await set(name, '')
    expect(el.querySelector('#profile-name-err')?.textContent).toContain('required')
    await set(name, 'Marv K')
    await set(tag, '@Marv_K')
    expect(el.querySelector('#profile-tag-err')).toBeNull()
    saveReply = () => json({ profile: { ...PROFILES[0], name: 'Marv K', tag: 'marv_k' }, prefs: { default: {}, device: {}, effective: {} }, device_id: 'd1' })
    await click(save)
    const put = calls.find((c) => c.url === '/api/me/profile' && c.init?.method === 'PUT')
    expect(JSON.parse(String(put!.init!.body))).toEqual({ name: 'Marv K', tag: 'marv_k' })
    await unmount()
  })

  it('shows the server tag error under the field', async () => {
    window.location.hash = '#/profile'
    const { el, unmount } = await mount()
    const tag = el.querySelector('#profile-tag') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(tag, 'newtag')
      tag.dispatchEvent(new Event('input', { bubbles: true }))
    })
    saveReply = () => json({ error: 'invalid', fields: { tag: 'taken' } }, 400)
    await click([...el.querySelectorAll('button')].find((b) => b.textContent === 'Save')!)
    expect(el.querySelector('#profile-tag-err')?.textContent).toContain('already uses')
    await unmount()
  })

  it('a preference saves for this device by default and for all devices when asked', async () => {
    window.location.hash = '#/profile'
    saveReply = () => json({ profile: PROFILES[0], prefs: { default: {}, device: { font: 'space-grotesk' }, effective: { font: 'space-grotesk' } }, device_id: 'd1' })
    const { el, unmount } = await mount()
    await click(el.querySelector('[data-testid=font-space-grotesk]')!)
    let put = calls.filter((c) => c.url === '/api/me/profile' && c.init?.method === 'PUT').pop()
    expect(JSON.parse(String(put!.init!.body))).toEqual({ prefs: { device: { font: 'space-grotesk' } } })
    await click(el.querySelector('[data-testid=scope-all]')!)
    await click(el.querySelector('[data-testid=zoom-130]')!)
    put = calls.filter((c) => c.url === '/api/me/profile' && c.init?.method === 'PUT').pop()
    expect(JSON.parse(String(put!.init!.body))).toEqual({ prefs: { default: { zoom: 130 }, device: { zoom: null } } })
    await unmount()
  })

  it('a profile_update frame follows live: the font and the name change without a reload', async () => {
    thread = convo()
    const { el, unmount } = await mount()
    await act(async () => {
      emit({ type: 'profile_update', profile: { ...PROFILES[1], name: 'Bay P' }, prefs: undefined })
      emit({ type: 'profile_update', profile: PROFILES[0], prefs: { default: { font: 'system', reduced_motion: true }, devices: { d1: { font: 'space-grotesk' } } } })
    })
    await settle()
    expect(row(el, 'a1').textContent).toContain('Bay P')
    expect(document.documentElement.dataset.font).toBe('space-grotesk')
    expect(document.documentElement.dataset.motion).toBe('reduce')
    await unmount()
  })
})

describe('helpers', () => {
  const all = PROFILES
  it('validateProfile enforces name and tag rules', () => {
    expect(validateProfile({ name: 'Marvin', tag: 'marvin' }, all, 'marvin')).toEqual({})
    expect(validateProfile({ name: ' ', tag: 'ok' }, all, 'marvin').name).toBeTruthy()
    expect(validateProfile({ name: 'x'.repeat(61), tag: 'ok' }, all, 'marvin').name).toBeTruthy()
    for (const bad of ['a', 'x'.repeat(25), 'has space', 'bad!', '-lead', 'ÑÑ']) expect(validateProfile({ name: 'n', tag: bad }, all, 'marvin').tag, bad).toBeTruthy()
    expect(validateProfile({ name: 'n', tag: 'Bay' }, all, 'marvin').tag).toContain('already')
    expect(validateProfile({ name: 'n', tag: 'gilfoyle' }, all, 'marvin').tag).toContain('Gilfoyle')
    expect(validateProfile({ name: 'n', tag: 'a1' }, all, 'marvin')).toEqual({})
    expect(validateProfile({ name: 'n', tag: 'x'.repeat(24) }, all, 'marvin')).toEqual({})
  })
  it('mention parsing', () => {
    expect(mentionSegments('hi @bay, mail a@b.com @bay.com and @john.').filter((s) => s.kind === 'mention').map((s) => s.text)).toEqual(['@bay', '@john'])
    expect(activeMention('hello @ba', 9)).toEqual({ start: 6, query: 'ba' })
    expect(activeMention('mail a@ba', 9)).toBeNull()
    const cands = [{ id: 'bay', tag: 'bay', name: 'Bay Purcell', avatar: null }, { id: 'ba2', tag: 'cba', name: 'Zed', avatar: null }]
    expect(filterCandidates(cands, 'ba').map((c) => c.id)).toEqual(['bay', 'ba2'])
    expect(insertMention('hello @ba there', { start: 6, query: 'ba' }, 9, 'bay')).toEqual({ text: 'hello @bay  there', caret: 11 })
  })
  it('cropRect keeps the square inside the image', () => {
    expect(cropRect(400, 200, 1, 0.5, 0.5)).toEqual({ sx: 100, sy: 0, side: 200 })
    expect(cropRect(400, 200, 2, 0, 0)).toEqual({ sx: 0, sy: 0, side: 100 })
    expect(cropRect(400, 200, 2, 1, 1)).toEqual({ sx: 300, sy: 100, side: 100 })
  })
  it('the store counts unread mentions per lane and puts them in the tab title', () => {
    let s = reduce(initialStore(), { type: 'me', me: { person: 'marvin', role: 'owner', device_id: 'd', device_name: 'L', ip: '', mac: null, lanwatch_status: null } })
    s = reduce(s, { type: 'lanes', lanes: [{ id: 'lab', kind: 'group', title: 'Lab', members: ['marvin', 'bay'], last: null, tail: [] }], readAt: { lab: '2026-10-27T09:00:00Z' } })
    const msg = (id: string, at: string, mentions?: string[]): TextMessage => ({ id, lane: 'lab', at, role: 'person', text: 'x', signature: { person: 'bay' }, ...(mentions ? { mentions } : {}) })
    s = reduce(s, { type: 'frame', ev: { type: 'message', lane: 'lab', message: msg('1', '2026-10-27T10:00:00Z', ['marvin']) }, now: 1 })
    s = reduce(s, { type: 'frame', ev: { type: 'message', lane: 'lab', message: msg('2', '2026-10-27T10:01:00Z') }, now: 2 })
    s = reduce(s, { type: 'frame', ev: { type: 'message', lane: 'lab', message: msg('3', '2026-10-27T10:02:00Z', ['bay']) }, now: 3 })
    expect(unreadMentions(s, 'lab')).toBe(1)
    expect(tabTitle(s)).toBe('@1 (3) SearchOS')
    s = reduce(s, { type: 'mark_read', lane: 'lab', at: '2026-10-27T10:02:00Z' })
    expect(unreadMentions(s, 'lab')).toBe(0)
  })
})
