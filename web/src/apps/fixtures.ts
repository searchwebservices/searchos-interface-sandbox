// Small fixtures for the app page tests.
import type { ClientsBody, EstateBody, ProfileBody } from './types'

export const CLIENTS: ClientsBody = {
  totals: { clients: 3, active: 2, mrr_mxn: 12500, overdue: 1 },
  clients: [
    { id: 'c1', name: 'Sample Bakery', company_name: 'Bakery SA', status: 'active', tier: 'OS', health: 'green', ball: 'them', mrr_mxn: 5000, last_contact_at: '2026-10-20T10:00:00Z', overdue: false, projects: [{ id: 'p1', name: 'Bakery site', type: 'website', status: 'live' }, { id: 'p2', name: 'Bakery agent', type: 'agent', status: 'building' }], deals_open: 1 },
    { id: 'c2', name: 'Sample Spa', company_name: null, status: 'active', tier: 'Starter', health: 'red', ball: 'us', mrr_mxn: 7500, last_contact_at: '2026-09-01T10:00:00Z', overdue: true, projects: [{ id: 'p3', name: 'Spa portal', type: 'portal', status: 'live' }], deals_open: 0 },
    { id: 'c3', name: 'Another Cafe', status: 'paused', tier: 'Agents', health: 'amber', ball: 'us', mrr_mxn: 0, last_contact_at: null, overdue: false, projects: [] },
  ],
}

export const PROFILE: ProfileBody = {
  client: { id: 'c1', name: 'Sample Bakery', company_name: 'Bakery SA', email: 'hola@bakery.test', phone: '+52 624 000 0000', owner_name: 'Borja', status: 'active', onboarding_date: '2026-03-01', last_contact_at: '2026-10-20T10:00:00Z', notes: 'Likes mornings.', ai_summary: 'A happy bakery.' },
  board: { svt_owner: 'bay', tier: 'OS', health: 'green', health_note: 'All quiet', ball: 'them', mrr_mxn: 5000, status: 'active' },
  projects: Array.from({ length: 7 }, (_, i) => ({ id: 'p' + i, name: 'Project ' + i, type: 'website', status: 'live', live_url: 'https://p' + i + '.example.com', repo_url: i === 0 ? 'https://github.com/x/y' : null })),
  deals: [{ id: 'd1', name: 'Upsell', stage: 'proposal', proposal_url: 'https://docs.example.com/p' }, { id: 'd2', name: 'First build', stage: 'won' }],
  proposals: [{ title: 'Proposal v1', url: 'https://docs.example.com/p', kind: 'proposal', at: '2026-09-01T00:00:00Z' }],
  contracts: [{ id: 'k1', title: 'Service agreement', ref_code: 'SVT-1', type: 'service', status: 'signed', created_at: '2026-03-02T00:00:00Z' }],
  invoices: [{ id: 'i1', amount: 5000, status: 'paid', type: 'monthly', due_date: '2026-10-03', paid_date: '2026-10-04' }, { id: 'i2', amount: 5000, status: 'paid', type: 'monthly', due_date: '2025-12-03', paid_date: '2025-12-04' }, { id: 'i3', amount: 5000, status: 'open', type: 'monthly', due_date: '2026-11-03' }],
  facturas: [{ id: 'f1', folio: 'BP260-7', total: 5800, status: 'stamped', fecha: '2026-10-04' }],
  cartera: { entries: [{ id: 'e1', bucket: 'os', monthly_amount: 5000, billing_mode: 'auto', billing_state: 'active', last_paid_period: '2026-10' }], payments: [{ id: 'y1', entry_id: 'e1', kind: 'monthly', amount: 5000, period: '2026-10', paid_at: '2026-10-04T00:00:00Z' }] },
  mrr: [{ service: 'OS', amount_mxn: 5000, status: 'active', counts_in_mrr: true, billing_paused: false }],
  versions: [{ id: 'v1', entry_date: '2026-10-01', title: 'Menu page', category: 'feature', published: true }, { id: 'v2', entry_date: '2026-10-15', title: 'Order form', category: 'feature', published: true }],
  errors: { reports: [{ id: 'r1', title: 'Broken button', severity: 'low', status: 'resolved', created_at: '2026-10-02T00:00:00Z' }], incidents: [{ id: 'n1', title: 'Site down', impact: 'high', status: 'resolved', started_at: '2026-10-20T00:00:00Z' }, { id: 'n2', title: 'Old outage', status: 'resolved', started_at: '2026-06-01T00:00:00Z' }] },
  infra: [{ surface: 'bakery.test', url: 'https://bakery.test', hosting: 'netlify', monitored: true, last_ping_ok: true, last_ping_ms: 120, last_ping_at: '2026-10-27T00:00:00Z', consecutive_failures: 0 }],
  tickets: { project: [{ ticket_key: 'SVT-1', title: 'Fix menu', priority: 'P1', status: 'open' }, { ticket_key: 'SVT-2', title: 'Done thing', status: 'done' }], code: [{ code_key: 'C-1', repo: 'bakery', kind: 'bug', status: 'open', title: 'Typo' }] },
}

export const ESTATE: EstateBody = {
  generated_at: '2026-10-27T08:00:00Z',
  root: {
    id: 'os', kind: 'os', title: 'SearchOS', subtitle: 'v5', status: 'ok',
    children: [
      { id: 'lanes', kind: 'group', title: 'Lanes', children: [
        { id: 'lane:jared-bay', kind: 'lane', title: 'jared-bay', status: 'up', meta: { owner: 'bay', engine: 'claude' }, children: [{ id: 'f1', kind: 'file', title: 'charter.md' }] },
        { id: 'lane:hardware', kind: 'lane', title: 'hardware', status: 'down' },
      ] },
      { id: 'infra', kind: 'group', title: 'Infra', children: [{ id: 'd1', kind: 'daemon', title: 'relay', status: 'ok' }] },
    ],
  },
}
