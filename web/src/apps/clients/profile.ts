// Pure helpers of the client profile: the six summary tiles, the link list and the count on every section.
import type { ProfileBody } from '../types'

const CLOSED_DEAL = /won|lost|closed|cancel|churn/i
const DONE_TICKET = /done|closed|resolved|cancel|complete|shipped|wontfix|won't/i
export const isOpenDeal = (stage?: string | null): boolean => !CLOSED_DEAL.test(stage ?? '')
export const isOpenTicket = (status?: string | null): boolean => !DONE_TICKET.test(status ?? '')

const DAY = 86400000

export interface Summary {
  mrr: number | null
  paidCount: number
  paidTotal: number
  openDeals: number
  openTickets: number
  incidents30d: number
  latestVersion: string
}

export function summarize(p: ProfileBody, now: number = Date.now()): Summary {
  const year = new Date(now).getUTCFullYear()
  const live = p.mrr.filter((m) => m.counts_in_mrr !== false && !m.billing_paused)
  const paid = p.invoices.filter((i) => (i.status ?? '').toLowerCase() === 'paid' && i.paid_date && new Date(i.paid_date).getUTCFullYear() === year)
  const versions = [...p.versions].sort((a, b) => Date.parse(b.entry_date ?? '') - Date.parse(a.entry_date ?? ''))
  return {
    mrr: p.board?.mrr_mxn ?? (p.mrr.length ? live.reduce((a, m) => a + (m.amount_mxn ?? 0), 0) : null),
    paidCount: paid.length,
    paidTotal: paid.reduce((a, i) => a + (i.amount ?? 0), 0),
    openDeals: p.deals.filter((d) => isOpenDeal(d.stage)).length,
    openTickets: p.tickets.project.filter((t) => isOpenTicket(t.status)).length + p.tickets.code.filter((t) => isOpenTicket(t.status)).length,
    incidents30d: p.errors.incidents.filter((i) => {
      const t = Date.parse(i.started_at ?? '')
      return !isNaN(t) && now - t <= 30 * DAY && now - t >= -DAY
    }).length,
    latestVersion: versions[0]?.title ?? '',
  }
}

export interface LinkRow { label: string; url: string; kind: 'live' | 'repo' | 'portal' | 'status' | 'proposal' | 'next steps' }

export function linksOf(p: ProfileBody): LinkRow[] {
  const out: LinkRow[] = []
  const seen = new Set<string>()
  const add = (label: string, url: string | null | undefined, kind: LinkRow['kind']) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push({ label, url, kind })
  }
  for (const pr of p.projects) {
    add(pr.name, pr.live_url, /portal/i.test(pr.type ?? '') || /portal/i.test(pr.name) ? 'portal' : 'live')
    add(pr.name, pr.repo_url, 'repo')
  }
  for (const i of p.infra) {
    add(i.surface, i.url, i.monitored ? 'status' : 'live')
    if (i.repo && /^https?:\/\//.test(i.repo)) add(i.surface, i.repo, 'repo')
  }
  for (const d of p.deals) {
    add(d.name, d.proposal_url, 'proposal')
    add(d.name, d.next_steps_url, 'next steps')
  }
  return out
}

export interface Counts {
  projects: number
  links: number
  proposals: number
  contracts: number
  versions: number
  errors: number
  money: number
  infra: number
  tickets: number
  notes: number
}

export function sectionCounts(p: ProfileBody): Counts {
  return {
    projects: p.projects.length,
    links: linksOf(p).length,
    proposals: p.proposals.length,
    contracts: p.contracts.length,
    versions: p.versions.length,
    errors: p.errors.reports.length + p.errors.incidents.length,
    money: p.cartera.entries.length + p.cartera.payments.length + p.invoices.length + p.facturas.length + p.mrr.length,
    infra: p.infra.length,
    tickets: p.tickets.project.length + p.tickets.code.length,
    notes: [p.client.notes, p.client.ai_summary].filter((s) => s && s.trim()).length,
  }
}
