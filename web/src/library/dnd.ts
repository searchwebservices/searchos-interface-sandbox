// Drag and drop between tiles, folders and breadcrumb items, and the cut clipboard. The payload lives here instead of
// in dataTransfer because a drag over only exposes its types, never its data, until the drop.
import { useState } from 'react'
import type { DragEvent } from 'react'
import { isInside } from '@/lib/filetree'
import type { ContextAttachment } from '@/lib/types'

export interface DragPayload {
  files: string[] // library row ids
  folders: string[][] // tree dirs
  lane: string
  // What dropping on the chat composer adds: references to the dragged items, never their bytes.
  refs?: ContextAttachment[]
}
let drag: DragPayload | null = null
let cut: DragPayload | null = null
export const setDrag = (p: DragPayload | null): void => {
  drag = p
}
export const getDrag = (): DragPayload | null => drag
export const setCut = (p: DragPayload | null): void => {
  cut = p
}
export const getCut = (): DragPayload | null => cut

// A folder cannot go into itself or into anything below it.
export function dropAllowed(p: DragPayload | null, target: string[], writable: boolean, laneOfTarget: string | null): boolean {
  if (!p || !writable) return false
  if (!p.files.length && !p.folders.length) return false // a read only item dragged for the composer cannot be moved
  if (laneOfTarget && p.lane !== laneOfTarget) return false
  return !p.folders.some((f) => isInside(target, f))
}

export interface DropTargetOps {
  writableDir: (dir: string[]) => boolean
  laneOf: (dir: string[]) => string | null
  moveTo: (files: string[], folders: string[][], target: string[]) => Promise<void> | void
}
export function useDropTarget(dir: string[], ops: DropTargetOps) {
  const [over, setOver] = useState(false)
  const ok = () => dropAllowed(drag, dir, ops.writableDir(dir), ops.laneOf(dir))
  return {
    over,
    props: {
      onDragEnter: (e: DragEvent) => {
        if (ok()) {
          e.preventDefault()
          setOver(true)
        }
      },
      onDragOver: (e: DragEvent) => {
        if (ok()) {
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
          setOver(true)
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        const p = drag
        if (!p || !ok()) return
        e.preventDefault()
        e.stopPropagation()
        drag = null
        void ops.moveTo(p.files, p.folders, dir)
      },
    },
  }
}
