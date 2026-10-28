import { useEffect, useState } from "react"
import { GilfoyleAvatar } from '@/components/GilfoyleAvatar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { SearchMark } from "@/components/SearchMark";
import { ActivityIcon, BookOpenIcon, ExternalLinkIcon, FileTextIcon, LibraryIcon, NetworkIcon, PinIcon, ServerIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar'
import { MenuItemRow } from '@/ui/bay-v1/RowMenu'
import { laneActions, openActions } from '@/ui/bay-v1/menus'
import { copyText } from '@/lib/clip'
import { cn } from '@/lib/utils'
import { displayName, initials, relTime } from '@/lib/time'
import { LaneIcon, hasLaneIcon } from '@/components/LaneIcon'
import { healthLine } from '@/pages/Health'
import { isOwnerOrAdmin, unreadCount, unreadMentions } from '@/lib/store'
import { PersonAvatar } from '@/components/PersonAvatar'
import type { LaneRow } from '@/lib/types'
import { useApp } from './AppContext'
import { go } from './router'
import type { Route } from './router'
import { ThemeToggle } from './ThemeToggle'
import { agentName, useAgentName } from '@/lib/agent'

// A still-animated dot: the working row in the open thread is the only LatticeLoader that animates.
function BusyDot() {
  return <span className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
}

export function LaneItem({ lane, active, pinned, label, move }: { lane: LaneRow; active: boolean; pinned: boolean; label?: string; move?: { up: (() => void) | null; down: (() => void) | null } }) {
  const { store, togglePin, markRead, toast } = useApp()
  const unread = unreadCount(store, lane.id)
  const mentions = unreadMentions(store, lane.id)
  const asks = lane.asks ?? 0
  const forms = lane.forms ?? 0
  const hasPill = asks > 0 || forms > 0
  const dm = lane.kind === 'dm'
  const preview = lane.last ? (lane.last.own ? 'You: ' : lane.last.who ? lane.last.who + ': ' : '') + lane.last.text : 'No messages yet'
  const latest = (lane.tail ?? []).reduce((m, e) => (e.at > m ? e.at : m), lane.last?.at ?? '')
  const actions = laneActions({
    pinned,
    move,
    open: () => go({ name: 'lane', id: lane.id }),
    togglePin: () => togglePin(lane.id),
    markRead: () => {
      if (latest) markRead(lane.id, latest)
      toast('Marked as read')
    },
    copyLink: async () => {
      const url = location.origin + location.pathname + '#/lanes/' + encodeURIComponent(lane.id)
      toast((await copyText(url)) ? 'Link copied' : 'Could not copy')
    },
    classic: () => window.open('/w?lane=' + encodeURIComponent(lane.id), '_blank', 'noopener'),
  })
  return (
    <MenuItemRow menuId={'lane-' + lane.id} menuTestid="lane-menu" label={label ?? lane.title} actions={actions}>
      <SidebarMenuButton
        size="lg"
        isActive={active}
        tooltip={label ?? (dm ? agentName(lane) : lane.title)}
        onClick={() => go({ name: 'lane', id: lane.id })}
        className={cn(unread > 0 && 'font-semibold', hasPill ? 'pr-24' : (unread > 0 || lane.session_missing) && 'pr-14')}
      >
        {dm ? (
          <>
            {hasLaneIcon(lane.id) ? (
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <LaneIcon laneId={lane.id} busy={!!lane.busy} size={18} className="text-secondary-foreground" />
              </span>
            ) : (
              <GilfoyleAvatar size="md" src={lane.agent?.avatar} name={lane.agent?.name} />
            )}
            <div className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="truncate">{label ?? agentName(lane)}</span>
                {pinned && <PinIcon className="size-3 shrink-0 text-muted-foreground" data-testid="lane-pinned" aria-label="Pinned" />}
                {lane.busy && (
                  <span data-testid="lane-busy" aria-label="Working">
                    <BusyDot />
                  </span>
                )}
                <span data-testid="lane-time" className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                  {lane.last ? relTime(lane.last.at) : ''}
                </span>
              </span>
              <span data-testid="lane-preview" className="truncate text-xs font-normal text-muted-foreground">{preview}</span>
            </div>
          </>
        ) : (
          <>
            {hasLaneIcon(lane.id) ? (
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <LaneIcon laneId={lane.id} busy={!!lane.busy} className="text-secondary-foreground" />
              </span>
            ) : (
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[0.625rem] font-semibold text-secondary-foreground">
                {initials(lane.title)}
              </span>
            )}
            <div className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="flex items-center gap-1.5 truncate text-sm">
                {lane.title}
                {lane.busy && (
                  <span data-testid="lane-busy" aria-label="Working">
                    <BusyDot />
                  </span>
                )}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">{preview}</span>
            </div>
          </>
        )}
      </SidebarMenuButton>
      {asks > 0 || forms > 0 ? (
        <SidebarMenuBadge className={cn("bg-warn/20 text-warn", dm && "top-auto bottom-1.5")} data-testid="needs-you-badge">
          {[asks > 0 ? (asks === 1 ? '1 ask' : asks + ' asks') : '', forms > 0 ? (forms === 1 ? '1 form' : forms + ' forms') : ''].filter(Boolean).join(', ')}
        </SidebarMenuBadge>
) : mentions > 0 ? (
        <SidebarMenuBadge data-testid="mention-badge" aria-label={mentions + (mentions === 1 ? ' mention' : ' mentions')} className={cn("bg-primary text-primary-foreground", dm && "top-auto bottom-1.5")}>
          @{mentions > 99 ? '99+' : mentions}
        </SidebarMenuBadge>
      ) : unread > 0 ? (
        <SidebarMenuBadge data-testid="unread-badge" className={cn(dm && "top-auto bottom-1.5")}>{unread > 99 ? '99+' : unread}</SidebarMenuBadge>
      ) : lane.session_missing ? (
        <SidebarMenuBadge className="text-destructive">No session</SidebarMenuBadge>
      ) : null}
    </MenuItemRow>
  )
}

export function LaneSections({ activeId }: { activeId: string }) {
  const { store, pinned } = useApp()
  const lanes = store.order.map((id) => store.lanes[id]).filter(Boolean)
  const pinnedLanes = pinned.map((id) => store.lanes[id]).filter(Boolean)
  const direct = lanes.filter((l) => l.kind === 'dm' && !pinned.includes(l.id))
  const threads = lanes.filter((l) => l.kind === 'group' && !pinned.includes(l.id))
  const section = (label: string, list: LaneRow[], testid: string) =>
    list.length > 0 && (
      <SidebarGroup data-testid={testid}>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {list.map((l) => (
              <LaneItem key={l.id} lane={l} active={l.id === activeId} pinned={pinned.includes(l.id)} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  return (
    <>
      {section('Pinned', pinnedLanes, 'rail-pinned')}
      {section('Direct', direct, 'rail-direct')}
      {section('Threads', threads, 'rail-threads')}
    </>
  )
}

export function QuickActions({ route }: { route: Route }) {
  const agent = useAgentName()
  const { store, quickReport, toast } = useApp()
  const [reportOpen, setReportOpen] = useState(false)
  const [reportAt, setReportAt] = useState<number>(() => {
    try { return Number(localStorage.getItem('sov.report.at') || 0) } catch { return 0 }
  })
  useEffect(() => { try { localStorage.setItem('sov.report.at', String(reportAt)) } catch { /* ignore */ } }, [reportAt])
  const REPORT_COOLDOWN_MS = 10 * 60 * 1000
  const hardwareBusy = !!store.lanes.hardware?.busy
  const reportBlocked = hardwareBusy || Date.now() - reportAt < REPORT_COOLDOWN_MS
  const admin = isOwnerOrAdmin(store)
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Quick actions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {admin && (
            <MenuItemRow menuId="quick-devices" label="Devices" actions={openActions('#/devices', () => { window.location.hash = '#/devices' })}>
              <SidebarMenuButton tooltip="Devices" isActive={route.name === 'devices'} onClick={() => go({ name: 'devices' })}>
                <ServerIcon />
                <span>Devices</span>
              </SidebarMenuButton>
            </MenuItemRow>
          )}
          <MenuItemRow menuId="quick-lan" label="LAN" actions={openActions('#/lan', () => { window.location.hash = '#/lan' })}>
            <SidebarMenuButton tooltip="LAN map" isActive={route.name === 'lan'} onClick={() => go({ name: 'lan' })}>
              <NetworkIcon />
              <span>LAN</span>
            </SidebarMenuButton>
          </MenuItemRow>
          <MenuItemRow menuId="quick-health" label="Health" actions={openActions('#/health', () => { window.location.hash = '#/health' })}>
            <SidebarMenuButton tooltip="Health" isActive={route.name === 'health'} onClick={() => go({ name: 'health' })}>
              <ActivityIcon />
              <span>Health</span>
            </SidebarMenuButton>
          </MenuItemRow>
          <MenuItemRow menuId="quick-library" label="Library" actions={openActions('#/library', () => { window.location.hash = '#/library' })}>
            <SidebarMenuButton tooltip="Library" isActive={route.name === 'library'} onClick={() => go({ name: 'library' })}>
              <LibraryIcon />
              <span>Library</span>
            </SidebarMenuButton>
          </MenuItemRow>
          <MenuItemRow menuId="quick-standards" label="Standards" actions={openActions('#/lanes/standards', () => { window.location.hash = '#/lanes/standards' })}>
            <SidebarMenuButton tooltip="Standards" onClick={() => go({ name: 'lane', id: 'standards' })} disabled={!store.lanes.standards}>
              <BookOpenIcon />
              <span>Standards</span>
            </SidebarMenuButton>
          </MenuItemRow>
          <MenuItemRow menuId="quick-report" label="Report" actions={[{ id: 'open', label: 'Open Hardware thread', icon: ExternalLinkIcon, run: () => go({ name: 'lane', id: 'hardware' }), disabled: !store.lanes.hardware }]}>
            {/* Report asks for a confirmation and refuses a repeat while the hardware lane is still
                working on the last one or within the cool-down (Bay, 2026-10-26: no accidental
                double requests). */}
            <AlertDialog open={reportOpen} onOpenChange={setReportOpen}>
              <AlertDialogTrigger asChild>
                <SidebarMenuButton
                  tooltip={reportBlocked ? 'Report already requested, wait for the hardware lane' : 'Report: send the digest request to the hardware lane'}
                  disabled={!store.lanes.hardware || reportBlocked}
                >
                  <FileTextIcon />
                  <span>Report</span>
                </SidebarMenuButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ask the hardware lane for the report?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {agent} runs the digest for the rack, the box and the LAN and posts it in the Hardware thread. One request at a time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setReportAt(Date.now())
                      quickReport()
                      toast('Asked the hardware lane for the report')
                      go({ name: 'lane', id: 'hardware' })
                    }}
                  >
                    Request report
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </MenuItemRow>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar({ route }: { route: Route }) {
  const agent = useAgentName()
  const { store } = useApp()
  const activeId = route.name === 'lane' ? route.id : ''
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
        <LaneSections activeId={activeId} />
        <QuickActions route={route} />
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
        <div
          className="flex items-center gap-2 px-1 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center"
          data-testid="gilfoyle-status"
          title={healthLine(store.health, agent)}
        >
          <GilfoyleAvatar size="sm" />
          <span className={cn('size-2 rounded-full', !known && 'bg-muted-foreground', known && up && 'bg-ok', known && !up && 'bg-destructive')} />
          <span className="group-data-[collapsible=icon]:hidden">{healthLine(store.health, agent)}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
