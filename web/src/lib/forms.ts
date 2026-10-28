// Pure helpers for the FormCard (docs/forms-spec.md, console/lib/forms.js, console/ui/cards.js formNode).
// Pages are a presentation layer over one flat field list: metadata.pages, one page at a time, required checks per
// page, one submit at the end. The server checks the answer again; these rules only save a round trip.
import type { FormDef, FormField, FormItem, FormOption } from './types'

export type Values = Record<string, unknown>
export interface Page {
  heading: string
  intro: string
  keys: string[]
}

// Fewer than six options are radios, six or more a select.
export const RADIO_MAX = 5

export const has = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)

export const fieldsOf = (f: FormDef): FormField[] => (f.fields ?? []).filter((x) => x && typeof x.key === 'string')

export const initialValues = (f: FormDef): Values => {
  const v: Values = {}
  for (const x of fieldsOf(f)) if (x.default !== undefined) v[x.key] = Array.isArray(x.default) ? x.default.slice() : x.default
  return v
}

// The `when` rule: every condition must hold. An unanswered controlling field equals nothing.
export const isVisible = (x: FormField, vals: Values): boolean =>
  !x.hidden && (x.when ?? []).every((w) => (w.op === 'neq' ? vals[w.key] !== w.value : vals[w.key] === w.value))

// The declared pages, plus a last page for any field they forgot, or one page for everything.
export function pagesOf(f: FormDef): Page[] {
  const fields = fieldsOf(f)
  const known = new Set(fields.map((x) => x.key))
  const declared = f.metadata?.pages
  const pages: Page[] =
    Array.isArray(declared) && declared.length
      ? declared
          .filter((p) => p && typeof p === 'object')
          .map((p) => ({ heading: p.heading ?? '', intro: p.intro ?? '', keys: (p.keys ?? []).filter((k) => known.has(k)) }))
      : [{ heading: '', intro: '', keys: fields.map((x) => x.key) }]
  const placed = new Set(pages.flatMap((p) => p.keys))
  const rest = fields.filter((x) => !placed.has(x.key)).map((x) => x.key)
  if (rest.length) pages.push({ heading: pages.length ? 'More' : '', intro: '', keys: rest })
  return pages
}

export const hasPages = (f: FormDef): boolean => Array.isArray(f.metadata?.pages) && f.metadata!.pages!.length > 0

const byKeyOf = (f: FormDef): Map<string, FormField> => new Map(fieldsOf(f).map((x) => [x.key, x]))

// A page is live when it has no fields (an intro page) or at least one visible field.
export function livePages(f: FormDef, vals: Values): number[] {
  const by = byKeyOf(f)
  return pagesOf(f)
    .map((p, i) => (!p.keys.length || p.keys.some((k) => isVisible(by.get(k)!, vals)) ? i : -1))
    .filter((i) => i >= 0)
}

export function fieldError(x: FormField, v: unknown): string | null {
  if (!has(v)) return x.required && x.type !== 'external' ? 'Required' : null
  if (x.type === 'string') {
    const s = String(v)
    if (typeof x.minLength === 'number' && s.length < x.minLength) return 'At least ' + x.minLength + ' characters'
    if (typeof x.maxLength === 'number' && s.length > x.maxLength) return 'At most ' + x.maxLength + ' characters'
    if (x.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Not a valid email'
    if (x.format === 'uri') {
      try {
        new URL(s)
      } catch {
        return 'Not a valid link'
      }
    }
    if (x.pattern) {
      try {
        if (!new RegExp(x.pattern).test(s)) return 'Not in the expected format'
      } catch {
        /* a bad pattern is the form author's problem */
      }
    }
  } else if (x.type === 'number' || x.type === 'integer') {
    if (typeof v !== 'number' || !isFinite(v)) return 'Not a number'
    if (x.type === 'integer' && !Number.isInteger(v)) return 'A whole number'
    if (typeof x.minimum === 'number' && v < x.minimum) return 'At least ' + x.minimum
    if (typeof x.maximum === 'number' && v > x.maximum) return 'At most ' + x.maximum
  } else if (x.type === 'multiselect' && Array.isArray(v)) {
    if (typeof x.minItems === 'number' && v.length < x.minItems) return 'Pick at least ' + x.minItems
    if (typeof x.maxItems === 'number' && v.length > x.maxItems) return 'Pick at most ' + x.maxItems
  }
  return null
}

// Errors for the visible fields of one page, by key. Empty when the page is clean.
export function pageErrors(f: FormDef, pageIndex: number, vals: Values): Record<string, string> {
  const by = byKeyOf(f)
  const out: Record<string, string> = {}
  for (const k of pagesOf(f)[pageIndex]?.keys ?? []) {
    const x = by.get(k)
    if (!x || !isVisible(x, vals)) continue
    const e = fieldError(x, vals[k])
    if (e) out[k] = e
  }
  return out
}

// The first live page with an error, or -1: submit checks every live page, not just the one in view.
export function firstBadPage(f: FormDef, vals: Values): number {
  for (const i of livePages(f, vals)) if (Object.keys(pageErrors(f, i, vals)).length) return i
  return -1
}

// Only visible, answered fields go to the server.
export function answerOf(f: FormDef, vals: Values): Values {
  const a: Values = {}
  for (const x of fieldsOf(f)) if (x.type !== 'external' && isVisible(x, vals) && has(vals[x.key])) a[x.key] = vals[x.key]
  return a
}

export interface Step {
  index: number
  label: string
  state: 'done' | 'current' | 'todo'
}

// The top stepper: live pages numbered in order; earlier than the current is done.
export function stepperOf(f: FormDef, vals: Values, current: number): Step[] {
  const pages = pagesOf(f)
  const live = livePages(f, vals)
  const at = live.indexOf(current)
  return live.map((i, n) => ({ index: i, label: pages[i].heading || 'Step ' + (n + 1), state: n < at ? 'done' : n === at ? 'current' : 'todo' }))
}

export const optionLabel = (o: FormOption): string => o.label || o.value

export type Control = 'external' | 'boolean' | 'multiselect' | 'select' | 'radio' | 'textarea' | 'text' | 'number'
export function controlOf(x: FormField): Control {
  if (x.type === 'external') return 'external'
  if (x.type === 'boolean') return 'boolean'
  if (x.type === 'multiselect') return 'multiselect'
  if (x.type === 'number' || x.type === 'integer') return 'number'
  if (x.options && x.options.length > RADIO_MAX) return 'select'
  if (x.options && x.options.length) return 'radio'
  if (!x.format && typeof x.maxLength === 'number' && x.maxLength > 160) return 'textarea'
  return 'text'
}

const INPUT_TYPES: Record<string, string> = { email: 'email', uri: 'url', date: 'date', 'date-time': 'datetime-local' }
export const inputTypeOf = (x: FormField): string => INPUT_TYPES[x.format ?? ''] ?? 'text'

// Server per-field errors ({fields: {key: 'is required'}}) -> text under the field, and the page to show.
export function serverErrors(f: FormDef, fields: Record<string, string>): { errors: Record<string, string>; page: number } {
  const by = byKeyOf(f)
  const errors: Record<string, string> = {}
  for (const [k, e] of Object.entries(fields)) errors[k] = k === '_' ? e : (by.get(k)?.title || k) + ' ' + e
  const pages = pagesOf(f)
  return { errors, page: pages.findIndex((p) => p.keys.some((k) => errors[k])) }
}

// The settled line: "Answered by Marvin, 3 of 3" or "Cancelled".
export function settledLine(item: FormItem, people: Record<string, string>): string {
  const by = item.replied_by ?? {}
  const who = by.person ? people[by.person] || by.person : by.via === 'opencode' ? 'OpenCode' : ''
  if (item.state === 'answered') {
    const n = item.summary
    return 'Answered' + (who ? ' by ' + who : '') + (n && typeof n.total === 'number' ? ', ' + n.answered + ' of ' + n.total : '')
  }
  return 'Cancelled' + (who ? ' by ' + who : '')
}
