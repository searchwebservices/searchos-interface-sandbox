import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { SidebarInset, useSidebar } from '@/components/ui/sidebar'
import { LaneView } from '@/thread/LaneView'
import { DevicesPage } from '@/pages/Devices'
import { HealthPage } from '@/pages/Health'
import { LibraryPage } from '@/pages/Library'
import { ProfilePage } from '@/pages/Profile'
// The LAN map pulls in @xyflow/react, so the page loads on demand.
const LanPage = lazy(() => import('@/pages/Lan'))
import { tabTitle, totalAsks } from '@/lib/store'
import { useApp } from '@/app/AppContext'
import { SearchContext } from '@/app/SearchContext'
import { SearchModal } from '@/app/SearchModal'
import { go, useRoute } from '@/app/router'
import { MobileHome } from '@/app/MobileHome'
import { MobileTabBar } from '@/app/MobileTabBar'
import { useAppViewport } from '@/app/viewport'
import { isSwipeBack } from '@/lib/swipe'
import type { Touch2 } from '@/lib/swipe'
import { cn } from '@/lib/utils'
import { AgentNameContext, agentName } from '@/lib/agent'
import { EnginesPage } from '@/pages/Engines'
import { ClientRedirect, ClientsListRedirect } from '@/apps/ClientsRedirect'
import { CrmPage } from '@/apps/CrmPage'
import { PmPage } from '@/apps/PmPage'
import { MoneyPage } from '@/apps/money/MoneyPage'
import { EstatePage } from '@/apps/map/EstatePage'
import { AppsLinks } from './AppsNav'
import { BaySidebar, RailSections } from './BaySidebar'
import { useEnginesRoute } from './route'
import { approvalCount, useAgentHealth, useOpenAsks } from './useBayData'

function ShellBody() {
  const route = useRoute()
  const engines = useEnginesRoute()
  const health = useAgentHealth()
  const asks = useOpenAsks(useApp().store)
  const { store } = useApp()
  const { isMobile } = useSidebar()
  const { keyboard } = useAppViewport(isMobile)
  const [find, setFind] = useState(false)
  const touch = useRef<Touch2 | null>(null)

  useEffect(() => {
    // Marvin's title counts the lanes' own asks; Bay's also counts the approver asks.
    const base = tabTitle(store)
    const extra = approvalCount(store, asks) - totalAsks(store)
    document.title = extra > 0 ? '[+' + extra + (extra === 1 ? ' approver ask] ' : ' approver asks] ') + base : base
  }, [store, asks])

  // The home route opens the first lane once the rail is known.
  useEffect(() => {
    // On a phone the home route IS the lane list; it does not jump into a thread.
    if (route.name === 'home' && !engines && store.order.length && !isMobile) {
      const first = store.order.find((id) => store.lanes[id].kind === 'dm') ?? store.order[0]
      go({ name: 'lane', id: first })
    }
  }, [route.name, engines, store.order, store.lanes, isMobile])

  const pages = (
    <>
      {!engines && route.name === 'lane' && (
        <AgentNameContext.Provider value={agentName(store.lanes[route.id])}>
          <LaneView key={route.id} laneId={route.id} msg={route.msg} />
        </AgentNameContext.Provider>
      )}
      {engines && <EnginesPage />}
      {!engines && route.name === 'apps-clients' && <ClientsListRedirect />}
      {!engines && route.name === 'apps-client' && <ClientRedirect key={route.id} id={route.id} />}
      {!engines && route.name === 'apps-map' && <EstatePage />}
      {!engines && route.name === 'apps-crm' && <CrmPage sub={route.sub} />}
      {!engines && route.name === 'apps-money' && <MoneyPage tab={route.tab} />}
      {!engines && route.name === 'apps-pm' && <PmPage sub={route.sub} />}
      {!engines && route.name === 'devices' && <DevicesPage />}
      {!engines && route.name === 'lan' && (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
          <LanPage />
        </Suspense>
      )}
      {!engines && route.name === 'health' && <HealthPage />}
      {!engines && route.name === 'profile' && <ProfilePage />}
      {!engines && route.name === 'library' && <LibraryPage lane={route.lane} />}
      {!engines && route.name === 'home' && <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>}
    </>
  )

  if (isMobile) {
    const inLane = route.name === 'lane' && !engines
    return (
      <SearchContext.Provider value={{ open: () => setFind(true) }}>
        {/* The shell is as tall as the visual viewport, so the composer rides above the keyboard. */}
        <div
          data-testid="mobile-shell"
          data-keyboard={keyboard ? 'open' : undefined}
          className={cn('fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)]', inLane && !keyboard && 'pb-[env(safe-area-inset-bottom)]')}
          style={{ height: 'var(--app-h, 100dvh)', transform: 'translateY(var(--app-top, 0px))' }}
          onTouchStart={(e) => {
            const t = e.touches[0]
            touch.current = t && inLane ? { x: t.clientX, y: t.clientY, t: Date.now() } : null
          }}
          onTouchEnd={(e) => {
            const t = e.changedTouches[0]
            const a = touch.current
            touch.current = null
            if (a && t && isSwipeBack(a, { x: t.clientX, y: t.clientY, t: Date.now() })) go({ name: 'home' })
          }}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {route.name === 'home' && !engines ? <MobileHome route={route} extra={<AppsLinks route={route} />} sections={<RailSections activeId="" health={health} />} /> : pages}
          </div>
          {!inLane && <MobileTabBar route={route} />}
        </div>
        <SearchModal open={find} onOpenChange={setFind} />
      </SearchContext.Provider>
    )
  }

  return (
    <SearchContext.Provider value={{ open: () => setFind(true) }}>
      <BaySidebar route={route} engines={engines} health={health} asks={asks} />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        {pages}
      </SidebarInset>
      <SearchModal open={find} onOpenChange={setFind} />
    </SearchContext.Provider>
  )
}


// Marvin's shell composition with Bay's sidebar and the #/engines page. The agent name outside a thread (sidebar footer, health, library) is the one the viewer's first direct lane talks to.
export function BayV1Shell() {
  const { store } = useApp()
  const dm = store.order.map((id) => store.lanes[id]).find((l) => l?.kind === 'dm')
  return (
    <AgentNameContext.Provider value={agentName(dm)}>
      <ShellBody />
    </AgentNameContext.Provider>
  )
}
