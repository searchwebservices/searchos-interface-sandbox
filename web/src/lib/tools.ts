// Tool specialisation by NAME, exactly as docs/console-v2-spec.md section 3 lists. The name comes from the
// server event; nothing is invented and anything unknown gets the plain card.
import type { ChangeFile, ChangesItem, RunTool, ThreadItem } from './types'

export type ToolKind = 'shell' | 'edit' | 'web' | 'plain'

const SHELL = new Set(['shell', 'bash'])
const EDIT = new Set(['edit', 'write', 'patch', 'multiedit', 'apply_patch'])
const WEB = new Set(['webfetch', 'websearch'])

export function toolKind(name: string): ToolKind {
  const n = String(name || '').toLowerCase()
  if (SHELL.has(n)) return 'shell'
  if (EDIT.has(n)) return 'edit'
  if (WEB.has(n)) return 'web'
  return 'plain'
}

// The server stores one redacted line per tool input (inputSummary), not the full object. The key shown
// beside it is the one inputSummary picks for that tool, so the list is honest about what it holds.
const ARG_KEY: Record<string, string> = {
  shell: 'command',
  bash: 'command',
  read: 'filePath',
  edit: 'filePath',
  write: 'filePath',
  multiedit: 'filePath',
  patch: 'filePath',
  apply_patch: 'patch',
  grep: 'pattern',
  glob: 'pattern',
  webfetch: 'url',
  websearch: 'query',
  task: 'description',
}
export function toolArgs(t: Pick<RunTool, 'name' | 'input_summary'>): { key: string; value: string }[] {
  if (!t.input_summary) return []
  return [{ key: ARG_KEY[String(t.name).toLowerCase()] ?? 'input', value: t.input_summary }]
}

export const LONG_VALUE = 160
export const isLongValue = (v: string): boolean => v.length > LONG_VALUE

export function toolDuration(t: Pick<RunTool, 'started' | 'ended'>): number | null {
  return typeof t.ended === 'number' && typeof t.started === 'number' ? Math.max(0, t.ended - t.started) : null
}

// "exit 1" style hint for a shell result. The server stores only an excerpt, so the exit code is read from
// the text when the tool prints one; otherwise it comes from the status.
export function shellExit(t: Pick<RunTool, 'status' | 'output_excerpt'>): string {
  const m = /exit(?:ed)?(?: with)?(?: code)?[:\s]+(-?\d+)/i.exec(t.output_excerpt || '')
  if (m) return m[1]
  return t.status === 'ok' ? '0' : t.status === 'failed' ? 'failed' : 'running'
}

export interface SourceLink {
  url: string
  host: string
  title: string
}
// Links found in a webfetch or websearch result. Title is the line before the URL when it is plain text,
// else the host. Only http(s).
export function sourcesOf(output: string | undefined): SourceLink[] {
  const text = String(output || '')
  const seen = new Set<string>()
  const out: SourceLink[] = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/https?:\/\/[^\s<>"'`)\]]+/gi)) {
      const url = m[0].replace(/[.,;:!?]+$/, '')
      if (seen.has(url)) continue
      let host = ''
      try {
        const u = new URL(url)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
        host = u.host
      } catch {
        continue
      }
      seen.add(url)
      const before = line.slice(0, m.index).replace(/[\s\-:[(]+$/, '').trim()
      const prev = (lines[i - 1] || '').trim()
      const title = before || (prev && !/https?:\/\//.test(prev) ? prev : '') || host
      out.push({ url, host, title: title.slice(0, 120) })
    }
  })
  return out.slice(0, 8)
}

// The changes card data for a turn: the `changes` item that follows the run in the thread (the server
// emits it right after a mutating turn). Matched by file path against an edit tool's one-line summary.
export function changesAfter(items: ThreadItem[], runId: string): ChangesItem | null {
  const i = items.findIndex((x) => x.id === runId)
  if (i < 0) return null
  for (let j = i + 1; j < items.length; j++) {
    const x = items[j]
    if (x.role === 'changes') return x
    if (x.role === 'run') return null
  }
  return null
}
export function fileFor(changes: ChangesItem | null, t: Pick<RunTool, 'input_summary'>): ChangeFile | null {
  if (!changes) return null
  const s = t.input_summary
  return changes.files.find((f) => s.includes(f.path) || (s.length > 2 && f.path.endsWith(s))) ?? null
}
