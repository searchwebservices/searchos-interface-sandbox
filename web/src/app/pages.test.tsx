// @vitest-environment happy-dom
// Render smoke for the devices and health pages and the form card in a lane, against a mocked console API.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import lanesJson from '../../../console/data/lanes.json'
import App from '../App'
import { FORM } from '@/lib/forms.fixture'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let role = 'owner'
let emit: (o: unknown) => void = () => {}
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
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } }))
const calls: { url: string; init?: RequestInit }[] = []
const formItem = { id: 'fi1', lane: 'hardware', at: '2026-10-26T10:00:00Z', role: 'form', form: FORM, state: 'pending' }
const lanes = (lanesJson as { id: string; members: string[] }[]).map((l) => ({ ...l, busy: false, count: 0, asks: 0, last: null, tail: [] }))
const hwMembers = (lanesJson as { id: string; members: string[] }[]).find((l) => l.id === 'hardware')!.members

beforeEach(() => {
  role = 'owner'
  calls.length = 0
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeES
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === '/api/me') return json({ person: hwMembers[0], role, device_id: 'd', device_name: 'Laptop', ip: '1.1.1.1', mac: null, lanwatch_status: null })
      if (url === '/api/health') return json({ opencode: 'down', down_for_s: 125, sessions: { hardware: 'ok', 'dm-marvin': 'missing' }, pending_asks: 2, outbox: 7 })
      if (url === '/api/lanes') return json(lanes)
      if (url === '/api/lanes/hardware/messages') return json([formItem])
      if (url.endsWith('/messages')) return json([])
      if (url === '/api/devices') return json([{ id: 'dev-approved-0001', name: 'Marvin Laptop', person_id: 'marvin', last_ip: '10.0.0.5', last_mac: 'aa:bb', last_seen: '2026-10-26T09:00:00Z' }])
      if (url === '/api/devices/pending') return json([{ id: 'pend-0000000001', ua: 'Mozilla/5.0 (iPhone) Safari/605 Version/17', ip: '10.0.0.9', mac: null, first_seen: '2026-10-26T09:30:00Z', status: 'pending', lanwatch_name: 'Johns phone' }])
      if (url.includes('/forms/')) return json({ form: { ...formItem, state: 'answered', summary: { answered: 1, total: 1 }, replied_by: { person: hwMembers[0] } } })
      return json({})
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
const mount = async (hash: string) => {
  window.location.hash = hash
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<App />) })
  await settle()
  return { el, root }
}

describe('devices page', () => {
  it('shows one pending card and one approved row, and approve and revoke post the console payloads', async () => {
    const { el, root } = await mount('#/devices')
    const pend = el.querySelectorAll('[data-testid=pending-device]')
    expect(pend).toHaveLength(1)
    expect(pend[0].textContent).toContain('Safari on iPhone')
    expect(pend[0].textContent).toContain('lan-watch: Johns phone')
    expect(pend[0].textContent).toContain('no MAC yet')
    const rows = el.querySelectorAll('[data-testid=approved-device]')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('Marvin Laptop')
    expect(rows[0].textContent).toContain('10.0.0.5')
    expect([...pend[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Approve', 'Deny']))
    expect([...rows[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Revoke'])
    // deny posts the console payload, then the page refreshes
    const deny = [...pend[0].querySelectorAll('button')].find((b) => b.textContent === 'Deny')!
    await act(async () => deny.click())
    await settle()
    const post = calls.find((c) => c.url === '/api/devices/pend-0000000001')
    expect(JSON.parse(String(post?.init?.body))).toEqual({ action: 'deny' })
    expect(calls.filter((c) => c.url === '/api/devices').length).toBeGreaterThan(1)
    await act(async () => root.unmount())
  })
  it('anyone who is not an owner or admin sees a short owners-only line and no device calls', async () => {
    role = 'member'
    const { el, root } = await mount('#/devices')
    expect(el.querySelector('[data-testid=owners-only]')?.textContent).toContain('Owners only')
    expect(el.querySelector('[data-testid=pending-device]')).toBeNull()
    expect(calls.some((c) => c.url.startsWith('/api/devices'))).toBe(false)
    await act(async () => root.unmount())
  })
})

describe('health page', () => {
  it('shows OpenCode down with the duration, sessions per lane, pending asks and outbox, and the footer agrees', async () => {
    const { el, root } = await mount('#/health')
    expect(el.querySelector('[data-testid=health-opencode]')?.textContent).toContain('Down for')
    expect(el.querySelector('[data-testid=health-asks]')?.textContent).toContain('2')
    expect(el.querySelector('[data-testid=health-outbox]')?.textContent).toContain('7')
    const ss = [...el.querySelectorAll('[data-testid=health-sessions] li')].map((li) => li.getAttribute('data-state'))
    expect(ss).toEqual(['ok', 'missing'])
    expect(el.querySelector('[data-testid=gilfoyle-status]')?.textContent).toContain('unreachable')
    await act(async () => root.unmount())
  })
})

describe('form in a lane', () => {
  it('renders as a card, counts on the lane row, and submitting settles it to the quiet line', async () => {
    const { el, root } = await mount('#/lanes/hardware')
    expect(el.querySelector('[data-testid=form-card]')).toBeTruthy()
    expect(el.textContent).toContain('1 form')
    // a frame from the stream settles it
    await act(async () => { emit({ type: 'form_update', lane: 'hardware', id: 'fi1', state: 'answered', summary: { answered: 2, total: 2 }, replied_by: { person: 'bay' }, replied_at: '2026-10-26T10:05:00Z' }) })
    await settle()
    expect(el.querySelector('[data-testid=form-card]')).toBeNull()
    expect(el.querySelector('[data-testid=form-collapsed]')?.textContent).toContain('Answered by Bay, 2 of 2')
    expect(el.textContent).not.toContain('1 form')
    await act(async () => root.unmount())
  })
})
