// The prompt input: draft per lane per device, send states live on the message rows, a quote chip, and the
// Read only state for a non-member. Attachments and voice are not wired and therefore not shown.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PaperclipIcon, XIcon } from 'lucide-react'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/PersonAvatar'
import * as prefs from '@/lib/prefs'
import { activeMention, filterCandidates, insertMention } from '@/lib/profile'
import type { Candidate } from '@/lib/profile'
import { cn } from '@/lib/utils'
import type { ContextAttachment, MessageAttachment, ReplyTo } from '@/lib/types'
import { getDrag, setDrag } from '@/library/dnd'
import { AttachmentChips } from './AttachmentChips'
import { ContextChips } from './ContextChips'
import { addContext, clearContext, getContext, removeContext, useContextChips } from './contextStore'
import { AttachmentEditor } from './AttachmentEditor'
import type { ImageLoader } from './AttachmentEditor'
import { confirmText, useAttachments } from './useAttachments'
import type { Uploader } from './useAttachments'
import { useAgentName } from '@/lib/agent'
import { nextPlaceholder, placeholders } from '@/ui/marvin-v2/fill'

// A request from outside the composer (the cheat sheet) to put text in it. `apply` gets the current text and returns the
// new text and the range to select (a collapsed range is a caret). A new token is a new request; the text is never sent.
export interface ComposerFill {
  token: number
  apply: (current: string) => { text: string; start: number; end: number }
}

export function Composer({
  lane,
  person,
  title,
  isDm,
  member,
  sessionMissing,
  quote,
  onClearQuote,
  onSend,
  focusToken,
  candidates,
  notify,
  uploader,
  imageLoader,
  fill,
  onFilled,
}: {
  lane: string
  person: string
  title: string
  isDm: boolean
  member: boolean
  sessionMissing: boolean
  quote: ReplyTo | null
  onClearQuote: () => void
  onSend: (text: string, quote?: ReplyTo, attachments?: MessageAttachment[]) => void
  focusToken: number
  // Who can be mentioned with @ (group lanes: the other members and Gilfoyle). Empty or missing turns the autocomplete off.
  candidates?: Candidate[]
  // Short notices (a file over the limit). Optional so the composer renders without an app around it.
  notify?: (text: string) => void
  // Test seams: how a file uploads, how an image decodes for the editor.
  uploader?: Uploader
  imageLoader?: ImageLoader
  // Optional: a shell can drop text into the box and have it focused with the caret (or a placeholder) placed.
  fill?: ComposerFill
  onFilled?: (token: number) => void
}) {
  const agent = useAgentName()
  const ctx = useContextChips(lane)
  const att = useAttachments(lane, { notify: notify ?? (() => {}), uploader })
  const fileInput = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const editingItem = att.items.find((a) => a.key === editing) ?? null
  const key = prefs.keys.draft(person, lane)
  const [text, setText] = useState(() => prefs.get<string>(key, ''))
  // A different lane has its own draft.
  useEffect(() => {
    setText(prefs.get<string>(key, ''))
  }, [key])
  useEffect(() => {
    if (focusToken && !matchMedia('(hover: none)').matches) document.getElementById('v2-composer')?.focus()
  }, [focusToken])

  // A fill from outside: set the text (and the saved draft), then focus and select once the new value is in the DOM.
  const textRef = useRef(text)
  textRef.current = text
  const lastFill = useRef(0)
  // Set once a cheat sheet prompt was dropped in: Tab walks its placeholders, and sending one unfilled asks first.
  const [fromFill, setFromFill] = useState(false)
  // The text a warning was shown for. Sending that same text again goes through.
  const [warned, setWarned] = useState<string | null>(null)
  const [sel, setSel] = useState<{ n: number; start: number; end: number } | null>(null)
  useEffect(() => {
    if (!fill || fill.token === lastFill.current || !member) return
    lastFill.current = fill.token
    const r = fill.apply(textRef.current)
    setText(r.text)
    setFromFill(placeholders(r.text).length > 0)
    setWarned(null)
    if (r.text.trim()) prefs.set(key, r.text)
    else prefs.del(key)
    setCaret(r.start)
    setSel({ n: fill.token, start: r.start, end: r.end })
    onFilled?.(fill.token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill?.token, member])
  useLayoutEffect(() => {
    if (!sel) return
    const el = document.getElementById('v2-composer') as HTMLTextAreaElement | null
    if (!el) return
    el.focus()
    el.setSelectionRange(sel.start, sel.end)
  }, [sel])

  const [caret, setCaret] = useState(0)
  const [hi, setHi] = useState(0)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const am = candidates && candidates.length ? activeMention(text, caret) : null
  const opts = am && am.start !== dismissed && candidates ? filterCandidates(candidates, am.query).slice(0, 6) : []
  const listOpen = opts.length > 0
  useEffect(() => setHi(0), [am?.query, am?.start])
  const choose = (c: Candidate) => {
    if (!am) return
    const r = insertMention(text, am, caret, c.tag)
    change(r.text)
    setCaret(r.caret)
    window.setTimeout(() => {
      const el = document.getElementById('v2-composer') as HTMLTextAreaElement | null
      el?.focus()
      el?.setSelectionRange(r.caret, r.caret)
    }, 0)
  }
  const keyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!listOpen) {
      if (fromFill && e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.nativeEvent.isComposing) {
        const el = e.currentTarget
        const next = nextPlaceholder(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0)
        if (next) {
          e.preventDefault()
          el.setSelectionRange(next.start, next.end)
          setCaret(next.start)
        }
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((i) => (i + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(opts[Math.min(hi, opts.length - 1)])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (am) setDismissed(am.start)
    }
  }
  const syncCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? el.value.length)

  const change = (v: string) => {
    setText(v)
    setWarned(null)
    if (!v.trim()) setFromFill(false)
    if (v.trim()) prefs.set(key, v)
    else prefs.del(key)
  }
  const submit = async () => {
    const t = text.trim()
    const links = getContext(lane)
    if ((!t && !att.items.length && !links.length) || !member || att.busy) return
    // A cheat sheet prompt that still holds a <placeholder>: warn once, the same text sent again goes through.
    if (fromFill && warned !== t && placeholders(t).length > 0) {
      setWarned(t)
      return
    }
    let rows: MessageAttachment[] = []
    if (att.items.length) {
      const done = await att.upload() // files first; a failure leaves the chips and the text where they are
      if (!done) return
      rows = done
    }
    const all = [...rows, ...links]
    onSend(t, quote ?? undefined, all.length ? all : undefined)
    setText('')
    setFromFill(false)
    setWarned(null)
    prefs.del(key)
    att.clear()
    clearContext(lane)
    onClearQuote()
  }
  // A drag that started in the Drive browser carries references, not bytes: dropping it adds context chips.
  const linkDrag = () => {
    const d = getDrag()
    return d?.refs?.length && (!d.lane || d.lane === lane) ? d : null
  }
  const hasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types ?? []).includes('Files')
  // Capture phase, so the prompt input's own file handling (which would read a whole file into memory) never sees them.
  const onDropCapture = (e: React.DragEvent) => {
    const d = linkDrag()
    if (d) {
      e.preventDefault()
      e.stopPropagation()
      setDragging(false)
      setDrag(null)
      if (member) addContext(lane, d.refs!)
      return
    }
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (member && e.dataTransfer.files.length) att.add(e.dataTransfer.files)
  }
  const onDragOverCapture = (e: React.DragEvent) => {
    if (linkDrag()) {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'link'
      if (member) setDragging(true)
      return
    }
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    if (member) setDragging(true)
  }
  const onPasteCapture = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (!files.length) return
    e.preventDefault()
    e.stopPropagation()
    if (member) att.add(files)
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-3">
      {quote && (
        <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-primary bg-secondary px-3 py-1.5 text-xs" data-testid="quote-chip">
          <div className="min-w-0 flex-1">
            <div className="font-medium">Replying to {quote.person}</div>
            <div className="truncate text-muted-foreground">{(quote.excerpt || '').replace(/\s+/g, ' ')}</div>
          </div>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove quote" onClick={onClearQuote}>
            <XIcon />
          </Button>
        </div>
      )}
      <div className={cn('relative rounded-xl', dragging && 'ring-2 ring-ring')} onDragOverCapture={onDragOverCapture} onDragLeave={() => setDragging(false)} onDropCapture={onDropCapture} onPasteCapture={onPasteCapture} data-testid="composer-drop" data-dragging={dragging}>
      {listOpen && (
        <ul role="listbox" id="mention-list" aria-label="Mention" data-testid="mention-list" className="absolute bottom-full left-0 z-20 mb-1 w-72 max-w-full overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {opts.map((c, i) => (
            <li
              key={c.id}
              id={'mention-opt-' + c.id}
              role="option"
              aria-selected={i === hi}
              data-testid="mention-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
              className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm', i === hi && 'bg-accent text-accent-foreground')}
            >
              <PersonAvatar id={c.id} name={c.name} size="xs" />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground">@{c.tag}</span>
            </li>
          ))}
        </ul>
      )}
      <PromptInput onSubmit={submit}>
        {att.items.length > 0 && (
          <PromptInputHeader className="w-full flex-col items-stretch p-0">
            <AttachmentChips items={att.items} busy={att.busy} batch={att.batch} onOpen={(a) => setEditing(a.key)} onRemove={att.remove} />
          </PromptInputHeader>
        )}
        {ctx.length > 0 && (
          <PromptInputHeader className="w-full flex-col items-stretch p-0">
            <ContextChips items={ctx} onRemove={(c: ContextAttachment) => removeContext(lane, c)} />
          </PromptInputHeader>
        )}
        <PromptInputBody>
          <PromptInputTextarea
            id="v2-composer"
            value={text}
            disabled={!member}
            aria-label="Message"
            placeholder={!member ? 'Read only' : isDm ? 'Message ' + agent : 'Message ' + title}
            aria-autocomplete={candidates?.length ? 'list' : undefined}
            aria-controls={listOpen ? 'mention-list' : undefined}
            aria-activedescendant={listOpen ? 'mention-opt-' + opts[Math.min(hi, opts.length - 1)].id : undefined}
            onChange={(e) => {
              change(e.currentTarget.value)
              syncCaret(e.currentTarget)
              setDismissed(null)
            }}
            onKeyDown={keyDown}
            onKeyUp={(e) => syncCaret(e.currentTarget)}
            onClick={(e) => syncCaret(e.currentTarget)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              aria-label="Choose files to attach"
              tabIndex={-1}
              data-testid="attach-input"
              onChange={(e) => {
                if (e.currentTarget.files?.length) att.add(e.currentTarget.files)
                e.currentTarget.value = ''
              }}
            />
            <PromptInputButton type="button" aria-label="Attach files" title="Attach files" disabled={!member || att.busy} onClick={() => fileInput.current?.click()} data-testid="attach-button">
              <PaperclipIcon />
            </PromptInputButton>
            <span className="px-2 text-xs text-muted-foreground">{member ? 'Enter to send, Shift Enter newline' : 'Read only: you are not a member of this lane'}</span>
          </PromptInputTools>
          <PromptInputSubmit disabled={!member || att.busy || (!text.trim() && !att.items.length && !ctx.length)} />
        </PromptInputFooter>
      </PromptInput>
      </div>
      <AttachmentEditor
        file={editingItem && editingItem.state !== 'uploading' ? editingItem.file : null}
        open={!!editingItem}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={(f) => {
          if (editingItem) att.replace(editingItem.key, f)
          setEditing(null)
        }}
        loader={imageLoader}
      />
      <AlertDialog open={!!att.confirm} onOpenChange={(o) => !o && att.resolveConfirm(false)}>
        <AlertDialogContent data-testid="big-file-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Attach a large file?</AlertDialogTitle>
            <AlertDialogDescription data-testid="big-file-text">{att.confirm ? confirmText(att.confirm) : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="big-file-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => att.resolveConfirm(true)} data-testid="big-file-ok">Attach</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {warned !== null && (
        <p role="status" className="mt-1 text-xs text-destructive" data-testid="placeholder-warning">
          This still has {placeholders(warned).length === 1 ? 'a <placeholder>' : 'unfilled <placeholders>'} to fill in: {placeholders(warned).map((p) => warned.slice(p.start, p.end)).join(' ')}. Press Enter again to send anyway.
        </p>
      )}
      {sessionMissing && (
        <p role="status" className="mt-1 text-xs text-destructive">
          This lane has no live OpenCode session. Messages are saved, not forwarded.
        </p>
      )}
    </div>
  )
}
