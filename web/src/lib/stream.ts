// One EventSource for the whole workbench (/api/stream). EventSource reconnects on its own;
// onUp fires on every (re)connect (true when it is a reconnect) so callers can resync.
import type { StreamEvent } from './types'

export interface StreamHandlers {
  onEvent: (ev: StreamEvent) => void
  onUp?: (reconnect: boolean) => void
  onDown?: () => void
}

export function connect({ onEvent, onUp, onDown }: StreamHandlers): () => void {
  let es: EventSource | null = null
  let everUp = false
  let closed = false
  const open = () => {
    es = new EventSource('/api/stream')
    es.onopen = () => {
      onUp?.(everUp)
      everUp = true
    }
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as StreamEvent)
      } catch {
        /* ignore a bad frame */
      }
    }
    es.onerror = () => {
      onDown?.()
      if (es && es.readyState === 2 && !closed) setTimeout(open, 3000)
    }
  }
  open()
  return () => {
    closed = true
    es?.close()
  }
}
