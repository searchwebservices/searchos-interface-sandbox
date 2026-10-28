// Scratchpad: one markdown note per lane. People edit it freely; Gilfoyle reads it (scratch_read) and appends to it
// (scratch_append). It saves itself: 600 ms after typing stops, on blur, and at once on Cmd or Ctrl S. Every save is
// a new version on the server and carries the version it was loaded at; if the note moved on meanwhile, the other
// side's new lines are merged in after ours (never overwritten) and the save goes again. While the surface is open
// the note is read every 5 s, so Gilfoyle's appends arrive live. History lists the server's versions, with Restore.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HistoryIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import * as api from '@/lib/api'
import { mergeNote } from '@/lib/scratchmerge'
import { displayName, relTime } from '@/lib/time'
import type { Scratch, ScratchVersion } from '@/lib/types'
import { useNow } from '@/lib/useNow'
import { useDock } from './context'
import { useSurfaceState } from './hooks'
import { useAgentName } from '@/lib/agent'

interface PadState extends Record<string, unknown> {
  loaded: boolean
  // What the person sees and has typed.
  text: string
  // The version the server last gave us, and its text: the starting point of our edits and of any merge.
  version: number
  savedText: string
  updatedAt: string
  updatedBy: string
  // saving: a save is on its way (or queued behind the debounce). saved: the last save landed. error: it did not.
  status: '' | 'saving' | 'saved' | 'error'
  savedAt: string
}
const S0: PadState = { loaded: false, text: '', version: 0, savedText: '', updatedAt: '', updatedBy: '', status: '', savedAt: '' }
export const DEBOUNCE_MS = 600
export const POLL_MS = 5000
const RETRY_MS = 5000
const MAX_MERGES = 4

const whoOf = (b: Scratch['updated_by'], agent: string): string => (b ? (b.via === 'harness' || b.person === 'gilfoyle' ? agent : b.person ? displayName(b.person) : '') : '')
const isNote = (b: unknown): b is Scratch => !!b && typeof (b as Scratch).text === 'string' && typeof (b as Scratch).version === 'number'

export function Scratchpad({ lane }: { lane: string }) {
  const agent = useAgentName()
  const d = useDock()
  const [s, patch] = useSurfaceState<PadState>(lane, 'scratch', S0)
  const live = useRef(s)
  live.current = s
  // Patch the store and the ref together: a save loop reads the ref again before React has rendered.
  const apply = (p: Partial<PadState>) => {
    live.current = { ...live.current, ...p }
    patch(p)
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef(false)
  const again = useRef(false)
  const reads = useRef(0)
  const caret = useRef<number | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const [history, setHistory] = useState<ScratchVersion[] | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const now = useNow(30000, s.status === 'saved')

  const dirty = s.loaded && s.text !== s.savedText
  // Open: this tab is the expanded one and the dock is showing (or the bottom sheet is up).
  const open = d.state.active === 'scratch' && (d.narrow ? d.sheetOpen : !d.state.hidden)

  const take = (r: Scratch): Partial<PadState> => ({ loaded: true, text: r.text, savedText: r.text, version: r.version, updatedAt: r.updated_at ?? '', updatedBy: whoOf(r.updated_by, agent) })
  // Someone else's version arrived: ours stays, theirs is merged in.
  const absorb = (r: Scratch): Partial<PadState> => {
    const cur = live.current
    const merged = mergeNote(cur.savedText, cur.text, r.text)
    return { ...take(r), text: merged }
  }

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const schedule = (ms: number) => {
    clear()
    timer.current = setTimeout(() => void save(), ms)
  }

  async function save(): Promise<void> {
    clear()
    if (inflight.current) {
      again.current = true
      return
    }
    if (!live.current.loaded) return
    inflight.current = true
    try {
      for (let tries = 0; tries < MAX_MERGES; tries++) {
        const cur = live.current
        if (cur.text === cur.savedText) {
          // Nothing to write (Cmd S on a clean note, or a merge that left nothing of ours): it is saved.
          apply({ status: 'saved', savedAt: new Date().toISOString() })
          return
        }
        apply({ status: 'saving' })
        const sent = cur.text
        const r = await api.putScratch(lane, sent, cur.version)
        if (r.ok && isNote(r.body)) {
          // Typing may have gone on while the request was out: what is on screen is the next save, after its debounce.
          const onScreen = live.current.text
          apply({ ...take(r.body), text: onScreen === sent ? r.body.text : onScreen, status: onScreen === sent ? 'saved' : 'saving', savedAt: new Date().toISOString() })
          return
        }
        if (r.status === 409 && isNote(r.body.current)) {
          // The note moved on: take their new lines in after ours, then write again on their version.
          apply({ ...absorb(r.body.current), status: 'saving' })
          continue
        }
        apply({ status: 'error' })
        schedule(RETRY_MS)
        return
      }
    } finally {
      inflight.current = false
      reads.current++
      if (again.current) {
        again.current = false
        schedule(DEBOUNCE_MS)
      }
    }
  }

  // A read that started before a save finished, or that lands while one is out, is older than what we hold.
  const read = () => {
    const at = reads.current
    return api.scratch(lane).then((r) => {
      if (!r.ok || !isNote(r.body) || inflight.current || at !== reads.current) return
      const cur = live.current
      if (!cur.loaded) apply(take(r.body))
      else if (r.body.version > cur.version) {
        if (cur.text === cur.savedText) apply(take(r.body))
        else {
          const next = absorb(r.body)
          apply(next)
          if (next.text !== next.savedText) schedule(DEBOUNCE_MS)
        }
      }
    })
  }

  useEffect(() => {
    void read()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane])
  // Live while open: Gilfoyle's appends show up without a reload.
  useEffect(() => {
    if (!open) return undefined
    void read()
    const t = setInterval(() => void read(), POLL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane, open])
  // Leaving the lane with an unsaved edit saves it on the way out.
  useEffect(
    () => () => {
      clear()
      if (live.current.loaded && live.current.text !== live.current.savedText) void save()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lane],
  )
  // A Tab key press inserts spaces; put the caret back after React has written the new value.
  useLayoutEffect(() => {
    if (caret.current != null && area.current) {
      area.current.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  }, [s.text])

  const edit = (text: string) => {
    apply({ text, status: 'saving' })
    schedule(DEBOUNCE_MS)
  }
  const loadHistory = () => {
    setHistoryError(false)
    void api.scratchHistory(lane).then((r) => (r.ok && Array.isArray(r.body.versions) ? setHistory(r.body.versions) : setHistoryError(true)))
  }
  const restore = async (v: ScratchVersion) => {
    const r = await api.scratchVersion(lane, v.version)
    if (!r.ok || typeof r.body.text !== 'string') return setHistoryError(true)
    edit(r.body.text)
    schedule(0)
  }

  const note =
    s.status === 'error'
      ? 'Not saved, trying again'
      : dirty || s.status === 'saving'
        ? 'Saving...'
        : s.status === 'saved'
          ? 'Saved ' + (relTime(s.savedAt, now) || 'just now')
          : s.version
            ? `Version ${s.version}${s.updatedBy ? ', by ' + s.updatedBy : ''}${s.updatedAt ? ', ' + relTime(s.updatedAt, now) : ''}`
            : 'Empty'
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4" data-testid="scratchpad">
      <Textarea
        ref={area}
        value={s.text}
        disabled={!s.loaded}
        aria-label="Scratchpad (markdown)"
        placeholder={s.loaded ? 'Notes for this lane. ' + agent + ' can read this and add to it.' : 'Loading...'}
        className="min-h-40 flex-1 resize-none font-sans text-sm leading-relaxed"
        data-testid="scratch-text"
        onChange={(e) => edit(e.target.value)}
        onBlur={() => {
          if (live.current.text !== live.current.savedText) void save()
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
            e.preventDefault()
            void save()
          } else if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault()
            const el = e.currentTarget
            const a = el.selectionStart
            caret.current = a + 2
            edit(el.value.slice(0, a) + '  ' + el.value.slice(el.selectionEnd))
          }
        }}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span role="status" aria-live="polite" data-testid="scratch-status">{note}</span>
        <DropdownMenu onOpenChange={(o) => o && loadHistory()}>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="xs" variant="ghost" className="ml-auto" data-testid="scratch-history-button">
              <HistoryIcon />
              History
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto" data-testid="scratch-history">
            <DropdownMenuLabel>Versions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {historyError && <p className="px-2 py-1.5 text-sm text-destructive">History could not be read.</p>}
            {!historyError && !history && <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</p>}
            {history && history.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No versions yet.</p>}
            {history?.map((v) => (
              <DropdownMenuItem key={v.version} onSelect={() => void restore(v)} data-testid="scratch-version" aria-label={`Restore version ${v.version}`}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm">Version {v.version}{v.version === s.version ? ' (current)' : ''}</span>
                  <span className="text-xs text-muted-foreground">{[whoOf(v.by, agent) || (v.by?.person ? displayName(v.by.person) : ''), relTime(v.at, now)].filter(Boolean).join(', ')}</span>
                </span>
                <span className="text-xs font-medium">Restore</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
