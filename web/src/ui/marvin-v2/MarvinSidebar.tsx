// Marvin's sidebar: the one chat, then Devices, LAN, Health, Library and Help. Profile and the theme toggle sit in the
// footer. No lane list, no groups, no apps.
import { ActivityIcon, CheckCheckIcon, ExternalLinkIcon, HelpCircleIcon, LibraryIcon, LinkIcon, NetworkIcon, ServerIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { GilfoyleAvatar } from '@/components/GilfoyleAvatar'
import { PersonAvatar } from '@/components/PersonAvatar'
import { SearchMark } from '@/components/SearchMark'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarRail } from '@/components/ui/sidebar'
import { useApp } from '@/app/AppContext'
import { go, hrefFor } from '@/app/router'
import type { Route } from '@/app/router'
import { ThemeToggle } from '@/app/ThemeToggle'
import { MenuItemRow, wired } from '@/ui/bay-v1/RowMenu'
import type { MenuAction } from '@/ui/bay-v1/RowMenu'
import { openActions } from '@/ui/bay-v1/menus'
import { copyText } from '@/lib/clip'
import { agentName, useAgentName } from '@/lib/agent'
import { healthLine } from '@/pages/Health'
import { isOwnerOrAdmin, unreadCount } from '@/lib/store'
import { displayName, relTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { LaneRow } from '@/lib/types'
import { useHelp } from './help'

// The full URL of a route in this console, for Copy link and Open in new tab.
const urlOf = (r: Route): string => location.origin + location.pathname + hrefFor(r)

function useCopyLink() {
  const { toast } = useApp()
  return async (r: Route) => toast((await copyText(urlOf(r))) ? 'Link copied' : 'Could not copy')
}

// Open, Open in new tab, Copy link: the menu of a tool page row.
function ToolRow({ id, label, tip, icon: Icon, route, active }: { id: string; label: string; tip: string; icon: ComponentType; route: Route; active: boolean }) {
  const copy = useCopyLink()
  const actions: MenuAction[] = wired([
    ...openActions(hrefFor(route), () => go(route)),
    { id: 'link', label: 'Copy link', icon: LinkIcon, run: () => void copy(route), separatorBefore: true },
  ])
  return (
    <MenuItemRow menuId={'tool-' + id} label={label} actions={actions}>
      <SidebarMenuButton tooltip={tip} isActive={active} onClick={() => go(route)}>
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </MenuItemRow>
  )
}

function ChatRow({ lane, active }: { lane: LaneRow; active: boolean }) {
  const { store, markRead, toast } = useApp()
  const help = useHelp()
  const copy = useCopyLink()
  const unread = unreadCount(store, lane.id)
  const latest = (lane.tail ?? []).reduce((m, e) => (e.at > m ? e.at : m), lane.last?.at ?? '')
  const route: Route = { name: 'lane', id: lane.id }
  const actions = wired([
    { id: 'open', label: 'Open chat', icon: ExternalLinkIcon, run: () => go(route) },
    help && { id: 'help', label: 'Open Help', icon: HelpCircleIcon, run: () => help.setOpen(true) },
    unread > 0 && !!latest && {
      id: 'read',
      label: 'Mark as read',
      icon: CheckCheckIcon,
      run: () => {
        markRead(lane.id, latest)
        toast('Marked as read')
      },
    },
    { id: 'link', label: 'Copy link to chat', icon: LinkIcon, run: () => void copy(route), separatorBefore: true },
  ])
  const preview = lane.last ? (lane.last.own ? 'You: ' : '') + lane.last.text : 'No messages yet'
  return (
    <MenuItemRow menuId="chat" menuTestid="chat-menu" label={agentName(lane)} actions={actions}>
      <SidebarMenuButton size="lg" isActive={active} tooltip={agentName(lane)} data-testid="chat-row" onClick={() => go(route)} className={cn(unread > 0 && 'pr-14 font-semibold')}>
        <GilfoyleAvatar size="md" src={lane.agent?.avatar} name={lane.agent?.name} />
        <div className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="flex items-center gap-1.5 text-sm">
            <span className="truncate">{agentName(lane)}</span>
            {lane.busy && <span data-testid="lane-busy" aria-label="Working" className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
            <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{lane.last ? relTime(lane.last.at) : ''}</span>
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">{preview}</span>
        </div>
      </SidebarMenuButton>
      {unread > 0 && <SidebarMenuBadge data-testid="unread-badge" className="top-auto bottom-1.5">{unread > 99 ? '99+' : unread}</SidebarMenuBadge>}
    </MenuItemRow>
  )
}

export function MarvinSidebar({ route, lane }: { route: Route; lane: LaneRow | null }) {
  const agent = useAgentName()
  const { store } = useApp()
  const help = useHelp()
  const admin = isOwnerOrAdmin(store)
  const up = store.health?.opencode === 'up'
  const known = !!store.health
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => go({ name: 'home' })}>
            <span className="inline-flex size-7 shrink-0 items-center justify-center text-foreground"><SearchMark className="size-6" /></span>
            <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">SearchOS</span>
          </button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {lane && (
          <SidebarGroup data-testid="rail-chat">
            <SidebarGroupLabel>Chat</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <ChatRow lane={lane} active={route.name === 'lane'} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup data-testid="rail-tools">
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {admin && <ToolRow id="devices" label="Devices" tip="Devices" icon={ServerIcon} route={{ name: 'devices' }} active={route.name === 'devices'} />}
              <ToolRow id="lan" label="LAN" tip="LAN map" icon={NetworkIcon} route={{ name: 'lan' }} active={route.name === 'lan'} />
              <ToolRow id="health" label="Health" tip="Health" icon={ActivityIcon} route={{ name: 'health' }} active={route.name === 'health'} />
              <ToolRow id="library" label="Library" tip="Library" icon={LibraryIcon} route={{ name: 'library' }} active={route.name === 'library'} />
              <MenuItemRow menuId="tool-help" label="Help" actions={wired([help && { id: 'help', label: 'Open Help', icon: HelpCircleIcon, run: () => help.setOpen(true) }])}>
                <SidebarMenuButton tooltip="Help: cheat sheet (?)" data-testid="help-nav" isActive={!!help?.open} onClick={() => help?.setOpen(true)}>
                  <HelpCircleIcon />
                  <span>Help</span>
                </SidebarMenuButton>
              </MenuItemRow>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:flex-col">
          <button
            type="button"
            data-testid="profile-link"
            aria-label="Your profile"
            title="Your profile"
            onClick={() => go({ name: 'profile' })}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {store.me && <PersonAvatar id={store.me.person} size="md" />}
            <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-medium">{store.me ? displayName(store.me.person) : '...'}</span>
              <span className="block truncate text-xs text-muted-foreground">{store.me?.device_name}</span>
            </span>
          </button>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center" data-testid="gilfoyle-status" title={healthLine(store.health, agent)}>
          <GilfoyleAvatar size="sm" />
          <span className={cn('size-2 rounded-full', !known && 'bg-muted-foreground', known && up && 'bg-ok', known && !up && 'bg-destructive')} />
          <span className="group-data-[collapsible=icon]:hidden">{healthLine(store.health, agent)}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
