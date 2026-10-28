import { createContext, useContext } from 'react'
import type { CardView } from './types'

// What a card needs from wherever surfaces are shown. Kept apart from the host so cards and the registry never
// import it, and the dock can provide it instead of the sheet.
export interface SurfaceApi {
  open: (card: CardView, arg?: unknown) => void
  close: () => void
}

export const SurfaceContext = createContext<SurfaceApi | null>(null)
// null when no host is mounted, so a card rendered on its own simply has no Open.
export const useSurfaces = (): SurfaceApi | null => useContext(SurfaceContext)
