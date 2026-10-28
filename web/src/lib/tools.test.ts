import { describe, expect, it } from 'vitest'
import { sourcesOf, toolArgs, toolKind } from './tools'

describe('tool specialisation by name', () => {
  it('maps names exactly as the spec lists', () => {
    for (const n of ['shell', 'bash']) expect(toolKind(n)).toBe('shell')
    for (const n of ['edit', 'write', 'patch', 'multiedit', 'apply_patch']) expect(toolKind(n)).toBe('edit')
    for (const n of ['webfetch', 'websearch']) expect(toolKind(n)).toBe('web')
    for (const n of ['read', 'grep', 'glob', 'mystery']) expect(toolKind(n)).toBe('plain')
  })
  it('reads sources out of a result that carries urls', () => {
    const s = sourcesOf('Example Domain - https://example.com/a.\nsecond https://example.com/a and http://x.org/p?q=1')
    expect(s.map((x) => x.host)).toEqual(['example.com', 'x.org'])
    expect(s[0].title).toBe('Example Domain')
  })
  it('ignores non http urls and empty results', () => {
    expect(sourcesOf('javascript:alert(1) ftp://x')).toEqual([])
    expect(sourcesOf(undefined)).toEqual([])
  })
  it('keys the one-line summary by tool', () => {
    expect(toolArgs({ name: 'bash', input_summary: 'ls' })).toEqual([{ key: 'command', value: 'ls' }])
    expect(toolArgs({ name: 'x', input_summary: '' })).toEqual([])
  })
})
