import { ChevronLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { go } from './router'

// Desktop: nothing (the Search mark in the sidebar is the toggle). Phones have no sidebar: a lane gets a Back button to the lane list, a page gets nothing
// (the tab bar is its navigation).
export function NavTrigger({ back = false }: { back?: boolean }) {
  const { isMobile } = useSidebar()
  if (!isMobile) return null
  if (!back) return null
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Back to lanes" data-testid="mobile-back" onClick={() => go({ name: 'home' })} className="-ml-1 size-11">
      <ChevronLeftIcon className="size-6" />
    </Button>
  )
}
