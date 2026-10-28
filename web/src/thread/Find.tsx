// Find in thread: highlights every match in the message text (nothing is filtered out), counts them, and steps
// through them. Matches are DOM Ranges over the text nodes marked data-find, painted with the CSS Custom Highlight
// API, so React's own DOM is never touched.
import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

type HighlightCtor = new (...r: Range[]) => unknown
interface HighlightRegistry {
  set: (k: string, v: unknown) => void
  delete: (k: string) => void
}
const registry = (): HighlightRegistry | null => {
  const c = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS
  return c && c.highlights ? c.highlights : null
}
const Highlight = (): HighlightCtor | null => ((globalThis as { Highlight?: HighlightCtor }).Highlight ?? null)

export function rangesFor(root: HTMLElement, query: string): Range[] {
  const q = query.toLowerCase()
  const out: Range[] = []
  if (!q) return out
  root.querySelectorAll('[data-find]').forEach((el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const text = (n.nodeValue ?? '').toLowerCase()
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + q.length)
        out.push(r)
      }
    }
  })
  return out
}

export function FindBar({ rootRef, version, focusToken, onClose }: { rootRef: React.RefObject<HTMLElement | null>; version: string; focusToken: number; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [count, setCount] = useState(0)
  const ranges = useRef<Range[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focusToken])

  useEffect(() => {
    const root = rootRef.current
    ranges.current = root ? rangesFor(root, q) : []
    setCount(ranges.current.length)
    setIdx((i) => (i >= ranges.current.length ? 0 : i))
  }, [q, version, rootRef])

  useEffect(() => {
    const reg = registry()
    const H = Highlight()
    if (!reg || !H) return undefined
    const all = ranges.current
    reg.set('find-match', new H(...all.filter((_, i) => i !== idx)))
    reg.set('find-current', new H(...(all[idx] ? [all[idx]] : [])))
    return () => {
      reg.delete('find-match')
      reg.delete('find-current')
    }
  }, [q, version, idx, count])

  // Scroll the current match into view when the query or the position changes, not on every streamed token.
  useEffect(() => {
    const r = ranges.current[idx]
    const el = r ? (r.startContainer.parentElement as HTMLElement | null) : null
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' })
  }, [q, idx, count])

  const step = (d: number) => {
    if (!count) return
    setIdx((i) => (i + d + count) % count)
  }

  return (
    <div className="flex items-center gap-2 border-b bg-card px-3 py-2" role="search" data-testid="find-bar">
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setIdx(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder="Find in this thread"
        aria-label="Find in this thread"
        className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="shrink-0 font-mono text-xs text-muted-foreground" data-testid="find-count" aria-live="polite">
        {q ? (count ? `${idx + 1} of ${count}` : '0 of 0') : ''}
      </span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous match" onClick={() => step(-1)} disabled={!count}>
        <ChevronUpIcon />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Next match" onClick={() => step(1)} disabled={!count}>
        <ChevronDownIcon />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Close find" onClick={onClose}>
        <XIcon />
      </Button>
    </div>
  )
}
