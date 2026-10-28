// The quiet line for an answered ask. replied_by is a person id (older rows) or an object
// {person, device_id, device_name, ip, mac} (console/lib/events.js), so it is never printed raw.
import type { AskItem, Decision } from './types'
import { displayName, relTime } from './time'

const LABEL: Record<Decision, string> = { once: 'Allowed once', always: 'Allowed always', reject: 'Denied' }

export function askWho(item: AskItem, people: Record<string, string>): { name: string; device: string } {
  const rb = item.replied_by as unknown
  const person = rb && typeof rb === 'object' ? String((rb as { person?: unknown }).person ?? '') : typeof rb === 'string' ? rb : ''
  const device = rb && typeof rb === 'object' ? String((rb as { device_name?: unknown }).device_name ?? '') : ''
  const dev = device || item.signature?.device_name || item.signature?.device || ''
  return { name: person ? people[person] || displayName(person) : '', device: dev }
}

export function askLine(item: AskItem, people: Record<string, string>, now?: number): string {
  if (item.state === 'closed') return 'Closed (dropped by a restart)'
  if (item.state === 'open') return ''
  const { name, device } = askWho(item, people)
  const when = item.replied_at ? relTime(item.replied_at, now) : ''
  return LABEL[item.state] + (name ? ' by ' + name : '') + (device ? ' (' + device + ')' : '') + (when ? ', ' + when : '')
}

// Inside a group: "Permission: shell, allowed once by Bay (Bay MacBook Pro), 2 min ago".
export function askGroupLine(item: AskItem, people: Record<string, string>, now?: number): string {
  const line = askLine(item, people, now)
  return 'Permission: ' + item.ask.action + ', ' + line.charAt(0).toLowerCase() + line.slice(1)
}
