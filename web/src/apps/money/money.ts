// Pure helpers of the Money app: money text, filters, paging, the mark-paid form defaults.
import type { Tone } from '../map/estate'
import type { CarteraRow, PayKind, Semaphore } from './types'

export const PAGE = 50

// $12,500 MXN, and $900 USD for a USD row.
export function moneyOf(n: number | null | undefined, currency = 'MXN'): string {
  if (n == null || !Number.isFinite(n)) return '-'
  const whole = Math.abs(n % 1) < 0.005
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })
  return (n < 0 ? '-' : '') + '$' + body + ' ' + currency
}

// The day in America/Mazatlan as YYYY-MM-DD.
export const todayMz = (now: number = Date.now()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mazatlan' }).format(new Date(now))

export const SEM_TONE: Record<Semaphore, Tone> = { stripe: 'idle', verde: 'ok', amarillo: 'warn', rojo: 'bad' }
export const SEM_LABEL: Record<Semaphore, string> = { stripe: 'Stripe', verde: 'Collected', amarillo: 'Pending', rojo: 'Not started' }
export const KIND_LABEL: Record<PayKind, string> = { monthly: 'Monthly', build_deposit: 'Build deposit', build_final: 'Build final' }

export interface CarteraFilter { bucket: string; semaphore: 'all' | Semaphore; q: string }
export function filterCartera(rows: CarteraRow[], f: CarteraFilter): CarteraRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) =>
    (f.bucket === 'all' || r.bucket === f.bucket) &&
    (f.semaphore === 'all' || r.semaphore === f.semaphore) &&
    (!q || [r.company_name, r.contact_name, r.notes, r.billing_mode, r.billing_state].some((v) => (v ?? '').toLowerCase().includes(q))))
}

export function pageOf<T>(rows: T[], page: number, size = PAGE): T[] {
  return rows.slice(page * size, page * size + size)
}
export const pageCount = (n: number, size = PAGE): number => Math.max(1, Math.ceil(n / size))

// Which payment kinds can still be recorded on an entry, and the amount each one prefills.
export function payKinds(e: CarteraRow): { kind: PayKind; amount: number }[] {
  const out: { kind: PayKind; amount: number }[] = []
  if (e.can_mark_paid) out.push({ kind: 'monthly', amount: e.monthly_amount })
  if (e.build_deposit_amount && !e.build_deposit_paid_at) out.push({ kind: 'build_deposit', amount: e.build_deposit_amount })
  if (e.build_final_amount && !e.build_final_paid_at) out.push({ kind: 'build_final', amount: e.build_final_amount })
  return out
}

export const compact = (n: number): string => (Math.abs(n) >= 1000 ? (n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(n)))

// Cartera groups by the real bucket values in the data. Known ones get a label and an order, anything else follows with its own
// name; cerrado starts collapsed and is never merged into desarrollo. Empty activos and desarrollo still show, other empties do not.
export const BUCKET_LABEL: Record<string, string> = { activos: 'Activos', desarrollo: 'Desarrollo', cerrado: 'Cerrados' }
const BUCKET_ORDER = ['activos', 'desarrollo', 'cerrado']
export interface CarteraGroup { key: string; label: string; rows: CarteraRow[]; collapsed: boolean }
export function groupCartera(groups: Record<string, CarteraRow[] | undefined>, filter: CarteraFilter): CarteraGroup[] {
  const keys = [...BUCKET_ORDER, ...Object.keys(groups).filter((k) => !BUCKET_ORDER.includes(k)).sort()]
  return keys
    .filter((k) => (groups[k]?.length ?? 0) > 0 || k === 'activos' || k === 'desarrollo')
    .map((k) => ({ key: k, label: BUCKET_LABEL[k] ?? k.charAt(0).toUpperCase() + k.slice(1), rows: filterCartera(groups[k] ?? [], filter), collapsed: k === 'cerrado' }))
}
