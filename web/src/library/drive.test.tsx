// @vitest-environment happy-dom
// The Drive-style browser: selection by click, Shift, Cmd and the drag rectangle, drag and drop onto folders and
// breadcrumb items, the right-click menus, inline rename, the keyboard, and the dialogs behind the menu.
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { LibraryRow } from '@/lib/library'
import { Crumbs } from './Crumbs'
import { DriveBrowser } from './DriveBrowser'
import type { DriveOps } from './DriveBrowser'
import { fromLibraryRow } from './FileTile'
import { setCut, setDrag } from './dnd'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (name: string, over: Partial<LibraryRow> = {}): LibraryRow => ({
  id: 'id-' + name, lane: 'hardware', name, folder: '', kind: 'text/markdown', size: 100, uploaded_at: '2026-10-26T10:00:00Z', status: 'available', version: 1, tags: [], uses_count: 0, linked_skills: [], ...over,
})
// Newest first, so the display order is a, b, c, d.
const rows = ['a.md', 'b.md', 'c.md', 'd.md'].map((n, i) => row(n, { uploaded_at: `2026-10-26T10:0${9 - i}:00Z` }))

const DIR = ['uploads']
const mkOps = (over: Partial<DriveOps> = {}): DriveOps & Record<string, ReturnType<typeof vi.fn>> => {
  const o = {
    canDelete: true,
    people: [{ id: 'marvin', name: 'Marvin' }, { id: 'bay', name: 'Bay' }],
    writableDir: (d: string[]) => d[0] === 'uploads',
    laneOf: () => 'hardware',
    folderPath: (d: string[]) => (d[0] === 'uploads' ? d.slice(1).join('/') : null),
    dirOfFolder: (_d: string[], f: string) => ['uploads', ...f.split('/').filter(Boolean)],
    folderList: () => ['Plans', 'Plans/2026', 'Quotes'],
    moveTo: vi.fn(async () => {}),
    renameFile: vi.fn(async () => {}),
    renameFolder: vi.fn(async () => {}),
    newFolder: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    patch: vi.fn(async () => {}),
    uploadFiles: vi.fn(),
    uploadFolder: vi.fn(),
    ...over,
  }
  return o as never
}

let root: Root | null = null
const mounted = { ops: mkOps(), opened: [] as string[], folders: [] as string[][], actions: [] as string[] }
function Harness({ ops, dir = DIR, folders = [{ name: 'Plans', count: 2 }, { name: 'Quotes', count: 0 }], view = 'grid' as const }: { ops: DriveOps; dir?: string[]; folders?: { name: string; count: number }[]; view?: 'grid' | 'list' }) {
  const [d, setD] = useState(dir)
  return (
    <TooltipProvider>
      <Crumbs root="Lane files" dir={d} onGo={setD} ops={ops} />
      <DriveBrowser
        key={d.join('/')}
        dir={d}
        folders={d.join('/') === dir.join('/') ? folders : []}
        files={d.join('/') === dir.join('/') ? rows.map((r) => fromLibraryRow(r)) : []}
        view={view}
        actionsFor={(it) => ('uploaded_at' in it.raw ? [{ id: 'index', label: 'Index into recall' }, { id: 'version', label: 'New version' }] : [])}
        onOpenFile={(it) => mounted.opened.push(it.name)}
        onOpenFolder={(x) => {
          mounted.folders.push(x)
          setD(x)
        }}
        onAction={(it, id) => mounted.actions.push(id + ':' + it.name)}
        ops={ops}
        laneOfDir={ops.laneOf}
        emptyText="Nothing here."
      />
    </TooltipProvider>
  )
}
const mount = async (ops: DriveOps, props: Partial<Parameters<typeof Harness>[0]> = {}) => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(<Harness ops={ops} {...props} />))
  return el
}
beforeEach(() => {
  mounted.opened = []
  mounted.folders = []
  mounted.actions = []
  setDrag(null)
  setCut(null)
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

const q = (p: ParentNode, s: string) => p.querySelector(s) as HTMLElement
const qa = (p: ParentNode, s: string) => [...p.querySelectorAll(s)] as HTMLElement[]
const tile = (el: ParentNode, name: string) => qa(el, '[data-testid=file-tile]').find((t) => q(t, '[data-testid=tile-name]')?.textContent === name || q(t, '[data-testid=rename-input]'))!
const ftile = (el: ParentNode, name: string) => qa(el, '[data-testid=folder-tile]').find((t) => t.getAttribute('aria-label') === 'Open folder ' + name)!
const picked = (el: ParentNode) => qa(el, '[data-key][data-picked=true]').map((t) => t.getAttribute('data-key'))
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)) })
const click = async (e: Element, init: MouseEventInit = {}) => { await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })) }) }
const dbl = async (e: Element) => { await click(e); await act(async () => { e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })) }) }
const ctx = async (e: Element) => { await act(async () => { e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })) }) }
const key = (e: Element, k: string, init: KeyboardEventInit = {}) => act(async () => { e.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })) })
const menuItems = () => qa(document.body, '[role=menuitem]').map((i) => i.textContent)
const pick = async (id: string) => { await click(q(document.body, `[data-testid="menu-${id}"]`)); await settle() }
const type = (e: HTMLInputElement | HTMLTextAreaElement, v: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(e, v)
    e.dispatchEvent(new Event('input', { bubbles: true }))
  })

describe('selecting', () => {
  it('a click selects one tile, Cmd and Ctrl toggle, Shift takes the range', async () => {
    const el = await mount(mkOps())
    const main = (n: string) => q(tile(el, n), '[data-testid=tile-main]')
    await click(main('a.md'))
    expect(picked(el)).toEqual(['id-a.md'])
    await click(main('c.md'), { metaKey: true })
    expect(picked(el)).toEqual(['id-a.md', 'id-c.md'])
    await click(main('a.md'), { ctrlKey: true })
    expect(picked(el)).toEqual(['id-c.md'])
    await click(main('b.md'))
    await click(main('d.md'), { shiftKey: true })
    expect(picked(el)).toEqual(['id-b.md', 'id-c.md', 'id-d.md'])
    expect(q(el, '[data-testid=file-count]').textContent).toContain('3 selected')
    expect(opened()).toEqual([]) // selecting never opens
  })
  it('a double click opens a file or a folder', async () => {
    const el = await mount(mkOps())
    await dbl(q(tile(el, 'b.md'), '[data-testid=tile-main]'))
    expect(mounted.opened).toEqual(['b.md'])
    await dbl(ftile(el, 'Plans'))
    expect(mounted.folders).toEqual([['uploads', 'Plans']])
  })
  it('folders select along with files, and open space clears', async () => {
    const el = await mount(mkOps())
    await click(ftile(el, 'Plans'))
    await click(q(tile(el, 'a.md'), '[data-testid=tile-main]'), { metaKey: true })
    expect(picked(el)).toEqual(['d:uploads/Plans', 'id-a.md'])
    const grid = q(el, '[data-testid=file-grid]')
    await act(async () => { grid.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 })) })
    await act(async () => { window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 })) })
    expect(picked(el)).toEqual([])
  })
  it('dragging a rectangle over open space selects the tiles it touches', async () => {
    const el = await mount(mkOps())
    const boxes: Record<string, [number, number, number, number]> = { 'id-a.md': [0, 100, 90, 190], 'id-b.md': [100, 100, 190, 190], 'id-c.md': [0, 200, 90, 290], 'id-d.md': [100, 200, 190, 290] }
    qa(el, '[data-key]').forEach((t) => {
      const b = boxes[t.dataset.key!] ?? [500, 500, 510, 510]
      t.getBoundingClientRect = () => ({ left: b[0], top: b[1], right: b[2], bottom: b[3], width: b[2] - b[0], height: b[3] - b[1], x: b[0], y: b[1], toJSON() {} }) as DOMRect
    })
    const grid = q(el, '[data-testid=file-grid]')
    const drag = async (from: [number, number], to: [number, number], init: MouseEventInit = {}) => {
      await act(async () => { grid.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: from[0], clientY: from[1], ...init })) })
      await act(async () => { window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: to[0], clientY: to[1] })) })
    }
    const release = (at: [number, number]) => act(async () => { window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: at[0], clientY: at[1] })) })
    await drag([150, 150], [10, 110])
    expect(q(el, '[data-testid=select-rect]')).toBeTruthy()
    expect(picked(el)).toEqual(['id-a.md', 'id-b.md']) // live, while the rectangle is still down
    await release([10, 110])
    expect(q(el, '[data-testid=select-rect]')).toBeNull()
    expect(picked(el)).toEqual(['id-a.md', 'id-b.md'])
    // Cmd held: the next rectangle adds to it
    await drag([95, 295], [50, 250], { metaKey: true })
    await release([50, 250])
    expect(picked(el)).toEqual(['id-a.md', 'id-b.md', 'id-c.md'])
    // without Cmd a new rectangle replaces it
    await drag([195, 295], [150, 250])
    await release([150, 250])
    expect(picked(el)).toEqual(['id-d.md'])
  })
})
const opened = () => mounted.opened

describe('drag and drop', () => {
  const drag = async (el: Element, type: string, dt: Partial<DataTransfer> = {}) => act(async () => { el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer: { effectAllowed: '', dropEffect: '', setData() {}, ...dt } })) })
  it('dropping the selection on a folder moves the files there', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await click(q(tile(el, 'a.md'), '[data-testid=tile-main]'))
    await click(q(tile(el, 'b.md'), '[data-testid=tile-main]'), { metaKey: true })
    await drag(tile(el, 'a.md'), 'dragstart')
    const target = q(el, '[data-key="d:uploads/Plans"]')
    await drag(target, 'dragover')
    expect(q(target, '[data-drop-over]').getAttribute('data-drop-over')).toBe('true')
    await drag(target, 'drop')
    expect(ops.moveTo).toHaveBeenCalledWith(['id-a.md', 'id-b.md'], [], ['uploads', 'Plans'])
  })
  it('dragging an unselected tile moves just that one', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await click(q(tile(el, 'a.md'), '[data-testid=tile-main]'))
    await drag(tile(el, 'c.md'), 'dragstart')
    await drag(q(el, '[data-key="d:uploads/Quotes"]'), 'drop')
    expect(ops.moveTo).toHaveBeenCalledWith(['id-c.md'], [], ['uploads', 'Quotes'])
    expect(picked(el)).toEqual(['id-c.md'])
  })
  it('a folder can be dragged onto another, but not onto itself', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await drag(q(el, '[data-key="d:uploads/Plans"]'), 'dragstart')
    await drag(q(el, '[data-key="d:uploads/Plans"]'), 'drop')
    expect(ops.moveTo).not.toHaveBeenCalled()
    await drag(q(el, '[data-key="d:uploads/Quotes"]'), 'drop')
    expect(ops.moveTo).toHaveBeenCalledWith([], [['uploads', 'Plans']], ['uploads', 'Quotes'])
  })
  it('a breadcrumb item is a drop target too', async () => {
    const ops = mkOps()
    const el = await mount(ops, { dir: ['uploads', 'Plans'] })
    await drag(tile(el, 'a.md'), 'dragstart')
    const crumb = qa(el, '[data-testid=crumb]').find((c) => c.textContent === 'uploads')!
    await drag(crumb, 'dragover')
    expect(crumb.getAttribute('data-drop-over')).toBe('true')
    await drag(crumb, 'drop')
    expect(ops.moveTo).toHaveBeenCalledWith(['id-a.md'], [], ['uploads'])
    // the lane root holds no files, so it refuses a drop
    await drag(tile(el, 'a.md'), 'dragstart')
    const root0 = qa(el, '[data-testid=crumb]').find((c) => c.textContent === 'Lane files')!
    const ev = new Event('dragover', { bubbles: true, cancelable: true })
    await act(async () => { root0.dispatchEvent(Object.assign(ev, { dataTransfer: { dropEffect: '' } })) })
    expect(ev.defaultPrevented).toBe(false)
  })
  it('a read-only target does not accept a drop', async () => {
    const ops = mkOps({ writableDir: (d: string[]) => d.join('/') !== 'uploads/Quotes' && d[0] === 'uploads' })
    const el = await mount(ops)
    await drag(tile(el, 'a.md'), 'dragstart')
    const ev = new Event('dragover', { bubbles: true, cancelable: true })
    await act(async () => { q(el, '[data-key="d:uploads/Quotes"]').dispatchEvent(Object.assign(ev, { dataTransfer: { dropEffect: '' } })) })
    expect(ev.defaultPrevented).toBe(false)
    await drag(q(el, '[data-key="d:uploads/Quotes"]'), 'drop')
    expect(ops.moveTo).not.toHaveBeenCalled()
  })
  it('repo files are not draggable', async () => {
    const ops = mkOps({ writableDir: () => false })
    const el = await mount(ops, { dir: ['docs'] })
    expect(tile(el, 'a.md').getAttribute('draggable')).toBe('false')
  })
})

describe('right-click menus', () => {
  it('a file offers Open, Download, Rename, Move to, Label, Assign, Notes, Index, New version and Delete', async () => {
    const el = await mount(mkOps())
    await ctx(tile(el, 'a.md'))
    expect(menuItems()).toEqual(['Open', 'Download', 'Rename', 'Cut', 'Move to...', 'Label', 'Assign', 'Notes', 'Index into recall', 'New version', 'Delete'])
    await pick('open')
    expect(mounted.opened).toEqual(['a.md'])
    await ctx(tile(el, 'a.md'))
    await pick('act:index')
    expect(mounted.actions).toEqual(['index:a.md'])
  })
  it('right-clicking a tile outside the selection selects it; inside the selection keeps it and acts on all', async () => {
    const el = await mount(mkOps())
    await click(q(tile(el, 'a.md'), '[data-testid=tile-main]'))
    await click(q(tile(el, 'b.md'), '[data-testid=tile-main]'), { metaKey: true })
    await ctx(tile(el, 'b.md'))
    expect(picked(el)).toEqual(['id-a.md', 'id-b.md'])
    expect(menuItems()).toEqual(['Cut', 'Move to...', 'Label', 'Assign', 'Notes', 'Delete 2 items'])
    await key(q(document.body, '[role=menu]'), 'Escape')
    expect(qa(document.body, '[role=menu]')).toEqual([])
    await ctx(tile(el, 'd.md'))
    expect(picked(el)).toEqual(['id-d.md'])
  })
  it('a folder offers Open, Rename, Move to and Delete', async () => {
    const el = await mount(mkOps())
    await ctx(q(el, '[data-key="d:uploads/Plans"]'))
    expect(menuItems()).toEqual(['Open', 'Rename', 'Cut', 'Move to...', 'Delete'])
  })
  it('open space offers New folder, Upload files, Upload folder, Select all and Paste once something was cut', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await ctx(q(el, '[data-testid=file-grid]'))
    expect(menuItems()).toEqual(['New folder', 'Upload files', 'Upload folder', 'Select all', 'Paste'])
    expect(q(document.body, '[data-testid=menu-paste]').hasAttribute('disabled')).toBe(true)
    await pick('upload-files')
    expect(ops.uploadFiles).toHaveBeenCalledWith(DIR)
    await ctx(q(el, '[data-testid=file-grid]'))
    await pick('upload-folder')
    expect(ops.uploadFolder).toHaveBeenCalledWith(DIR)
    await ctx(q(el, '[data-testid=file-grid]'))
    await pick('select-all')
    expect(picked(el).length).toBe(6) // two folders and four files
  })
  it('Cut then Paste moves into the folder you paste in', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await ctx(tile(el, 'c.md'))
    await pick('cut')
    expect(tile(el, 'c.md').getAttribute('data-cut')).toBe('true')
    await dbl(ftile(el, 'Plans'))
    await ctx(q(el, '[data-testid=file-grid]'))
    expect(q(document.body, '[data-testid=menu-paste]').hasAttribute('disabled')).toBe(false)
    await pick('paste')
    expect(ops.moveTo).toHaveBeenCalledWith(['id-c.md'], [], ['uploads', 'Plans'])
    await ctx(q(el, '[data-testid=file-grid]'))
    expect(q(document.body, '[data-testid=menu-paste]').hasAttribute('disabled')).toBe(true) // the clipboard is spent
  })
  it('repo files and folders say they are read only and offer no edits', async () => {
    const ops = mkOps({ writableDir: () => false })
    const el = await mount(ops, { dir: ['docs'] })
    await ctx(tile(el, 'a.md'))
    expect(menuItems()).toEqual(['Open', 'Download'])
    expect(q(document.body, '[data-testid=context-note]').textContent).toContain('read only')
    await key(q(document.body, '[role=menu]'), 'Escape')
    await ctx(q(el, '[data-testid=file-grid]'))
    expect(menuItems()).toEqual(['Select all'])
    expect(q(document.body, '[data-testid=context-note]').textContent).toContain('read only')
  })
  it('Delete is disabled for a member who is not an owner', async () => {
    const el = await mount(mkOps({ canDelete: false }))
    await ctx(tile(el, 'a.md'))
    expect(q(document.body, '[data-testid=menu-delete]').hasAttribute('disabled')).toBe(true)
  })
})

describe('rename, new folder, move, details and delete', () => {
  it('Rename edits the name in place; Enter saves and Escape cancels', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await ctx(tile(el, 'a.md'))
    await pick('rename')
    const input = q(el, '[data-testid=rename-input]') as HTMLInputElement
    expect(input.value).toBe('a.md')
    await type(input, 'alpha.md')
    await key(input, 'Enter')
    expect(ops.renameFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-a.md' }), 'alpha.md')
    expect(q(el, '[data-testid=rename-input]')).toBeNull()
    await ctx(tile(el, 'b.md'))
    await pick('rename')
    const again = q(el, '[data-testid=rename-input]') as HTMLInputElement
    await type(again, 'nope.md')
    await key(again, 'Escape')
    expect(ops.renameFile).toHaveBeenCalledTimes(1)
  })
  it('a folder renames in place too', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await ctx(q(el, '[data-key="d:uploads/Plans"]'))
    await pick('rename')
    const input = q(el, '[data-testid=rename-input]') as HTMLInputElement
    await type(input, 'Drawings')
    await key(input, 'Enter')
    expect(ops.renameFolder).toHaveBeenCalledWith(['uploads', 'Plans'], 'Drawings')
  })
  it('New folder asks for a name and creates it inside the current folder', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await ctx(q(el, '[data-testid=file-grid]'))
    await pick('new-folder')
    const input = q(document.body, '[data-testid=name-input]') as HTMLInputElement
    await type(input, 'Garage quotes')
    await click(q(document.body, '[data-testid=name-confirm]'))
    expect(ops.newFolder).toHaveBeenCalledWith(DIR, 'Garage quotes')
  })
  it('Move to lists the lane folders and moves the selection to the one picked', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await ctx(tile(el, 'a.md'))
    await pick('move')
    const targets = qa(document.body, '[data-testid=move-target]').map((t) => t.dataset.folder)
    expect(targets).toEqual(['', 'Plans', 'Plans/2026', 'Quotes'])
    await click(qa(document.body, '[data-testid=move-target]').find((t) => t.dataset.folder === 'Plans/2026')!)
    await click(q(document.body, '[data-testid=move-confirm]'))
    expect(ops.moveTo).toHaveBeenCalledWith(['id-a.md'], [], ['uploads', 'Plans', '2026'])
  })
  it('Label, Assign and Notes open one details dialog on the asked field and save a patch', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await ctx(tile(el, 'a.md'))
    await pick('assign')
    expect(document.activeElement).toBe(q(document.body, '[data-testid=details-assign]'))
    await type(q(document.body, '[data-testid=details-label]') as HTMLInputElement, 'Quote')
    await act(async () => {
      const sel = q(document.body, '[data-testid=details-assign]') as HTMLSelectElement
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'marvin')
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await type(q(document.body, '[data-testid=details-notes]') as HTMLTextAreaElement, 'check port 4')
    await click(q(document.body, '[data-testid=details-save]'))
    expect(ops.patch).toHaveBeenCalledWith([expect.objectContaining({ id: 'id-a.md' })], { assigned_to: 'marvin', label: 'Quote', tags: [], notes: 'check port 4' })
  })
  it('Delete asks first, then removes the selected files and folders', async () => {
    const ops = mkOps()
    const el = await mount(ops)
    await click(q(tile(el, 'a.md'), '[data-testid=tile-main]'))
    await click(ftile(el, 'Plans'), { metaKey: true })
    await ctx(tile(el, 'a.md'))
    await pick('delete')
    expect(q(document.body, '[data-testid=delete-confirm]').textContent).toContain('Delete 2 items?')
    expect(ops.remove).not.toHaveBeenCalled()
    const confirm = qa(document.body, '[data-testid=delete-confirm] button').find((b) => b.textContent === 'Delete')!
    await click(confirm)
    expect(ops.remove).toHaveBeenCalledWith([expect.objectContaining({ id: 'id-a.md' })], [['uploads', 'Plans']])
    expect(picked(el)).toEqual([])
  })
})

describe('keyboard', () => {
  const grid = (el: Element) => q(el, '[data-testid=file-grid]')
  it('arrows move the selection, Shift extends, Enter opens, Cmd A selects all, Esc clears', async () => {
    const el = await mount(mkOps(), { view: 'list' })
    const g = grid(el)
    await key(g, 'ArrowDown')
    expect(picked(el)).toEqual(['d:uploads/Plans'])
    await key(g, 'ArrowDown')
    await key(g, 'ArrowDown')
    expect(picked(el)).toEqual(['id-a.md'])
    await key(g, 'ArrowDown', { shiftKey: true })
    expect(picked(el)).toEqual(['id-a.md', 'id-b.md'])
    await key(g, 'ArrowUp')
    expect(picked(el)).toEqual(['id-a.md'])
    await key(g, 'Enter')
    expect(mounted.opened).toEqual(['a.md'])
    await key(g, 'a', { metaKey: true })
    expect(picked(el).length).toBe(6)
    await key(g, 'Escape')
    expect(picked(el)).toEqual([])
    await key(g, 'End')
    expect(picked(el)).toEqual(['id-d.md'])
    await key(g, 'a', { ctrlKey: true })
    expect(picked(el).length).toBe(6)
  })
  it('Enter on a folder opens it', async () => {
    const el = await mount(mkOps(), { view: 'list' })
    await key(grid(el), 'ArrowDown')
    await key(grid(el), 'Enter')
    expect(mounted.folders).toEqual([['uploads', 'Plans']])
  })
  it('Delete asks for a confirm before removing; F2 renames; Cmd X then Cmd V moves', async () => {
    const ops = mkOps()
    const el = await mount(ops, { view: 'list' })
    const g = grid(el)
    await key(g, 'End')
    await key(g, 'Delete')
    expect(q(document.body, '[data-testid=delete-confirm]')).toBeTruthy()
    expect(ops.remove).not.toHaveBeenCalled()
    await click(qa(document.body, '[data-testid=delete-confirm] button').find((b) => b.textContent === 'Cancel')!)
    expect(ops.remove).not.toHaveBeenCalled()
    await key(g, 'F2')
    expect(q(el, '[data-testid=rename-input]')).toBeTruthy()
    await key(q(el, '[data-testid=rename-input]'), 'Escape')
    await key(g, 'x', { metaKey: true })
    await dbl(ftile(el, 'Quotes'))
    await key(grid(el), 'v', { metaKey: true })
    expect(ops.moveTo).toHaveBeenCalledWith(['id-d.md'], [], ['uploads', 'Quotes'])
  })
  it('Delete does nothing to a read-only selection', async () => {
    const ops = mkOps({ writableDir: () => false })
    const el = await mount(ops, { dir: ['docs'], view: 'list' })
    await key(grid(el), 'End')
    await key(grid(el), 'Delete')
    expect(q(document.body, '[data-testid=delete-confirm]')).toBeNull()
  })
})
