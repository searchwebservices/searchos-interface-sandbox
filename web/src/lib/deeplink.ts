// Message deep links: /v2/#/lanes/<lane>/m/<messageId>. The link is built here, and opening one is: find the message
// in the loaded thread; else ask the console for the page around it; else ask which of my lanes holds it and move there.
import * as api from './api'
import type { ThreadItem } from './types'

export const messageLink = (lane: string, id: string): string => location.origin + import.meta.env.BASE_URL + '#/lanes/' + encodeURIComponent(lane) + '/m/' + encodeURIComponent(id)

const FLASH = ['ring-2', 'ring-ring', 'bg-accent/40']
// Scrolls a message row to the middle and lights it for a moment.
export function flash(el: HTMLElement, ms = 1400): void {
  el.scrollIntoView?.({ block: 'center' })
  el.classList.add(...FLASH)
  window.setTimeout(() => el.classList.remove(...FLASH), ms)
}

export type DeepOutcome = 'found' | 'merged' | 'moved' | 'missing'
export async function openMessage(a: { lane: string; id: string; present: () => boolean; merge: (items: ThreadItem[]) => void; moveTo: (lane: string) => void }): Promise<DeepOutcome> {
  if (a.present()) return 'found'
  const page = await api.messagesAround(a.lane, a.id)
  if (page.ok && Array.isArray(page.body.items)) {
    a.merge(page.body.items)
    return 'merged'
  }
  const owner = await api.resolveMessage(a.id)
  if (owner.ok && owner.body.lane && owner.body.lane !== a.lane) {
    a.moveTo(owner.body.lane)
    return 'moved'
  }
  return 'missing'
}
