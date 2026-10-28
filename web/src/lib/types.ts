// Shapes of the console API, from docs/console-wired.md, console/lib/events.js and console/server.js.

// Profiles (console/lib/chat.js). The public part is what everyone sees; prefs are the person's own.
export interface PublicProfile {
  person_id: string
  name: string
  tag: string
  avatar: string | null
  editable: boolean
}
export type FontChoice = 'system' | 'montserrat' | 'space-grotesk'
export interface PrefValues {
  theme?: 'light' | 'dark' | 'system'
  zoom?: 100 | 115 | 130
  reduced_motion?: boolean
  font?: FontChoice
  rail?: import('./rail').RailPrefs
  // Marvin's pinned cheat sheet suggestions (item ids), per person and device.
  help_pins?: string[]
}
// The person-level default plus one entry per device id.
export interface StoredPrefs {
  default: PrefValues
  devices: Record<string, PrefValues>
}
export interface MyProfile {
  profile: PublicProfile
  prefs: { default: PrefValues; device: PrefValues; effective: PrefValues }
  device_id: string
}

export type Role = 'person' | 'gilfoyle' | 'agent' | 'system' | 'lane' | 'ask' | 'run' | 'changes' | 'form' | 'card'

export interface Signature {
  person: string
  device_id?: string
  device_name?: string
  device?: string
  ip?: string
  mac?: string
  at?: string
}

export interface ReplyTo {
  message_id: string
  excerpt?: string
  person?: string
}

interface Base {
  id: string
  lane: string
  at: string
  oc_id?: string
}

export interface TextMessage extends Base {
  role: 'person' | 'gilfoyle' | 'agent' | 'system' | 'lane'
  text: string
  client_id?: string
  from_lane?: string
  // A reply from an agent other than Gilfoyle: role 'agent' plus its id.
  agent?: string
  // A cross-agent ask or its reply, delivered as a lane message: the eyebrow names the sender ("Ask from Jared (jared-bay)"),
  // a reply quotes the ask it answers.
  eyebrow?: string
  relay_id?: string
  relay_kind?: 'ask' | 'reply'
  quote?: { label: string; text: string }
  acting_person?: string | null
  reply_to?: ReplyTo
  signature?: Signature
  // Person ids named with @tag in the text (Gilfoyle is 'gilfoyle'), set by the console on send.
  mentions?: string[]
  // Set on a message that was forwarded here from another lane.
  forwarded_from?: ForwardedFrom
  // Files uploaded into the lane's Library first (tag chat), described by the console from the Library row.
  attachments?: MessageAttachment[]
}

export interface Attachment {
  id: string
  name: string
  kind: string
  size: number
  mode?: 'upload'
}
// A pointer at a file or folder already in Lane files: nothing is uploaded or copied. `ref` is a Library id or a repo
// path for a file, and the Lane files tree path ('uploads/Quotes', 'registry') for a folder. `path` is the display path.
export interface ContextAttachment {
  mode: 'context'
  ref: string
  kind: 'file' | 'folder'
  name: string
  lane?: string | null
  path?: string
}
export type MessageAttachment = Attachment | ContextAttachment
export const isContext = (a: MessageAttachment): a is ContextAttachment => (a as ContextAttachment).mode === 'context'

export interface ForwardedFrom {
  lane: string
  message_id: string
  author: string
  at: string
}

export type AskState = 'open' | 'once' | 'always' | 'reject' | 'closed'
export type Decision = 'once' | 'always' | 'reject'

export interface AskScope {
  host?: string
  command_class: string
  always_allowed: boolean
}

export interface AskItem extends Base {
  role: 'ask'
  ask: {
    request_id: string
    action: string
    resources: string[]
    message: string
    metadata: Record<string, unknown> | null
    source: unknown
    // Set by the console when the ask arrives: where it runs, its class, and whether the policy lets "Always" show.
    scope?: AskScope
  }
  state: AskState
  replied_by?: string | null
  replied_at?: string | null
  signature?: Signature
}

export type ToolStatus = 'running' | 'ok' | 'failed'

export interface RunTool {
  id: string
  name: string
  input_summary: string
  sensitive?: boolean
  status: ToolStatus
  started: number
  ended?: number
  output_excerpt?: string
}

export type RunStatus = 'running' | 'done' | 'failed' | 'interrupted'

export interface RunData {
  turn_id?: string
  message_id: string
  message_ids?: string[]
  agent: string | null
  model: string | null
  started: number
  ended: number | null
  status: RunStatus
  tools: RunTool[]
}

export interface RunItem extends Base {
  role: 'run'
  run: RunData
}

export interface ChangeFile {
  path: string
  additions: number
  deletions: number
  diff: string
  truncated: boolean
  sensitive?: boolean
}

export interface ChangesItem extends Base {
  role: 'changes'
  files: ChangeFile[]
}

// Forms (docs/forms-spec.md). The thread item is the stored one from console/lib/forms.js.
export interface FormOption {
  value: string
  label?: string
  description?: string
}

export interface FormCondition {
  key: string
  op: 'eq' | 'neq'
  value: unknown
}

export interface FormField {
  key: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'multiselect' | 'external'
  title?: string
  description?: string
  required?: boolean
  hidden?: boolean
  when?: FormCondition[]
  format?: 'email' | 'uri' | 'date' | 'date-time'
  minLength?: number
  maxLength?: number
  pattern?: string
  placeholder?: string
  default?: unknown
  options?: FormOption[]
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  url?: string
}

export interface FormPage {
  heading?: string
  intro?: string
  keys?: string[]
}

export interface FormDef {
  id: string
  title: string
  fields: FormField[]
  metadata: { intro?: string; pages?: FormPage[] } | null
}

export type FormState = 'pending' | 'answered' | 'cancelled'

export interface FormSettler {
  person?: string | null
  via?: string
  device_name?: string
}

export interface FormItem extends Base {
  role: 'form'
  form: FormDef
  state: FormState
  text?: string
  replied_by?: FormSettler | null
  replied_at?: string | null
  summary?: { answered: number; total: number } | null
}

export interface FormResult {
  form: FormItem
}

// Cards (docs/cards-spec.md). A stored card is a thread item { role: 'card', card }; the console validates it
// against the shared registry (console/lib/cards) before storing. The four older items are mapped into the same
// registry by web/src/cards/map.ts and keep their own storage.
export type CardActionKind = 'open' | 'approve' | 'deny' | 'ack' | 'copy' | 'download' | 'retry' | 'submit' | 'run'
export interface CardAction {
  id: string
  label: string
  kind: CardActionKind
  scope?: 'owner' | 'member'
  target?: string
  // Set by Gilfoyle on an `open` action: the dock opens the surface once, on its own.
  auto?: boolean
}
export interface CardProvenance {
  source: 'tool' | 'recall' | 'research' | 'person'
  tool?: string
  run_id?: string
  message_id?: string
  refs?: { label: string; href?: string; path?: string }[]
  at: string
}
export type CardState = 'open' | 'done' | 'ack' | 'stale'
export interface CardResolution {
  action_id: string
  kind: CardActionKind
  label?: string
  by: { person?: string | null; device_id?: string; device_name?: string }
  at: string
}
export interface CardObject {
  id: string
  kind: string
  lane: string
  data: Record<string, unknown>
  provenance: CardProvenance
  actions: CardAction[]
  state: CardState
  at: string
  resolution?: CardResolution | null
  last_action?: CardResolution | null
}
export interface CardItem extends Base {
  role: 'card'
  card: CardObject
  session_id?: string
  text?: string
}

export type ThreadItem = TextMessage | AskItem | RunItem | ChangesItem | FormItem | CardItem

export interface Me {
  person: string
  name?: string
  role: string
  // Layout variant id (people.ui). Missing means marvin-v1.
  ui?: string
  device_id: string
  device_name: string
  ip: string
  mac: string | null
  lanwatch_status: string | null
  // Not in the API today; the devices page uses it when present, else the lane members.
  people?: { id: string; name: string }[]
}

export interface LaneLast {
  id: string
  role: string
  who: string
  own: boolean
  text: string
  at: string
}

// GET /api/lanes rows (lanePreview): the lane definition plus live preview fields.
export interface LaneRow {
  id: string
  kind: 'dm' | 'group' | 'desk'
  title: string
  members: string[]
  busy?: boolean
  count?: number
  asks?: number
  // Pending forms, counted client side from the thread (the lane list API does not carry them).
  forms?: number
  session_missing?: boolean
  // The agent this lane talks to. Additive: absent means Gilfoyle.
  agent?: { id: string; name: string; avatar?: string | null }
  last?: LaneLast | null
  tail?: { at: string; own: boolean; mention?: boolean }[]
}

export interface Health {
  opencode: 'up' | 'down'
  down_for_s?: number
  sessions: Record<string, 'ok' | 'missing'>
  pending_asks: number
  outbox?: number
  // Per agent runtime status. Additive, not read yet.
  agents?: Record<string, { opencode: 'up' | 'down'; down_for_s?: number }>
}

export interface SendPayload {
  text: string
  client_id?: string
  reply_to?: ReplyTo
  attachments?: ({ id: string } | { mode: 'context'; ref: string; kind: 'file' | 'folder'; name: string; lane?: string })[]
}

export interface SendResult {
  message: TextMessage
  forwarded?: boolean
  reason?: string
}

export interface AskReplyResult {
  ask: AskItem
}

// Frames on /api/stream. muxSend adds `lane` to every lane frame. Runs and changes arrive as `message` frames.
export type StreamEvent =
  | { type: 'message'; lane: string; message: ThreadItem }
  | { type: 'ask'; lane: string; ask: AskItem }
  | { type: 'ask_update'; lane: string; id: string; state: AskState; replied_by?: string | null; replied_at?: string | null }
  | { type: 'asks'; lane: string; open: number }
  | { type: 'busy'; lane: string; busy: boolean }
  | { type: 'removed'; lane: string; id: string }
  | { type: 'run_update'; lane: string; id: string; run: RunData }
  | { type: 'stream'; lane: string; message_id: string; text: string }
  | { type: 'stream_end'; lane: string; message_id: string }
  | { type: 'session'; lane: string; state: 'missing' | 'ok' }
  | { type: 'form'; lane: string; form: FormItem }
  | { type: 'form_update'; lane: string; id: string; state?: FormState; summary?: FormItem['summary']; replied_by?: FormSettler | null; replied_at?: string | null }
  | { type: 'card'; lane: string; card: CardItem }
  | { type: 'card_update'; lane: string; id: string; state: CardState; resolution?: CardResolution | null; last_action?: CardResolution | null }
  | { type: 'health'; opencode: 'up' | 'down'; down_for_s?: number; agents?: Health['agents'] }
  // An ask changed in a lane where this person is only an approver: a hint to re-read the approval queue, no content.
  | { type: 'approver_ask'; lane: string }
  // No lane: a public profile changed. `prefs` rides along only on the changed person's own tabs.
  | { type: 'profile_update'; profile: PublicProfile; prefs?: StoredPrefs }

// GET /api/devices rows (approved) and the pending rows (console/lib/store.js).
export interface PendingDevice {
  id: string
  ua?: string
  ip?: string
  mac?: string | null
  first_seen?: string
  status?: string
  lanwatch_name?: string
  door?: string | null
}

export interface Device {
  id: string
  name: string
  person_id: string
  last_ip?: string | null
  last_mac?: string | null
  last_seen?: string | null
}

// ---------------------------------------------------------------- surfaces (docs/surfaces-spec.md)

// GET /api/asks?state=open: an ask item plus the lane it sits in.
export type AskRow = AskItem & { lane_title: string }

// One entry of a note's history: the text of a version comes from its own request.
export interface ScratchVersion {
  version: number
  at: string
  by: Scratch['updated_by']
  bytes: number
}

export interface Scratch {
  lane: string
  text: string
  version: number
  updated_at: string | null
  updated_by: { person?: string; device_name?: string; via?: string } | null
}

export interface LaneFileRow {
  name: string
  path: string
  kind: string
  size: number
  mtime: string | null
  lane: string
  source: 'repo' | 'upload'
  scope: 'lane' | 'shared'
}

// GET /api/lan/summary: lan-watch lenovo/lan-watch/portal.py /api/summary, read only.
export interface LanDevice {
  mac: string
  label: string | null
  vendor: string | null
  status: 'pending' | 'approved' | 'denied' | string
  is_random?: boolean
  first_seen?: string | null
  last_seen?: string | null
  last_ip?: string | null
  online?: boolean
  is_box?: boolean
  // Not sent by lan-watch today. When it is, the connection lens uses it.
  connection?: 'wired' | 'wifi' | string | null
}
export interface LanSummary {
  generated_at?: string
  online_window_min?: number
  box?: { iface?: string | null; ip?: string | null; mac?: string | null }
  // Not sent by lan-watch today. When it is, the LAN views use it instead of inferring the gateway and the switch.
  gateway?: { ip?: string | null; mac?: string | null; label?: string | null } | null
  switch?: { label?: string | null } | null
  last_scan?: string | null
  counts?: { total: number; online: number; pending: number; denied: number }
  devices: LanDevice[]
}

// GET /api/box/interfaces
export interface IfaceCounters {
  bytes: number
  packets: number
  errors: number
  dropped: number
}
export interface BoxIface {
  name: string
  state: string
  addrs: string[]
  mac: string | null
  mtu: number | null
  speed_mbps: number | null
  carrier_changes: number | null
  rx: IfaceCounters | null
  tx: IfaceCounters | null
}

// GET /api/lan/assignments and PUT /api/lan/devices/:mac: the console-side mapping of a LAN device to a person.
export type LanClass = 'personal_family' | 'smart_home' | 'lcav' | 'search'
export interface LanClassRow {
  id: LanClass
  label: string
  count: number
}
export interface LanAssignment {
  person: string | null
  notes: string
  // Absent until someone classifies the device. The Lenovo box reads as 'search' without a record.
  class?: LanClass | null
  updated_by: string | null
  updated_at: string | null
}
export type LanAction = 'approve' | 'deny' | 'reset' | 'rename'
