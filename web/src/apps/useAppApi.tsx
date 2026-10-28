// One admin GET for an app page. 403 and 503 are calm states, not errors: the pages show an empty state for both.
import { useCallback, useEffect, useState } from 'react'
import { call } from '@/lib/api'

export type ApiState<T> =
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'forbidden' }
  | { kind: 'unavailable'; error?: string }
  | { kind: 'error'; status: number }

export function useAppApi<T>(url: string): { state: ApiState<T>; reload: () => void } {
  const [state, setState] = useState<ApiState<T>>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    void call<T & { error?: string }>(url).then((r) => {
      if (!live) return
      if (r.ok) setState({ kind: 'ok', data: r.body as T })
      else if (r.status === 403) setState({ kind: 'forbidden' })
      else if (r.status === 503 || r.body?.error === 'db_unavailable') setState({ kind: 'unavailable', error: r.body?.error })
      else setState({ kind: 'error', status: r.status })
    })
    return () => { live = false }
  }, [url, tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { state, reload }
}

export function EmptyState({ state, onRetry }: { state: ApiState<unknown>; onRetry?: () => void }) {
  const text =
    state.kind === 'forbidden' ? 'This page is for admins. Nothing to show for your account.'
    : state.kind === 'unavailable' ? 'The database is not reachable right now. It usually comes back on its own.'
    : state.kind === 'error' && state.status === 404 ? 'Nothing found at this address.'
    : state.kind === 'error' ? 'This could not be loaded (' + (state.status || 'network') + ').'
    : 'Loading...'
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center text-sm text-muted-foreground" data-testid="app-empty" data-state={state.kind}>
      <p>{text}</p>
      {onRetry && state.kind !== 'forbidden' && state.kind !== 'loading' && (
        <button type="button" className="rounded-md border px-3 py-1.5 text-foreground hover:bg-accent" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}
