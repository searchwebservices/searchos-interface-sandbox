// The one layout of every app page: header (breadcrumb, title, actions slot), content, and a right dock whose
// "Ask Jared" tab opens a 380px panel. Under 768px the panel is a bottom sheet.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRightIcon, XIcon } from 'lucide-react'
import { NavTrigger } from '@/app/NavTrigger'
import { SearchButton } from '@/app/SearchButton'
import { cn } from '@/lib/utils'
import { JaredPanel } from './JaredPanel'
import { JARED_PREFILL_EVENT, prefillOf } from './jared'
import type { JaredPrefill } from './jared'

const KEY = 'apps.jared.open'
const readOpen = (): boolean => {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
const writeOpen = (on: boolean) => {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ }
}

export interface Crumb { label: string; href?: string }

// chromeless: the embedded app has its own top bar, so the shell header (breadcrumb, title, Search) is not rendered.
export function AppPage({ crumbs, title, actions, context, testid, chromeless = false, children }: { crumbs: Crumb[]; title: string; actions?: ReactNode; context: string; testid: string; chromeless?: boolean; children: ReactNode }) {
  const [open, setOpenState] = useState(readOpen)
  const setOpen = (on: boolean) => { setOpenState(on); writeOpen(on) }
  // "Ask Jared about this" from anywhere on the page: open the dock and hand the composer the draft.
  const [prefill, setPrefill] = useState<JaredPrefill | null>(null)
  useEffect(() => {
    const on = (e: Event) => { const p = prefillOf(e); if (p) { setPrefill(p); setOpenState(true); writeOpen(true) } }
    window.addEventListener(JARED_PREFILL_EVENT, on)
    return () => window.removeEventListener(JARED_PREFILL_EVENT, on)
  }, [])
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1" data-testid={testid}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!chromeless && (
        <header className="flex min-w-0 items-center gap-2 border-b px-3 py-2" data-testid="app-header">
          <NavTrigger />
          <div className="min-w-0 flex-1">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="app-crumbs">
              {crumbs.map((c, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <ChevronRightIcon className="size-3 shrink-0" />}
                  {c.href ? <a href={c.href} className="truncate hover:text-foreground">{c.label}</a> : <span className="truncate">{c.label}</span>}
                </span>
              ))}
            </nav>
            <h1 className="truncate text-sm font-semibold" data-testid="app-title">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2" data-testid="app-actions">
            {actions}
            <SearchButton />
          </div>
        </header>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
      {open ? (
        <aside
          data-testid="jared-dock"
          data-open="true"
          aria-label="Ask Jared"
          className={cn('z-30 flex flex-col border-l bg-card', 'absolute inset-x-0 bottom-0 h-[70%] rounded-t-xl border-t shadow-lg', 'md:static md:h-auto md:w-[380px] md:shrink-0 md:rounded-none md:border-t-0 md:shadow-none')}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-secondary text-xs font-semibold">J</span>
            <span className="text-sm font-medium">Ask Jared</span>
            <button type="button" aria-label="Close Ask Jared" data-testid="jared-close" className="ml-auto rounded-md p-1 hover:bg-accent" onClick={() => setOpen(false)}>
              <XIcon className="size-4" />
            </button>
          </div>
          <JaredPanel context={context} prefill={prefill} />
        </aside>
      ) : (
        <button
          type="button"
          data-testid="jared-tab"
          data-open="false"
          aria-label="Ask Jared"
          onClick={() => setOpen(true)}
          className={cn('z-30 flex items-center gap-2 border bg-card text-sm font-medium shadow-sm hover:bg-accent', 'absolute bottom-3 right-3 rounded-full px-4 py-2', 'md:static md:w-9 md:shrink-0 md:flex-col md:justify-start md:gap-3 md:rounded-none md:border-0 md:border-l md:px-0 md:py-3 md:shadow-none')}
        >
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-secondary text-xs font-semibold">J</span>
          <span className="md:[writing-mode:vertical-rl]">Ask Jared</span>
        </button>
      )}
    </div>
  )
}
