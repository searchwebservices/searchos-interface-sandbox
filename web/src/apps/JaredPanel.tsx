// "Ask Jared": the dock body of every app page. Hosts the jared-bay thread in a compact form: the last messages and a
// composer. LaneView is a whole page (header, find, selection, its own dock), so it is not embedded; this panel reads
// the same store thread and posts through the same send path. The "[on screen: ...]" prefix rides on the body only
// when a message is sent from here, and the panel strips it again when it draws the thread.
import { useEffect, useRef, useState } from 'react'
import { SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/app/AppContext'
import { emptyThread, feedOf } from '@/lib/store'
import type { TextMessage } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { JaredPrefill } from './jared'

interface Row { key: string; mine: boolean; text: string; note: string }
export const JARED_LANE = 'jared-bay'
const PREFIX = /^\[on screen: [^\]\n]*\]\n?/

export const withContext = (context: string, text: string): string => (context ? '[on screen: ' + context.replace(/[\]\n]+/g, ' ') + ']\n' + text : text)
export const stripContext = (text: string): string => text.replace(PREFIX, '')

export function JaredPanel({ context, lane = JARED_LANE, prefill = null }: { context: string; lane?: string; prefill?: JaredPrefill | null }) {
  const app = useApp()
  const { store } = app
  const known = !!store.lanes[lane]
  const t = store.threads[lane] ?? emptyThread()
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // A new prefill (by sequence, so the same text twice still lands) replaces the draft; the person edits and sends.
  useEffect(() => { if (prefill) { setDraft(prefill.text); input.current?.focus?.() } }, [prefill])
  useEffect(() => {
    if (known) void app.loadThread(lane)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane, known])
  const stored = feedOf(t).filter((m): m is TextMessage => (m as TextMessage).role !== undefined && ['person', 'agent', 'gilfoyle'].includes((m as TextMessage).role) && typeof (m as TextMessage).text === 'string')
  // Sends still in flight (or failed) live in t.pending until the console echoes them back with their client id.
  const inFlight = t.pending.filter((p) => !stored.some((m) => m.client_id === p.client_id))
  const items: Row[] = [...stored.map((m) => ({ key: m.id, mine: m.role === 'person', text: m.text, note: '' })), ...inFlight.map((p) => ({ key: p.client_id, mine: true, text: p.text, note: p.state === 'sending' ? 'sending' : 'not sent' }))].slice(-8)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [items.length])
  const submit = () => {
    const text = draft.trim()
    if (!text || !known) return
    app.send(lane, withContext(context, text))
    setDraft('')
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="jared-panel">
      <p className="border-b px-3 py-2 text-xs text-muted-foreground" data-testid="jared-context">On screen: {context}</p>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" data-testid="jared-thread">
        {!known && <p className="text-sm text-muted-foreground" data-testid="jared-missing">Jared's lane is not available to this account.</p>}
        {known && !items.length && <p className="text-sm text-muted-foreground">No messages yet. Ask about what is on screen.</p>}
        {items.map((m) => (
          <div key={m.key} data-testid="jared-msg" data-mine={m.mine ? 'true' : 'false'} className={cn('max-w-[90%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm', m.mine ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-secondary text-secondary-foreground')}>
            {stripContext(m.text)}
            {m.note && <span className="mt-1 block text-xs opacity-70">{m.note}</span>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex items-end gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <textarea
          ref={input}
          aria-label="Message Jared"
          data-testid="jared-input"
          rows={2}
          value={draft}
          disabled={!known}
          placeholder="Ask Jared"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          className="min-h-9 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" aria-label="Send" data-testid="jared-send" disabled={!known || !draft.trim()}>
          <SendIcon />
        </Button>
      </form>
    </div>
  )
}
