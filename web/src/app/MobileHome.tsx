import { SearchMark } from '@/components/SearchMark'
import { LaneSections, QuickActions } from './AppSidebar'
import { SearchButton } from './SearchButton'
import type { Route } from './router'
import type { ReactNode } from 'react'

// The lane list as a full-screen page: the phone's home. Rows are the same LaneItem the sidebar uses (long press menu included).
export function MobileHome({ route, extra, sections }: { route: Route; extra?: ReactNode; sections?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="mobile-home">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span className="inline-flex size-9 items-center justify-center text-foreground"><SearchMark className="size-7" /></span>
        <h1 className="text-base font-semibold">SearchOS</h1>
        <div className="ml-auto"><SearchButton /></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2" data-testid="mobile-lanes">
        {extra}
        {sections ?? <LaneSections activeId="" />}
        <QuickActions route={route} />
      </div>
    </div>
  )
}
