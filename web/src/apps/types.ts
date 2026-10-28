// Wire shapes of GET /api/apps/clients, /api/apps/clients/:id and /api/apps/estate (admin only).
export interface AppProject {
  id: string
  name: string
  type?: string | null
  status?: string | null
  live_url?: string | null
  repo_url?: string | null
  monthly_rate?: number | null
}
export interface ClientRow {
  id: string
  name: string
  company_name?: string | null
  status?: string | null
  industry?: string | null
  owner?: string | null
  tier?: string | null
  health?: string | null
  health_note?: string | null
  ball?: string | null
  mrr_mxn?: number | null
  last_contact_at?: string | null
  onboarding_date?: string | null
  overdue?: boolean | null
  projects: AppProject[]
  deals_open?: number | null
}
export interface ClientsBody {
  totals: { clients: number; active: number; mrr_mxn: number; overdue: number }
  clients: ClientRow[]
}
export interface ClientCore {
  id: string
  name: string
  company_name?: string | null
  email?: string | null
  phone?: string | null
  industry?: string | null
  niche?: string | null
  owner_name?: string | null
  decision_maker?: string | null
  relationship_type?: string | null
  ai_summary?: string | null
  status?: string | null
  onboarding_date?: string | null
  last_contact_at?: string | null
  next_follow_up_at?: string | null
  avatar_url?: string | null
  notes?: string | null
}
export interface ClientBoard {
  svt_owner?: string | null
  tier?: string | null
  health?: string | null
  health_note?: string | null
  ball?: string | null
  mrr_mxn?: number | null
  mrr_note?: string | null
  pending_us?: string | null
  pending_them?: string | null
  money_note?: string | null
  status?: string | null
}
export interface Deal {
  id: string
  name: string
  stage?: string | null
  service_type?: string | null
  service_tier?: string | null
  proposed_monthly_amount?: number | null
  final_monthly_amount?: number | null
  expected_close_date?: string | null
  actual_close_date?: string | null
  probability?: number | null
  proposal_url?: string | null
  next_steps_url?: string | null
  updated_at?: string | null
}
export interface Proposal { title: string; url: string; kind?: string | null; at?: string | null }
export interface Contract { id: string; title: string; ref_code?: string | null; type?: string | null; status?: string | null; created_at?: string | null; updated_at?: string | null }
export interface Invoice { id: string; amount?: number | null; status?: string | null; type?: string | null; due_date?: string | null; paid_date?: string | null }
export interface Factura { id: string; folio?: string | null; total?: number | null; status?: string | null; fecha?: string | null }
export interface CarteraEntry {
  id: string
  bucket?: string | null
  monthly_amount?: number | null
  billing_mode?: string | null
  billing_state?: string | null
  last_paid_period?: string | null
  next_payment_estimate?: string | null
  build_total?: number | null
  notes?: string | null
}
export interface CarteraPayment { id: string; entry_id?: string | null; kind?: string | null; amount?: number | null; period?: string | null; paid_at?: string | null }
export interface MrrLine { service: string; amount_mxn?: number | null; status?: string | null; starts_on?: string | null; counts_in_mrr?: boolean | null; billing_paused?: boolean | null }
export interface VersionEntry { id: string; entry_date?: string | null; category?: string | null; title: string; body?: string | null; published?: boolean | null }
export interface ErrorReport { id: string; title: string; severity?: string | null; status?: string | null; created_at?: string | null; resolved_at?: string | null }
export interface Incident { id: string; title: string; impact?: string | null; status?: string | null; started_at?: string | null; resolved_at?: string | null; summary?: string | null }
export interface InfraRow {
  surface: string
  url?: string | null
  hosting?: string | null
  repo?: string | null
  supabase_project_ref?: string | null
  monitored?: boolean | null
  last_ping_ok?: boolean | null
  last_ping_at?: string | null
  last_ping_ms?: number | null
  consecutive_failures?: number | null
}
export interface ProjectTicket { ticket_key: string; title: string; priority?: string | null; status?: string | null; gate?: string | null; owner?: string | null }
export interface CodeTicket { code_key: string; repo?: string | null; kind?: string | null; severity?: string | null; status?: string | null; title: string }
export interface ProfileBody {
  client: ClientCore
  board: ClientBoard | null
  projects: AppProject[]
  deals: Deal[]
  proposals: Proposal[]
  contracts: Contract[]
  invoices: Invoice[]
  facturas: Factura[]
  cartera: { entries: CarteraEntry[]; payments: CarteraPayment[] }
  mrr: MrrLine[]
  versions: VersionEntry[]
  errors: { reports: ErrorReport[]; incidents: Incident[] }
  infra: InfraRow[]
  tickets: { project: ProjectTicket[]; code: CodeTicket[] }
}

export type EstateKind =
  | 'os' | 'group' | 'lane' | 'agent' | 'folder' | 'file' | 'daemon' | 'timer' | 'watchdog'
  | 'model' | 'tool' | 'connector' | 'service' | 'repo' | 'surface' | 'db' | 'backup'
export interface EstateNode {
  id: string
  kind: EstateKind | string
  title: string
  subtitle?: string
  status?: string
  meta?: Record<string, unknown>
  children?: EstateNode[]
}
export interface EstateBody { generated_at?: string; root: EstateNode }
