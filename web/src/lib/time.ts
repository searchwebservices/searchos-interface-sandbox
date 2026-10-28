// Same buckets as console/ui/time.js.
export function relTime(iso: string | undefined, now?: number): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (isNaN(t)) return ''
  const s = Math.round(((now ?? Date.now()) - t) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + ' h ago'
  const d = Math.round(h / 24)
  if (d < 30) return d + ' d ago'
  return new Date(t).toISOString().slice(0, 10)
}

export function dayKey(iso: string | undefined): string {
  const d = new Date(iso ?? '')
  return isNaN(d.getTime()) ? '' : d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
}

export function dayLabel(iso: string | undefined, now?: number): string {
  const d = new Date(iso ?? '')
  if (isNaN(d.getTime())) return ''
  const n = new Date(now ?? Date.now())
  const k = (x: Date) => x.getFullYear() * 400 + x.getMonth() * 31 + x.getDate()
  const diff = k(n) - k(d)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const initials = (s: string | undefined): string =>
  String(s || '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

// 12.3s, or 2m 5.0s, from milliseconds. Matches the loader's own format.
export function fmtDuration(ms: number): string {
  const ds = Math.max(0, Math.round(ms / 100))
  return ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`
}

// The API gives person ids (marvin); the interface shows them capitalised.
// A profile name wins when the person set one; AppProvider keeps the registry current from the profiles list.
let names: Record<string, string> = {}
export const registerNames = (m: Record<string, string>): void => {
  names = m
}
export const displayName = (id: string): string => (id ? names[id] || id.charAt(0).toUpperCase() + id.slice(1) : '')

// Same reading as console/lib/format.js parseUA: "Chrome on Mac".
export function parseUA(ua: string | undefined): string {
  const u = String(ua ?? '').trim()
  if (!u) return 'Unknown browser'
  const tool = u.match(/^(curl|wget|python-requests|node-fetch|undici|okhttp|Go-http-client|axios|PostmanRuntime|HTTPie)\b/i)
  if (tool) return tool[1].toLowerCase() === 'curl' ? 'curl' : tool[1]
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /CrOS/.test(u) ? 'ChromeOS' : /Macintosh|Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux|X11/.test(u) ? 'Linux' : ''
  const br = /Edg(e|A|iOS)?\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /Firefox\/|FxiOS\//.test(u) ? 'Firefox' : /Chrome\/|CriOS\//.test(u) ? 'Chrome' : /Safari\//.test(u) && /Version\//.test(u) ? 'Safari' : ''
  if (br) return os ? br + ' on ' + os : br
  const tok = u.match(/^([A-Za-z][\w.-]*)\//)
  if (tok) return os ? tok[1] + ' on ' + os : tok[1]
  return os || u.slice(0, 40)
}

export const shortId = (id: string | undefined): string => String(id ?? '').slice(0, 12)
