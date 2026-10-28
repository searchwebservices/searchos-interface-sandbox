// The cheat sheet: suggestions Marvin can click (they land in the chat's composer, unsent) and pin (they stay as chips
// above the composer). Quiet cards, the mono eyebrow for section titles, the accent only as a hint on a pinned item.
import { HelpCircleIcon, PinIcon, PinOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAgentName } from '@/lib/agent'
import type { CheatItem } from './cheatsheet.types'
import { useHelp } from './help'

function Suggestion({ item, section }: { item: CheatItem; section: string }) {
  const help = useHelp()!
  const on = help.isPinned(item.id)
  return (
    <li className={cn('flex items-start gap-1 rounded-lg border bg-card', on && 'border-primary/40')} data-testid="cheat-item" data-item={item.id} data-section={section}>
      <button
        type="button"
        onClick={() => help.use(item)}
        data-testid="cheat-use"
        className="min-w-0 flex-1 rounded-lg p-3 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="mt-1 block break-words text-xs text-muted-foreground">{item.prompt}</span>
        {item.why && <span className="mt-1 block break-words text-xs italic text-muted-foreground">{item.why}</span>}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-pressed={on}
        aria-label={(on ? 'Unpin ' : 'Pin ') + item.label}
        title={on ? 'Unpin' : 'Pin to the chat'}
        data-testid={on ? 'cheat-unpin' : 'cheat-pin'}
        onClick={() => help.togglePin(item.id)}
        className={cn('mt-2 mr-2 shrink-0', on && 'text-primary')}
      >
        {on ? <PinOffIcon /> : <PinIcon />}
      </Button>
    </li>
  )
}

function Eyebrow({ children }: { children: string }) {
  return <h3 className="si-eyebrow">{children}</h3>
}

export function HelpSheet() {
  const help = useHelp()!
  const agent = useAgentName()
  return (
    <Sheet open={help.open} onOpenChange={help.setOpen}>
      <SheetContent
        side="right"
        data-testid="cheat-sheet"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg max-md:pt-[env(safe-area-inset-top)]"
      >
        <SheetHeader className="border-b px-4 pt-4 pr-12 pb-3">
          <span className="si-eyebrow">Help</span>
          <SheetTitle className="text-base font-semibold">Cheat sheet</SheetTitle>
          <SheetDescription>Click a suggestion to drop it in the box, then edit and send. Pin the ones you reach for.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pb-6 max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {help.pinned.length > 0 && (
            <section data-testid="cheat-pinned" aria-label="Pinned" className="space-y-2">
              <Eyebrow>Pinned</Eyebrow>
              <ul className="space-y-2">
                {help.pinned.map((i) => (
                  <Suggestion key={i.id} item={i} section="pinned" />
                ))}
              </ul>
            </section>
          )}
          {help.sections.map((s) => (
            <section key={s.id} data-testid="cheat-section" data-section={s.id} aria-label={s.title} className="space-y-2">
              <Eyebrow>{s.title}</Eyebrow>
              {s.blurb && <p className="text-xs text-muted-foreground">{s.blurb}</p>}
              <ul className="space-y-2">
                {s.items.map((i) => (
                  <Suggestion key={i.id} item={i} section={s.id} />
                ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Press <kbd className="rounded border px-1 font-mono">?</kbd> anywhere to open this, <kbd className="rounded border px-1 font-mono">Esc</kbd> to close. {agent} answers in the chat.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// The header button in the chat (the shell's sidebar and tab bar carry their own).
export function HelpHeaderButton() {
  const help = useHelp()
  if (!help) return null
  return (
    <Button type="button" variant="outline" size="sm" data-testid="help-button" aria-label="Help: cheat sheet" title="Help: cheat sheet (?)" onClick={() => help.setOpen(true)}>
      <HelpCircleIcon />
      <span className="max-md:sr-only">Help</span>
    </Button>
  )
}
