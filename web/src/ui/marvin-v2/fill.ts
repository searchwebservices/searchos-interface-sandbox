// Turns a cheat sheet prompt into what the composer shows. Pure, so the tests lean on it.
import type { CheatSection } from './cheatsheet.types'

// A placeholder is a short angle bracket word such as <ip>, <device> or <file>.
const PLACEHOLDER = /<[A-Za-z][A-Za-z0-9 _-]{0,30}>/

export interface Filled {
  text: string
  start: number
  end: number
}

// An empty box, or one that still holds an unedited suggestion, takes the prompt as it is. Anything the person
// typed stays, and the prompt goes under it. The selection is the first placeholder, or a caret at the end.
export function placePrompt(current: string, prompt: string, known: readonly string[]): Filled {
  const cur = current.trim()
  const base = !cur || known.includes(cur) ? '' : current.replace(/\s+$/, '') + '\n\n'
  const text = base + prompt
  const m = PLACEHOLDER.exec(prompt)
  if (m) {
    const start = base.length + m.index
    return { text, start, end: start + m[0].length }
  }
  return { text, start: text.length, end: text.length }
}

export const allPrompts = (sections: readonly CheatSection[]): string[] => sections.flatMap((s) => s.items.map((i) => i.prompt.trim()))

export function findItem(sections: readonly CheatSection[], id: string) {
  for (const s of sections) {
    const hit = s.items.find((i) => i.id === id)
    if (hit) return hit
  }
  return undefined
}

// Every unfilled placeholder token in a text, in order.
export function placeholders(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  const re = new RegExp(PLACEHOLDER.source, 'g')
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ start: m.index, end: m.index + m[0].length })
  return out
}

// Where Tab goes next: the first placeholder that starts at or after the end of the selection, wrapping to the first.
// The token that is already the selection does not count (it is where the caret is), so a lone token returns null and
// Tab behaves normally. Null also when no placeholder is left.
export function nextPlaceholder(text: string, selStart: number, selEnd: number): { start: number; end: number } | null {
  const all = placeholders(text).filter((p) => !(p.start === selStart && p.end === selEnd))
  if (!all.length) return null
  return all.find((p) => p.start >= selEnd) ?? all[0]
}
