// Context chips waiting in a lane's composer: files and folders from Lane files that the next message will point at.
// A small module store (per lane, in memory) so the Drive browser in the dock can add to the composer without either
// knowing the other. Nothing here uploads or reads a file.
import { useSyncExternalStore } from 'react'
import type { ContextAttachment } from '@/lib/types'

const NONE: ContextAttachment[] = []
const byLane = new Map<string, ContextAttachment[]>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const same = (a: ContextAttachment, b: ContextAttachment): boolean => a.kind === b.kind && a.ref === b.ref

// Adds what is not already there. Returns how many were new.
export function addContext(lane: string, refs: ContextAttachment[]): number {
  const cur = byLane.get(lane) ?? NONE
  const fresh = refs.filter((r, i) => !cur.some((c) => same(c, r)) && refs.findIndex((x) => same(x, r)) === i)
  if (fresh.length) {
    byLane.set(lane, [...cur, ...fresh])
    emit()
  }
  return fresh.length
}
export function removeContext(lane: string, ref: ContextAttachment): void {
  const cur = byLane.get(lane)
  if (!cur) return
  const next = cur.filter((c) => !same(c, ref))
  if (next.length) byLane.set(lane, next)
  else byLane.delete(lane)
  emit()
}
export function clearContext(lane: string): void {
  if (byLane.delete(lane)) emit()
}
export const getContext = (lane: string): ContextAttachment[] => byLane.get(lane) ?? NONE

export function useContextChips(lane: string): ContextAttachment[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => getContext(lane),
  )
}
