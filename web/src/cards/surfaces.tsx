// Where a surface is shown. The registry (registry.tsx) only knows how to draw a surface; this file decides where.
// Today that is a right-side shadcn Sheet. Concept 01 replaces SheetSurfaceHost with the dock (several surfaces kept,
// one expanded, state per lane) by providing the same SurfaceApi, and nothing in the registry or the cards changes.
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CardSurface, entryOf } from './registry'
import { SurfaceContext } from './surface-context'
import type { SurfaceApi } from './surface-context'
import type { CardView } from './types'
import { KIND_LABEL } from './util'


const WIDTH = { md: 'sm:max-w-md', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const

// resolve: look a card up again by id so an open surface follows the live thread (an ask answered while it is open).
export function SheetSurfaceHost({ children, resolve }: { children: ReactNode; resolve?: (id: string) => CardView | undefined }) {
  const [shown, setShown] = useState<{ card: CardView; arg?: unknown } | null>(null)
  const open = useCallback((card: CardView, arg?: unknown) => setShown({ card, arg }), [])
  const close = useCallback(() => setShown(null), [])
  const api = useMemo<SurfaceApi>(() => ({ open, close }), [open, close])
  const card = shown ? (resolve?.(shown.card.id) ?? shown.card) : null
  const e = card ? entryOf(card.kind) : undefined
  return (
    <SurfaceContext.Provider value={api}>
      {children}
      <Sheet open={!!shown} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className={'w-full gap-0 ' + WIDTH[e?.width ?? 'lg']} data-testid="surface-sheet">
          <SheetHeader>
            <SheetTitle className="break-all">{card ? (e ? e.title(card) : String(card.kind)) : 'Card'}</SheetTitle>
            <SheetDescription className="sr-only">{card ? (KIND_LABEL[card.kind] ?? card.kind) + ' detail' : 'Card detail'}</SheetDescription>
          </SheetHeader>
          {card && <CardSurface card={card} arg={shown?.arg} />}
        </SheetContent>
      </Sheet>
    </SurfaceContext.Provider>
  )
}
