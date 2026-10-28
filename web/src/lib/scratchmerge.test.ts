import { describe, expect, it } from 'vitest'
import { dirOfPath, listDir } from './filetree'
import { mergeNote, newLines } from './scratchmerge'

describe('merging a note', () => {
  it('finds only the lines the base did not have, counting repeats', () => {
    expect(newLines('a\nb\n', 'a\nb\nc\n')).toEqual(['c'])
    expect(newLines('a\n', 'a\na\n')).toEqual(['a'])
  })
  it('appends their new lines after ours and keeps all of ours', () => {
    expect(mergeNote('one\n', 'one\nmine\n', 'one\ntheirs\n')).toBe('one\nmine\ntheirs\n')
    expect(mergeNote('one', 'one mine', 'one\ntheirs\n')).toBe('one mine\ntheirs\n')
  })
  it('takes theirs when we changed nothing, and keeps ours when they added nothing', () => {
    expect(mergeNote('a', 'a', 'a\nb\n')).toBe('a\nb\n')
    expect(mergeNote('a\nb', 'a\nmine', 'a')).toBe('a\nmine')
    expect(mergeNote('a', 'x', 'x')).toBe('x')
  })
})

describe('lane file folders', () => {
  const e = (dir: string[], item: string) => ({ dir, item })
  it('uploads sit under one uploads folder, other paths keep their own prefixes', () => {
    expect(dirOfPath('console/data/uploads/hardware/site/a.md', 'hardware')).toEqual(['uploads', 'site'])
    expect(dirOfPath('registry/ports.md', 'hardware')).toEqual(['registry'])
    expect(dirOfPath('console/data/uploads/other/a.md', 'hardware')).toEqual(['console', 'data', 'uploads', 'other'])
  })
  it('lists the files in a folder and one tile per next folder, with counts at any depth', () => {
    const all = [e([], 'root'), e(['a'], 'a1'), e(['a', 'b'], 'ab1'), e(['a', 'b'], 'ab2'), e(['c'], 'c1')]
    expect(listDir(all, [])).toEqual({ folders: [{ name: 'a', count: 3 }, { name: 'c', count: 1 }], files: ['root'] })
    expect(listDir(all, ['a'])).toEqual({ folders: [{ name: 'b', count: 2 }], files: ['a1'] })
    expect(listDir(all, ['a', 'b'])).toEqual({ folders: [], files: ['ab1', 'ab2'] })
  })
})
