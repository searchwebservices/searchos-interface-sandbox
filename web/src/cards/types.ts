import type { AskItem, CardAction, CardObject, ChangesItem, Decision, FormItem, RunTool } from '@/lib/types'
import type { WorkGroup } from '@/lib/groups'
import type { Values } from '@/lib/forms'
import type { FormOutcome } from '@/app/AppContext'

// What the registry renders. A stored card is the card object as is. An older item (run, ask, form, changes,
// a shell tool) is mapped to a view with `source` pointing at the item, so one component per kind serves both.
export interface CardSource {
  ask?: AskItem
  form?: FormItem
  changes?: ChangesItem
  group?: WorkGroup
  tool?: RunTool
}
export type CardView = CardObject & { source?: CardSource }

export interface CardEnv {
  lane: string
  canAdmin: boolean
  isMember: boolean
  people: Record<string, string>
  now: number
  // Every card in this thread, stored and mapped, for the related cards of an alert.
  cards: CardView[]
  // The thread, for the changes card that follows a run.
  items: import('@/lib/types').ThreadItem[]
  // Server backed actions (approve, deny, ack, retry, submit). Resolves to an error text or null.
  act: (card: CardView, action: CardAction) => Promise<string | null>
  // The routes the older items already have.
  legacy: {
    answerAsk: (item: AskItem, d: Decision) => Promise<string | null>
    answerForm: (item: FormItem, answer: Values) => Promise<FormOutcome>
    cancelForm: (item: FormItem) => Promise<FormOutcome>
  }
  toast: (text: string) => void
}

export interface CardProps {
  card: CardView
}
export interface SurfaceProps extends CardProps {
  // Which part to show, for a card with several (the file to preview).
  arg?: unknown
}
