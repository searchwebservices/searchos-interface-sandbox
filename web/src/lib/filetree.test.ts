import { describe, expect, it } from 'vitest'
import { folderOfDir, folderSegs, isInside, listDir, sameDir, treeOf, treeSegments, uploadsDir } from './filetree'

// Rows as the manifest (console/data/files.json) carries them: a logical folder, never the storage id.
const rows = [
  { id: '0b9f4c2e-1111-4222-8333-444455556666', name: 'invoice.pdf', folder: '' },
  { id: '1c9f4c2e-1111-4222-8333-444455556666', name: 'photo.png', folder: '' },
  { id: '2d9f4c2e-1111-4222-8333-444455556666', name: 'quote-a.pdf', folder: 'Garage quotes/2026' },
  { id: '3e9f4c2e-1111-4222-8333-444455556666', name: 'quote-b.pdf', folder: 'Garage quotes/2026' },
  { id: '4f9f4c2e-1111-4222-8333-444455556666', name: 'old.pdf', folder: 'Garage quotes/2025' },
  { id: '5a9f4c2e-1111-4222-8333-444455556666', name: 'plan.md', folder: 'Plans' },
  { id: '6b9f4c2e-1111-4222-8333-444455556666', name: 'legacy.md', folder: null },
]

describe('the uploads tree', () => {
  const tree = treeOf(rows)
  it('uploads is one master folder: its files sit at the root, not under an id', () => {
    const root = tree.at(['uploads'])
    expect(root.files.map((f) => f.name).sort()).toEqual(['invoice.pdf', 'legacy.md', 'photo.png'])
    expect(root.folders.map((f) => f.name)).toEqual(['Garage quotes', 'Plans'])
  })
  it('an uploaded folder shows with its name and counts the files under it at any depth', () => {
    expect(tree.at(['uploads']).folders.find((f) => f.name === 'Garage quotes')!.count).toBe(3)
    const gq = tree.at(['uploads', 'Garage quotes'])
    expect(gq.files).toEqual([])
    expect(gq.folders).toEqual([{ name: '2025', count: 1 }, { name: '2026', count: 2 }])
    expect(tree.at(['uploads', 'Garage quotes', '2026']).files.map((f) => f.name)).toEqual(['quote-a.pdf', 'quote-b.pdf'])
  })
  it('no id ever shows as a folder name', () => {
    const seen = new Set<string>()
    const walk = (dir: string[]) => {
      const l = tree.at(dir)
      for (const f of l.folders) {
        seen.add(f.name)
        walk([...dir, f.name])
      }
    }
    walk(['uploads'])
    expect([...seen].some((n) => /[0-9a-f]{8}-[0-9a-f]{4}/.test(n))).toBe(false)
  })
  it('explicit empty folders appear with no files, and do not hide rows', () => {
    const t = treeOf(rows, ['Empty', 'Plans', 'Garage quotes/2027'])
    expect(t.at(['uploads']).folders.map((f) => [f.name, f.count])).toEqual([['Empty', 0], ['Garage quotes', 3], ['Plans', 1]])
    expect(t.at(['uploads', 'Garage quotes']).folders.map((f) => f.name)).toEqual(['2025', '2026', '2027'])
  })
  it('a storage path drops its id segment, so an upload listed by path shows in uploads', () => {
    const id = '0b9f4c2e-1111-4222-8333-444455556666'
    expect(treeSegments('console/data/uploads/hardware/' + id + '/a.pdf', 'hardware')).toEqual(['uploads', 'a.pdf'])
    expect(treeSegments('console/data/uploads/hardware/site/a.pdf', 'hardware')).toEqual(['uploads', 'site', 'a.pdf'])
    expect(treeSegments('registry/ports.md', 'hardware')).toEqual(['registry', 'ports.md'])
  })
  it('helpers for dirs', () => {
    expect(folderSegs('a/b')).toEqual(['a', 'b'])
    expect(folderSegs('')).toEqual([])
    expect(uploadsDir('a/b')).toEqual(['uploads', 'a', 'b'])
    expect(folderOfDir(['uploads', 'a', 'b'])).toBe('a/b')
    expect(folderOfDir(['docs', 'a'])).toBeNull()
    expect(isInside(['uploads', 'a', 'b'], ['uploads', 'a'])).toBe(true)
    expect(isInside(['uploads', 'a'], ['uploads', 'a', 'b'])).toBe(false)
    expect(sameDir(['a'], ['a'])).toBe(true)
  })
  it('listDir still lists repo folders by their prefixes', () => {
    const entries = [{ dir: ['registry'], item: 'ports.md' }, { dir: ['docs', 'hardware'], item: 'w.md' }]
    expect(listDir(entries, []).folders.map((f) => f.name)).toEqual(['docs', 'registry'])
  })
})
