// One node model for every LAN view (the Network topology surface, the #/lan canvas, the Interface health picker).
// Built from the lan-watch summary plus the console-side assignments. Pure: no fetching, no React.
import type { LanAssignment, LanClass, LanDevice, LanSummary } from '@/lib/types'

// Sovereign's house network: Marvin and Bay are the only people a device can be assigned to.
export const HOUSE_PEOPLE = ['marvin', 'bay']

export const CLASS_ORDER: LanClass[] = ['personal_family', 'smart_home', 'lcav', 'search']
export const CLASS_LABEL: Record<LanClass, string> = { personal_family: 'Personal / family', smart_home: 'Smart home', lcav: 'LCAV', search: 'Search' }
// The colour token behind each class (theme.css); views read it as var(--class-x) through [data-class].
export const CLASS_TOKEN: Record<LanClass, string> = { personal_family: '--class-personal', smart_home: '--class-smart', lcav: '--class-lcav', search: '--class-search' }
export const isLanClass = (v: unknown): v is LanClass => typeof v === 'string' && (CLASS_ORDER as string[]).includes(v)

export type DeviceType = 'network' | 'cameras' | 'controllers' | 'phones_laptops' | 'media' | 'other'
export const TYPE_ORDER: DeviceType[] = ['network', 'cameras', 'controllers', 'phones_laptops', 'media', 'other']
export const TYPE_LABEL: Record<DeviceType, string> = { network: 'Network gear', cameras: 'Cameras', controllers: 'Controllers', phones_laptops: 'Phones and laptops', media: 'Media', other: 'Other' }
export type Connection = 'wired' | 'wifi' | 'unknown'
export const CONN_ORDER: Connection[] = ['wired', 'wifi', 'unknown']
export type Activity = 'online' | 'today' | 'week' | 'stale' | 'pending' | 'denied'
export const ACT_ORDER: Activity[] = ['online', 'today', 'week', 'stale', 'pending', 'denied']
export const ACT_LABEL: Record<Activity, string> = { online: 'Online', today: 'Seen today', week: 'Seen this week', stale: 'Stale', pending: 'Pending', denied: 'Denied' }

export type NodeKind = 'gateway' | 'switch' | 'box' | 'device'
export type NodeStatus = 'online' | 'offline' | 'pending' | 'denied'

export interface LanNode {
  // 'gateway', 'switch', 'box' or the device mac. The box keeps 'box' because the lane selection already uses it.
  id: string
  kind: NodeKind
  label: string
  status: NodeStatus
  online: boolean
  mac: string | null
  ip: string | null
  vendor: string | null
  isRandom: boolean
  firstSeen: string | null
  lastSeen: string | null
  // The lan-watch row, when there is one. Only a node with a row can be approved, denied, reset or renamed.
  device: LanDevice | null
  assignment: LanAssignment | null
  // True when the node is drawn from a guess (no row, or no gateway in the summary).
  inferred: boolean
  // The classification: the assignment's, or 'search' for the Lenovo box when nobody has classified it. null = unclassified.
  cls: LanClass | null
  // Inferred from the vendor family and the name.
  type: DeviceType
  conn: Connection
}

export interface LanCounts {
  total: number
  online: number
  offline: number
  pending: number
  denied: number
}

export interface LanModel {
  gateway: LanNode
  switch: LanNode
  box: LanNode
  devices: LanNode[]
  // gateway -> switch -> box and every device.
  edges: { from: string; to: string }[]
  counts: LanCounts
  generatedAt: string | null
  lastScan: string | null
}

export const STATUS_ORDER: NodeStatus[] = ['pending', 'denied', 'online', 'offline']
export const STATUS_WORD: Record<NodeStatus, string> = { online: 'online', offline: 'offline', pending: 'pending approval', denied: 'denied' }

export function nodeStatus(d: LanDevice): NodeStatus {
  if (d.status === 'denied') return 'denied'
  if (d.status === 'pending') return 'pending'
  return d.online ? 'online' : 'offline'
}
export const deviceName = (d: LanDevice): string => d.label || d.vendor || d.mac

const RULES: [DeviceType, RegExp][] = [
  ['network', /tp-?link|netgear|ubiquiti|unifi|cisco|mikrotik|router|switch|gateway|access point|\bap\b|arris|ruckus|aruba|zyxel|d-link|eero|linksys|netgate|modem|huawei technologies|ruijie/],
  ['cameras', /hikvision|dahua|reolink|amcrest|wyze|\bring\b|arlo|camera|\bcam\b|ezviz|lorex|foscam|axis comm|nest cam|doorbell/],
  ['controllers', /raspberry|espressif|arduino|particle|tuya|shelly|philips lighting|signify|\bhue\b|lutron|sonoff|hubitat|smartthings|ecobee|nest labs|home assistant|controller|\bhub\b|\bplc\b|siemens|esp32|esp8266|thermostat|zigbee|z-wave|tasmota/],
  ['media', /sonos|roku|chromecast|\btv\b|bose|denon|yamaha|shield|apple tv|echo|spotify|xbox|playstation|nintendo|vizio|sony|lg electronics|speaker|soundbar|amazon tech|kindle/],
  ['phones_laptops', /apple|iphone|ipad|macbook|samsung|google|pixel|oneplus|xiaomi|motorola|lenovo|dell|hewlett|hp inc|intel|microsoft|asustek|acer|laptop|phone|android|galaxy|surface/],
]
export function deviceType(n: { kind: NodeKind; label: string; vendor: string | null }): DeviceType {
  if (n.kind === 'gateway' || n.kind === 'switch') return 'network'
  if (n.kind === 'box') return 'controllers'
  const hay = `${n.label} ${n.vendor ?? ''}`.toLowerCase()
  if (/printer|scanner/.test(hay)) return 'other'
  return RULES.find(([, re]) => re.test(hay))?.[0] ?? 'other'
}
const connOf = (d: LanDevice | null, kind: NodeKind): Connection => {
  const c = String(d?.connection ?? '').toLowerCase()
  if (c === 'wired' || c === 'ethernet' || c === 'lan') return 'wired'
  if (c === 'wifi' || c === 'wi-fi' || c === 'wireless' || c === 'wlan') return 'wifi'
  return kind === 'box' || kind === 'gateway' || kind === 'switch' ? 'wired' : 'unknown'
}
const classOf = (a: LanAssignment | null, kind: NodeKind): LanClass | null => (isLanClass(a?.class) ? a!.class! : kind === 'box' ? 'search' : null)

const finish = (n: Omit<LanNode, 'cls' | 'type' | 'conn'>): LanNode => ({ ...n, cls: classOf(n.assignment, n.kind), type: deviceType(n), conn: connOf(n.device, n.kind) })

const fromDevice = (d: LanDevice, kind: NodeKind, id: string, assignments: Record<string, LanAssignment>, label?: string): LanNode => finish({
  id,
  kind,
  label: label || deviceName(d),
  status: nodeStatus(d),
  online: !!d.online,
  mac: d.mac,
  ip: d.last_ip ?? null,
  vendor: d.vendor ?? null,
  isRandom: !!d.is_random,
  firstSeen: d.first_seen ?? null,
  lastSeen: d.last_seen ?? null,
  device: d,
  assignment: assignments[d.mac] ?? null,
  inferred: false,
})

const ghost = (id: string, kind: NodeKind, label: string, over: Partial<LanNode> = {}): LanNode => finish({
  id, kind, label, status: 'online', online: true, mac: null, ip: null, vendor: null, isRandom: false, firstSeen: null, lastSeen: null, device: null, assignment: null, inferred: true, ...over,
})

// The router is, by convention, the .1 of the box's /24. Used only when the summary does not name a gateway.
function guessGatewayIp(boxIp?: string | null): string | null {
  const m = (boxIp ?? '').match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/)
  return m ? m[1] + '.1' : null
}

export function buildLanModel(sum: LanSummary, assignments: Record<string, LanAssignment> = {}): LanModel {
  const rows = sum.devices
  const boxRow = rows.find((d) => d.is_box) ?? (sum.box?.mac ? rows.find((d) => d.mac === sum.box!.mac) : undefined)
  const named = !!(sum.gateway?.mac || sum.gateway?.ip)
  const gwIp = sum.gateway?.ip || guessGatewayIp(sum.box?.ip)
  // A gateway the summary names wins; only without one do we fall back to the .1 of the box's subnet.
  const isGw = (d: LanDevice) => (named ? (!!sum.gateway?.mac && d.mac === sum.gateway.mac) || (!!sum.gateway?.ip && d.last_ip === sum.gateway.ip) : !!gwIp && d.last_ip === gwIp)
  const gwRow = rows.find((d) => !d.is_box && d !== boxRow && isGw(d))
  const box: LanNode = boxRow
    ? { ...fromDevice(boxRow, 'box', 'box', assignments, 'This box'), ip: sum.box?.ip ?? boxRow.last_ip ?? null, status: 'online', online: true }
    : ghost('box', 'box', 'This box', { mac: sum.box?.mac ?? null, ip: sum.box?.ip ?? null })
  const gateway: LanNode = gwRow
    ? fromDevice(gwRow, 'gateway', 'gateway', assignments, sum.gateway?.label || (gwRow.label ? gwRow.label : 'Gateway'))
    : ghost('gateway', 'gateway', sum.gateway?.label || 'Gateway', { ip: gwIp, mac: sum.gateway?.mac ?? null })
  const sw: LanNode = ghost('switch', 'switch', sum.switch?.label || 'Switch')
  const devices = rows.filter((d) => d !== boxRow && d !== gwRow).map((d) => fromDevice(d, 'device', d.mac, assignments))
  const counts: LanCounts = { total: rows.length, online: 0, offline: 0, pending: 0, denied: 0 }
  for (const d of rows) {
    const s = nodeStatus(d)
    if (d.online) counts.online++
    if (s === 'offline') counts.offline++
    if (s === 'pending') counts.pending++
    if (s === 'denied') counts.denied++
  }
  return {
    gateway,
    switch: sw,
    box,
    devices,
    edges: [{ from: 'gateway', to: 'switch' }, { from: 'switch', to: 'box' }, ...devices.map((d) => ({ from: 'switch', to: d.id }))],
    counts,
    generatedAt: sum.generated_at ?? null,
    lastScan: sum.last_scan ?? null,
  }
}

// Every node a view can pick, in drawing order.
export const allNodes = (m: LanModel): LanNode[] => [m.gateway, m.switch, m.box, ...m.devices]
export const findNode = (m: LanModel | null, id: string): LanNode | undefined => (m ? allNodes(m).find((n) => n.id === id || (!!n.mac && n.mac === id)) : undefined)

// What the lane's selection id means for this model: 'box' and the box mac are the same node.
export const selectionNodeId = (m: LanModel | null, selId: string): string => (m ? findNode(m, selId)?.id ?? selId : selId)

export function matchesQuery(n: LanNode, q: string, person?: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [n.label, n.mac, n.ip, n.vendor, person, STATUS_WORD[n.status]].some((v) => !!v && String(v).toLowerCase().includes(needle))
}


// ---------------------------------------------------------------- lenses

export interface Lens {
  classes: (LanClass | 'none')[]
  types: DeviceType[]
  conns: Connection[]
  acts: Activity[]
  q: string
}
export const NO_LENS: Lens = { classes: [], types: [], conns: [], acts: [], q: '' }
export const lensActive = (l: Lens): boolean => !!(l.classes.length || l.types.length || l.conns.length || l.acts.length || l.q.trim())

const DAY = 86_400_000
// The activity buckets a node falls in. `now` is the reading's own time, so a stale page does not drift.
export function activities(n: LanNode, now: number): Set<Activity> {
  const out = new Set<Activity>()
  const seen = n.lastSeen ? Date.parse(n.lastSeen) : NaN
  const age = Number.isFinite(seen) ? now - seen : Infinity
  if (n.status === 'pending') out.add('pending')
  if (n.status === 'denied') out.add('denied')
  if (n.status === 'online') out.add('online')
  if (n.online || age <= DAY) out.add('today')
  if (n.online || age <= 7 * DAY) out.add('week')
  if (n.status === 'offline' && age > 7 * DAY) out.add('stale')
  return out
}

// Chips inside one group are alternatives; the groups, and the text, all have to hold.
export function matchesLens(n: LanNode, l: Lens, now: number, person?: string): boolean {
  if (l.classes.length && !l.classes.includes(n.cls ?? 'none')) return false
  if (l.types.length && !l.types.includes(n.type)) return false
  if (l.conns.length && !l.conns.includes(n.conn)) return false
  if (l.acts.length) {
    const a = activities(n, now)
    if (!l.acts.some((x) => a.has(x))) return false
  }
  return matchesQuery(n, l.q, person)
}
// The devices lan-watch holds a row for (the switch and guessed nodes are structure, not devices).
export const lensPool = (m: LanModel): LanNode[] => [m.gateway, m.box, ...m.devices].filter((n) => !n.inferred)

export function classCounts(m: LanModel | null): Record<LanClass | 'none', number> {
  const out = { personal_family: 0, smart_home: 0, lcav: 0, search: 0, none: 0 } as Record<LanClass | 'none', number>
  if (m) for (const n of lensPool(m)) out[n.cls ?? 'none']++
  return out
}
