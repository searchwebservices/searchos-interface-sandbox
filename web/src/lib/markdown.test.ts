import { describe, expect, it } from 'vitest'
import { commandsOf, isShellBlock, splitFences } from './markdown'

describe('command-block rule', () => {
  it('bash, sh, zsh and console are command blocks', () => {
    for (const l of ['bash', 'sh', 'zsh', 'console', 'BASH', 'shell']) expect(isShellBlock(l, ['echo hi'])).toBe(true)
  })
  it('other languages are not, unless a line starts with "$ "', () => {
    expect(isShellBlock('js', ['const a = 1'])).toBe(false)
    expect(isShellBlock('', ['plain text'])).toBe(false)
    expect(isShellBlock('', ['$ ls -la'])).toBe(true)
    expect(isShellBlock('text', ['  $ whoami'])).toBe(true)
  })
  it('one command per line, comments are plain text', () => {
    expect(commandsOf('# list\nls -la\ncd /tmp')).toEqual([
      { kind: 'text', text: '# list' },
      { kind: 'cmd', text: 'ls -la' },
      { kind: 'cmd', text: 'cd /tmp' },
    ])
  })
  it('backslash continuations stay inside one command', () => {
    const p = commandsOf('docker run \\\n  -it ubuntu\nls')
    expect(p).toHaveLength(2)
    expect(p[0].kind).toBe('cmd')
    expect(p[0].text.startsWith('docker run')).toBe(true)
    expect(p[0].text).toContain('-it ubuntu')
  })
  it('with "$ " lines only those are commands and the rest is output', () => {
    expect(commandsOf('$ ls\nfile.txt\n$ pwd\n/home')).toEqual([
      { kind: 'cmd', text: 'ls' },
      { kind: 'text', text: 'file.txt' },
      { kind: 'cmd', text: 'pwd' },
      { kind: 'text', text: '/home' },
    ])
  })
  it('blank lines are dropped and trailing blanks ignored', () => {
    expect(commandsOf('ls\n\n\npwd\n\n')).toEqual([
      { kind: 'cmd', text: 'ls' },
      { kind: 'cmd', text: 'pwd' },
    ])
  })
})

describe('splitFences', () => {
  it('splits prose and fences and marks shell blocks', () => {
    const segs = splitFences('Run this:\n\n```bash\nls\n```\n\nThen:\n\n```js\nlet a\n```\nDone.')
    expect(segs.map((s) => s.type)).toEqual(['md', 'code', 'md', 'code', 'md'])
    expect(segs[1]).toMatchObject({ lang: 'bash', shell: true, open: false })
    expect(segs[3]).toMatchObject({ lang: 'js', shell: false })
  })
  it('an unclosed fence (a reply still streaming) is an open code segment', () => {
    const segs = splitFences('go:\n```sh\nsudo systemctl')
    expect(segs[1]).toMatchObject({ type: 'code', shell: true, open: true, code: 'sudo systemctl' })
  })
  it('an unlabelled fence with "$ " lines is a command block', () => {
    const segs = splitFences('```\n$ ls\n```')
    expect(segs[0]).toMatchObject({ type: 'code', shell: true })
  })
})
