// Merging two edits of the same note without losing either. Gilfoyle appends lines; a person edits anywhere. When a
// save finds a newer version, the other side's new lines (the ones not in the version we both started from) are
// appended after ours. Nothing of ours is dropped, and nothing of theirs that is new is dropped.

// The lines of `theirs` that `base` did not have, in order. Counted, so a repeated line only counts as old as many
// times as the base had it.
export function newLines(base: string, theirs: string): string[] {
  const have = new Map<string, number>()
  for (const l of base.split('\n')) have.set(l, (have.get(l) ?? 0) + 1)
  const out: string[] = []
  for (const l of theirs.split('\n')) {
    const n = have.get(l) ?? 0
    if (n > 0) have.set(l, n - 1)
    else out.push(l)
  }
  // A trailing empty line is just the final newline.
  while (out.length && out[out.length - 1] === '') out.pop()
  return out
}

export function mergeNote(base: string, mine: string, theirs: string): string {
  if (theirs === mine || theirs === base) return mine
  if (mine === base) return theirs
  const add = newLines(base, theirs).filter((l, i, all) => l.trim() !== '' || all.some((x, j) => j > i && x.trim() !== ''))
  if (!add.length) return mine
  return mine + (mine === '' || mine.endsWith('\n') ? '' : '\n') + add.join('\n') + '\n'
}
