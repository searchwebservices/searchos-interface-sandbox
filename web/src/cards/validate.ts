// The subset of JSON Schema the card schemas use: type (one or a list), required, properties, enum, items,
// minItems, maxLength. Same rules and same messages as console/lib/cards/index.js; cards.test.tsx proves parity.
import { ENVELOPE, KINDS, SCHEMAS } from './schemas'

export interface Schema {
  type?: string | string[]
  required?: string[]
  properties?: Record<string, Schema>
  enum?: unknown[]
  items?: Schema
  minItems?: number
  maxLength?: number
}

const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
function isType(name: string, v: unknown): boolean {
  switch (name) {
    case 'string':
      return typeof v === 'string'
    case 'number':
      return typeof v === 'number' && Number.isFinite(v)
    case 'integer':
      return Number.isInteger(v)
    case 'boolean':
      return typeof v === 'boolean'
    case 'null':
      return v === null
    case 'array':
      return Array.isArray(v)
    case 'object':
      return v !== null && typeof v === 'object' && !Array.isArray(v)
    default:
      return true
  }
}

export function validate(schema: Schema | undefined, value: unknown, at = 'data'): string[] {
  const errs: string[] = []
  if (!schema || typeof schema !== 'object') return errs
  if (schema.type !== undefined) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!names.some((n) => isType(n, value))) return [`${at}: expected ${names.join(' or ')}, got ${typeOf(value)}`]
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errs.push(`${at}: must be one of ${schema.enum.join(', ')}`)
  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength) errs.push(`${at}: longer than ${schema.maxLength} characters`)
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errs.push(`${at}: needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`)
    if (schema.items) value.forEach((x, i) => errs.push(...validate(schema.items, x, `${at}[${i}]`)))
  }
  if (isType('object', value)) {
    const o = value as Record<string, unknown>
    for (const k of schema.required ?? []) if (o[k] === undefined) errs.push(`${at}.${k}: required`)
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (o[k] !== undefined) errs.push(...validate(sub, o[k], `${at}.${k}`))
  }
  return errs
}

export function validateCard(card: unknown): { ok: boolean; errors: string[] } {
  const errors = validate(ENVELOPE, card, 'card')
  const c = isType('object', card) ? (card as Record<string, unknown>) : null
  if (c && typeof c.kind === 'string') {
    if (!(KINDS as readonly string[]).includes(c.kind)) errors.unshift(`unknown card kind "${c.kind.slice(0, 60)}"`)
    else if (isType('object', c.data)) errors.push(...validate(SCHEMAS[c.kind as keyof typeof SCHEMAS], c.data, 'data'))
  }
  // Same rule as semanticErrors in console/lib/cards/index.js: an executable script must list its permissions.
  if (!errors.length && c && c.kind === 'script' && isType('object', c.data)) {
    const d = c.data as Record<string, unknown>
    if (d.executable === true && !(Array.isArray(d.permissions) && d.permissions.length > 0)) errors.push('data.permissions: an executable script must list the permissions it needs')
  }
  const p = c && isType('object', c.provenance) ? (c.provenance as Record<string, unknown>) : null
  if (p && typeof p.at === 'string' && Number.isNaN(Date.parse(p.at))) errors.push('card.provenance.at: not a date')
  if (c && typeof c.at === 'string' && Number.isNaN(Date.parse(c.at))) errors.push('card.at: not a date')
  return { ok: errors.length === 0, errors }
}
