// @vitest-environment happy-dom
/// <reference types="node" />
import { createRequire } from 'node:module'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CardInline, CardSurface, UnknownCard, entryOf, registry } from './registry'
import { CardEnvContext, defaultCardEnv } from './env'
import { SheetSurfaceHost } from './surfaces'
import { SurfaceContext } from './surface-context'
import type { SurfaceApi } from './surface-context'
import { FIXTURES, KINDS, SCHEMAS } from './schemas'
import { validate, validateCard } from './validate'
import { cardOfAsk, cardOfChanges, cardOfForm, cardOfGroup, cardOfShellTool } from './map'
import { baseWindow, seriesFor, metricsOf, windowsOf } from './Metrics'
import { relatedOf } from './Alert'
import { beforeAfter, sideBySide } from './diff'
import { downloadable, fmtBytes, summaryOf } from './util'
import { FORM } from '@/lib/forms.fixture'
import { groupFeed } from '@/lib/groups'
import type { WorkGroup } from '@/lib/groups'
import { AskCard } from '@/thread/Agent'
import type { AskItem, ChangesItem, FormItem, RunItem } from '@/lib/types'
import type { CardEnv, CardView } from './types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  // Recharts measures its container; happy-dom has no layout.
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})
const mount = async (node: React.ReactNode) => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(node))
  return el
}
const click = async (e: Element | null | undefined) => {
  expect(e).toBeTruthy()
  await act(async () => (e as HTMLElement).click())
}
const button = (el: ParentNode, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

const fixture = (kind: string): CardView => JSON.parse(JSON.stringify((FIXTURES as Record<string, { valid: unknown }>)[kind].valid)) as CardView
const env = (over: Partial<CardEnv> = {}): CardEnv => ({ ...defaultCardEnv, lane: 'hardware', canAdmin: true, isMember: true, now: Date.parse('2026-10-26T10:05:00Z'), ...over })
const surfaces = () => ({ open: vi.fn(), close: vi.fn() })
const withEnv = (e: CardEnv, s: { open: unknown; close: unknown } | null, node: React.ReactNode) => (
  <CardEnvContext.Provider value={e}>
    <SurfaceContext.Provider value={s as SurfaceApi | null}>{node}</SurfaceContext.Provider>
  </CardEnvContext.Provider>
)

describe('registry', () => {
  it('covers every kind that has a schema file, once', () => {
    const files = Object.keys(import.meta.glob('../../../console/lib/cards/schemas/*.json')).map((f) => f.replace(/^.*\//, '').replace(/\.json$/, ''))
    expect([...files].sort()).toEqual([...KINDS].sort())
    expect(Object.keys(registry).sort()).toEqual([...KINDS].sort())
    for (const k of KINDS) {
      const e = entryOf(k)!
      expect(typeof e.Inline).toBe('function')
      expect(typeof e.Surface).toBe('function')
      expect(e.schema).toBe(SCHEMAS[k])
      expect(e.schema.type).toBe('object')
    }
  })

  it('the web validator agrees with the console validator on every fixture, errors included', () => {
    const shared = createRequire(import.meta.url)('../../../console/lib/cards/index.js') as { validateCard: (c: unknown) => { ok: boolean; errors: string[] }; KINDS: string[] }
    expect([...shared.KINDS]).toEqual([...KINDS])
    for (const k of KINDS) {
      const f = (FIXTURES as Record<string, { valid: unknown; invalid: unknown }>)[k]
      expect(validateCard(f.valid)).toEqual(shared.validateCard(f.valid))
      expect(validateCard(f.valid).ok).toBe(true)
      expect(validateCard(f.invalid)).toEqual(shared.validateCard(f.invalid))
      expect(validateCard(f.invalid).ok).toBe(false)
    }
    for (const x of [null, 'x', 4, [], {}, { kind: 'mood_ring' }]) expect(validateCard(x)).toEqual(shared.validateCard(x))
  })

  it('validate covers the subset the schemas use', () => {
    expect(validate({ type: 'integer' }, 3.5, 'x')).toEqual(['x: expected integer, got number'])
    expect(validate({ type: ['string', 'null'] }, null)).toEqual([])
    expect(validate({ enum: ['a'] }, 'b', 'x')).toEqual(['x: must be one of a'])
    expect(validate({ type: 'string', maxLength: 1 }, 'ab', 'x')).toEqual(['x: longer than 1 characters'])
    expect(validate({ type: 'array', minItems: 1 }, [], 'x')).toEqual(['x: needs at least 1 item'])
  })
})

describe('every kind draws its fixture, inline and as a surface', () => {
  const expectText: Record<string, string> = {
    tool_run: '2 tools',
    command_output: 'ss -tlnp',
    metrics_snapshot: 'Memory',
    approval: 'shell',
    file_retrieval: 'ports.md',
    requested_input: 'Three questions',
    config_diff: 'registry/ports.md',
    alert: 'Disk at 91 percent',
    script: 'df -h /',
    result_summary: 'Switch uplink check',
  }
  for (const kind of KINDS) {
    it(kind, async () => {
      const card = fixture(kind)
      const a = await mount(withEnv(env({ items: [] }), surfaces(), <CardInline card={card} />))
      expect(a.querySelector('[data-testid=unknown-card]')).toBeNull()
      expect(a.textContent).toContain(expectText[kind])
      act(() => root?.unmount())
      root = null
      const b = await mount(withEnv(env({ items: [] }), surfaces(), <CardSurface card={card} />))
      expect(b.querySelector('[data-testid=unknown-card]')).toBeNull()
      expect(b.textContent!.length).toBeGreaterThan(5)
    })
  }
})

describe('unknown and broken cards never crash the thread', () => {
  it('an unknown kind shows the placeholder with the raw kind name, inline and as a surface', async () => {
    const card = { ...fixture('alert'), kind: 'mood_ring' } as CardView
    const a = await mount(<CardInline card={card} />)
    expect(a.querySelector('[data-testid=unknown-card]')).toBeTruthy()
    expect(a.textContent).toContain('mood_ring')
    act(() => root?.unmount())
    root = null
    const b = await mount(<CardSurface card={card} />)
    expect(b.textContent).toContain('mood_ring')
  })
  it('garbage in place of a card does not throw', async () => {
    for (const c of [null, undefined, {}, { kind: 42 }, { kind: 'alert' }, { kind: 'alert', data: 'x' }]) {
      const el = await mount(<CardInline card={c as unknown as CardView} />)
      expect(el.querySelector('[data-testid=unknown-card]')).toBeTruthy()
      act(() => root?.unmount())
      root = null
    }
  })
  it('a known kind with data that does not fit its schema shows the placeholder with the reason', async () => {
    const card = { ...fixture('alert'), data: { severity: 'urgent' } } as CardView
    const el = await mount(<CardInline card={card} />)
    expect(el.textContent).toContain('alert')
    expect(el.textContent).toContain('required')
  })
  it('a renderer that throws is caught and shown as the placeholder', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = { ...cardOfGroup({ id: 'w', members: [], runs: [], tools: undefined, started: 0, ended: 0, failed: false, interrupted: false, kind: 'work' } as unknown as WorkGroup, 'hardware') }
    const el = await mount(withEnv(env(), null, <CardInline card={bad} />))
    expect(el.querySelector('[data-testid=unknown-card]')).toBeTruthy()
    expect(el.textContent).toContain('tool_run')
    spy.mockRestore()
  })
  it('UnknownCard shows a non-string kind safely', async () => {
    const el = await mount(<UnknownCard kind={{ a: 1 }} />)
    expect(el.textContent).toContain('object')
  })
})

describe('metrics_snapshot', () => {
  it('inline: three mini panels with sparklines, the rest counted', async () => {
    const card = fixture('metrics_snapshot')
    ;(card.data.metrics as unknown[]).push({ label: 'Load', value: 0.4 })
    const el = await mount(withEnv(env(), surfaces(), <CardInline card={card} />))
    expect(el.querySelectorAll('[data-testid=metric-panel]').length).toBe(3)
    expect(el.querySelectorAll('[data-testid=sparkline]').length).toBe(3)
    expect(el.textContent).toContain('+1 more')
    expect(el.textContent).toContain('CPU')
  })
  it('the window picker only offers windows present in the data', async () => {
    const card = fixture('metrics_snapshot')
    expect(windowsOf(card.data)).toEqual(['1h', '24h', '7d'])
    const el = await mount(withEnv(env(), surfaces(), <CardSurface card={card} />))
    const tabs = [...el.querySelectorAll('[data-testid=window-picker] [role=tab]')].map((t) => t.textContent)
    expect(tabs).toEqual(['1h', '24h', '7d'])
    expect(el.querySelectorAll('[data-testid=metric-chart]').length).toBe(3)
  })
  it('a card with one window shows it as a label, not a picker; with none there is no label', async () => {
    const one = fixture('metrics_snapshot')
    for (const m of one.data.metrics as Array<Record<string, unknown>>) delete m.series
    expect(windowsOf(one.data)).toEqual(['1h'])
    const el = await mount(withEnv(env(), null, <CardSurface card={one} />))
    expect(el.querySelector('[data-testid=window-picker]')).toBeNull()
    expect(el.querySelector('[data-testid=window-label]')!.textContent).toBe('1h')
    act(() => root?.unmount())
    root = null
    const none = fixture('metrics_snapshot')
    none.data.metrics = [{ label: 'Up', value: 'yes' }]
    expect(windowsOf(none.data)).toEqual([])
    const el2 = await mount(withEnv(env(), null, <CardSurface card={none} />))
    expect(el2.querySelector('[data-testid=window-label]')).toBeNull()
    expect(el2.textContent).toContain('No data for this metric')
  })
  it('a window one metric lacks says so for that metric only; the base window is named recent when the card gives none', () => {
    const data = { title: 'x', metrics: [{ label: 'a', value: 1, trend: [1, 2], series: { '24h': [3, 4] } }, { label: 'b', value: 2, trend: [5, 6] }] }
    expect(baseWindow(data)).toBe('recent')
    expect(windowsOf(data)).toEqual(['recent', '24h'])
    const [a, b] = metricsOf(data)
    expect(seriesFor(a, '24h', data)).toEqual([3, 4])
    expect(seriesFor(b, '24h', data)).toBeNull()
    expect(seriesFor(b, 'recent', data)).toEqual([5, 6])
    expect(windowsOf({ metrics: [{ label: 'a', value: 1, series: { bad: ['x'], empty: [] } }] })).toEqual([])
  })
  it('Open asks the host for the surface', async () => {
    const s = surfaces()
    const card = fixture('metrics_snapshot')
    const el = await mount(withEnv(env(), s, <CardInline card={card} />))
    await click(button(el, 'Open'))
    expect(s.open).toHaveBeenCalledWith(card, undefined)
  })
})

describe('file_retrieval', () => {
  it('inline: a row per file with Open and a Download link into the lane files route', async () => {
    const s = surfaces()
    const card = fixture('file_retrieval')
    const el = await mount(withEnv(env(), s, <CardInline card={card} />))
    const rows = el.querySelectorAll('[data-testid=file-row]')
    expect(rows.length).toBe(2)
    const link = rows[0].querySelector('a[data-testid=file-download]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/api/lanes/hardware/files?path=registry%2Fports.md')
    expect(link.getAttribute('download')).toBe('ports.md')
    await click(button(rows[1], 'Open'))
    expect(s.open).toHaveBeenCalledWith(card, 1)
  })
  it('a file with a Library id downloads and previews through /api/library/:id', async () => {
    const card = fixture('file_retrieval')
    ;(card.data.files as Array<Record<string, unknown>>)[0].id = '0b9f4c2e-1111-4222-8333-444455556666'
    ;(card.data.files as Array<Record<string, unknown>>)[0].path = 'console/data/uploads/hardware/x/ports.md'
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn((u: string) => {
      fetched.push(u)
      return Promise.resolve(new Response(JSON.stringify({ id: 'x', name: 'ports.md', kind: 'text/markdown', status: 'processed', size: 5, text: 'Port 4 flaps', truncated: false, has_text: true, previewable: false, needs_parser: false, note: null, fail_reason: null }), { status: 200 }))
    }))
    const inline = await mount(withEnv(env(), null, <CardInline card={card} />))
    expect(inline.querySelector('a[data-testid=file-download]')!.getAttribute('href')).toBe('/api/library/0b9f4c2e-1111-4222-8333-444455556666/download')
    await act(async () => root!.unmount())
    const el = await mount(withEnv(env(), null, <CardSurface card={card} arg={0} />))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(fetched).toContain('/api/library/0b9f4c2e-1111-4222-8333-444455556666/preview')
    expect(el.querySelector('[data-testid=file-content-text]')!.textContent).toBe('Port 4 flaps')
    vi.unstubAllGlobals()
  })
  it('a repo file with no Library id reads its text inline from the lane files route', async () => {
    const card = fixture('file_retrieval')
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn((u: string) => {
      fetched.push(u)
      return Promise.resolve(new Response('# Ports\n8800 console', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }))
    }))
    const el = await mount(withEnv(env(), null, <CardSurface card={card} arg={0} />))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(fetched).toContain('/api/lanes/hardware/files?path=registry%2Fports.md&inline=1')
    expect(el.querySelector('[data-testid=file-content-text]')!.textContent).toBe('# Ports\n8800 console')
    vi.unstubAllGlobals()
  })
  it('a repo file past the inline cap is not fetched and says so', async () => {
    const card = fixture('file_retrieval')
    ;(card.data.files as Array<Record<string, unknown>>)[0].size = 600 * 1024
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const el = await mount(withEnv(env(), null, <CardSurface card={card} arg={0} />))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(el.querySelector('[data-testid=file-content]')!.textContent).toContain('Too large')
    vi.unstubAllGlobals()
  })
  it('a path the console does not serve is shown but not offered for download', async () => {
    const card = fixture('file_retrieval')
    ;(card.data.files as Array<Record<string, unknown>>)[0].path = 'src/secret.ts'
    const el = await mount(withEnv(env(), null, <CardInline card={card} />))
    const first = el.querySelector('[data-testid=file-row]')!
    expect(first.querySelector('a')).toBeNull()
    expect(button(first, 'Download')!.hasAttribute('disabled')).toBe(true)
    expect(downloadable('docs/a.md')).toBe(true)
    expect(downloadable('console/data/uploads/x.pdf')).toBe(true)
    expect(downloadable('docs/../x')).toBe(false)
    expect(downloadable('src/x')).toBe(false)
  })
  it('surface: the File Preview shows the summary and the metadata of the opened file', async () => {
    const card = fixture('file_retrieval')
    const el = await mount(withEnv(env(), null, <CardSurface card={card} arg={0} />))
    expect(el.querySelector('[data-testid=file-summary]')!.textContent).toBe('Listening ports on the Lenovo.')
    const meta = el.querySelector('[data-testid=file-meta]')!.textContent!
    expect(meta).toContain('registry/ports.md')
    expect(meta).toContain('sha256:ab12')
    expect(meta).toContain('1.8 KB')
    expect(meta).toContain('hardware')
    act(() => root?.unmount())
    root = null
    const second = await mount(withEnv(env(), null, <CardSurface card={card} arg={1} />))
    expect(second.textContent).toContain('harness.md')
    expect(second.textContent).toContain('No summary stored')
  })
  it('formats sizes', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(1840)).toBe('1.8 KB')
    expect(fmtBytes(52000)).toBe('51 KB')
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(fmtBytes('x')).toBe('0 B')
  })
})

describe('alert', () => {
  it('inline: severity strip, title, body and Acknowledge for a member', async () => {
    const act1 = vi.fn().mockResolvedValue(null)
    const card = fixture('alert')
    const el = await mount(withEnv(env({ act: act1 }), surfaces(), <CardInline card={card} />))
    expect(el.querySelector('[data-testid=severity-strip]')).toBeTruthy()
    expect(el.querySelector('[data-testid=card-alert]')!.getAttribute('data-severity')).toBe('warn')
    expect(el.textContent).toContain('The backup volume is nearly full.')
    await click(button(el, 'Acknowledge'))
    expect(act1).toHaveBeenCalledTimes(1)
    expect(act1.mock.calls[0][1]).toMatchObject({ id: 'ack', kind: 'ack' })
  })
  it('a viewer who is not a member cannot acknowledge, and an acknowledged alert shows who did', async () => {
    const card = fixture('alert')
    const el = await mount(withEnv(env({ isMember: false }), null, <CardInline card={card} />))
    expect(button(el, 'Acknowledge')).toBeUndefined()
    expect(el.textContent).toContain('Members of this lane can acknowledge')
    act(() => root?.unmount())
    root = null
    const acked = { ...card, state: 'ack' as const, resolution: { action_id: 'ack', kind: 'ack' as const, label: 'Acknowledge', by: { person: 'bay', device_name: 'Bay Mac' }, at: '2026-10-26T10:04:00Z' } }
    const el2 = await mount(withEnv(env({ people: { bay: 'Bay' } }), null, <CardInline card={acked} />))
    expect(button(el2, 'Acknowledge')).toBeUndefined()
    expect(el2.querySelector('[data-testid=resolution]')!.textContent).toContain('by Bay (Bay Mac)')
    expect(el2.textContent).toContain('Acknowledged')
  })
  it('the action error is shown', async () => {
    const el = await mount(withEnv(env({ act: vi.fn().mockResolvedValue('Already handled elsewhere.') }), null, <CardInline card={fixture('alert')} />))
    await click(button(el, 'Acknowledge'))
    expect(el.textContent).toContain('Already handled elsewhere.')
  })
  it('severity strips use tokens, critical is destructive', async () => {
    const card = fixture('alert')
    card.data.severity = 'critical'
    const el = await mount(withEnv(env(), null, <CardInline card={card} />))
    expect(el.querySelector('[data-testid=severity-strip]')!.className).toContain('bg-destructive')
  })
  it('surface: the detail lists the related cards of the same run and opens them', async () => {
    const s = surfaces()
    const alert = fixture('alert')
    const metrics = { ...fixture('metrics_snapshot'), id: 'm-1' }
    const other = { ...fixture('command_output'), id: 'c-1', provenance: { ...fixture('command_output').provenance, run_id: 'call_other' } }
    const mine = { ...fixture('command_output'), id: 'c-2' }
    expect(relatedOf(alert, [alert, metrics, other, mine]).map((c) => c.id)).toEqual(['m-1', 'c-2'])
    const el = await mount(withEnv(env({ cards: [alert, metrics, other, mine] }), s, <CardSurface card={alert} />))
    const rows = el.querySelectorAll('[data-testid=related-cards] li')
    expect(rows.length).toBe(2)
    expect(rows[1].textContent).toContain('ss -tlnp')
    await click(button(rows[0], 'Open'))
    expect(s.open).toHaveBeenCalledWith(metrics, undefined)
    act(() => root?.unmount())
    root = null
    const lone = await mount(withEnv(env({ cards: [alert] }), s, <CardSurface card={alert} />))
    expect(lone.querySelector('[data-testid=no-related]')).toBeTruthy()
  })
})

describe('command_output', () => {
  it('inline: compact terminal with Output and Exit tabs and Copy; retry is for owners only', async () => {
    const card = fixture('command_output')
    const el = await mount(withEnv(env({ canAdmin: false }), null, <CardInline card={card} />))
    expect(el.querySelector('[data-testid=code-run-card]')).toBeTruthy()
    expect(el.textContent).toContain('$ ss -tlnp')
    expect(button(el, 'Copy')).toBeTruthy()
    expect(button(el, 'Retry')).toBeUndefined()
    expect(el.textContent).toContain('Waiting on an owner')
    act(() => root?.unmount())
    root = null
    const owner = await mount(withEnv(env({ canAdmin: true }), null, <CardInline card={card} />))
    expect(button(owner, 'Retry')).toBeTruthy()
  })
  it('surface: the full terminal has Output, Errors and Details tabs', async () => {
    const el = await mount(withEnv(env(), null, <CardSurface card={fixture('command_output')} />))
    const tabs = [...el.querySelectorAll('[role=tab]')].map((t) => t.textContent)
    expect(tabs).toEqual(['Output', 'Errors', 'Details'])
    expect(el.textContent).toContain('lenovo')
  })
  it('the shell tool of a run maps to a command_output card', () => {
    const tool = { id: 't1', name: 'bash', input_summary: 'ls', status: 'ok' as const, started: 1, ended: 2, output_excerpt: 'a\nb' }
    const c = cardOfShellTool(tool, 'hardware', '2026-10-26T10:00:00Z')!
    expect(c.kind).toBe('command_output')
    expect(c.data).toMatchObject({ command: 'ls', stdout: 'a\nb', exit: 0 })
    expect(cardOfShellTool({ ...tool, name: 'read' }, 'hardware', '')).toBeNull()
    expect(cardOfShellTool({ ...tool, status: 'failed' }, 'hardware', '')!.data.exit).toBe(1)
  })
})

describe('older items render through the registry', () => {
  const at = '2026-10-26T10:00:00Z'
  const ask: AskItem = { id: 'a1', lane: 'hardware', at, role: 'ask', state: 'open', ask: { request_id: 'per_1', action: 'shell', resources: ['git push'], message: 'Push?', metadata: null, source: null } }
  const run: RunItem = { id: 'r1', lane: 'hardware', at, role: 'run', run: { message_id: 'msg_1', agent: 'gilfoyle', model: null, started: 1761472800000, ended: 1761472803000, status: 'done', tools: [{ id: 't1', name: 'bash', input_summary: 'ls', status: 'ok', started: 1761472800100, ended: 1761472800900, output_excerpt: 'x' }] } }
  const changes: ChangesItem = { id: 'c1', lane: 'hardware', at, role: 'changes', files: [{ path: 'docs/a.md', additions: 1, deletions: 1, diff: '@@ -1 +1 @@\n-old\n+new', truncated: false }] }
  const form: FormItem = { id: 'f1', lane: 'hardware', at, role: 'form', form: FORM, state: 'pending' }

  it('maps run, ask, form and changes onto tool_run, approval, requested_input and config_diff', () => {
    const rows = groupFeed([run])
    const g = rows[0] as WorkGroup
    expect(cardOfGroup(g, 'hardware').kind).toBe('tool_run')
    expect(cardOfAsk(ask)).toMatchObject({ kind: 'approval', state: 'open', source: { ask } })
    expect(cardOfAsk({ ...ask, state: 'once' }).state).toBe('done')
    expect(cardOfForm(form)).toMatchObject({ kind: 'requested_input', state: 'open' })
    expect(cardOfChanges(changes)).toMatchObject({ kind: 'config_diff', state: 'done' })
    expect(summaryOf(cardOfChanges(changes))).toBe('docs/a.md')
  })
  it('the approval renderer is the ask card: Allow once calls the ask route, owners only', async () => {
    const answerAsk = vi.fn().mockResolvedValue(null)
    const e = env({ legacy: { ...defaultCardEnv.legacy, answerAsk } })
    const el = await mount(withEnv(e, null, <CardInline card={cardOfAsk(ask)} />))
    expect(el.querySelector('[data-testid=ask-card]')).toBeTruthy()
    await click(button(el, 'Allow once'))
    expect(answerAsk).toHaveBeenCalledWith(ask, 'once')
    act(() => root?.unmount())
    root = null
    const member = await mount(withEnv(env({ canAdmin: false }), null, <CardInline card={cardOfAsk(ask)} />))
    expect(member.textContent).toContain('Waiting on an owner')
  })
  it('the approval surface shows the history', async () => {
    const el = await mount(withEnv(env(), null, <CardSurface card={cardOfAsk({ ...ask, state: 'once', replied_at: at, replied_by: { person: 'bay', device_name: 'Mac' } as never })} />))
    const h = el.querySelector('[data-testid=approval-history]')!.textContent!
    expect(h).toContain('Asked')
    expect(h).toContain('Allowed once')
  })
  it('the tool_run renderer is the run row, requested_input is the form card', async () => {
    const g = groupFeed([run])[0] as WorkGroup
    const a = await mount(withEnv(env({ items: [run] }), null, <CardInline card={cardOfGroup(g, 'hardware')} />))
    expect(a.querySelector('[data-testid=run-row]')).toBeTruthy()
    act(() => root?.unmount())
    root = null
    const b = await mount(withEnv(env({ items: [run] }), null, <CardSurface card={cardOfGroup(g, 'hardware')} />))
    expect(b.querySelector('[data-testid=run-surface]')!.textContent).toContain('bash')
    act(() => root?.unmount())
    root = null
    const d = await mount(withEnv(env(), null, <CardInline card={cardOfForm(form)} />))
    expect(d.textContent).toContain('Welcome John')
  })
  it('the config_diff surface is side by side, for a changes item and for before and after', async () => {
    const a = await mount(withEnv(env(), null, <CardSurface card={cardOfChanges(changes)} />))
    const cells = [...a.querySelectorAll('[data-testid=side-by-side] [data-side]')]
    expect(cells.some((c) => c.getAttribute('data-side') === 'left' && c.textContent === 'old')).toBe(true)
    expect(cells.some((c) => c.getAttribute('data-side') === 'right' && c.textContent === 'new')).toBe(true)
    act(() => root?.unmount())
    root = null
    const stored = fixture('config_diff')
    delete (stored.data as Record<string, unknown>).unified
    const b = await mount(withEnv(env(), null, <CardSurface card={stored} />))
    expect(b.querySelector('[data-testid=side-by-side]')!.textContent).toContain('| 8801 | loopback |')
  })
  it('a stored config_diff has Approve and Deny for owners and records through the card action', async () => {
    const act1 = vi.fn().mockResolvedValue(null)
    const el = await mount(withEnv(env({ act: act1 }), surfaces(), <CardInline card={fixture('config_diff')} />))
    await click(button(el, 'Approve'))
    expect(act1.mock.calls[0][1]).toMatchObject({ id: 'approve' })
  })
})

describe('diff helpers', () => {
  it('pairs removed and added lines and keeps context on both sides', () => {
    const rows = sideBySide('--- a\n+++ b\n@@ -1,3 +1,3 @@\n keep\n-old\n-gone\n+new\n tail')
    expect(rows.map((r) => r.kind)).toEqual(['hunk', 'ctx', 'chg', 'del', 'ctx'])
    expect(rows[2]).toMatchObject({ left: 'old', right: 'new' })
    expect(rows[3]).toMatchObject({ left: 'gone', right: null })
  })
  it('lines against lines when there is no diff text', () => {
    expect(beforeAfter('a\nb', 'a\nc\nd').map((r) => r.kind)).toEqual(['ctx', 'chg', 'add'])
    expect(beforeAfter('', 'x').map((r) => r.kind)).toEqual(['add'])
  })
})

describe('surface host', () => {
  it('opens a card surface in a right-side sheet and the registry does not know about it', async () => {
    function Opener({ card }: { card: CardView }) {
      return <CardInline card={card} />
    }
    const card = fixture('alert')
    const el = await mount(
      <CardEnvContext.Provider value={env()}>
        <SheetSurfaceHost>
          <Opener card={card} />
        </SheetSurfaceHost>
      </CardEnvContext.Provider>,
    )
    expect(document.querySelector('[data-testid=surface-sheet]')).toBeNull()
    await click(button(el, 'Open'))
    const sheet = document.querySelector('[data-testid=surface-sheet]')!
    expect(sheet).toBeTruthy()
    expect(sheet.getAttribute('data-side')).toBe('right')
    expect(sheet.querySelector('[data-testid=alert-surface]')).toBeTruthy()
    expect(sheet.textContent).toContain('Alert: Disk at 91 percent')
  })
  it('follows the live card when a resolver is given', async () => {
    const card = fixture('alert')
    const live = { ...card, state: 'ack' as const }
    const el = await mount(
      <CardEnvContext.Provider value={env()}>
        <SheetSurfaceHost resolve={() => live}>
          <CardInline card={card} />
        </SheetSurfaceHost>
      </CardEnvContext.Provider>,
    )
    await click(button(el, 'Open'))
    expect(document.querySelector('[data-testid=alert-surface]')!.textContent).toContain('ack')
  })
})

describe('script', () => {
  const script = (over: Record<string, unknown> = {}): CardView => {
    const c = fixture('script')
    c.data = { ...c.data, ...over }
    return c
  }
  it('inline: a code block with the target and cwd line and an executable badge', async () => {
    const el = await mount(withEnv(env(), surfaces(), <CardInline card={script()} />))
    expect(el.querySelector('[data-testid=script-code]')!.textContent).toBe('uptime\ndf -h /')
    const where = el.querySelector('[data-testid=script-where]')!.textContent!
    expect(where).toContain('target lenovo')
    expect(where).toContain('cwd /home/sovereign/sovereignos')
    expect(el.querySelector('[data-testid=script-mode]')!.textContent).toBe('executable')
    expect(button(el, 'Run')).toBeUndefined() // Run lives on the surface, not in the thread
  })
  it('inline: an informational script says so', async () => {
    const el = await mount(withEnv(env(), surfaces(), <CardInline card={script({ executable: false, permissions: [] })} />))
    expect(el.querySelector('[data-testid=script-mode]')!.textContent).toBe('informational')
  })
  it('surface: shows the code, target, cwd and permissions', async () => {
    const el = await mount(withEnv(env(), surfaces(), <CardSurface card={script()} />))
    expect(el.querySelector('[data-testid=script-target]')!.textContent).toBe('lenovo')
    expect(el.querySelector('[data-testid=script-cwd]')!.textContent).toBe('/home/sovereign/sovereignos')
    expect(el.querySelector('[data-testid=script-code]')!.textContent).toContain('uptime')
    expect([...el.querySelectorAll('[data-testid=script-permissions] li')].map((l) => l.textContent)).toEqual(['shell: uptime', 'shell: df'])
  })
  it('surface: Run shows only when the script is executable and the viewer is an owner, and posts the run action', async () => {
    const act1 = vi.fn(async () => null)
    const el = await mount(withEnv(env({ act: act1 }), surfaces(), <CardSurface card={script()} />))
    await click(el.querySelector('[data-testid=run-script]'))
    expect(act1).toHaveBeenCalledTimes(1)
    const [card, action] = act1.mock.calls[0] as unknown as [CardView, { id: string; kind: string }]
    expect(card.kind).toBe('script')
    expect([action.id, action.kind]).toEqual(['run', 'run'])
  })
  it('surface: a member who is not an owner sees no Run button', async () => {
    const el = await mount(withEnv(env({ canAdmin: false, isMember: true }), surfaces(), <CardSurface card={script()} />))
    expect(el.querySelector('[data-testid=run-script]')).toBeNull()
    expect(el.querySelector('[data-testid=run-owner-only]')).toBeTruthy()
  })
  it('surface: an informational script has no Run button, even for an owner', async () => {
    const el = await mount(withEnv(env(), surfaces(), <CardSurface card={script({ executable: false, permissions: [] })} />))
    expect(el.querySelector('[data-testid=run-script]')).toBeNull()
    expect(el.querySelector('[data-testid=run-owner-only]')).toBeNull()
    expect(el.querySelector('[data-testid=script-no-permissions]')).toBeTruthy()
  })
  it('surface: a refused run shows the reason, and a recorded run is noted', async () => {
    const el = await mount(withEnv(env({ act: async () => 'Only an owner can do this.' }), surfaces(), <CardSurface card={script()} />))
    await click(el.querySelector('[data-testid=run-script]'))
    expect(el.textContent).toContain('Only an owner can do this.')
    act(() => root?.unmount())
    root = null
    const ran = script()
    ran.last_action = { action_id: 'run', kind: 'run', by: { person: 'bay', device_id: 'd', device_name: 'Laptop' }, at: '2026-10-26T10:04:00Z' } as CardView['last_action']
    const el2 = await mount(withEnv(env(), surfaces(), <CardSurface card={ran} />))
    expect(el2.querySelector('[data-testid=script-last-run]')).toBeTruthy()
  })
  it('the web validator refuses an executable script with no permissions, as the console does', () => {
    const bad = script({ permissions: [] })
    expect(validateCard(bad).ok).toBe(false)
    expect(validateCard(bad).errors[0]).toContain('must list the permissions')
    expect(validateCard(script({ executable: false, permissions: [] })).ok).toBe(true)
  })
})

describe('result_summary', () => {
  it('inline: the completion card with ok marks, failing notes only, distinct from prose', async () => {
    const el = await mount(withEnv(env(), surfaces(), <CardInline card={fixture('result_summary')} />))
    const rows = [...el.querySelectorAll('[data-testid=result-checks] li')]
    expect(rows.map((r) => r.getAttribute('data-ok'))).toEqual(['true', 'false'])
    expect(el.querySelectorAll('[role=img][aria-label=passed]').length).toBe(1)
    expect(el.querySelectorAll('[role=img][aria-label=failed]').length).toBe(1)
    expect(el.textContent).toContain('2 percent over 100 pings') // the failed one explains itself
    expect(el.textContent).not.toContain('1000Mb/s') // a passing note waits for the surface
    expect(el.querySelector('[data-testid=card-result_summary]')!.getAttribute('data-failed')).toBe('true')
    expect(el.querySelector('[data-testid=result-strip]')).toBeTruthy()
    expect(el.textContent).toContain('1 of 2 failed')
  })
  it('inline: all checks ok reads as passed', async () => {
    const c = fixture('result_summary')
    c.data = { ...c.data, checks: [{ label: 'Link is up', ok: true }] }
    const el = await mount(withEnv(env(), surfaces(), <CardInline card={c} />))
    expect(el.querySelector('[data-testid=card-result_summary]')!.getAttribute('data-failed')).toBe('false')
    expect(el.textContent).toContain('1 of 1 passed')
  })
  it('surface: every note expanded and what was observed listed', async () => {
    const el = await mount(withEnv(env(), surfaces(), <CardSurface card={fixture('result_summary')} />))
    expect([...el.querySelectorAll('[data-testid=check-note]')].map((n) => n.textContent)).toEqual(['1000Mb/s full duplex', '2 percent over 100 pings'])
    expect([...el.querySelectorAll('[data-testid=result-observed] li')].map((n) => n.textContent)).toEqual(['enp2s0 carrier up', 'uptime 12 days'])
  })
  it('Open on the inline card opens the surface', async () => {
    const s = surfaces()
    const el = await mount(withEnv(env(), s, <CardInline card={fixture('result_summary')} />))
    await click(button(el, 'Open'))
    expect(s.open).toHaveBeenCalledTimes(1)
  })
})

describe('approval scope and the Always button', () => {
  const ask = (scope?: { host?: string; command_class: string; always_allowed: boolean }, resource = 'uptime'): AskItem => ({
    id: 'a1',
    lane: 'dm-bay',
    role: 'ask',
    at: '2026-10-26T10:00:00Z',
    ask: { request_id: 'per_1', action: 'bash', resources: [resource], message: '', metadata: null, source: null, ...(scope ? { scope } : {}) },
    state: 'open',
  })
  const render = (item: AskItem, canAnswer = true) => mount(<AskCard item={item} canAnswer={canAnswer} people={{}} onAnswer={async () => null} />)
  it('offers Always only when the scope says the class allows it', async () => {
    const yes = await render(ask({ host: 'lenovo', command_class: 'uptime', always_allowed: true }))
    expect(button(yes, 'Always')).toBeTruthy()
    expect(button(yes, 'Allow once')).toBeTruthy()
    act(() => root?.unmount())
    root = null
    const no = await render(ask({ host: 'lenovo', command_class: 'curl', always_allowed: false }, 'curl https://x'))
    expect(button(no, 'Always')).toBeUndefined()
    expect(button(no, 'Allow once')).toBeTruthy()
    expect(button(no, 'Deny')).toBeTruthy()
  })
  it('an ask with no scope never offers Always (fail closed)', async () => {
    const el = await render(ask())
    expect(button(el, 'Always')).toBeUndefined()
    expect(el.querySelector('[data-testid=ask-scope]')).toBeNull()
  })
  it('shows the scope line: host and class', async () => {
    const el = await render(ask({ host: 'lenovo', command_class: 'systemctl', always_allowed: false }))
    expect(el.querySelector('[data-testid=ask-scope]')!.textContent).toBe('lenovo, systemctl')
  })
  it('Always posts the always decision', async () => {
    const onAnswer = vi.fn(async () => null)
    const el = await mount(<AskCard item={ask({ command_class: 'uptime', always_allowed: true })} canAnswer people={{}} onAnswer={onAnswer} />)
    await click(button(el, 'Always'))
    expect(onAnswer).toHaveBeenCalledWith('always')
  })
  it('a member sees no buttons at all, and the mapped approval card carries the scope', async () => {
    const el = await render(ask({ command_class: 'uptime', always_allowed: true }), false)
    expect(button(el, 'Always')).toBeUndefined()
    const view = cardOfAsk(ask({ host: 'lenovo', command_class: 'uptime', always_allowed: true }))
    expect(view.data.scope).toEqual({ host: 'lenovo', command_class: 'uptime', always_allowed: true })
  })
  it('the approval surface and the card kind accept the scope object, and refuse the old string', () => {
    const c = fixture('approval')
    expect(validateCard(c).ok).toBe(true)
    c.data = { ...c.data, scope: 'once' }
    expect(validateCard(c).ok).toBe(false)
  })
})
