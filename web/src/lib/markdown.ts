// The command-block rule from console/ui/markdown.js, as pure functions.
// A fenced block is a command block when its language is bash, sh, zsh or console (the old file also
// accepts shell, terminal and the -session variants), or when any line starts with "$ ".

const SHELL = /^(bash|sh|shell|zsh|console|terminal|shell-session|sh-session)$/i

export const isShellBlock = (lang: string | undefined, lines: string[]): boolean =>
  SHELL.test(lang || '') || lines.some((l) => /^\s*\$ /.test(l))

export interface CommandPart {
  kind: 'cmd' | 'text'
  text: string
}

// Splits a shell block into commands and plain lines. Backslash continuations stay inside one command.
// When any line starts with "$ ", only those lines are commands and the rest is output.
export function commandsOf(code: string): CommandPart[] {
  const lines = String(code ?? '').replace(/\r/g, '').split('\n')
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  const prompted = lines.some((l) => /^\s*\$ /.test(l))
  const out: CommandPart[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const isCmd = prompted ? /^\s*\$ /.test(line) : !/^\s*#/.test(line)
    if (!isCmd) {
      out.push({ kind: 'text', text: line })
      continue
    }
    let cmd = prompted ? line.replace(/^\s*\$ /, '') : line.trim()
    while (/\\\s*$/.test(cmd) && i + 1 < lines.length) {
      i++
      cmd += '\n' + lines[i].replace(/^\s*(\$ )?/, prompted ? '' : '$&')
    }
    out.push({ kind: 'cmd', text: cmd.replace(/[ \t]+$/gm, '') })
  }
  return out
}

export type Segment =
  | { type: 'md'; text: string }
  | { type: 'code'; lang: string; code: string; shell: boolean; open: boolean }

// Splits markdown into prose and fenced blocks. An unclosed fence (a reply still streaming) is a code
// segment with open: true. Prose segments go to the Response component untouched.
export function splitFences(src: string): Segment[] {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: Segment[] = []
  let prose: string[] = []
  const flush = () => {
    const t = prose.join('\n')
    if (t.trim()) out.push({ type: 'md', text: t })
    prose = []
  }
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(/^\s*(```|~~~)\s*([\w+-]*)[^\n]*$/)
    if (!m) {
      prose.push(lines[i++])
      continue
    }
    flush()
    const fence = m[1]
    const lang = m[2]
    const buf: string[] = []
    i++
    let open = true
    while (i < lines.length) {
      if (lines[i].trim().startsWith(fence)) {
        open = false
        i++
        break
      }
      buf.push(lines[i++])
    }
    out.push({ type: 'code', lang, code: buf.join('\n'), shell: isShellBlock(lang, buf), open })
  }
  flush()
  return out
}
