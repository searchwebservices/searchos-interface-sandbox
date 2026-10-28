// Side by side rows from a unified diff, or from a before and after text. Pure.
export interface SideRow {
  left: string | null
  right: string | null
  kind: 'ctx' | 'del' | 'add' | 'chg' | 'hunk'
}

export function sideBySide(unified: string): SideRow[] {
  const rows: SideRow[] = []
  let dels: string[] = []
  let adds: string[] = []
  let inHunk = false
  const flush = () => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) {
      const l = dels[i] ?? null
      const r = adds[i] ?? null
      rows.push({ left: l, right: r, kind: l !== null && r !== null ? 'chg' : l !== null ? 'del' : 'add' })
    }
    dels = []
    adds = []
  }
  for (const line of unified.split('\n')) {
    if (line.startsWith('@@')) {
      flush()
      inHunk = true
      rows.push({ left: line, right: line, kind: 'hunk' })
    } else if (!inHunk && (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index '))) {
      continue
    } else if (line.startsWith('-')) dels.push(line.slice(1))
    else if (line.startsWith('+')) adds.push(line.slice(1))
    else {
      flush()
      const t = line.startsWith(' ') ? line.slice(1) : line
      rows.push({ left: t, right: t, kind: 'ctx' })
    }
  }
  flush()
  return rows
}

// No diff text: show the two texts line against line.
export function beforeAfter(before: string, after: string): SideRow[] {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  const rows: SideRow[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const l = a[i] ?? null
    const r = b[i] ?? null
    rows.push({ left: l, right: r, kind: l === r ? 'ctx' : l !== null && r !== null ? 'chg' : l !== null ? 'del' : 'add' })
  }
  return rows
}
