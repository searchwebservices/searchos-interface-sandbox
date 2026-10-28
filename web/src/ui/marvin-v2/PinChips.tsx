// Pinned suggestions as a compact row of chips just above the composer. A click puts the prompt in the box, like the sheet.
import { cn } from '@/lib/utils'
import { useHelp } from './help'

export function PinChips() {
  const help = useHelp()
  if (!help || help.pinned.length === 0) return null
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-2" data-testid="pin-chips" role="group" aria-label="Pinned suggestions">
      <ul className={cn('flex gap-1.5', 'max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 md:flex-wrap')}>
        {help.pinned.map((i) => (
          <li key={i.id} className="shrink-0">
            <button
              type="button"
              data-testid="pin-chip"
              data-item={i.id}
              title={i.prompt}
              onClick={() => help.use(i)}
              className="max-w-[16rem] truncate rounded-full border bg-card px-3 py-1 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {i.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
