import { describe, expect, it } from 'vitest'
import { hrefFor, parseRoute } from '@/app/router'
import { layoutGrid, layoutLayered } from './canvas/layout'
import { absDate, money, relDate } from './format'
import { stripContext, withContext } from './JaredPanel'
import { clientsTree, filterClients, sortClients } from './clients/clients'
import { isOpenDeal, linksOf, sectionCounts, summarize } from './clients/profile'
import { ancestorsOf, indexTree, initialExpanded, limitedTree, onTreeKey, pagesToReveal, statusTone, visibleRows } from './map/estate'
import { CLIENTS, ESTATE, PROFILE } from './fixtures'

describe('router', () => {
  it('parses the three app routes and round-trips them', () => {
    expect(parseRoute('#/apps/clients')).toEqual({ name: 'apps-clients' })
    expect(parseRoute('#/apps/clients/abc%20d')).toEqual({ name: 'apps-client', id: 'abc d' })
    expect(parseRoute('#/apps/map')).toEqual({ name: 'apps-map' })
    expect(parseRoute('#/apps/other')).toEqual({ name: 'home' })
    for (const h of ['#/apps/clients', '#/apps/clients/abc%20d', '#/apps/map']) expect(hrefFor(parseRoute(h))).toBe(h)
  })
})

describe('layoutLayered', () => {
  const expanded = new Set(['os', 'lanes', 'infra'])
  it('puts depth in columns, leaves in rows and parents between their children', () => {
    const l = layoutLayered(ESTATE.root, expanded)
    const at = (id: string) => l.nodes.find((n) => n.id === id)!
    expect(at('os').x).toBe(0)
    expect(at('lanes').x).toBeGreaterThan(at('os').x)
    expect(at('lane:jared-bay').x).toBeGreaterThan(at('lanes').x)
    const a = at('lane:jared-bay').y
    const b = at('lane:hardware').y
    expect(b).toBeGreaterThan(a)
    expect(at('lanes').y).toBe((a + b) / 2)
    expect(l.edges).toContainEqual({ id: 'lanes>lane:hardware', source: 'lanes', target: 'lane:hardware' })
  })
  it('draws only the expanded part', () => {
    const l = layoutLayered(ESTATE.root, new Set(['os', 'lanes']))
    expect(l.nodes.map((n) => n.id)).not.toContain('f1')
    const open = new Set(['os', 'lanes', 'lane:jared-bay'])
    expect(layoutLayered(ESTATE.root, open).nodes.map((n) => n.id)).toContain('f1')
    expect(layoutLayered(ESTATE.root, new Set()).nodes).toHaveLength(1)
  })
  it('never overlaps two tiles', () => {
    const open = new Set(['os', 'lanes', 'infra', 'lane:jared-bay'])
    const ns = layoutLayered(ESTATE.root, open).nodes
    for (const a of ns) for (const b of ns) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
  })
})

describe('layoutGrid', () => {
  const many = Array.from({ length: 61 }, (_, i) => ({ ...CLIENTS.clients[i % 3], id: 'x' + i, name: 'Client ' + i, projects: CLIENTS.clients[i % 3].projects }))
  it('clusters by health, stacks projects under each client and never overlaps', () => {
    const tree = clientsTree(many)
    expect(tree.children!.map((g) => g.title)).toEqual(['Needs attention', 'Watch', 'Healthy'])
    const l = layoutGrid(tree, { tileW: 200, tileH: 64 })
    expect(l.nodes).toHaveLength(1 + 3 + 61 + many.reduce((a, c) => a + c.projects.length, 0))
    expect(l.nodes[0].y).toBeLessThan(l.nodes.find((n) => n.depth === 1)!.y)
    for (const a of l.nodes) for (const b of l.nodes) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
    const client = l.nodes.find((n) => n.id === 'c:x0')!
    const proj = l.nodes.find((n) => n.parent === 'c:x0')!
    expect(proj.y).toBeGreaterThan(client.y + client.h)
    expect(l.edges.find((e) => e.target === proj.id)?.kind).toBe('bracket')
  })
  it('shows three projects and a +N tile', () => {
    const c = { ...CLIENTS.clients[0], projects: Array.from({ length: 5 }, (_, i) => ({ id: 'q' + i, name: 'Q' + i })) }
    const kids = clientsTree([c]).children![0].children![0].children!
    expect(kids.map((k) => k.title)).toEqual(['Q0', 'Q1', 'Q2', '+2 more'])
  })
})

describe('estate tree helpers', () => {
  const index = indexTree(ESTATE.root)
  it('starts with the root open, so its groups are drawn around it', () => {
    expect([...initialExpanded(ESTATE.root)]).toEqual(['os'])
  })
  it('caps a big folder at 20 children plus a +N more tile, and pages open the rest', () => {
    const big = { id: 'big', kind: 'folder', title: 'big', children: Array.from({ length: 45 }, (_, i) => ({ id: 'f' + i, kind: 'file', title: 'f' + i })) }
    const v = limitedTree(big, new Set(['big']), new Map())
    expect(v.children).toHaveLength(21)
    expect(v.children![20]).toMatchObject({ id: 'more:big', title: '+25 more', more: { parent: 'big', hidden: 25 } })
    expect(limitedTree(big, new Set(['big']), new Map([['big', 2]])).children).toHaveLength(41)
    expect(limitedTree(big, new Set(['big']), new Map([['big', 3]])).children).toHaveLength(45)
    expect(limitedTree(big, new Set(), new Map()).children).toBeUndefined()
    const bi = indexTree(big)
    expect(pagesToReveal(bi, 'f44', new Map()).get('big')).toBe(3)
    expect(pagesToReveal(bi, 'f3', new Map()).get('big')).toBeUndefined()
  })
  it('lays out at least 120 px between layers and 24 px between rows', () => {
    const l = layoutLayered(ESTATE.root, new Set(['os', 'lanes']))
    const col = (d: number) => l.nodes.filter((n) => n.depth === d)
    expect(col(1)[0].x - (col(0)[0].x + col(0)[0].w)).toBeGreaterThanOrEqual(120)
    const ys = col(2).map((n) => n.y).sort((a, b) => a - b)
    expect(ys[1] - ys[0] - col(2)[0].h).toBeGreaterThanOrEqual(24)
    expect(col(0)[0].w).toBe(180)
    expect(col(0)[0].h).toBe(48)
  })
  it('lists ancestors', () => expect(ancestorsOf(index, 'f1')).toEqual(['lane:jared-bay', 'lanes', 'os']))
  it('filters to matches plus their path', () => {
    const rows = visibleRows(ESTATE.root, new Set(), 'charter')
    expect(rows.map((r) => r.node.id)).toEqual(['os', 'lanes', 'lane:jared-bay', 'f1'])
    expect(visibleRows(ESTATE.root, new Set(), 'zzzz')).toEqual([])
  })
  it('moves with the arrow keys', () => {
    const open = new Set(['os'])
    const rows = visibleRows(ESTATE.root, open, '')
    expect(rows.map((r) => r.node.id)).toEqual(['os', 'lanes', 'infra'])
    expect(onTreeKey('ArrowDown', rows, 'os', open, index)!.selected).toBe('lanes')
    expect(onTreeKey('ArrowUp', rows, 'infra', open, index)!.selected).toBe('lanes')
    const right = onTreeKey('ArrowRight', rows, 'lanes', open, index)!
    expect(right.expanded.has('lanes')).toBe(true)
    expect(onTreeKey('ArrowLeft', rows, 'infra', open, index)!.selected).toBe('os')
    expect(onTreeKey('x', rows, 'os', open, index)).toBeNull()
  })
  it('reads status words as tones', () => {
    expect([statusTone('up'), statusTone('degraded'), statusTone('down'), statusTone('weird'), statusTone(undefined)]).toEqual(['ok', 'warn', 'bad', 'idle', 'idle'])
  })
})

describe('clients list', () => {
  it('sorts by every column, both ways, with a stable name tie-break', () => {
    const names = (k: Parameters<typeof sortClients>[1], d: 'asc' | 'desc') => sortClients(CLIENTS.clients, k, d).map((c) => c.name)
    expect(names('client', 'asc')).toEqual(['Another Cafe', 'Sample Bakery', 'Sample Spa'])
    expect(names('mrr', 'desc')).toEqual(['Sample Spa', 'Sample Bakery', 'Another Cafe'])
    expect(names('projects', 'desc')).toEqual(['Sample Bakery', 'Sample Spa', 'Another Cafe'])
    expect(names('health', 'asc')).toEqual(['Sample Spa', 'Another Cafe', 'Sample Bakery'])
    expect(names('last_contact', 'desc')).toEqual(['Sample Bakery', 'Sample Spa', 'Another Cafe'])
    expect(names('ball', 'asc')).toEqual(['Sample Bakery', 'Another Cafe', 'Sample Spa'])
  })
  it('filters on name, tier, owner and project names', () => {
    expect(filterClients(CLIENTS.clients, 'spa').map((c) => c.id)).toEqual(['c2'])
    expect(filterClients(CLIENTS.clients, 'bakery agent').map((c) => c.id)).toEqual(['c1'])
    expect(filterClients(CLIENTS.clients, '  ')).toHaveLength(3)
    expect(filterClients(CLIENTS.clients, 'nope')).toEqual([])
  })
})

describe('profile', () => {
  const now = Date.parse('2026-10-27T12:00:00Z')
  it('counts every section', () => {
    expect(sectionCounts(PROFILE)).toEqual({ projects: 7, links: linksOf(PROFILE).length, proposals: 1, contracts: 1, versions: 2, errors: 3, money: 1 + 1 + 3 + 1 + 1, infra: 1, tickets: 3, notes: 2 })
  })
  it('builds the six tiles', () => {
    expect(summarize(PROFILE, now)).toEqual({ mrr: 5000, paidCount: 1, paidTotal: 5000, openDeals: 1, openTickets: 2, incidents30d: 1, latestVersion: 'Order form' })
    expect(isOpenDeal('closed_won')).toBe(false)
    expect(isOpenDeal('Closing')).toBe(true)
  })
  it('collects deduped links with kinds', () => {
    const l = linksOf(PROFILE)
    expect(new Set(l.map((x) => x.url)).size).toBe(l.length)
    expect(l.find((x) => x.url === 'https://github.com/x/y')?.kind).toBe('repo')
    expect(l.find((x) => x.url === 'https://bakery.test')?.kind).toBe('status')
    expect(l.find((x) => x.url === 'https://docs.example.com/p')?.kind).toBe('proposal')
  })
})

describe('format and context', () => {
  it('formats money, relative and absolute dates', () => {
    expect(money(1234567)).toBe('$1,234,567 MXN')
    expect(money(null)).toBe('-')
    const now = Date.parse('2026-10-27T12:00:00Z')
    expect(relDate('2026-10-24T12:00:00Z', now)).toBe('3 d ago')
    expect(relDate('2026-10-29T12:00:00Z', now)).toBe('in 2 d')
    expect(relDate('2026-01-01T00:00:00Z', now)).toBe('2026-01-01')
    expect(absDate('2026-10-24T12:00:00Z')).toBe('2026-10-24')
  })
  it('prefixes and strips the on-screen context', () => {
    const body = withContext('Clients, list view', 'hello')
    expect(body).toBe('[on screen: Clients, list view]\nhello')
    expect(stripContext(body)).toBe('hello')
    expect(withContext('', 'hi')).toBe('hi')
    expect(withContext('a]\nb', 'x')).toBe('[on screen: a b]\nx')
  })
})
