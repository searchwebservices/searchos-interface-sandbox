// A tiny hash router: #/ , #/lanes/:id , #/devices , #/lan , #/health , #/library , #/library/:lane , #/profile , #/engines , #/apps/clients , #/apps/clients/:id , #/apps/map , #/apps/crm[/<crm hash>] , #/apps/money[/cartera|invoices|charts] , #/apps/pm[/<path>]. A hash needs no server fallback, so deep links
// work behind the static /v2/ mount.
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'lane'; id: string; msg?: string }
  | { name: 'devices' }
  | { name: 'lan' }
  | { name: 'health' }
  | { name: 'library'; lane?: string }
  | { name: 'profile' }
  | { name: 'engines' }
  | { name: 'apps-clients' }
  | { name: 'apps-client'; id: string }
  | { name: 'apps-map' }
  | { name: 'apps-money'; tab: 'cartera' | 'invoices' | 'charts' }
  | { name: 'apps-crm'; sub: string }
  | { name: 'apps-pm'; sub: string }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'lanes' && parts[1]) {
    const msg = parts[2] === 'm' && parts[3] ? decodeURIComponent(parts[3]) : undefined
    return { name: 'lane', id: decodeURIComponent(parts[1]), ...(msg ? { msg } : {}) }
  }
  if (parts[0] === 'devices') return { name: 'devices' }
  if (parts[0] === 'lan') return { name: 'lan' }
  if (parts[0] === 'health') return { name: 'health' }
  if (parts[0] === 'profile') return { name: 'profile' }
  if (parts[0] === 'engines') return { name: 'engines' }
  if (parts[0] === 'apps') {
    if (parts[1] === 'clients') return parts[2] ? { name: 'apps-client', id: decodeURIComponent(parts[2]) } : { name: 'apps-clients' }
    if (parts[1] === 'map') return { name: 'apps-map' }
    if (parts[1] === 'money') return { name: 'apps-money', tab: parts[2] === 'invoices' ? 'invoices' : parts[2] === 'charts' ? 'charts' : 'cartera' }
    if (parts[1] === 'crm') return { name: 'apps-crm', sub: parts.slice(2).join('/') }
    if (parts[1] === 'pm') return { name: 'apps-pm', sub: parts.slice(2).join('/') }
  }
  if (parts[0] === 'library') return parts[1] ? { name: 'library', lane: decodeURIComponent(parts[1]) } : { name: 'library' }
  return { name: 'home' }
}

export const hrefFor = (r: Route): string =>
  r.name === 'apps-clients' ? '#/apps/clients' : r.name === 'apps-client' ? '#/apps/clients/' + encodeURIComponent(r.id) : r.name === 'apps-map' ? '#/apps/map' : r.name === 'apps-money' ? '#/apps/money' + (r.tab === 'cartera' ? '' : '/' + r.tab) : r.name === 'apps-crm' ? '#/apps/crm' + (r.sub ? '/' + r.sub : '') : r.name === 'apps-pm' ? '#/apps/pm' + (r.sub ? '/' + r.sub : '') : r.name === 'library' ? '#/library' + (r.lane ? '/' + encodeURIComponent(r.lane) : '') : r.name === 'lane' ? '#/lanes/' + encodeURIComponent(r.id) + (r.msg ? '/m/' + encodeURIComponent(r.msg) : '') : r.name === 'home' ? '#/' : '#/' + r.name

export function go(r: Route): void {
  window.location.hash = hrefFor(r)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
