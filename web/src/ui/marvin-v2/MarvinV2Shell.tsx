// Marvin's second shell: ONE chat (his direct line with Gilfoyle), the tools around it (Devices, LAN, Health, Library,
// Profile), a Help button with a cheat sheet he can click and pin, the theme toggle and Cmd K search. Every other lane
// route lands on the one chat. marvin-v1 stays as it is, and is still the fallback for Dani and Borja.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SidebarInset, useSidebar } from '@/components/ui/sidebar'
import { LaneView } from '@/thread/LaneView'
import type { LaneSlots } from '@/thread/LaneView'
import { DevicesPage } from '@/pages/Devices'
import { HealthPage } from '@/pages/Health'
import { LibraryPage } from '@/pages/Library'
import { ProfilePage } from '@/pages/Profile'
// The LAN map pulls in @xyflow/react, so the page loads on demand.
const LanPage = lazy(() => import('@/pages/Lan'))
import { tabTitle } from '@/lib/store'
import { useApp } from '@/app/AppContext'
import { SearchContext } from '@/app/SearchContext'
import { SearchModal } from '@/app/SearchModal'
import { hrefFor, useRoute } from '@/app/router'
import { useAppViewport } from '@/app/viewport'
import { cn } from '@/lib/utils'
import type { StandingId } from '@/lib/dock'
import { AgentNameContext, agentName } from '@/lib/agent'
import { CHEATSHEET } from './cheatsheet'
import { HelpHeaderButton, HelpSheet } from './HelpSheet'
import { HelpContext, useHelpHotkey, useHelpState } from './help'
import { MarvinSidebar } from './MarvinSidebar'
import { MarvinTabBar } from './MarvinTabBar'
import { PinChips } from './PinChips'
import { pickOneLane, redirectFor } from './oneChat'

// Marvin's dock: Network topology, Interface health, Scratchpad, Lane files, always there.
const FIXED_DOCK: StandingId[] = ['topology', 'iface', 'scratch', 'files']

const Loading = () => <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>

function ShellBody() {
  const route = useRoute()
  const { store, reloadLanes } = useApp()
  const { isMobile } = useSidebar()
  const { keyboard } = useAppViewport(isMobile)
  const [find, setFind] = useState(false)
  const lane = useMemo(() => pickOneLane(store), [store])
  const chatId = lane?.id ?? null
  const onChat = route.name === 'lane' && route.id === chatId
  const { api, fill, onFilled } = useHelpState(CHEATSHEET, chatId, onChat)
  useHelpHotkey(api.open, api.setOpen)

  useEffect(() => {
    document.title = tabTitle(store, chatId)
  }, [store, chatId])

  // Everything that is not this shell's one chat or its tools lands on the chat. Replace, so Back does not bounce.
  const away = store.me ? redirectFor(route, chatId) : null
  const awayHref = away ? hrefFor(away) : ''
  useEffect(() => {
    if (awayHref) window.location.replace(awayHref)
  }, [awayHref])

  const slots: LaneSlots = { headerActions: <HelpHeaderButton />, aboveComposer: <PinChips />, fill, onFilled, hideBack: true, hideForward: true, fixedSurfaces: FIXED_DOCK, hideFind: true, inboxTitle: true }
  // With no direct line yet (the lane list is in and none is Gilfoyle's) there is nothing to open: say so.
  // If the lane list itself failed to load, that is a retry, not an empty account.
  const onChatRoute = route.name === 'lane' || route.name === 'home'
  const lanesFailed = !!store.lanesError && !chatId && onChatRoute
  const noChat = !!store.me && !chatId && onChatRoute && !store.lanesError
  const [retrying, setRetrying] = useState(false)
  const retry = () => {
    setRetrying(true)
    void reloadLanes().finally(() => setRetrying(false))
  }

  const pages = (
    <>
      {!away && route.name === 'lane' && lane && (
        <AgentNameContext.Provider value={agentName(lane)}>
          <LaneView key={lane.id} laneId={lane.id} msg={route.msg} slots={slots} />
        </AgentNameContext.Provider>
      )}
      {lanesFailed && (
        <div className="flex flex-1 items-center justify-center px-4" data-testid="lanes-failed">
          <div className="max-w-sm space-y-3 text-center">
            <div className="si-eyebrow">Could not load your chat</div>
            <p className="text-sm text-muted-foreground">The lane list did not load. Check the connection and try again.</p>
            <Button type="button" variant="outline" size="sm" disabled={retrying} onClick={retry} data-testid="lanes-retry">
              {retrying ? 'Trying...' : 'Try again'}
            </Button>
          </div>
        </div>
      )}
      {noChat && (
        <div className="flex flex-1 items-center justify-center px-4" data-testid="no-chat">
          <div className="max-w-sm space-y-2 text-center">
            <div className="si-eyebrow">No chat yet</div>
            <p className="text-sm text-muted-foreground">There is no direct line to Gilfoyle on this account. Ask Bay to set it up. Devices, LAN, Health and Library still work.</p>
          </div>
        </div>
      )}
      {!away && route.name === 'devices' && <DevicesPage approvedOnly />}
      {!away && route.name === 'lan' && (
        <Suspense fallback={<Loading />}>
          <LanPage />
        </Suspense>
      )}
      {!away && route.name === 'health' && <HealthPage onlyLane={chatId} />}
      {!away && route.name === 'profile' && <ProfilePage />}
      {!away && route.name === 'library' && <LibraryPage onlyLane={chatId} />}
      {!lanesFailed && (away || (!store.me && (route.name === 'lane' || route.name === 'home')) || (route.name === 'lane' && !lane && !noChat)) && <Loading />}
    </>
  )

  const shell = isMobile ? (
    <SearchContext.Provider value={{ open: () => setFind(true) }}>
      {/* The shell is as tall as the visual viewport, so the composer rides above the keyboard. */}
      <div
        data-testid="mobile-shell"
        data-keyboard={keyboard ? 'open' : undefined}
        className={cn('fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)]')}
        style={{ height: 'var(--app-h, 100dvh)', transform: 'translateY(var(--app-top, 0px))' }}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{pages}</div>
        {!keyboard && <MarvinTabBar route={route} chatId={chatId} />}
      </div>
      <SearchModal open={find} onOpenChange={setFind} onlyLane={chatId} />
      <HelpSheet />
    </SearchContext.Provider>
  ) : (
    <SearchContext.Provider value={{ open: () => setFind(true) }}>
      <MarvinSidebar route={route} lane={lane} />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">{pages}</SidebarInset>
      <SearchModal open={find} onOpenChange={setFind} onlyLane={chatId} />
      <HelpSheet />
    </SearchContext.Provider>
  )
  return <HelpContext.Provider value={api}>{shell}</HelpContext.Provider>
}

// The agent name outside a thread (sidebar footer, health, library) is the one the one chat talks to.
export function MarvinV2Shell() {
  const { store } = useApp()
  return (
    <AgentNameContext.Provider value={agentName(pickOneLane(store))}>
      <ShellBody />
    </AgentNameContext.Provider>
  )
}
