import { createContext, useContext } from 'react'
import type { DockState, Selection } from '@/lib/dock'
import type { LaneFileRow } from '@/lib/types'
import type { CardView } from '@/cards/types'
import type { StandingId } from '@/lib/dock'

// What the dock tells the surfaces and the lane header.
export interface DockApiForLane {
  lane: string
  state: DockState
  selection: Selection | null
  narrow: boolean
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
  openStanding: (id: StandingId) => void
  // Opens the File Preview inside Lane files. `id` is the library row, when the file has one.
  openFile: (row: LaneFileRow, id?: string) => void
  // Opens Lane files at a folder (tree path segments from the lane root).
  openFolder: (dir: string[]) => void
  openCard: (card: CardView, arg?: unknown) => void
  // Look a card up in the live thread (pinned cards, card surfaces).
  cardById: (id: string) => CardView | undefined
  // The last cards of the lane, newest last.
  recentCards: (n: number) => CardView[]
  select: (sel: Selection | null) => void
  hide: () => void
  // The lane's default surface set for this device (the override, or the built-in one), and a way to change it.
  defaults: StandingId[]
  // Set when the shell fixes the dock: these standing surfaces are always there, never closed, never a default to change.
  fixed: StandingId[] | null
  setDefault: (id: StandingId, on: boolean) => void
  restore: () => void
}

export const DockContext = createContext<DockApiForLane | null>(null)
export const useDock = (): DockApiForLane => {
  const v = useContext(DockContext)
  if (!v) throw new Error('useDock outside DockProvider')
  return v
}
