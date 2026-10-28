import { describe, expect, it } from 'vitest'
import { dockFor, initialStore, reduce, selectionOf, surfaceStateOf } from './store'
import type { Action, Store } from './store'
import { DOCK_DEFAULT, defaultDock, defaultSurfaces, restore, saveOf, standingSurface } from './dock'
import type { DockSurface } from './dock'
import type { LaneRow, Me } from './types'

const me: Me = { person: 'marvin', role: 'owner', device_id: 'd1', device_name: 'Laptop', ip: '10.0.0.2', mac: null, lanwatch_status: null }
const lane = (id: string, kind: 'dm' | 'group'): LaneRow => ({ id, kind, title: id, members: ['marvin'], busy: false, count: 0, asks: 0, last: null, tail: [] })
const base = (): Store => reduce(reduce(initialStore(), { type: 'me', me }), { type: 'lanes', lanes: [lane('hardware', 'group'), lane('dm-marvin', 'dm'), lane('lab', 'group')] })
const run = (s: Store, ...a: Action[]): Store => a.reduce(reduce, s)
const card = (id: string): DockSurface => ({ id: 'card:' + id, kind: 'card', cardKind: 'alert', title: 'Alert: ' + id })
const ids = (s: Store, l: string) => dockFor(s, l).surfaces.map((x) => x.id)

describe('default docks (surfaces spec section 2)', () => {
  it('hardware = topology, interface health, lane files', () => expect(defaultSurfaces('hardware', 'group')).toEqual(['topology', 'iface', 'files']))
  it('DM lanes = approval queue and scratchpad', () => expect(defaultSurfaces('dm-bay', 'dm')).toEqual(['approvals', 'scratch']))
  it('standards and lab', () => {
    expect(defaultSurfaces('standards', 'group')).toEqual(['files'])
    expect(defaultSurfaces('lab', 'group')).toEqual(['scratch', 'files'])
  })
  it('a lane never opened has its default, the first one expanded', () => {
    const d = dockFor(base(), 'hardware')
    expect(d.surfaces.map((x) => x.id)).toEqual(['topology', 'iface', 'files'])
    expect(d.active).toBe('topology')
    expect(d.hidden).toBe(false)
    expect(d.width).toBe(DOCK_DEFAULT)
  })
})

describe('dock reducer', () => {
  it('open adds a surface, expands it and un-hides the dock', () => {
    const s = run(base(), { type: 'dock_hide', lane: 'hardware' }, { type: 'dock_open', lane: 'hardware', surface: card('c1') })
    expect(ids(s, 'hardware')).toEqual(['topology', 'iface', 'files', 'card:c1'])
    expect(dockFor(s, 'hardware').active).toBe('card:c1')
    expect(dockFor(s, 'hardware').hidden).toBe(false)
    expect(dockFor(s, 'hardware').seq).toBe(1)
  })
  it('opening one already open does not duplicate it, it expands it and takes the new argument', () => {
    let s = run(base(), { type: 'dock_open', lane: 'hardware', surface: { ...card('c1'), arg: 0 } }, { type: 'dock_expand', lane: 'hardware', id: 'files' })
    s = reduce(s, { type: 'dock_open', lane: 'hardware', surface: { ...card('c1'), arg: 1 } })
    expect(ids(s, 'hardware').filter((x) => x === 'card:c1').length).toBe(1)
    expect(dockFor(s, 'hardware').surfaces.find((x) => x.id === 'card:c1')!.arg).toBe(1)
    expect(dockFor(s, 'hardware').active).toBe('card:c1')
  })
  it('open with expand false keeps the current panel', () => {
    const s = reduce(base(), { type: 'dock_open', lane: 'hardware', surface: card('c1'), expand: false })
    expect(dockFor(s, 'hardware').active).toBe('topology')
    expect(ids(s, 'hardware')).toContain('card:c1')
  })
  it('expand switches panel, collapse leaves every tab and loses nothing', () => {
    let s = run(base(), { type: 'surface_state', lane: 'hardware', id: 'scratch', patch: { text: 'draft' } }, { type: 'dock_expand', lane: 'hardware', id: 'files' })
    expect(dockFor(s, 'hardware').active).toBe('files')
    s = reduce(s, { type: 'dock_collapse', lane: 'hardware' })
    expect(dockFor(s, 'hardware').active).toBeNull()
    expect(ids(s, 'hardware').length).toBe(3)
    expect(surfaceStateOf(s, 'hardware', 'scratch').text).toBe('draft')
    expect(reduce(s, { type: 'dock_collapse', lane: 'hardware' })).toBe(s)
  })
  it('expand ignores an id that is not open', () => {
    const s = base()
    expect(reduce(s, { type: 'dock_expand', lane: 'hardware', id: 'nope' })).toBe(s)
  })
  it('close removes a tab and moves the panel to its neighbour; closing the last leaves none', () => {
    let s = run(base(), { type: 'dock_expand', lane: 'hardware', id: 'iface' }, { type: 'dock_close', lane: 'hardware', id: 'iface' })
    expect(ids(s, 'hardware')).toEqual(['topology', 'files'])
    expect(dockFor(s, 'hardware').active).toBe('files')
    s = run(s, { type: 'dock_close', lane: 'hardware', id: 'topology' }, { type: 'dock_close', lane: 'hardware', id: 'files' })
    expect(dockFor(s, 'hardware').surfaces).toEqual([])
    expect(dockFor(s, 'hardware').active).toBeNull()
  })
  it('closing a tab that is not expanded keeps the expanded one', () => {
    const s = reduce(base(), { type: 'dock_close', lane: 'hardware', id: 'files' })
    expect(dockFor(s, 'hardware').active).toBe('topology')
  })
  it('hide and restore; restore re-expands when everything was collapsed', () => {
    let s = run(base(), { type: 'dock_collapse', lane: 'hardware' }, { type: 'dock_hide', lane: 'hardware' })
    expect(dockFor(s, 'hardware').hidden).toBe(true)
    s = reduce(s, { type: 'dock_restore', lane: 'hardware' })
    expect(dockFor(s, 'hardware').hidden).toBe(false)
    expect(dockFor(s, 'hardware').active).toBe('topology')
    expect(reduce(s, { type: 'dock_restore', lane: 'hardware' })).toBe(s)
  })
  it('width is clamped to 360..520', () => {
    let s = reduce(base(), { type: 'dock_width', lane: 'hardware', width: 100 })
    expect(dockFor(s, 'hardware').width).toBe(360)
    s = reduce(s, { type: 'dock_width', lane: 'hardware', width: 9000 })
    expect(dockFor(s, 'hardware').width).toBe(520)
    s = reduce(s, { type: 'dock_width', lane: 'hardware', width: 444.4 })
    expect(dockFor(s, 'hardware').width).toBe(444)
  })
  it('lanes keep their own docks', () => {
    const s = reduce(base(), { type: 'dock_open', lane: 'lab', surface: card('x') })
    expect(ids(s, 'lab')).toEqual(['scratch', 'files', 'card:x'])
    expect(ids(s, 'hardware')).toEqual(['topology', 'iface', 'files'])
  })
  it('auto marks a card once', () => {
    const s = run(base(), { type: 'dock_auto', lane: 'hardware', id: 'c1' })
    expect(dockFor(s, 'hardware').auto).toEqual(['c1'])
    expect(reduce(s, { type: 'dock_auto', lane: 'hardware', id: 'c1' })).toBe(s)
  })
})

describe('selection and surface state', () => {
  it('a lane has one selected resource, shared, cleared with null, not shared across lanes', () => {
    let s = reduce(base(), { type: 'select', lane: 'hardware', selection: { kind: 'device', id: 'aa:bb', label: 'Printer' } })
    expect(selectionOf(s, 'hardware')).toEqual({ kind: 'device', id: 'aa:bb', label: 'Printer' })
    expect(selectionOf(s, 'lab')).toBeNull()
    s = reduce(s, { type: 'select', lane: 'hardware', selection: { kind: 'file', id: 'docs/x.md', label: 'x.md' } })
    expect(selectionOf(s, 'hardware')!.kind).toBe('file')
    s = reduce(s, { type: 'select', lane: 'hardware', selection: null })
    expect(selectionOf(s, 'hardware')).toBeNull()
  })
  it('surface state merges per lane and surface id', () => {
    let s = run(base(), { type: 'surface_state', lane: 'hardware', id: 'scratch', patch: { text: 'a' } }, { type: 'surface_state', lane: 'hardware', id: 'scratch', patch: { version: 2 } })
    expect(surfaceStateOf(s, 'hardware', 'scratch')).toEqual({ text: 'a', version: 2 })
    expect(surfaceStateOf(s, 'lab', 'scratch')).toEqual({})
    s = reduce(s, { type: 'surface_state', lane: 'lab', id: 'scratch', patch: { text: 'b' } })
    expect(surfaceStateOf(s, 'hardware', 'scratch').text).toBe('a')
  })
})

describe('saved layout (sov.dock.v1.<person>.<lane>)', () => {
  it('hydrate seeds a lane once and never overwrites a dock already in memory', () => {
    const saved = saveOf({ ...defaultDock('hardware', 'group'), surfaces: [standingSurface('files')], active: 'files', hidden: true, width: 500, auto: ['c9'] })
    let s = reduce(base(), { type: 'dock_hydrate', lane: 'hardware', saved })
    expect(dockFor(s, 'hardware')).toMatchObject({ active: 'files', hidden: true, width: 500, auto: ['c9'] })
    expect(ids(s, 'hardware')).toEqual(['files'])
    s = reduce(s, { type: 'dock_open', lane: 'hardware', surface: card('c1') })
    expect(reduce(s, { type: 'dock_hydrate', lane: 'hardware', saved: null })).toBe(s)
  })
  it('hydrate with nothing saved gives the default', () => {
    const s = reduce(base(), { type: 'dock_hydrate', lane: 'dm-marvin', saved: null })
    expect(ids(s, 'dm-marvin')).toEqual(['approvals', 'scratch'])
  })
  it('hydrate with a fixed set keeps exactly those standing surfaces, in any saved or default case', () => {
    const fixed = ['topology', 'iface', 'scratch', 'files'] as const
    const saved = saveOf({ ...defaultDock('dm-marvin', 'dm'), surfaces: [standingSurface('approvals'), card('c1')], active: 'approvals' })
    const s = reduce(base(), { type: 'dock_hydrate', lane: 'dm-marvin', saved, defaults: ['approvals'], fixed: [...fixed] })
    expect(ids(s, 'dm-marvin')).toEqual(['topology', 'iface', 'scratch', 'files', 'card:c1'])
    expect(dockFor(s, 'dm-marvin').active).toBe('topology')
    const fresh = reduce(base(), { type: 'dock_hydrate', lane: 'dm-marvin', saved: null, fixed: [...fixed] })
    expect(ids(fresh, 'dm-marvin')).toEqual(['topology', 'iface', 'scratch', 'files'])
  })
  it('a damaged layout falls back to the default instead of throwing', () => {
    const fb = defaultDock('lab', 'group')
    for (const bad of [null, 'x', 7, {}, { v: 2, surfaces: [] }, { v: 1, surfaces: 'no' }]) expect(restore(bad, fb)).toBe(fb)
    const r = restore({ v: 1, surfaces: [{ id: 'nope', kind: 'standing', title: 'x' }, { id: 'card:c1', kind: 'card', title: 'Alert', cardKind: 'alert' }, 5], active: 'zzz', width: 'wide' }, fb)
    expect(r.surfaces.map((x) => x.id)).toEqual(['card:c1'])
    expect(r.active).toBeNull()
    expect(r.width).toBe(DOCK_DEFAULT)
  })
  it('a stale layout that still holds the old File preview tab (a file surface or a file_retrieval card tab) is ignored on load', () => {
    const fb = defaultDock('lab', 'group')
    const r = restore({ v: 1, surfaces: [{ id: 'file:abc', kind: 'file', title: 'File preview', card: { id: 'file:abc', kind: 'file_retrieval' } }, { id: 'card:f1', kind: 'card', title: 'File preview', cardKind: 'file_retrieval' }, { id: 'files', kind: 'standing', title: 'Lane files' }], active: 'file:abc', width: 420 }, fb)
    expect(r.surfaces.map((x) => x.id)).toEqual(['files'])
    expect(r.active).toBeNull()
  })
  it('save then restore round trips the layout', () => {
    const d = { ...defaultDock('hardware', 'group'), width: 480, hidden: true, auto: ['a'] }
    const back = restore(JSON.parse(JSON.stringify(saveOf(d))), defaultDock('hardware', 'group'))
    expect(back).toEqual({ ...d, seq: 0 })
  })
})
