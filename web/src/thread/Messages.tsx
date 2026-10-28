// Section 2: a person's bubble, Gilfoyle's unboxed reply, lane messages, system lines, message actions.
// Every message has one utility menu (right click, long press on touch, Shift F10 or the Menu key, or the "..." button)
// and the same items back the hover row. Group lanes read like an inbox: mine right in the accent bubble, the rest left.
import { Fragment } from 'react'
import { GilfoyleAvatar } from '@/components/GilfoyleAvatar'
import { PersonAvatar } from '@/components/PersonAvatar'
import { CopyIcon, EllipsisIcon, ForwardIcon, LinkIcon, ListChecksIcon, QuoteIcon, Trash2Icon } from 'lucide-react'
import { Message, MessageAction, MessageActions, MessageContent } from '@/components/ai-elements/message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clip'
import { relTime } from '@/lib/time'
import { mentionSegments } from '@/lib/profile'
import { messageLink } from '@/lib/deeplink'
import type { PendingSend } from '@/lib/store'
import type { PublicProfile, ReplyTo, TextMessage } from '@/lib/types'
import { MessageAttachments } from './MessageAttachments'
import { Reply } from './Reply'
import { isAgentRole, useAgentName } from '@/lib/agent'
import { useApp } from '@/app/AppContext'

// Multi-select over the thread (state lives in LaneView). `toggle` takes shift for a range from the last picked row.
export interface SelectionApi {
  on: boolean
  ids: ReadonlySet<string>
  start: (id: string) => void
  toggle: (id: string, mod: { shift: boolean }) => void
}
export const NO_SELECTION: SelectionApi = { on: false, ids: new Set(), start: () => {}, toggle: () => {} }

export interface MessageEnv {
  lane: string
  mePerson: string
  canDelete: boolean
  people: Record<string, string>
  now: number
  delivered: Record<string, number>
  // A group lane lays out like an inbox; a direct lane keeps mine right and Gilfoyle left.
  grouped?: boolean
  profiles?: Record<string, PublicProfile>
  laneTitles?: Record<string, string>
  selection?: SelectionApi
  onForward?: (ids: string[]) => void
  onQuote: (q: ReplyTo) => void
  onDelete: (id: string) => void
  onCopied: (text: string) => void
  onJump: (id: string) => void
  onRetry: (clientId: string) => void
  onDiscard: (clientId: string) => void
}

const FORWARDABLE = new Set(['person', 'gilfoyle', 'agent', 'lane'])
export const isSelectable = (m: TextMessage): boolean => !m.id.startsWith('local-') && FORWARDABLE.has(m.role) && !!m.text.trim()

function QuoteBlock({ q, onJump }: { q: ReplyTo; onJump: (id: string) => void }) {
  return (
    <button
      type="button"
      title="Go to the original"
      onClick={() => onJump(q.message_id)}
      className="flex w-full flex-col rounded-md border-l-2 border-primary bg-secondary px-2 py-1 text-left text-xs"
    >
      <span className="font-medium">{q.person}</span>
      <span className="line-clamp-2 text-muted-foreground">{q.excerpt}</span>
    </button>
  )
}

// The text of a message with @tags that the console confirmed turned into chips. Everything else stays a React text node.
export function MentionText({ text, mentions, profiles }: { text: string; mentions?: string[]; profiles?: Record<string, PublicProfile> }) {
  const segs = mentionSegments(text)
  if (!profiles || segs.every((s) => s.kind === 'text')) return <>{text}</>
  const byTag = new Map(Object.values(profiles).map((p) => [p.tag, p]))
  return (
    <>
      {segs.map((s, i) => {
        if (s.kind === 'mention') {
          const p = byTag.get(s.tag)
          if (p && (mentions === undefined || mentions.includes(p.person_id))) {
            return (
              <span key={i} data-mention={p.person_id} title={p.name} className="rounded-sm bg-primary/15 px-1 font-medium text-primary">
                {s.text}
              </span>
            )
          }
        }
        return <Fragment key={i}>{s.text}</Fragment>
      })}
    </>
  )
}

interface Item {
  key: string
  label: string
  tooltip?: string
  icon: React.ReactNode
  inRow: boolean
  run: () => void | Promise<void>
}

function whoLabel(m: TextMessage, env: MessageEnv, agent: string): string {
  if (isAgentRole(m.role)) return agent
  if (m.role === 'system') return 'Console'
  if (m.role === 'lane') return m.from_lane || 'another lane'
  const p = m.signature?.person ?? ''
  return env.people[p] || p
}

// One list of utility items for a message: the hover row shows the inRow ones, the menu shows all of them.
function itemsOf(m: TextMessage, env: MessageEnv, own: boolean, agent: string): Item[] {
  const real = !m.id.startsWith('local-')
  const sel = env.selection ?? NO_SELECTION
  const out: Item[] = [
    { key: 'copy', label: 'Copy', icon: <CopyIcon className="size-3.5" />, inRow: true, run: async () => env.onCopied((await copyText(m.text)) ? 'Copied' : 'Could not copy') },
  ]
  if (real && m.role !== 'system') {
    out.push({ key: 'quote', label: 'Quote', icon: <QuoteIcon className="size-3.5" />, inRow: true, run: () => env.onQuote({ message_id: m.id, excerpt: m.text.slice(0, 280), person: whoLabel(m, env, agent) }) })
  }
  if (real) {
    out.push({
      key: 'link',
      label: 'Copy link',
      icon: <LinkIcon className="size-3.5" />,
      inRow: true,
      run: async () => {
        const url = messageLink(env.lane, m.id)
        env.onCopied((await copyText(url)) ? 'Link copied' : 'Could not copy')
      },
    })
  }
  if (isSelectable(m) && env.onForward) {
    out.push({ key: 'forward', label: 'Forward', icon: <ForwardIcon className="size-3.5" />, inRow: false, run: () => env.onForward?.([m.id]) })
  }
  if (real && own && env.canDelete && m.role === 'person') {
    out.push({ key: 'delete', label: 'Delete locally', tooltip: 'Delete locally (the console copy only)', icon: <Trash2Icon className="size-3.5" />, inRow: true, run: () => env.onDelete(m.id) })
  }
  if (isSelectable(m) && env.selection) {
    out.push({ key: 'select', label: 'Select', icon: <ListChecksIcon className="size-3.5" />, inRow: false, run: () => sel.start(m.id) })
  }
  return out
}

// Opens the context menu of `el` where it sits: Radix listens for the contextmenu event, so keyboard and the "..." button send one.
function openMenuAt(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(24, r.width / 2), clientY: r.top + Math.min(24, r.height / 2) }))
}

export function MessageRow({ m, env, pending }: { m: TextMessage; env: MessageEnv; pending?: PendingSend }) {
  const own = m.signature?.person === env.mePerson
  const agent = useAgentName()
  const { store: appStore } = useApp()
  const laneAgent = appStore.lanes[m.lane || env.lane]?.agent
  const who = whoLabel(m, env, agent)
  const grouped = !!env.grouped
  const sel = env.selection ?? NO_SELECTION
  const selectable = isSelectable(m)
  const picked = sel.ids.has(m.id)
  const dev = m.role === 'person' ? m.signature?.device_name || m.signature?.device || '' : ''
  const trail = [who, dev, m.signature?.ip && 'ip ' + m.signature.ip, m.signature?.mac && 'mac ' + m.signature.mac, m.at].filter(Boolean).join(', ')

  if (m.role === 'system') {
    return (
      <div id={'m-' + m.id} data-id={m.id} data-find className="py-1 text-center text-xs text-muted-foreground">
        {m.text}
      </div>
    )
  }

  const items = itemsOf(m, env, own, agent)
  // In a group lane mine sits right in the accent bubble and everyone else left; a direct lane keeps its layout.
  const right = !isAgentRole(m.role) && (!grouped || own)
  const shownName = grouped && own && m.role === 'person' ? 'You' : who

  const keyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault()
      openMenuAt(e.currentTarget)
    } else if (sel.on && selectable && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      sel.toggle(m.id, { shift: e.shiftKey })
    }
  }
  const click = (e: React.MouseEvent) => {
    if (!sel.on || !selectable) return
    e.preventDefault()
    sel.toggle(m.id, { shift: e.shiftKey })
  }

  const sig = (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs text-muted-foreground', right && grouped && 'justify-end')}>
      {sel.on && selectable && <Checkbox checked={picked} tabIndex={-1} aria-label="Selected" className="pointer-events-none" />}
      {isAgentRole(m.role) ? <GilfoyleAvatar size="sm" src={laneAgent?.avatar} name={laneAgent?.name} /> : m.role === 'lane' ? <PersonAvatar id={m.from_lane || '?'} name={who} size="xs" /> : <PersonAvatar id={m.signature?.person ?? ''} name={who} size="xs" />}
      <span className={cn('font-medium text-foreground', m.role === 'lane' && 'font-mono')}>{shownName}</span>
      {dev && <span>{dev}</span>}
      <Tooltip>
        <TooltipTrigger asChild>
          <time dateTime={m.at}>{relTime(m.at, env.now)}</time>
        </TooltipTrigger>
        <TooltipContent className="font-mono text-xs">{trail}</TooltipContent>
      </Tooltip>
      {pending?.state === 'sending' && <Badge variant="secondary">Sending</Badge>}
      {pending?.state === 'failed' && (
        <>
          <Badge variant="destructive">Not sent</Badge>
          <Button type="button" variant="ghost" size="xs" onClick={() => env.onRetry(pending.client_id)}>
            Retry
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => env.onDiscard(pending.client_id)}>
            Discard
          </Button>
        </>
      )}
      {!pending && m.client_id && env.delivered[m.client_id] && env.now - env.delivered[m.client_id] < 2500 && (
        <Badge variant="secondary">Delivered</Badge>
      )}
    </div>
  )

  const actions = !sel.on && (
    <MessageActions className={cn('opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100', right && grouped && 'justify-end')}>
      {items
        .filter((i) => i.inRow)
        .map((i) => (
          <MessageAction key={i.key} label={i.label} tooltip={i.tooltip ?? i.label} onClick={() => void i.run()}>
            {i.icon}
          </MessageAction>
        ))}
      <MessageAction label="More" tooltip="More" onClick={(e) => openMenuAt(e.currentTarget.closest('[data-id]') as HTMLElement)}>
        <EllipsisIcon className="size-3.5" />
      </MessageAction>
    </MessageActions>
  )

  const shared = {
    id: 'm-' + m.id,
    'data-id': m.id,
    'data-align': isAgentRole(m.role) || !right ? 'left' : 'right',
    'data-selected': picked ? 'true' : undefined,
    tabIndex: 0,
    onKeyDown: keyDown,
    onClick: click,
  }
  const focusRing = 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring'

  const body = m.forwarded_from ? (
    <div className="flex flex-col gap-1" data-testid="forwarded">
      <a
        href={'#/lanes/' + encodeURIComponent(m.forwarded_from.lane) + '/m/' + encodeURIComponent(m.forwarded_from.message_id)}
        title="Go to the original message"
        data-testid="forwarded-eyebrow"
        className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:underline"
      >
        Forwarded from {env.laneTitles?.[m.forwarded_from.lane] ?? m.forwarded_from.lane}, {m.forwarded_from.author}
      </a>
      <div className="border-l-2 border-primary pl-2">
        <MentionText text={m.text} />
      </div>
    </div>
  ) : (
    <MentionText text={m.text} mentions={m.mentions} profiles={env.profiles} />
  )
  const files = m.attachments?.length ? <MessageAttachments items={m.attachments} lane={m.lane || env.lane} /> : null

  let row: React.ReactNode
  if (isAgentRole(m.role)) {
    row = (
      <Message from="assistant" {...shared} className={cn('max-w-full', focusRing, picked && 'bg-accent/50')}>
        {sig}
        <MessageContent className="w-full">{m.forwarded_from ? body : <Reply text={m.text} />}</MessageContent>
        {actions}
      </Message>
    )
  } else {
    row = (
      <Message
        from="user"
        {...shared}
        className={cn('max-w-full', focusRing, grouped && 'max-w-[85%]', grouped && !right && 'mr-auto ml-0', pending?.state === 'failed' && 'opacity-80', picked && 'bg-accent/50')}
      >
        {sig}
        {m.role === 'lane' && <div className="font-mono text-[0.6875rem] uppercase tracking-wide text-muted-foreground" data-testid="lane-eyebrow">{m.eyebrow || 'Lane message from ' + (m.from_lane || 'another lane')}</div>}
        {m.role === 'lane' && m.quote && <blockquote className="border-l-2 border-border pl-2 text-xs text-muted-foreground" data-testid="relay-quote">{m.quote.label}: {m.quote.text}</blockquote>}
        {m.reply_to?.message_id && <QuoteBlock q={m.reply_to} onJump={env.onJump} />}
        <MessageContent
          data-find
          className={cn(
            'border bg-card whitespace-pre-wrap break-words',
            grouped && right && 'group-[.is-user]:bg-primary/10 border-primary/25',
            grouped && !right && 'group-[.is-user]:ml-0',
          )}
        >
          {body}
          {files}
        </MessageContent>
        {actions}
      </Message>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent data-testid="message-menu">
        {items.map((i) => (
          <ContextMenuItem key={i.key} onSelect={() => void i.run()}>
            {i.icon}
            {i.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function StreamingReply({ id, text }: { id: string; text: string }) {
  const agent = useAgentName()
  return (
    <Message from="assistant" data-stream={id} className="max-w-full">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GilfoyleAvatar size="sm" />
        <span className="font-medium text-foreground">{agent}</span>
        <Badge variant="secondary">Writing</Badge>
      </div>
      <MessageContent className="w-full">
        <Reply text={text} streaming />
      </MessageContent>
    </Message>
  )
}
