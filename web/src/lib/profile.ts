// Profile and mention helpers shared by the profile page, the composer and the message text. The tag rules mirror
// console/lib/chat.js (the console is the authority; this only saves a round trip).
import * as prefs from './prefs'
import type { FontChoice, PrefValues, PublicProfile, StoredPrefs } from './types'

export const TAG_RE = /^[a-z0-9][a-z0-9_-]{1,23}$/
export const NAME_MAX = 60
export const GILFOYLE_ID = 'gilfoyle'
export const ZOOM_CHOICES = [100, 115, 130] as const
export const FONT_CHOICES: { id: FontChoice; label: string; note: string }[] = [
  { id: 'system', label: 'System sans', note: 'Your device font' },
  { id: 'montserrat', label: 'Montserrat', note: 'Open licence (OFL), the default' },
  { id: 'space-grotesk', label: 'Space Grotesk', note: 'Open licence (OFL), a little cyber' },
]

export type ProfileErrors = { name?: string; tag?: string }

export const TAG_MESSAGES: Record<string, string> = {
  format: 'Use 2 to 24 lowercase letters, numbers, hyphens or underscores, starting with a letter or number.',
  taken: 'Someone already uses that tag.',
  reserved: 'That tag belongs to Gilfoyle.',
}
export const NAME_MESSAGES: Record<string, string> = {
  required: 'A name is required.',
  too_long: 'Keep the name under ' + NAME_MAX + ' characters.',
}

export const normTag = (raw: string): string => raw.trim().replace(/^@/, '').toLowerCase()

// Same rules as the console. `all` is every known profile; `selfId` is the person editing.
export function validateProfile(form: { name: string; tag: string }, all: PublicProfile[], selfId: string): ProfileErrors {
  const out: ProfileErrors = {}
  const name = form.name.replace(/\s+/g, ' ').trim()
  if (!name) out.name = NAME_MESSAGES.required
  else if (name.length > NAME_MAX) out.name = NAME_MESSAGES.too_long
  const tag = normTag(form.tag)
  if (!TAG_RE.test(tag)) out.tag = TAG_MESSAGES.format
  else if (tag === 'gilfoyle' && selfId !== GILFOYLE_ID) out.tag = TAG_MESSAGES.reserved
  else if (all.some((p) => p.person_id !== selfId && p.tag === tag)) out.tag = TAG_MESSAGES.taken
  return out
}

// ---------------------------------------------------------------- mentions

// Same pattern as the console: not glued to a word, not an email.
export const MENTION_RE = /(?<![A-Za-z0-9_@])@([A-Za-z0-9][A-Za-z0-9_-]{1,23})(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/g

export type Seg = { kind: 'text'; text: string } | { kind: 'mention'; text: string; tag: string }

// Splits text into plain runs and @tag runs. Plain runs are rendered as text by React (escaped), never as markup.
export function mentionSegments(text: string): Seg[] {
  const out: Seg[] = []
  let last = 0
  for (const m of text.matchAll(MENTION_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ kind: 'text', text: text.slice(last, i) })
    out.push({ kind: 'mention', text: m[0], tag: m[1].toLowerCase() })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

export interface ActiveMention {
  start: number // index of the @
  query: string
}
// The @word being typed at the caret, or null. The @ must start the text or follow whitespace.
export function activeMention(text: string, caret: number): ActiveMention | null {
  const before = text.slice(0, caret)
  const m = before.match(/(^|\s)@([A-Za-z0-9_-]{0,24})$/)
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2].toLowerCase() }
}

export interface Candidate {
  id: string
  tag: string
  name: string
  avatar: string | null
}
export function filterCandidates(list: Candidate[], query: string): Candidate[] {
  const q = query.toLowerCase()
  const score = (c: Candidate) => (c.tag.startsWith(q) ? 0 : c.name.toLowerCase().startsWith(q) ? 1 : c.tag.includes(q) || c.name.toLowerCase().includes(q) ? 2 : 3)
  return list
    .filter((c) => score(c) < 3)
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
}
// Replaces the @query before the caret with @tag and a space. Returns the new text and where the caret goes.
export function insertMention(text: string, am: ActiveMention, caret: number, tag: string): { text: string; caret: number } {
  const ins = '@' + tag + ' '
  return { text: text.slice(0, am.start) + ins + text.slice(caret), caret: am.start + ins.length }
}

// ---------------------------------------------------------------- prefs

export function effectivePrefs(p: StoredPrefs | null, deviceId: string | undefined): PrefValues {
  if (!p) return {}
  return { ...p.default, ...((deviceId && p.devices[deviceId]) || {}) }
}

// Applies the effective prefs to the document and caches them for first paint. Missing keys leave the device as it is.
export function applyEffective(e: PrefValues): void {
  if (e.theme) {
    prefs.set(prefs.keys.theme, e.theme)
    prefs.applyTheme(e.theme)
  }
  if (e.zoom) {
    prefs.set(prefs.keys.zoom, e.zoom / 100)
    prefs.applyZoom(e.zoom / 100)
  }
  if (e.font) {
    prefs.set(prefs.keys.font, e.font)
    prefs.applyFont(e.font)
  }
  if (e.reduced_motion !== undefined) {
    const m = e.reduced_motion ? 'reduce' : 'allow'
    prefs.set(prefs.keys.motion, m)
    prefs.applyMotion(m)
  }
}

// Crop geometry for a square avatar: the source rectangle of an image of w x h at `zoom` (1 = the short side fills the
// square), centred on (fx, fy) in 0..1 image coordinates and kept inside the image.
export function cropRect(w: number, h: number, zoom: number, fx: number, fy: number): { sx: number; sy: number; side: number } {
  const side = Math.max(1, Math.min(w, h) / Math.max(1, zoom))
  const sx = Math.min(Math.max(0, fx * w - side / 2), Math.max(0, w - side))
  const sy = Math.min(Math.max(0, fy * h - side / 2), Math.max(0, h - side))
  return { sx, sy, side }
}
