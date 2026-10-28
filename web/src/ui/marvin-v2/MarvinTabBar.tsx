// The phone's navigation for Marvin: Chat, Devices (owners and admins), LAN, Health, Library, Help, Profile.
import { ActivityIcon, HelpCircleIcon, LibraryIcon, MessageSquareIcon, NetworkIcon, ServerIcon, UserCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '@/app/AppContext'
import { go } from '@/app/router'
import type { Route } from '@/app/router'
import { isOwnerOrAdmin, unreadCount } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useHelp } from './help'

export function MarvinTabBar({ route, chatId }: { route: Route; chatId: string | null }) {
  const { store } = useApp()
  const help = useHelp()
  const unread = chatId ? unreadCount(store, chatId) : 0
  const tabs: { id: string; label: string; icon: ReactNode; on: boolean; go: () => void; badge?: number }[] = [
    { id: 'chat', label: 'Chat', icon: <MessageSquareIcon />, on: route.name === 'lane' || route.name === 'home', go: () => go(chatId ? { name: 'lane', id: chatId } : { name: 'home' }), badge: unread },
    ...(isOwnerOrAdmin(store) ? [{ id: 'devices', label: 'Devices', icon: <ServerIcon />, on: route.name === 'devices', go: () => go({ name: 'devices' }) }] : []),
    { id: 'lan', label: 'LAN', icon: <NetworkIcon />, on: route.name === 'lan', go: () => go({ name: 'lan' }) },
    { id: 'health', label: 'Health', icon: <ActivityIcon />, on: route.name === 'health', go: () => go({ name: 'health' }) },
    { id: 'library', label: 'Library', icon: <LibraryIcon />, on: route.name === 'library', go: () => go({ name: 'library' }) },
    { id: 'help', label: 'Help', icon: <HelpCircleIcon />, on: !!help?.open, go: () => help?.setOpen(true) },
    { id: 'profile', label: 'Profile', icon: <UserCircleIcon />, on: route.name === 'profile', go: () => go({ name: 'profile' }) },
  ]
  return (
    <nav aria-label="Main" data-testid="mobile-tabs" className="flex shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={t.go}
          aria-current={t.on ? 'page' : undefined}
          data-testid={'tab-' + t.id}
          className={cn('relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.625rem] outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5', t.on ? 'font-semibold text-primary' : 'text-muted-foreground')}
        >
          {t.icon}
          <span className="max-w-full truncate">{t.label}</span>
          {!!t.badge && t.badge > 0 && (
            <span className="absolute top-1.5 left-1/2 ml-2.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 text-primary-foreground">{t.badge > 99 ? '99+' : t.badge}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
