// @vitest-environment happy-dom
// What the browser's actions send to the console: move, rename (file and folder), new folder, delete, patch.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryRow } from '@/lib/library'
import { toBatchMeta } from './UploadBatchForm'
import { useDriveOps } from './useDriveOps'
import type { DriveOps } from './DriveBrowser'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const rowOf = (id: string, name: string, folder = ''): LibraryRow => ({ id, lane: 'hardware', name, folder, kind: 'text/markdown', size: 1, uploaded_at: 'x', status: 'available', version: 1, tags: [], uses_count: 0, linked_skills: [] })
const scope = {
  laneOf: () => 'hardware',
  folderPath: (d: string[]) => (d[0] === 'uploads' ? d.slice(1).join('/') : null),
  dirOfFolder: (_d: string[], f: string) => ['uploads', ...f.split('/').filter(Boolean)],
}
let calls: { url: string; method: string; body: unknown }[] = []
let reply: (url: string, method: string) => { status: number; body: unknown } = () => ({ status: 200, body: {} })
let toasts: string[] = []
let ops: DriveOps
let refreshed = 0
let root: Root | null = null

function Probe({ admin = true, member = true }: { admin?: boolean; member?: boolean }) {
  ops = useDriveOps({
    scope,
    rows: [rowOf('1', 'a.md', 'Plans'), rowOf('2', 'b.md', 'Quotes/2026')],
    folders: { hardware: ['Empty'] },
    isMember: () => member,
    admin,
    people: [],
    refresh: () => { refreshed++ },
    toast: (m) => toasts.push(m),
    pickFiles: () => {},
    pickFolder: () => {},
  })
  return null
}
beforeEach(async () => {
  calls = []
  toasts = []
  refreshed = 0
  reply = () => ({ status: 200, body: {} })
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const r = reply(url, method)
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }))
  }))
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.unstubAllGlobals()
})
const mount = async (props: Parameters<typeof Probe>[0] = {}) => {
  const el = document.createElement('div')
  root = createRoot(el)
  await act(async () => root!.render(<Probe {...props} />))
}

describe('the drive actions talk to the console', () => {
  it('moving files posts the ids and the target folder', async () => {
    await mount()
    reply = () => ({ status: 200, body: { moved: [{ id: '1' }], skipped: [] } })
    await act(async () => ops.moveTo(['1', '2'], [], ['uploads', 'Quotes']))
    expect(calls).toEqual([{ url: '/api/library/move', method: 'POST', body: { ids: ['1', '2'], folder: 'Quotes' } }])
    expect(toasts).toEqual(['Moved 1 item'])
    expect(refreshed).toBe(1)
  })
  it('moving to the uploads root sends an empty folder', async () => {
    await mount()
    await act(async () => ops.moveTo(['1'], [], ['uploads']))
    expect((calls[0].body as { folder: string }).folder).toBe('')
  })
  it('moving a folder renames its path under the target; same parent does nothing', async () => {
    await mount()
    await act(async () => ops.moveTo([], [['uploads', 'Plans'], ['uploads', 'Quotes', '2026']], ['uploads', 'Quotes']))
    expect(calls.map((c) => [c.url, c.body])).toEqual([['/api/library/folders/rename', { lane: 'hardware', from: 'Plans', to: 'Quotes/Plans' }]])
    expect(toasts).toEqual(['Moved 1 item'])
  })
  it('a name clash comes back as plain words', async () => {
    await mount()
    reply = () => ({ status: 409, body: { error: 'name_taken', skipped: [{ id: '1', reason: 'name_taken' }] } })
    await act(async () => ops.moveTo(['1'], [], ['uploads', 'Quotes']))
    expect(toasts).toEqual(['A file with that name is already in that folder'])
  })
  it('moving into a read-only folder is refused without a call', async () => {
    await mount()
    await act(async () => ops.moveTo(['1'], [], ['docs']))
    expect(calls).toEqual([])
    expect(toasts).toEqual(['That folder is read only'])
  })
  it('renaming a file patches its name; renaming a folder renames the path and keeps the parent', async () => {
    await mount()
    await act(async () => ops.renameFile(rowOf('1', 'a.md'), 'alpha.md'))
    await act(async () => ops.renameFolder(['uploads', 'Quotes', '2026'], '2027'))
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['PATCH', '/api/library/1', { name: 'alpha.md' }],
      ['POST', '/api/library/folders/rename', { lane: 'hardware', from: 'Quotes/2026', to: 'Quotes/2027' }],
    ])
  })
  it('a slash in a name is refused before any call', async () => {
    await mount()
    await act(async () => ops.renameFolder(['uploads', 'Plans'], 'a/b'))
    await act(async () => ops.newFolder(['uploads'], 'a/b'))
    expect(calls).toEqual([])
  })
  it('a new folder is created at the current path', async () => {
    await mount()
    await act(async () => ops.newFolder(['uploads', 'Quotes'], '2028'))
    expect(calls).toEqual([{ url: '/api/library/folders', method: 'POST', body: { lane: 'hardware', path: 'Quotes/2028' } }])
  })
  it('delete sends files and folders, soft on the server; a member who is not an owner is told no', async () => {
    await mount()
    await act(async () => ops.remove([rowOf('1', 'a.md')], [['uploads', 'Quotes']]))
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['DELETE', '/api/library/folders', { lane: 'hardware', path: 'Quotes' }],
      ['DELETE', '/api/library/1', undefined],
    ])
    expect(toasts).toEqual(['Moved 2 items to the bin'])
    calls = []
    toasts = []
    await mount({ admin: false })
    await act(async () => ops.remove([rowOf('1', 'a.md')], []))
    expect(calls).toEqual([])
    expect(toasts).toEqual(['Only owners can delete'])
  })
  it('patch sends the same fields for every selected file', async () => {
    await mount()
    await act(async () => ops.patch([rowOf('1', 'a.md'), rowOf('2', 'b.md')], { label: 'Quote', assigned_to: 'marvin' }))
    expect(calls.map((c) => [c.url, c.body])).toEqual([['/api/library/1', { label: 'Quote', assigned_to: 'marvin' }], ['/api/library/2', { label: 'Quote', assigned_to: 'marvin' }]])
    expect(toasts).toEqual(['Saved 2 files'])
  })
  it('the folder list merges row folders, their parents and the explicit empty ones', async () => {
    await mount()
    expect(ops.folderList(['uploads'])).toEqual(['Empty', 'Plans', 'Quotes', 'Quotes/2026'])
  })
  it('who may write: members of the lane, inside uploads only', async () => {
    await mount()
    expect(ops.writableDir(['uploads', 'Plans'])).toBe(true)
    expect(ops.writableDir(['docs'])).toBe(false)
    await mount({ member: false })
    expect(ops.writableDir(['uploads'])).toBe(false)
  })
})

describe('upload form details', () => {
  it('only what was filled in goes into the batch meta, and an empty form is no meta', () => {
    expect(toBatchMeta({ assigned_to: '', label: ' ', tags: '', notes: '' })).toBeUndefined()
    expect(toBatchMeta({ assigned_to: 'marvin', label: ' Quote pack ', tags: 'Garage, q4, garage', notes: 'hi' })).toEqual({ assigned_to: 'marvin', label: 'Quote pack', tags: ['garage', 'q4'], notes: 'hi' })
  })
})
