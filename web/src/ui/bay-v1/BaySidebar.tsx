// Marvin's sidebar with one change: the rail is sectioned by agent, each section headed by the agent's name and
// health dot, and the footer states both agents. Rows, quick actions, profile and theme are the shared pieces.
import { ActivityIcon, CpuIcon } from 'lucide-react'
import { appActive, appKeyMove, useAppOrder } from './AppsNav'
import { MenuItemRow, MenuWrap } from './RowMenu'
import { appActions, openActions, personActions } from './menus'
import { useRowDrag } from './useRowDrag'
import { SearchMark } from '@/components/SearchMark'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarRail, useSidebar,
} from '@/components/ui/sidebar'
import { PersonAvatar } from '@/components/PersonAvatar'
import { LaneItem, QuickActions } from '@/app/AppSidebar'
import { useApp } from '@/app/AppContext'
import { go } from '@/app/router'
import type { Route } from '@/app/router'
import { ThemeToggle, useThemeChoice } from '@/app/ThemeToggle'
import { AgentNameContext, agentName } from '@/lib/agent'
import { displayName } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { AskRow, Health, LaneRow } from '@/lib/types'
import { AGENT_LABELS, BAY_LABELS, bayKey, stateOf, stepId } from '@/lib/rail'
import { RailHeader } from './RailHeader'
import { agentState, agentsLine, groupLanes, isBayLaneRow } from './grouping'
import type { AgentGroup, AgentState } from './grouping'
import { approvalCount } from './useBayData'

const dotClass = (s: AgentState) => cn('size-2 shrink-0 rounded-full', s === 'up' && 'bg-ok', s === 'down' && 'bg-destructive', s === 'unknown' && 'bg-muted-foreground')

function AgentSection({ group, health, activeId, pinned }: { group: AgentGroup; health: Health | null; activeId: string; pinned: string[] }) {
  const { railSections, setRailSection, setRailOrder } = useApp()
  const { state: rail } = useSidebar()
  // A rail folded to icons shows every row; the section states are for the wide rail and the phone list.
  const folded = rail === 'collapsed'
  const state = agentState(group.id, health)
  const mode = folded ? 'open' : stateOf(railSections, group.id)
  const bayMode = folded ? 'open' : stateOf(railSections, bayKey(group.id))
  // Bay's lanes move within their pin partition: the saved bayLaneOrder is the whole list, pinned ones still sort first.
  const bayIds = group.bayLanes.map((l) => l.id)
  const moveBay = (id: string, delta: number) => {
    const i = bayIds.indexOf(id)
    const j = i + delta
    if (j < 0 || j >= bayIds.length || pinned.includes(bayIds[j]) !== pinned.includes(id)) return null
    return () => setRailOrder('bayLaneOrder', stepId(bayIds, id, delta))
  }
  const rows = (list: LaneRow[], titled = false) => list.map((l) => <LaneItem key={l.id} lane={l} active={l.id === activeId} pinned={pinned.includes(l.id)} label={titled ? l.title : undefined} move={titled ? { up: moveBay(l.id, -1), down: moveBay(l.id, 1) } : undefined} />)
  const bayRows = bayMode === 'half' ? group.bayLanes.filter((l) => pinned.includes(l.id)) : group.bayLanes
  return (
    <SidebarGroup data-testid={'agent-' + group.id} data-agent-state={state} data-rail={mode}>
      <RailHeader state={mode} labels={AGENT_LABELS} onState={(s) => setRailSection(group.id, s)} testid={'agent-header-' + group.id} name={group.name}>
        <span className="truncate">{group.name}</span>
        <span className={cn(dotClass(state), 'ml-auto')} data-testid="agent-dot" aria-label={state === 'up' ? 'online' : state === 'down' ? 'unreachable' : 'checking'} />
      </RailHeader>
      {mode !== 'closed' && (
        <SidebarGroupContent>
          <SidebarMenu data-testid={'direct-' + group.id}>{rows(group.dms)}</SidebarMenu>
          {group.bayLanes.length > 0 && (
            <>
              <RailHeader state={bayMode} labels={BAY_LABELS} onState={(s) => setRailSection(bayKey(group.id), s)} testid={'bay-lanes-label-' + group.id} name="Bay's lanes" className="mt-1 h-7">
                <span className="truncate">Bay's lanes</span>
              </RailHeader>
              {bayMode !== 'closed' && (
                <SidebarMenu data-testid={'bay-lanes-' + group.id}>{rows(bayRows, true)}</SidebarMenu>
              )}
              {bayMode === 'half' && bayRows.length === 0 && (
                <p className="px-3 py-1 text-xs text-muted-foreground" data-testid={'bay-lanes-empty-' + group.id}>No pinned lanes. Right click a lane to pin it.</p>
              )}
            </>
          )}
          {mode === 'open' && group.groups.length > 0 && <SidebarMenu data-testid={'groups-' + group.id}>{rows(group.groups)}</SidebarMenu>}
          {mode === 'open' && group.desks.length > 0 && <SidebarMenu data-testid={'desks-' + group.id}>{rows(group.desks)}</SidebarMenu>}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}

// The pinned lanes and the agent sections: the lane part of the rail, on the desktop sidebar and the phone's home list.
export function RailSections({ activeId, health }: { activeId: string; health: Health | null }) {
  const { store, pinned, bayLaneOrder } = useApp()
  const lanes = store.order.map((id) => store.lanes[id]).filter(Boolean)
  // Bay's own lanes stay in their sub-section (pinned ones first); every other pinned lane rides the Pinned group.
  const pinnedLanes = pinned.map((id) => store.lanes[id]).filter((l) => l && !isBayLaneRow(l))
  const groups = groupLanes(lanes.filter((l) => !pinned.includes(l.id) || isBayLaneRow(l)), pinned, bayLaneOrder)
  return (
    <>
      {pinnedLanes.length > 0 && (
        <SidebarGroup data-testid="rail-pinned">
          <SidebarGroupLabel>Pinned</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pinnedLanes.map((l) => (
                <LaneItem key={l.id} lane={l} active={l.id === activeId} pinned />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
      {groups.map((g) => (
        <AgentSection key={g.id} group={g} health={health} activeId={activeId} pinned={pinned} />
      ))}
    </>
  )
}

export function BaySidebar({ route, engines, health, asks }: { route: Route; engines: boolean; health: Health | null; asks: AskRow[] }) {
  const { store } = useApp()
  const { open, toggleSidebar } = useSidebar()
  const activeId = route.name === 'lane' ? route.id : ''
  const lanes = store.order.map((id) => store.lanes[id]).filter(Boolean)
  const groups = groupLanes(lanes)
  const apps = useAppOrder()
  const appDrag = useRowDrag(apps.drop)
  const theme = useThemeChoice()
  const waiting = approvalCount(store, asks)
  const line = agentsLine(groups.length ? groups : [{ id: 'gilfoyle', name: 'Gilfoyle' }], health)
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:flex-col">
          {/* The mark is the one sidebar toggle: click folds the rail to icons, click again opens it. */}
          <button
            type="button"
            data-testid="rail-toggle"
            aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
            title={open ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={toggleSidebar}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <SearchMark className="size-6" />
          </button>
          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold group-data-[collapsible=icon]:hidden" onClick={() => go({ name: 'home' })}>SearchOS</button>
          {waiting > 0 && (
            <span data-testid="approval-count" title="Open asks in the Approval queue, approver lanes included" className="rounded-full bg-warn/20 px-2 py-0.5 text-xs font-medium text-warn group-data-[collapsible=icon]:hidden">
              {waiting === 1 ? '1 ask' : waiting + ' asks'}
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <MenuItemRow menuId="nav-engines-row" label="Engines" actions={openActions('#/engines', () => { window.location.hash = '#/engines' })}>
                <SidebarMenuButton tooltip="Engines" isActive={engines} onClick={() => { window.location.hash = '#/engines' }} data-testid="nav-engines">
                  <CpuIcon />
                  <span>Engines</span>
                </SidebarMenuButton>
              </MenuItemRow>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup data-testid="rail-apps">
          <SidebarGroupLabel>Apps</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu data-drag-list>
              {apps.items.map((a, i) => (
                <MenuItemRow
                  key={a.id}
                  menuId={'app-' + a.id}
                  label={a.label}
                  className={cn(appDrag.drag?.id === a.id && 'opacity-60', appDrag.indicator(i, apps.items.length))}
                  actions={appActions({ hash: a.hash, open: () => { window.location.hash = a.hash }, index: i, count: apps.items.length, move: (how) => apps.move(a.id, how) })}
                  {...appDrag.rowProps(a.id)}
                >
                  <SidebarMenuButton
                    tooltip={a.label}
                    isActive={appActive(a.id, route)}
                    onClick={() => { window.location.hash = a.hash }}
                    onKeyDown={(e) => { const how = appKeyMove(e); if (how) { e.preventDefault(); apps.move(a.id, how, true) } }}
                    data-app-focus={a.id}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                    data-testid={'nav-apps-' + a.id}
                  >
                    <a.icon />
                    <span>{a.label}</span>
                  </SidebarMenuButton>
                </MenuItemRow>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <RailSections activeId={activeId} health={health} />
        {/* The quick actions (Report, Standards) are Gilfoyle's. */}
        <AgentNameContext.Provider value={agentName(store.lanes.hardware)}>
          <QuickActions route={route} />
        </AgentNameContext.Provider>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:flex-col">
          <MenuWrap menuId="person" actions={personActions({ profile: () => go({ name: 'profile' }), theme: theme.theme, pick: theme.pick })}>
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
          </MenuWrap>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center" data-testid="agents-status" title={line}>
          <ActivityIcon className="size-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">{line}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
