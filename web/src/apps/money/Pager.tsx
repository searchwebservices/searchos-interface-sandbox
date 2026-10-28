// Paging above 50 rows: Previous / Next and "51 to 100 of 230".
import { Button } from '@/components/ui/button'
import { PAGE, pageCount } from './money'

export function Pager({ total, page, onPage, label }: { total: number; page: number; onPage: (p: number) => void; label: string }) {
  if (total <= PAGE) return null
  const last = pageCount(total) - 1
  return (
    <nav className="flex items-center justify-between gap-2 py-2 text-xs text-muted-foreground" aria-label={label + ' pages'} data-testid="pager">
      <span>{page * PAGE + 1} to {Math.min(total, page * PAGE + PAGE)} of {total}</span>
      <span className="inline-flex gap-1">
        <Button type="button" size="xs" variant="outline" disabled={page <= 0} data-testid="pager-prev" onClick={() => onPage(page - 1)}>Previous</Button>
        <Button type="button" size="xs" variant="outline" disabled={page >= last} data-testid="pager-next" onClick={() => onPage(page + 1)}>Next</Button>
      </span>
    </nav>
  )
}
