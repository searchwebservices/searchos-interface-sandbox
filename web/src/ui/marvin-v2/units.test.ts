import { describe, expect, it } from 'vitest'
import { nextPlaceholder, placePrompt, placeholders } from './fill'
import { pickOneLane, redirectFor } from './oneChat'
import { initialStore, reduce, tabTitle } from '@/lib/store'
import type { Store } from '@/lib/store'
import type { LaneRow } from '@/lib/types'

const lane = (id: string, kind: LaneRow['kind'], extra: Partial<LaneRow> = {}): LaneRow => ({ id, kind, title: id, members: ['marvin'], ...extra })
const storeOf = (lanes: LaneRow[], person = 'marvin'): Store => ({
  ...initialStore(),
  me: { person, role: 'owner', device_id: 'd', device_name: 'x' } as Store['me'],
  order: lanes.map((l) => l.id),
  lanes: Object.fromEntries(lanes.map((l) => [l.id, l])),
})

describe('pickOneLane', () => {
  it('is the direct Gilfoyle lane, not groups, desks or another agent', () => {
    const s = storeOf([lane('hardware', 'group'), lane('jared-desk', 'desk', { agent: { id: 'jared', name: 'Jared' } }), lane('jared-bay', 'dm', { agent: { id: 'jared', name: 'Jared' } }), lane('dm-marvin', 'dm')])
    expect(pickOneLane(s)?.id).toBe('dm-marvin')
  })
  it('treats an explicit gilfoyle agent the same as none', () => {
    expect(pickOneLane(storeOf([lane('x', 'dm', { agent: { id: 'gilfoyle', name: 'Gilfoyle' } })]))?.id).toBe('x')
  })
  it('prefers the lane the viewer belongs to and is named for', () => {
    const s = storeOf([lane('dm-bay', 'dm', { members: ['bay'] }), lane('dm-marvin', 'dm')])
    expect(pickOneLane(s)?.id).toBe('dm-marvin')
  })
  it('is null with no such lane', () => {
    expect(pickOneLane(storeOf([lane('hardware', 'group')]))).toBeNull()
    expect(pickOneLane(storeOf([]))).toBeNull()
  })
})

describe('redirectFor', () => {
  const chat = { name: 'lane', id: 'dm-marvin' } as const
  it('keeps the chat and the tool pages', () => {
    expect(redirectFor({ name: 'lane', id: 'dm-marvin' }, 'dm-marvin')).toBeNull()
    for (const name of ['devices', 'lan', 'health', 'profile', 'library'] as const) expect(redirectFor({ name }, 'dm-marvin')).toBeNull()
  })
  it('sends home, other lanes and apps to the chat', () => {
    expect(redirectFor({ name: 'home' }, 'dm-marvin')).toEqual(chat)
    expect(redirectFor({ name: 'lane', id: 'hardware' }, 'dm-marvin')).toEqual(chat)
    expect(redirectFor({ name: 'engines' }, 'dm-marvin')).toEqual(chat)
    expect(redirectFor({ name: 'apps-pm', sub: '' }, 'dm-marvin')).toEqual(chat)
    expect(redirectFor({ name: 'apps-money', tab: 'cartera' }, 'dm-marvin')).toEqual(chat)
  })
  it('drops a foreign lane from a library link', () => {
    expect(redirectFor({ name: 'library', lane: 'hardware' }, 'dm-marvin')).toEqual({ name: 'library' })
    expect(redirectFor({ name: 'library', lane: 'dm-marvin' }, 'dm-marvin')).toBeNull()
  })
  it('redirects nothing to a chat that does not exist', () => {
    expect(redirectFor({ name: 'lane', id: 'hardware' }, null)).toBeNull()
    expect(redirectFor({ name: 'home' }, null)).toBeNull()
  })
})

describe('placePrompt', () => {
  const known = ['Give me the LAN picture.']
  it('puts a prompt in an empty box with the caret at the end', () => {
    expect(placePrompt('', 'Hello there', known)).toEqual({ text: 'Hello there', start: 11, end: 11 })
  })
  it('selects the first placeholder', () => {
    const r = placePrompt('', 'Ping <ip> from <device>', known)
    expect(r.text.slice(r.start, r.end)).toBe('<ip>')
  })
  it('keeps typed text and offsets the selection', () => {
    const r = placePrompt('note  \n', 'Ping <ip>', known)
    expect(r.text).toBe('note\n\nPing <ip>')
    expect(r.text.slice(r.start, r.end)).toBe('<ip>')
  })
  it('replaces an unedited suggestion', () => {
    expect(placePrompt('Give me the LAN picture.', 'Next', known).text).toBe('Next')
  })
  it('does not mistake other angle brackets for a placeholder', () => {
    const r = placePrompt('', 'is 3 < 5 and 7 > 2?', known)
    expect(r.start).toBe(r.end)
  })
})

describe('placeholders and nextPlaceholder', () => {
  const t = 'Copy <file> to <device> via <host>.'
  it('lists every token in order', () => {
    expect(placeholders(t).map((p) => t.slice(p.start, p.end))).toEqual(['<file>', '<device>', '<host>'])
    expect(placeholders('nothing here, 1 < 2 > 0')).toEqual([])
  })
  it('goes to the next token after the selection, wraps, and skips the one already selected', () => {
    const at = (s: number, e: number) => { const n = nextPlaceholder(t, s, e); return n ? t.slice(n.start, n.end) : null }
    expect(at(0, 0)).toBe('<file>')
    expect(at(5, 11)).toBe('<device>')
    expect(at(15, 23)).toBe('<host>')
    expect(at(31, 37)).toBe('<file>')
    expect(at(t.length, t.length)).toBe('<file>')
  })
  it('is null with no token left, or only the one that is selected', () => {
    expect(nextPlaceholder('all filled', 0, 0)).toBeNull()
    expect(nextPlaceholder('Ping <ip> now', 5, 9)).toBeNull()
    expect(nextPlaceholder('Ping <ip> now', 0, 0)).toEqual({ start: 5, end: 9 })
  })
})

describe('tabTitle with onlyLane', () => {
  const s = (() => {
    let st = storeOf([lane('dm-marvin', 'dm', { tail: [{ at: '2026-10-28T10:00:00Z', own: false }, { at: '2026-10-28T10:01:00Z', own: false, mention: true }] }), lane('ops-room', 'group', { asks: 3, tail: [{ at: '2026-10-28T10:02:00Z', own: false }] })])
    st = reduce(st, { type: 'lanes', lanes: Object.values(st.lanes), readAt: { 'dm-marvin': '', 'ops-room': '' } })
    return st
  })()
  it('counts every lane without it, one lane with it, and nothing for a lane that is not there', () => {
    expect(tabTitle(s)).toBe('[3 asks] @1 (3) SearchOS')
    expect(tabTitle(s, 'dm-marvin')).toBe('@1 (2) SearchOS')
    expect(tabTitle(s, 'ops-room')).toBe('[3 asks] (1) SearchOS')
    expect(tabTitle(s, null)).toBe('SearchOS')
    expect(tabTitle(s, 'gone')).toBe('SearchOS')
  })
})
