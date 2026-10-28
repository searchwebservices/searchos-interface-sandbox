import { createContext, useContext } from 'react'
import { useSurfaces } from './surface-context'
import type { CardEnv, CardView } from './types'

const quiet = async () => null
const none: CardEnv = {
  lane: '',
  canAdmin: false,
  isMember: false,
  people: {},
  now: 0,
  cards: [],
  items: [],
  act: quiet,
  legacy: {
    answerAsk: quiet,
    answerForm: async () => ({ error: null }),
    cancelForm: async () => ({ error: null }),
  },
  toast: () => {},
}

export const CardEnvContext = createContext<CardEnv>(none)
export const useCardEnv = (): CardEnv => useContext(CardEnvContext)
export const defaultCardEnv = none

// Open a card's surface wherever the host shows it. A no-op when no host is mounted.
export function useOpen(): (card: CardView, arg?: unknown) => void {
  const s = useSurfaces()
  return (card, arg) => s?.open(card, arg)
}
