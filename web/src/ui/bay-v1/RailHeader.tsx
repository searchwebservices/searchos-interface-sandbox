// A collapsible section header of Bay's rail. The row itself toggles open and closed; right click (long press on touch)
// and the small kebab at its end open the three-state menu. Used by the agent sections and Jared's "Bay's lanes".
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarGroupLabel } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { afterClick } from '@/lib/rail'
import type { RailState } from '@/lib/rail'

const MENU_ORDER: RailState[] = ['closed', 'half', 'open']

export function RailHeader({ state, labels, onState, testid, name, className, children }: {
  state: RailState
  labels: Record<RailState, string>
  onState: (s: RailState) => void
  testid: string
  name: string
  className?: string
  children: ReactNode
}) {
  const Chevron = state === 'closed' ? ChevronRightIcon : ChevronDownIcon
  const items = (Item: typeof ContextMenuItem | typeof DropdownMenuItem) =>
    MENU_ORDER.map((s) => (
      <Item key={s} data-testid={'rail-opt-' + s} onSelect={() => onState(s)}>
        <CheckIcon className={cn(s !== state && 'invisible')} />
        {labels[s]}
      </Item>
    ))
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarGroupLabel className={cn('gap-1 pr-1 group-data-[collapsible=icon]:hidden', className)} data-testid={testid} data-rail={state}>
          <button
            type="button"
            data-testid={testid + '-toggle'}
            aria-expanded={state !== 'closed'}
            aria-label={name + ': ' + labels[state]}
            title={'Click to ' + (state === 'closed' ? 'open' : 'collapse') + ', right click for more'}
            onClick={() => onState(afterClick(state))}
            className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Chevron className={cn('size-3.5 shrink-0 text-muted-foreground', state === 'half' && '-rotate-45')} />
            {children}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid={testid + '-menu'}
                aria-label={name + ' view options'}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <MoreHorizontalIcon className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-testid={testid + '-options'}>{items(DropdownMenuItem)}</DropdownMenuContent>
          </DropdownMenu>
        </SidebarGroupLabel>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid={testid + '-context'}>{items(ContextMenuItem)}</ContextMenuContent>
    </ContextMenu>
  )
}
