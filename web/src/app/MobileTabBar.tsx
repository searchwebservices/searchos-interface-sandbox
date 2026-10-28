import { LibraryIcon, MessageSquareIcon, NetworkIcon, ServerIcon, UserCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { isOwnerOrAdmin, unreadCount } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useApp } from './AppContext'
import { go } from './router'
import type { Route } from './router'

// The phone's navigation: Lanes, LAN, Library, Devices (owners and admins), Profile. Sits above the home indicator.
export function MobileTabBar({ route }: { route: Route }) {
  const { store } = useApp()
  const unread = store.order.reduce((n, id) => n + unreadCount(store, id), 0)
  const tabs: { id: string; label: string; icon: ReactNode; on: boolean; go: () => void; badge?: number }[] = [
    { id: 'lanes', label: 'Lanes', icon: <MessageSquareIcon />, on: route.name === 'home' || route.name === 'lane', go: () => go({ name: 'home' }), badge: unread },
    { id: 'lan', label: 'LAN', icon: <NetworkIcon />, on: route.name === 'lan', go: () => go({ name: 'lan' }) },
    { id: 'library', label: 'Library', icon: <LibraryIcon />, on: route.name === 'library', go: () => go({ name: 'library' }) },
    ...(isOwnerOrAdmin(store) ? [{ id: 'devices', label: 'Devices', icon: <ServerIcon />, on: route.name === 'devices', go: () => go({ name: 'devices' }) }] : []),
    { id: 'profile', label: 'Profile', icon: <UserCircleIcon />, on: route.name === 'profile', go: () => go({ name: 'profile' }) },
  ]
  return (
    <nav aria-label="Main" data-testid="mobile-tabs" className="flex shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          data-testid={'tab-' + t.id}
          aria-current={t.on ? 'page' : undefined}
          onClick={t.go}
          className={cn('relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5', t.on ? 'font-semibold text-primary' : 'text-muted-foreground')}
        >
          {t.icon}
          <span className="truncate">{t.label}</span>
          {!!t.badge && t.badge > 0 && (
            <span className="absolute top-1.5 left-1/2 ml-2.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 text-primary-foreground">{t.badge > 99 ? '99+' : t.badge}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
