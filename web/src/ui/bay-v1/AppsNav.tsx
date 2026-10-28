// The Apps section of Bay's shell: where the rows point, when they read as active and in which order. The sidebar and
// the phone's lane list share this one table. The order is the person's, saved in the rail pref (appOrder).
import { ContactIcon, KanbanIcon, WalletIcon, WaypointsIcon } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import type { Route } from '@/app/router'
import { useApp } from '@/app/AppContext'
import { cn } from '@/lib/utils'
import { applyOrder, dropAt, moveId, stepId } from '@/lib/rail'
import { appActions } from './menus'
import { MenuWrap } from './RowMenu'

export interface AppItem { id: 'crm' | 'money' | 'pm' | 'map'; label: string; hash: string; icon: ComponentType }
export const APP_ITEMS: AppItem[] = [
  { id: 'crm', label: 'CRM', hash: '#/apps/crm', icon: ContactIcon },
  { id: 'money', label: 'Money', hash: '#/apps/money', icon: WalletIcon },
  { id: 'pm', label: 'Projects', hash: '#/apps/pm', icon: KanbanIcon },
  { id: 'map', label: 'SearchOS map', hash: '#/apps/map', icon: WaypointsIcon },
]

export const appActive = (id: AppItem['id'], route: Route): boolean =>
  id === 'crm' ? route.name === 'apps-crm' : id === 'money' ? route.name === 'apps-money' : id === 'pm' ? route.name === 'apps-pm' : route.name === 'apps-map'

export type AppMove = 'up' | 'down' | 'top'
// The next order after a menu move or an Alt+Arrow on `id`.
export function moveApp(ids: readonly string[], id: string, how: AppMove): string[] {
  return how === 'top' ? moveId(ids, id, 0) : stepId(ids, id, how === 'up' ? -1 : 1)
}
export { dropAt }

// The apps in the saved order (new or unknown ones last) with the moves that save it.
export function useAppOrder() {
  const { appOrder, setRailOrder } = useApp()
  const items = applyOrder(APP_ITEMS, appOrder)
  const ids = items.map((a) => a.id)
  const focus = useRef('')
  // A reordered row is a moved DOM node and loses focus; give it back so Alt+Arrow can repeat.
  useEffect(() => {
    if (!focus.current) return
    const el = document.querySelector<HTMLElement>('[data-app-focus="' + focus.current + '"]')
    focus.current = ''
    el?.focus()
  })
  const apply = useCallback((next: string[]) => setRailOrder('appOrder', next), [setRailOrder])
  const move = (id: string, how: AppMove, keepFocus = false) => {
    if (keepFocus) focus.current = id
    apply(moveApp(ids, id, how))
  }
  const drop = (id: string, gap: number) => apply(dropAt(ids, id, gap))
  return { items, ids, move, drop }
}

// Alt+Up / Alt+Down on a focused app row.
export const appKeyMove = (e: { key: string; altKey: boolean }): AppMove | null => (e.altKey && e.key === 'ArrowUp' ? 'up' : e.altKey && e.key === 'ArrowDown' ? 'down' : null)

// Phone: the same rows above the lane list (there is no sidebar to hold them).
export function AppsLinks({ route }: { route: Route }) {
  const { items, move } = useAppOrder()
  return (
    <nav aria-label="Apps" data-testid="mobile-apps" className="mb-2 flex flex-col gap-1">
      <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">Apps</div>
      {items.map((a, i) => (
        <MenuWrap key={a.id} menuId={'mobile-apps-' + a.id} actions={appActions({ hash: a.hash, open: () => { window.location.hash = a.hash }, index: i, count: items.length, move: (how) => move(a.id, how) })}>
          <a href={a.hash} data-testid={'mobile-apps-' + a.id} aria-current={appActive(a.id, route) ? 'page' : undefined} className={cn('flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent [&_svg]:size-4', appActive(a.id, route) && 'bg-accent font-medium')}>
            <a.icon />
            <span>{a.label}</span>
          </a>
        </MenuWrap>
      ))}
    </nav>
  )
}
