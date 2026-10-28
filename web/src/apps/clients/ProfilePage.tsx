// LEGACY (unrouted since the fold into the CRM): the profile now renders in the CRM's SearchOS tab. Kept for its tests and as the spec of the tab.
// #/apps/clients/:id: one client, read only. Header, six summary tiles, then collapsible sections that show their
// first five rows and a "show all" per list.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppPage } from '../AppPage'
import { absDate, initialsOf, isLive, money, relDate } from '../format'
import { Pill, StatusDot } from '../tiles'
import { EmptyState, useAppApi } from '../useAppApi'
import type { ProfileBody } from '../types'
import { healthTone } from './clients'
import { linksOf, sectionCounts, summarize } from './profile'
import type { Counts } from './profile'
import type { Tone } from '../map/estate'

export function Dated({ iso, now }: { iso?: string | null; now?: number }) {
  if (!iso) return <span className="text-muted-foreground">-</span>
  return <time dateTime={iso} title={absDate(iso)}>{relDate(iso, now)}</time>
}

const statusTone = (s?: string | null): Tone => {
  const v = (s ?? '').toLowerCase()
  if (/paid|active|live|signed|resolved|done|ok|up|won|stamped|vigente/.test(v)) return 'ok'
  if (/overdue|failed|open|error|down|critical|high|cancel|lost|vencid/.test(v)) return 'bad'
  if (/pending|draft|sent|due|warn|paused|medium|progress/.test(v)) return 'warn'
  return 'idle'
}

const LIMIT = 5

export function RowList({ rows, testid }: { rows: ReactNode[]; testid: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, LIMIT)
  return (
    <div data-testid={testid}>
      <ul className="divide-y">
        {shown.map((r, i) => <li key={i} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid="profile-row">{r}</li>)}
      </ul>
      {rows.length > LIMIT && (
        <Button type="button" variant="ghost" size="sm" data-testid="show-all" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : 'Show all (' + rows.length + ')'}
        </Button>
      )}
    </div>
  )
}

function Section({ id, title, count, children, openByDefault = true }: { id: string; title: string; count: number; children: ReactNode; openByDefault?: boolean }) {
  const [open, setOpen] = useState(openByDefault)
  return (
    <section className="rounded-lg border bg-card" data-testid={'section-' + id} data-count={count}>
      <h2>
        <button type="button" aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
          <span className="flex-1">{title}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground" data-testid="section-count">{count}</span>
        </button>
      </h2>
      {open && <div className="border-t px-3 pb-2">{count === 0 && id !== 'notes' ? <p className="py-3 text-sm text-muted-foreground">Nothing here yet.</p> : children}</div>}
    </section>
  )
}

const Sub = ({ title, n, children }: { title: string; n: number; children: ReactNode }) =>
  n ? <div className="pt-2"><h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title} ({n})</h3>{children}</div> : null
const Muted = ({ children }: { children: ReactNode }) => <span className="text-xs text-muted-foreground">{children}</span>
const Name = ({ children }: { children: ReactNode }) => <span className="min-w-0 flex-1 basis-40 truncate font-medium">{children}</span>
function Ext({ url, children }: { url?: string | null; children: ReactNode }) {
  return isLive(url) ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">{children}<ExternalLinkIcon className="size-3" /></a> : <>{children}</>
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3" data-testid="summary-tile" data-label={label}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-lg font-semibold" title={value}>{value || '-'}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function Profile({ p, now }: { p: ProfileBody; now?: number }) {
  const c = p.client
  const s = summarize(p, now)
  const counts: Counts = sectionCounts(p)
  const links = linksOf(p)
  const tier = p.board?.tier
  const health = p.board?.health
  const owner = c.owner_name || p.board?.svt_owner
  const status = c.status || p.board?.status
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="client-profile" data-id={c.id}>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 p-3 sm:p-4">
        <div className="flex items-start gap-3" data-testid="profile-header">
          {c.avatar_url ? <img src={c.avatar_url} alt="" className="size-14 shrink-0 rounded-full object-cover" /> : <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold">{initialsOf(c.name)}</span>}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold">{c.name}</h2>
            {c.company_name && <p className="truncate text-sm text-muted-foreground">{c.company_name}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {c.email && <a className="text-primary hover:underline" href={'mailto:' + c.email}>{c.email}</a>}
              {c.phone && <a className="text-primary hover:underline" href={'tel:' + c.phone}>{c.phone}</a>}
              {c.decision_maker && <span className="text-muted-foreground">Decides: {c.decision_maker}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {owner && <Pill>owner {owner}</Pill>}
              {tier && <Pill>{tier}</Pill>}
              {health && <Pill tone={healthTone(health)}><StatusDot tone={healthTone(health)} className="mr-1" />{health}</Pill>}
              {status && <Pill tone={statusTone(status)}>{status}</Pill>}
              {c.onboarding_date && <span className="text-muted-foreground">since <Dated iso={c.onboarding_date} now={now} /></span>}
            </div>
            {p.board?.health_note && <p className="mt-1 text-xs text-muted-foreground">{p.board.health_note}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6" data-testid="summary-tiles">
          <Tile label="MRR" value={s.mrr == null ? '' : money(s.mrr)} sub={p.board?.mrr_note ?? undefined} />
          <Tile label="Paid this year" value={String(s.paidCount)} sub={money(s.paidTotal)} />
          <Tile label="Open deals" value={String(s.openDeals)} />
          <Tile label="Open tickets" value={String(s.openTickets)} />
          <Tile label="Incidents, 30 days" value={String(s.incidents30d)} />
          <Tile label="Latest version" value={s.latestVersion} />
        </div>

        <Section id="projects" title="Projects" count={counts.projects}>
          <RowList testid="rows-projects" rows={p.projects.map((x) => <><Name>{x.name}</Name><Muted>{x.type}</Muted><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill>{x.monthly_rate != null && <Muted>{money(x.monthly_rate)}/mo</Muted>}</>)} />
        </Section>
        <Section id="links" title="Links" count={counts.links}>
          <RowList testid="rows-links" rows={links.map((l) => <><Name>{l.label}</Name><Pill>{l.kind}</Pill><Ext url={l.url}>{l.url.replace(/^https?:\/\//, '')}</Ext></>)} />
        </Section>
        <Section id="proposals" title="Proposals" count={counts.proposals}>
          <RowList testid="rows-proposals" rows={p.proposals.map((x) => <><Name><Ext url={x.url}>{x.title}</Ext></Name><Muted>{x.kind}</Muted><Muted><Dated iso={x.at} now={now} /></Muted></>)} />
        </Section>
        <Section id="contracts" title="Contracts" count={counts.contracts}>
          <RowList testid="rows-contracts" rows={p.contracts.map((x) => <><Name>{x.title}</Name><Muted>{x.ref_code}</Muted><Muted>{x.type}</Muted><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill><Muted><Dated iso={x.updated_at ?? x.created_at} now={now} /></Muted></>)} />
        </Section>
        <Section id="versions" title="Versions" count={counts.versions}>
          <RowList testid="rows-versions" rows={p.versions.map((x) => <><Name>{x.title}</Name><Muted>{x.category}</Muted>{x.published === false && <Pill tone="warn">unpublished</Pill>}<Muted><Dated iso={x.entry_date} now={now} /></Muted></>)} />
        </Section>
        <Section id="errors" title="Errors and incidents" count={counts.errors}>
          <Sub title="Incidents" n={p.errors.incidents.length}>
            <RowList testid="rows-incidents" rows={p.errors.incidents.map((x) => <><Name>{x.title}</Name><Muted>{x.impact}</Muted><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill><Muted><Dated iso={x.started_at} now={now} /></Muted></>)} />
          </Sub>
          <Sub title="Error reports" n={p.errors.reports.length}>
            <RowList testid="rows-reports" rows={p.errors.reports.map((x) => <><Name>{x.title}</Name><Muted>{x.severity}</Muted><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill><Muted><Dated iso={x.created_at} now={now} /></Muted></>)} />
          </Sub>
        </Section>
        <Section id="money" title="Money" count={counts.money}>
          <Sub title="Cartera" n={p.cartera.entries.length}>
            <RowList testid="rows-cartera" rows={p.cartera.entries.map((x) => <><Name>{x.bucket ?? 'entry'}</Name><span>{money(x.monthly_amount)}/mo</span><Muted>{x.billing_mode}</Muted><Pill tone={statusTone(x.billing_state)}>{x.billing_state ?? 'unknown'}</Pill><Muted>last paid {x.last_paid_period ?? '-'}</Muted></>)} />
          </Sub>
          <Sub title="Payments" n={p.cartera.payments.length}>
            <RowList testid="rows-payments" rows={p.cartera.payments.map((x) => <><Name>{money(x.amount)}</Name><Muted>{x.kind}</Muted><Muted>{x.period}</Muted><Muted><Dated iso={x.paid_at} now={now} /></Muted></>)} />
          </Sub>
          <Sub title="Invoices" n={p.invoices.length}>
            <RowList testid="rows-invoices" rows={p.invoices.map((x) => <><Name>{money(x.amount)}</Name><Muted>{x.type}</Muted><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill><Muted>due <Dated iso={x.due_date} now={now} /></Muted></>)} />
          </Sub>
          <Sub title="Facturas" n={p.facturas.length}>
            <RowList testid="rows-facturas" rows={p.facturas.map((x) => <><Name>{x.folio ?? x.id}</Name><span>{money(x.total)}</span><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill><Muted><Dated iso={x.fecha} now={now} /></Muted></>)} />
          </Sub>
          <Sub title="MRR roster" n={p.mrr.length}>
            <RowList testid="rows-mrr" rows={p.mrr.map((x) => <><Name>{x.service}</Name><span>{money(x.amount_mxn)}</span><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill>{x.billing_paused && <Pill tone="warn">paused</Pill>}{x.counts_in_mrr === false && <Muted>not in MRR</Muted>}</>)} />
          </Sub>
        </Section>
        <Section id="infra" title="Infra" count={counts.infra}>
          <RowList testid="rows-infra" rows={p.infra.map((x) => <><Name><Ext url={x.url}>{x.surface}</Ext></Name><Muted>{x.hosting}</Muted>{x.monitored ? <><StatusDot tone={x.last_ping_ok ? 'ok' : 'bad'} label={x.last_ping_ok ? 'ping ok' : 'ping failing'} /><Muted>{x.last_ping_ms != null ? x.last_ping_ms + ' ms, ' : ''}<Dated iso={x.last_ping_at} now={now} /></Muted></> : <Muted>not monitored</Muted>}{!!x.consecutive_failures && <Pill tone="bad">{x.consecutive_failures} failures</Pill>}</>)} />
        </Section>
        <Section id="tickets" title="Tickets" count={counts.tickets}>
          <Sub title="Project tickets" n={p.tickets.project.length}>
            <RowList testid="rows-tickets-project" rows={p.tickets.project.map((x) => <><span className="font-mono text-xs">{x.ticket_key}</span><Name>{x.title}</Name><Muted>{x.priority}</Muted><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill></>)} />
          </Sub>
          <Sub title="Code tickets" n={p.tickets.code.length}>
            <RowList testid="rows-tickets-code" rows={p.tickets.code.map((x) => <><span className="font-mono text-xs">{x.code_key}</span><Name>{x.title}</Name><Muted>{x.repo}</Muted><Pill tone={statusTone(x.status)}>{x.status ?? 'unknown'}</Pill></>)} />
          </Sub>
        </Section>
        <Section id="notes" title="Notes" count={counts.notes}>
          <div className="flex flex-col gap-3 py-2 text-sm">
            {c.ai_summary && <div><h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Summary</h3><p className="whitespace-pre-wrap break-words">{c.ai_summary}</p></div>}
            {c.notes && <div><h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</h3><p className="whitespace-pre-wrap break-words">{c.notes}</p></div>}
            {!c.ai_summary && !c.notes && <p className="text-muted-foreground">No notes.</p>}
          </div>
        </Section>
      </div>
    </div>
  )
}

export function ClientProfilePage({ id }: { id: string }) {
  const { state, reload } = useAppApi<ProfileBody>('/api/apps/clients/' + encodeURIComponent(id))
  const ok = state.kind === 'ok' && state.data?.client ? state.data : null
  const name = ok?.client.name ?? ''
  return (
    <AppPage
      testid="apps-client-page"
      crumbs={[{ label: 'Apps' }, { label: 'Clients', href: '#/apps/clients' }, { label: name || 'Client' }]}
      title={name || 'Client'}
      context={'Client profile' + (name ? ', selected: ' + name : '')}
      actions={<Button type="button" size="icon-xs" variant="ghost" aria-label="Refresh client" onClick={reload}><RefreshCwIcon /></Button>}
    >
      {ok ? <Profile p={normalize(ok)} /> : <EmptyState state={state.kind === 'ok' ? { kind: 'error', status: 404 } : state} onRetry={reload} />}
    </AppPage>
  )
}

// The API promises every list; a missing one reads as empty rather than crashing the page.
export function normalize(p: ProfileBody): ProfileBody {
  return {
    ...p,
    board: p.board ?? null,
    projects: p.projects ?? [], deals: p.deals ?? [], proposals: p.proposals ?? [], contracts: p.contracts ?? [],
    invoices: p.invoices ?? [], facturas: p.facturas ?? [], mrr: p.mrr ?? [], versions: p.versions ?? [], infra: p.infra ?? [],
    cartera: { entries: p.cartera?.entries ?? [], payments: p.cartera?.payments ?? [] },
    errors: { reports: p.errors?.reports ?? [], incidents: p.errors?.incidents ?? [] },
    tickets: { project: p.tickets?.project ?? [], code: p.tickets?.code ?? [] },
  }
}
