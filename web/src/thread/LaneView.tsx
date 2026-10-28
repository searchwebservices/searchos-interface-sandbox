import { LaneIcon } from "@/components/LaneIcon"
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { GilfoyleAvatar } from '@/components/GilfoyleAvatar'
import { ArrowDownIcon, ForwardIcon, SearchIcon, XIcon, CopyIcon } from 'lucide-react'
import { useStickToBottomContext } from 'use-stick-to-bottom'
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NavTrigger } from '@/app/NavTrigger'
import { useApp } from '@/app/AppContext'
import { emptyThread, feedOf, signerOf, isMember, isOwnerOrAdmin, isWorking, openRun, workingSince } from '@/lib/store'
import { copyText } from '@/lib/clip'
import { dayKey, dayLabel, displayName, initials } from '@/lib/time'
import type { Candidate } from '@/lib/profile'
import { useNow } from '@/lib/useNow'
import { emptyFor } from '@/lanes/suggestions'
import { go } from '@/app/router'
import * as api from '@/lib/api'
import { flash, openMessage } from '@/lib/deeplink'
import type { ReplyTo, TextMessage, ThreadItem } from '@/lib/types'
import { WorkingRow } from './Agent'
import { CardInline } from '@/cards/registry'
import { Dock } from '@/dock/Dock'
import { DockControls, SelectionChip } from '@/dock/DockControls'
import { DockProvider } from '@/dock/DockHost'
import type { StandingId } from '@/lib/dock'
import { CardEnvContext } from '@/cards/env'
import { cardOfAsk, cardOfForm, cardOfGroup } from '@/cards/map'
import type { CardEnv, CardView } from '@/cards/types'
import { FindBar } from './Find'
import { SearchButton } from '@/app/SearchButton'
import { groupFeed } from '@/lib/groups'
import { Composer } from './Composer'
import type { ComposerFill } from './Composer'
import { MessageRow, StreamingReply, isSelectable } from './Messages'
import type { MessageEnv, SelectionApi } from './Messages'
import { ForwardDialog } from './ForwardDialog'
import { agentName, isAgentRole } from '@/lib/agent'

// Inside <Conversation>: marks the lane read when the reader is at the bottom of a visible page, and shows the
// jump pill with the count of conversation items that arrived while they were away.
function Watch({ lane, items }: { lane: string; items: ThreadItem[] }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  const { markRead } = useApp()
  const convo = items.filter((m) => m.role !== 'run' && m.role !== 'changes' && m.role !== 'form' && m.role !== 'card')
  const seen = useRef(convo.length)
  const [, force] = useState(0)
  const last = convo.length ? convo[convo.length - 1].at : ''
  useEffect(() => {
    if (isAtBottom) {
      seen.current = convo.length
      force((n) => n + 1)
      if (!document.hidden && last) markRead(lane, last)
    }
  }, [isAtBottom, convo.length, last, lane, markRead])
  useEffect(() => {
    const on = () => {
      if (!document.hidden && isAtBottom && last) markRead(lane, last)
    }
    document.addEventListener('visibilitychange', on)
    window.addEventListener('focus', on)
    return () => {
      document.removeEventListener('visibilitychange', on)
      window.removeEventListener('focus', on)
    }
  }, [isAtBottom, last, lane, markRead])
  if (isAtBottom) return null
  const away = Math.max(0, convo.length - seen.current)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background"
      onClick={() => void scrollToBottom()}
      data-testid="jump-pill"
    >
      <ArrowDownIcon />
      {away ? (away === 1 ? '1 new message' : away + ' new messages') : 'Jump to latest'}
    </Button>
  )
}

// Optional places a variant shell can fill without touching the thread: extra header buttons, a row above the
// composer, a request to put text in the composer, and hiding the phone's Back-to-lanes button. Unset means unchanged.
export interface LaneSlots {
  headerActions?: ReactNode
  aboveComposer?: ReactNode
  fill?: ComposerFill
  onFilled?: (token: number) => void
  hideBack?: boolean
  // One-chat shells have nowhere to forward to: no Forward action, no dialog.
  hideForward?: boolean
  // A fixed dock: exactly these standing surfaces, always. No Surfaces menu, no closing them.
  fixedSurfaces?: StandingId[]
  // Find lives in the app search (Cmd K) here: no Find button, and Cmd F is left to the browser.
  hideFind?: boolean
  // An inbox DM header: the agent's avatar and name only, no lane title, kind badge or member chips.
  inboxTitle?: boolean
}

export function LaneView({ laneId, msg, slots }: { laneId: string; msg?: string; slots?: LaneSlots }) {
  const app = useApp()
  const { store } = app
  const lane = store.lanes[laneId]
  const t = store.threads[laneId] ?? emptyThread()
  const me = store.me
  const now = useNow(30000)
  const [quote, setQuote] = useState<ReplyTo | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  // The read mark as it was when this lane was opened: the "New" divider sits where unread begins.
  const [sinceAtOpen, setSinceAtOpen] = useState('')
  const snapped = useRef('')
  const [findOpen, setFindOpen] = useState(false)
  const [findToken, setFindToken] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Multi-select: the picked message ids, in the order they were picked; the anchor is the last one clicked (for Shift ranges).
  const [selOn, setSelOn] = useState(false)
  const [selIds, setSelIds] = useState<string[]>([])
  const anchor = useRef('')
  const [forwardIds, setForwardIds] = useState<string[] | null>(null)
  const openFind = () => {
    setFindOpen(true)
    setFindToken((n) => n + 1)
  }

  // Cmd F (Ctrl F elsewhere) finds in this thread. Only mounted while a lane is open, so no lane means the browser keeps it.
  const hideFind = !!slots?.hideFind
  useEffect(() => {
    if (hideFind) return
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFindOpen(true)
        setFindToken((n) => n + 1)
      }
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [hideFind])

  useEffect(() => {
    void app.loadThread(laneId)
    setQuote(null)
    snapped.current = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneId])
  useEffect(() => {
    if (t.loaded && snapped.current !== laneId) {
      snapped.current = laneId
      setSinceAtOpen(store.readAt[laneId] ?? '')
    }
  }, [t.loaded, laneId, store.readAt])

  // Deep link to one message (#/lanes/:id/m/:msg). In the loaded thread it scrolls and flashes; outside it the console
  // sends the page around it; in another lane the console says which one and we move there.
  const [flashTick, setFlashTick] = useState(0)
  const [flashId, setFlashId] = useState('')
  const reach = (id: string) =>
    openMessage({
      lane: laneId,
      id,
      present: () => !!document.getElementById('m-' + id),
      merge: (items) => app.mergeThread(laneId, items),
      moveTo: (to) => go({ name: 'lane', id: to, msg: id }),
    }).then((o) => {
      if (o === 'found' || o === 'merged') {
        setFlashId(id)
        setFlashTick((n) => n + 1)
      } else if (o === 'missing') app.toast('That message is not available.')
      return o
    })
  useEffect(() => {
    if (!msg || !t.loaded || !lane) return
    let alive = true
    void reach(msg).then(() => alive)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg, t.loaded, laneId])
  // The lane in the link is not one I have: ask which of my lanes holds the message.
  useEffect(() => {
    if (!msg || lane || !store.order.length) return
    void api.resolveMessage(msg).then((r) => {
      if (r.ok && r.body.lane) go({ name: 'lane', id: r.body.lane, msg })
      else app.toast('That message is not available.')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg, lane, store.order.length])
  useEffect(() => {
    if (!flashTick || !flashId) return
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById('m-' + flashId)
      if (el) flash(el)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [flashTick, flashId])

  const mePeople = store.me?.people
  const profiles = store.profiles
  const people = useMemo(
    () => ({
      ...Object.fromEntries((lane?.members ?? []).map((p) => [p, displayName(p)])),
      ...Object.fromEntries((mePeople ?? []).filter((p) => p.name).map((p) => [p.id, p.name])),
      ...Object.fromEntries(Object.values(profiles).map((p) => [p.person_id, p.name])),
    }),
    [lane, mePeople, profiles],
  )
  const member = isMember(store, laneId)
  const working = isWorking(lane, t)
  const items = feedOf(t)
  const open = openRun(t)
  const isEmpty = t.loaded && items.length === 0 && t.pending.length === 0 && Object.keys(t.streams).length === 0

  // Text messages in thread order, for Shift ranges.
  const selectableIds = items.filter((m): m is TextMessage => (m.role === 'person' || isAgentRole(m.role) || m.role === 'lane') && isSelectable(m as TextMessage)).map((m) => m.id)
  const cancelSelection = () => {
    setSelOn(false)
    setSelIds([])
    anchor.current = ''
  }
  const selection: SelectionApi = {
    on: selOn,
    ids: new Set(selIds),
    start: (id) => {
      setSelOn(true)
      setSelIds([id])
      anchor.current = id
    },
    toggle: (id, mod) => {
      if (mod.shift && anchor.current && anchor.current !== id) {
        const a = selectableIds.indexOf(anchor.current)
        const b = selectableIds.indexOf(id)
        if (a >= 0 && b >= 0) {
          const range = selectableIds.slice(Math.min(a, b), Math.max(a, b) + 1)
          setSelIds((cur) => cur.concat(range.filter((x) => !cur.includes(x))))
          anchor.current = id
          return
        }
      }
      setSelIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id)))
      anchor.current = id
    },
  }
  // Escape leaves selection mode (the forward dialog closes itself first).
  useEffect(() => {
    if (!selOn) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && forwardIds === null) {
        setSelOn(false)
        setSelIds([])
      }
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [selOn, forwardIds])
  const selectedInOrder = selectableIds.filter((id) => selIds.includes(id))
  const copySelected = async () => {
    const byId = new Map(items.map((m) => [m.id, m]))
    const text = selectedInOrder
      .map((id) => byId.get(id) as TextMessage)
      .map((m) => {
        const who = isAgentRole(m.role) ? agentName(lane) : m.role === 'lane' ? m.from_lane || 'lane' : people[m.signature?.person ?? ''] || m.signature?.person || ''
        return who + ' (' + m.at + '):\n' + m.text
      })
      .join('\n\n')
    app.toast((await copyText(text)) ? 'Copied ' + selectedInOrder.length : 'Could not copy')
    cancelSelection()
  }
  const memberLanes = store.order.map((id) => store.lanes[id]).filter((l) => l && me && l.members.includes(me.person))
  const laneTitles = useMemo(() => Object.fromEntries(Object.values(store.lanes).map((l) => [l.id, l.title])), [store.lanes])
  // Mentions work in group lanes: the other members and Gilfoyle, by the tag on their profile.
  const candidates: Candidate[] =
    lane?.kind === 'group'
      ? [
          ...lane.members.filter((p) => p !== me?.person).map((p) => ({ id: p, tag: profiles[p]?.tag ?? p, name: people[p] ?? displayName(p), avatar: profiles[p]?.avatar ?? null })),
          { id: 'gilfoyle', tag: 'gilfoyle', name: agentName(lane), avatar: '/brand/gilfoyle-128.png' },
        ]
      : []

  const env: MessageEnv = {
    grouped: lane?.kind === 'group',
    profiles,
    laneTitles,
    selection,
    onForward: slots?.hideForward ? undefined : (ids) => setForwardIds(ids),
    lane: laneId,
    mePerson: me?.person ?? '',
    canDelete: isOwnerOrAdmin(store),
    people,
    now,
    delivered: t.delivered,
    onQuote: (q) => {
      setQuote(q)
      setFocusToken((n) => n + 1)
    },
    onDelete: async (id) => {
      if (!confirm('Delete this message from the console only? OpenCode keeps its copy.')) return
      const err = await app.deleteLocal(laneId, id)
      app.toast(err ?? 'Deleted from the console')
    },
    onCopied: app.toast,
    onJump: (id) => void reach(id),
    onRetry: (cid) => app.retry(laneId, cid),
    onDiscard: (cid) => app.discard(laneId, cid),
  }

  if (!lane) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{store.order.length ? 'No such lane.' : 'Loading...'}</div>
  }

  let lastDay = ''
  let marked = false
  const rows: React.ReactNode[] = []
  // Every card in the thread, as the registry sees it: stored cards plus the older items mapped in.
  const cards: CardView[] = []
  const show = (key: string, card: CardView) => {
    cards.push(card)
    rows.push(<CardInline key={key} card={card} />)
  }
  groupFeed(items).forEach((row) => {
    if (row.kind === 'work') {
      show(row.id, cardOfGroup(row, laneId))
      return
    }
    const m = row.item
    const k = dayKey(m.at)
    if (k && k !== lastDay) {
      lastDay = k
      rows.push(
        <div key={'d' + k} className="py-1 text-center text-xs text-muted-foreground">
          {dayLabel(m.at, now)}
        </div>,
      )
    }
    const mine = signerOf(m) === me?.person
    if (!marked && sinceAtOpen && m.at > sinceAtOpen && !mine && m.role !== 'run' && m.role !== 'changes' && m.role !== 'form' && m.role !== 'card') {
      marked = true
      rows.push(
        <div key="new" className="flex items-center gap-3 text-xs font-medium text-primary" data-testid="new-marker">
          <span className="h-px flex-1 bg-primary/40" />
          New
          <span className="h-px flex-1 bg-primary/40" />
        </div>,
      )
    }
    if (m.role === 'run') return
    // The server still emits `changes` items; the thread no longer renders a summary card for them.
    if (m.role === 'changes') return
    if (m.role === 'ask') show(m.id, cardOfAsk(m))
    else if (m.role === 'form') show(m.id, cardOfForm(m))
    else if (m.role === 'card') show(m.id, m.card)
    else rows.push(<MessageRow key={m.id} m={m as TextMessage} env={env} />)
  })
  for (const p of t.pending) {
    const local: TextMessage = {
      id: 'local-' + p.client_id,
      lane: laneId,
      at: p.at,
      role: 'person',
      text: p.text,
      client_id: p.client_id,
      reply_to: p.reply_to,
      ...(p.attachments?.length ? { attachments: p.attachments } : {}),
      signature: { person: me?.person ?? '', device_name: me?.device_name },
    }
    rows.push(<MessageRow key={local.id} m={local} env={env} pending={p} />)
  }
  for (const [id, text] of Object.entries(t.streams)) rows.push(<StreamingReply key={'s' + id} id={id} text={text} />)
  if (working) {
    rows.push(<WorkingRow key={open?.id ?? 'working'} since={workingSince(t)} canStop={member} onStop={() => void app.stop(laneId).then((e) => app.toast(e ?? 'Stop sent'))} />)
  }

  const empty = emptyFor(laneId, agentName(lane))
  const grouped = lane.kind === 'group'

  const cardEnv: CardEnv = {
    lane: laneId,
    canAdmin: isOwnerOrAdmin(store),
    isMember: member,
    people,
    now,
    cards,
    items: t.items,
    act: (card, action) => app.cardAction(laneId, card.id, action.id),
    legacy: {
      answerAsk: (item, d) => app.answerAsk(laneId, item.id, item.ask.request_id, d),
      answerForm: (item, answer) => app.answerForm(laneId, item.form.id, answer),
      cancelForm: (item) => app.cancelForm(laneId, item.form.id),
    },
    toast: app.toast,
  }

  return (
    <CardEnvContext.Provider value={cardEnv}>
    <DockProvider laneId={laneId} cards={cards} loaded={t.loaded} fixed={slots?.fixedSurfaces}>
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2 max-md:px-2" data-testid="lane-header">
        {!slots?.hideBack && <NavTrigger back />}
        {slots?.inboxTitle ? (
          <>
            <GilfoyleAvatar size="sm" src={lane.agent?.avatar} name={lane.agent?.name} />
            <h1 className="truncate text-sm font-semibold" data-testid="lane-title">{agentName(lane)}</h1>
          </>
        ) : (
          <>
            <LaneIcon laneId={lane.id} busy={!!lane.busy} size={16} />
            <h1 className="truncate text-sm font-semibold" data-testid="lane-title">{lane.title}</h1>
            <Badge variant="secondary" className="max-md:hidden">{lane.kind === 'dm' ? 'Direct' : lane.kind === 'desk' ? 'Desk' : 'Thread'}</Badge>
            <div className="ml-1 hidden items-center -space-x-1 sm:flex" aria-label="Members">
              {lane.members.map((p) => (
                <span key={p} title={p} className="inline-flex size-5 items-center justify-center rounded-full border bg-secondary text-[0.625rem] font-semibold">
                  {initials(p)}
                </span>
              ))}
            </div>
          </>
        )}
        {grouped && <span className="hidden text-xs text-muted-foreground md:inline">every message carries who and which device</span>}
        <SelectionChip />
        <div className="ml-auto flex items-center gap-1">
          <DockControls kind={lane.kind} />
          {!hideFind && (
            <Button type="button" variant="outline" size="sm" data-testid="find-button" onClick={() => (findOpen ? setFindOpen(false) : openFind())}>
              <SearchIcon />
              <span className="max-md:sr-only">Find</span>
            </Button>
          )}
          <SearchButton />
          {slots?.headerActions}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {findOpen && !hideFind && (
        <FindBar
          rootRef={bodyRef}
          focusToken={findToken}
          version={t.items.length + ':' + t.pending.length + ':' + Object.values(t.streams).join('').length + ':' + (t.loaded ? 1 : 0)}
          onClose={() => setFindOpen(false)}
        />
      )}
      <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-[760px] gap-5">
          {isEmpty && !working ? (
            <div className="flex flex-col items-start gap-4 py-10" data-testid="empty-lane">
              <GilfoyleAvatar size="lg" src={lane.agent?.avatar} name={lane.agent?.name} />
              <p className="text-base">{empty.purpose}</p>
              {empty.suggestions.length > 0 && (
                <div className="grid w-full gap-2 sm:grid-cols-3">
                  {empty.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!member}
                      onClick={() => app.send(laneId, s)}
                      className="rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            rows
          )}
          {!t.loaded && <p className="text-sm text-muted-foreground">Loading...</p>}
        </ConversationContent>
        <Watch lane={laneId} items={t.items} />
      </Conversation>
      {selOn && (
        <div
          role="toolbar"
          aria-label="Selected messages"
          data-testid="selection-bar"
          className="absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md"
        >
          <span className="px-2 font-medium" data-testid="selection-count">
            {selectedInOrder.length} selected
          </span>
          {!slots?.hideForward && (
            <Button type="button" size="sm" disabled={!selectedInOrder.length} onClick={() => setForwardIds(selectedInOrder)}>
              <ForwardIcon />
              Forward
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={!selectedInOrder.length} onClick={() => void copySelected()}>
            <CopyIcon />
            Copy
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancelSelection}>
            <XIcon />
            Cancel
          </Button>
        </div>
      )}
      </div>
      {slots?.aboveComposer}
      <Composer
        lane={laneId}
        person={me?.person ?? ''}
        title={lane.title}
        isDm={lane.kind === 'dm'}
        member={member}
        sessionMissing={!!lane.session_missing}
        quote={quote}
        onClearQuote={() => setQuote(null)}
        onSend={(text, q, files) => app.send(laneId, text, q, files)}
        notify={app.toast}
        focusToken={focusToken}
        candidates={candidates}
        fill={slots?.fill}
        onFilled={slots?.onFilled}
      />
      </div>
      <Dock />
      </div>
      {!slots?.hideForward && (
      <ForwardDialog
        open={forwardIds !== null}
        onOpenChange={(o) => {
          if (!o) setForwardIds(null)
        }}
        count={forwardIds?.length ?? 0}
        lanes={memberLanes}
        onSend={async (to, note) => {
          const err = await app.forward(laneId, forwardIds ?? [], to, note)
          if (!err) {
            app.toast(to.length === 1 ? 'Forwarded' : 'Forwarded to ' + to.length + ' lanes')
            cancelSelection()
          }
          return err
        }}
      />
      )}
    </div>
    </DockProvider>
    </CardEnvContext.Provider>
  )
}
