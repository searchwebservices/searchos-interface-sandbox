// The right-hand panels: Indexing status, Linked conversations, Usage in skills.
import { PIPELINE, hrefForUse } from '@/lib/library'
import type { LibraryStatus, LibraryUse } from '@/lib/library'
import { relTime } from '@/lib/time'

function Panel({ title, testid, children }: { title: string; testid: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3" data-testid={testid}>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

const eventLine = (e: LibraryStatus['events'][number]): string => {
  switch (e.type) {
    case 'library_state':
      return `${e.name ?? 'file'}: ${e.from ? e.from + ' to ' : ''}${e.to}${e.reason ? ' (' + e.reason + ')' : ''}`
    case 'library_indexed':
      return `${e.name ?? 'file'}: indexed, ${e.chunks ?? 0} chunks`
    case 'library_index_started':
      return `${e.name ?? 'file'}: indexing started`
    case 'library_index_failed':
      return `${e.name ?? 'file'}: index failed${e.reason ? ' (' + e.reason + ')' : ''}`
    case 'library_deleted':
      return `${e.name ?? 'file'}: moved to the bin`
    case 'library_refused':
      return `${e.name ?? 'file'}: refused${e.reason ? ' (' + e.reason + ')' : ''}`
    case 'library_version':
      return `${e.name ?? 'file'}: new version`
    default:
      return `${e.name ?? 'file'}: ${e.type.replace(/^library_/, '')}`
  }
}

export function IndexingPanel({ status }: { status: LibraryStatus | null }) {
  return (
    <Panel title="Indexing status" testid="panel-indexing">
      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs" data-testid="pipeline-counts">
        {PIPELINE.map((s) => (
          <div key={s} className="flex items-baseline justify-between gap-1">
            <dt className="text-muted-foreground">{s}</dt>
            <dd className="font-mono" data-testid={'count-' + s}>
              {status?.counts[s] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-col gap-1 border-t pt-2 text-xs" data-testid="pipeline-events">
        {(status?.events ?? []).length === 0 && <li className="text-muted-foreground">No pipeline events yet.</li>}
        {(status?.events ?? []).slice(0, 10).map((e, i) => (
          <li key={e.at + i} className="flex gap-2">
            <span className="min-w-0 flex-1 truncate" title={eventLine(e)}>
              {eventLine(e)}
            </span>
            <span className="shrink-0 text-muted-foreground">{relTime(e.at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function ConversationsPanel({ uses }: { uses: LibraryUse[] }) {
  return (
    <Panel title="Linked conversations" testid="panel-conversations">
      {uses.length === 0 ? (
        <p className="text-xs text-muted-foreground">No conversation or run has used a file yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {uses.slice(0, 20).map((u) => {
            const href = hrefForUse(u)
            return (
              <li key={u.id} className="flex gap-2" data-testid="conversation-use">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{u.name}</span> <span className="text-muted-foreground">in a {u.use_kind}</span>{' '}
                  {href ? (
                    <a className="underline underline-offset-2" href={href}>
                      open
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{u.ref}</span>
                  )}
                </span>
                <span className="shrink-0 text-muted-foreground">{relTime(u.at)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function SkillsPanel({ uses }: { uses: LibraryUse[] }) {
  return (
    <Panel title="Usage in skills" testid="panel-skills">
      {uses.length === 0 ? (
        <p className="text-xs text-muted-foreground">No skill links a file yet. A skill that attaches a file shows up here.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {uses.map((u) => (
            <li key={u.id} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{u.name}</span> <span className="text-muted-foreground">{u.ref}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{relTime(u.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
