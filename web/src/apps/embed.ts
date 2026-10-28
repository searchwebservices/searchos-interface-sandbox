// Shared helpers for the two embedded apps (CRM, Plane): the console theme and the context lines for Ask Jared.
import { useEffect, useState } from 'react'

export type ThemeValue = 'light' | 'dark'
const current = (): ThemeValue => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')

// The console theme as the html element carries it, live: applyTheme toggles the `dark` class.
export function useThemeValue(): ThemeValue {
  const [v, setV] = useState<ThemeValue>(current)
  useEffect(() => {
    setV(current())
    const mo = new MutationObserver(() => setV(current()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return v
}

const clean = (s: unknown, max = 80): string => (typeof s === 'string' ? s.replace(/[\]\n\r]+/g, ' ').trim().slice(0, max) : '')
const singular = (r: string): string => r.replace(/ies$/, 'y').replace(/s$/, '')

// ask + prompt: the CRM's "Ask Jared about this" (Home page): the dock opens with the composer prefilled.
export interface CrmContextMsg { type: 'crm.context'; route?: string; resource?: string; id?: string | number; name?: string; title?: string; label?: string; tab?: string; ask?: boolean; prompt?: string }
export const askPromptOf = (m: CrmContextMsg): string | null => (m.ask === true && typeof m.prompt === 'string' && m.prompt.trim() ? m.prompt.replace(/\s+/g, ' ').trim().slice(0, 2000) : null)
export const isCrmContext = (d: unknown): d is CrmContextMsg => !!d && typeof d === 'object' && (d as { type?: unknown }).type === 'crm.context'

// "CRM deal 9: Acme (#/deals/9)"
export function crmContextLine(m: CrmContextMsg | null): string {
  if (!m) return 'CRM'
  const route = clean(m.route, 120)
  const res = clean(m.resource, 30)
  const id = m.id === undefined || m.id === null ? '' : clean(String(m.id), 40)
  const name = clean(m.name ?? m.title ?? m.label)
  const head = res ? 'CRM ' + singular(res) + (id ? ' ' + id : '') : 'CRM'
  const tab = clean(m.tab, 30)
  return head + (name ? ': ' + name : '') + (tab ? ', ' + tab + ' tab' : '') + (route ? ' (' + route + ')' : '')
}

// Plane paths: /<workspace>/browse/KEY-12/ (work item), /<workspace>/projects/<id>/... (project, optionally .../issues/<id>).
export function pmContextLine(pathname: string, prefix = '/v2/apps/pm'): string {
  let p = pathname
  if (p.startsWith(prefix)) p = p.slice(prefix.length)
  p = p.replace(/\/+$/, '') || '/'
  if (p === '/') return 'Projects'
  const parts = p.split('/').filter(Boolean)
  const b = parts.indexOf('browse')
  if (b >= 0 && parts[b + 1]) return 'Plane work item ' + clean(decodeURIComponent(parts[b + 1]), 40) + ' (' + clean(p, 120) + ')'
  const i = parts.indexOf('issues')
  const pr = parts.indexOf('projects')
  if (pr >= 0 && parts[pr + 1]) {
    const proj = clean(decodeURIComponent(parts[pr + 1]), 40)
    if (i >= 0 && parts[i + 1]) return 'Plane work item ' + clean(decodeURIComponent(parts[i + 1]), 40) + ' in project ' + proj + ' (' + clean(p, 120) + ')'
    return 'Plane project ' + proj + ' (' + clean(p, 120) + ')'
  }
  return 'Plane (' + clean(p, 120) + ')'
}
