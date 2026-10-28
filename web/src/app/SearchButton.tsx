import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSearch } from './SearchContext'

// Top right of every header: opens the universal search (Cmd K does the same).
export function SearchButton({ className }: { className?: string }) {
  const { open } = useSearch()
  return (
    <Button type="button" variant="outline" size="sm" data-testid="search-button" aria-label="Search everything" title="Search everything (Cmd K)" onClick={open} className={cn('gap-2', className)}>
      <SearchIcon />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden text-xs text-muted-foreground lg:inline">Cmd K</kbd>
    </Button>
  )
}
