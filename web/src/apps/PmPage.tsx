// #/apps/pm[/<plane path>] (and the alias #/apps/pm/board[/<plane path>]): Plane in an iframe. Sub-path mode is same origin (/v2/apps/pm/), so the page reads the iframe's
// pathname on load and on an interval for the Ask Jared context. When the console runs the dedicated Plane port
// (/api/apps/pm/config says mode 'port') the iframe is cross-origin and the context stays "Projects".
import { useEffect, useRef, useState } from 'react'
import { AppPage } from './AppPage'
import { pmContextLine } from './embed'

export const PM_BASE = '/v2/apps/pm/'
interface PmConfig { mode?: 'subpath' | 'port'; port?: number | null }

export function PmPage({ sub = '' }: { sub?: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [cfg, setCfg] = useState<PmConfig | null>(null)
  const [context, setContext] = useState('Projects')
  // 'board' is an alias for the bare route; the rest of the tail is the Plane path.
  const first = useRef(sub.replace(/^\/+/, '').replace(/^board(?:\/|$)/, ''))
  useEffect(() => {
    let live = true
    fetch('/api/apps/pm/config', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => { if (live) setCfg((j && typeof j === 'object' ? j : {}) as PmConfig) })
    return () => { live = false }
  }, [])
  const port = cfg?.mode === 'port' && cfg.port ? cfg.port : null
  const src = cfg ? (port ? window.location.protocol + '//' + window.location.hostname + ':' + port + '/' : PM_BASE) + (first.current ? first.current.replace(/^\/+/, '') + '/' : '') : ''

  const read = () => {
    if (port) return
    try {
      const loc = frame.current?.contentWindow?.location
      if (!loc || loc.href === 'about:blank') return
      setContext(pmContextLine(loc.pathname))
      const rest = loc.pathname.startsWith('/v2/apps/pm') ? loc.pathname.slice('/v2/apps/pm'.length).replace(/^\/+/, '') : ''
      window.history.replaceState(null, '', '#/apps/pm' + (rest ? '/' + rest : ''))
    } catch { /* cross-origin or not loaded yet */ }
  }
  useEffect(() => {
    if (!cfg || port) return
    const t = window.setInterval(read, 2000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, port])

  return (
    <AppPage crumbs={[{ label: 'Apps' }, { label: 'Projects' }]} title="Projects" context={context} testid="pm-page" chromeless>
      {src ? <iframe ref={frame} title="Projects" data-testid="pm-frame" src={src} onLoad={read} className="min-h-0 w-full flex-1 border-0 bg-background" /> : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>}
    </AppPage>
  )
}
