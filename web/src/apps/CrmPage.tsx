// #/apps/crm[/<crm hash>]: Atomic CRM in an iframe (same origin, /v2/apps/crm/). The child posts { type: 'crm.context' } on
// every route change; the parent posts { type: 'theme', value } on load and when the console theme changes, and
// { type: 'crm.navigate', hash } when a deep link changes while the page is open.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppPage } from './AppPage'
import { askPromptOf, crmContextLine, isCrmContext, useThemeValue } from './embed'
import type { CrmContextMsg } from './embed'
import { askJared } from './jared'

export const CRM_BASE = '/v2/apps/crm/'
const toHash = (sub: string): string => (sub ? '#/' + sub.replace(/^\/+/, '') : '')

export function CrmPage({ sub = '' }: { sub?: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const theme = useThemeValue()
  const [ctx, setCtx] = useState<CrmContextMsg | null>(null)
  const first = useRef(sub)
  const reported = useRef(sub) // the sub-route the iframe last told us about
  const src = useMemo(() => CRM_BASE + toHash(first.current), [])
  const post = (msg: unknown) => { try { frame.current?.contentWindow?.postMessage(msg, window.location.origin) } catch { /* frame gone */ } }

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || !isCrmContext(e.data)) return
      setCtx(e.data)
      // "Ask Jared about this" from the CRM Home: the dock opens with the prompt; the person still sends.
      const prompt = askPromptOf(e.data)
      if (prompt) askJared(prompt)
      const route = typeof e.data.route === 'string' ? e.data.route.replace(/^#\/?/, '') : ''
      reported.current = route
      // Keep the parent address in step so a reload or a copied link lands on the same CRM page (no hashchange render).
      try { window.history.replaceState(null, '', '#/apps/crm' + (route ? '/' + route : '')) } catch { /* ignore */ }
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])

  useEffect(() => { post({ type: 'theme', value: theme }) }, [theme])
  useEffect(() => {
    if (sub !== reported.current) { reported.current = sub; post({ type: 'crm.navigate', hash: toHash(sub) || '#/' }) }
  }, [sub])

  return (
    <AppPage crumbs={[{ label: 'Apps' }, { label: 'CRM' }]} title="CRM" context={crmContextLine(ctx)} testid="crm-page" chromeless>
      <iframe ref={frame} title="CRM" data-testid="crm-frame" src={src} onLoad={() => post({ type: 'theme', value: theme })} className="min-h-0 w-full flex-1 border-0 bg-background" />
    </AppPage>
  )
}
