// Display helpers for the app pages: money with thousands separators, dates relative with the absolute one on hover.
export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-'
  return '$' + Math.round(n).toLocaleString('en-US') + ' MXN'
}

const parse = (iso?: string | null): number => (iso ? Date.parse(iso) : NaN)

// "3 d ago", "in 2 d", "just now"; dates a month or more away read as the day itself.
export function relDate(iso?: string | null, now: number = Date.now()): string {
  const t = parse(iso)
  if (isNaN(t)) return ''
  const diff = Math.round((now - t) / 1000)
  const past = diff >= 0
  const s = Math.abs(diff)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  const unit = m < 60 ? m + ' min' : Math.round(m / 60) < 24 ? Math.round(m / 60) + ' h' : Math.round(m / 60 / 24) < 30 ? Math.round(m / 60 / 24) + ' d' : ''
  if (!unit) return absDate(iso)
  return past ? unit + ' ago' : 'in ' + unit
}

export function absDate(iso?: string | null): string {
  const t = parse(iso)
  if (isNaN(t)) return ''
  return new Date(t).toISOString().slice(0, 10)
}

export const initialsOf = (s: string): string =>
  s.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

export const isLive = (u?: string | null): u is string => !!u && /^https?:\/\//i.test(u)
