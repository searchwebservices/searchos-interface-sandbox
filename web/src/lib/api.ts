// Thin JSON client over the console API. Every call resolves to {ok, status, body}; none throws on HTTP errors.
import type { LibraryPreview, LibraryRow, LibraryStatus, LibraryUse } from './library'
import type { LanClass, LanClassRow, ForwardedFrom, MyProfile, PrefValues, PublicProfile, LanAction, LanAssignment, AskReplyResult, AskRow, BoxIface, LaneFileRow, LanSummary, Scratch, ScratchVersion, CardItem, Decision, Device, FormResult, Health, PendingDevice, LaneRow, Me, SendPayload, SendResult, ThreadItem } from './types'

export interface ApiResult<T> {
  ok: boolean
  status: number
  body: T
}

export async function call<T>(url: string, opts?: RequestInit): Promise<ApiResult<T>> {
  let r: Response
  try {
    r = await fetch(url, { credentials: 'same-origin', ...opts })
  } catch {
    return { ok: false, status: 0, body: { error: 'network' } as T }
  }
  let body: unknown = null
  try {
    body = await r.json()
  } catch {
    body = null
  }
  return { ok: r.ok, status: r.status, body: (body ?? {}) as T }
}

const lane = (id: string) => '/api/lanes/' + encodeURIComponent(id)
const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
})

export const me = () => call<Me>('/api/me')
export const lanes = () => call<LaneRow[]>('/api/lanes')
export const messages = (id: string) => call<ThreadItem[]>(lane(id) + '/messages')
// The page of a thread that holds one message (a deep link whose target is outside the loaded window).
export interface AroundResult {
  lane: string
  around: string
  items: ThreadItem[]
  before: number
  after: number
  total: number
}
export const messagesAround = (id: string, messageId: string, limit = 60) =>
  call<AroundResult & { error?: string }>(lane(id) + '/messages?around=' + encodeURIComponent(messageId) + '&limit=' + limit)
// Which of my lanes holds this message id.
export const resolveMessage = (messageId: string) => call<{ id: string; lane: string; error?: string }>('/api/messages/' + encodeURIComponent(messageId))
export const send = (id: string, payload: SendPayload) => call<SendResult>(lane(id) + '/messages', json('POST', payload))
export interface ForwardResult {
  forwarded: { lane: string; messages: { id: string; forwarded_from?: ForwardedFrom }[]; note: { id: string } | null; forwarded: boolean; reason: string | null }[]
}
export const forward = (id: string, payload: { message_ids: string[]; to_lanes: string[]; note?: string }) =>
  call<ForwardResult & { error?: string }>(lane(id) + '/messages/forward', json('POST', payload))
// Profiles. PUT takes { name?, tag?, prefs?: { default?, device? } }; a null pref value clears that override.
export const profiles = () => call<PublicProfile[]>('/api/profiles')
export const myProfile = () => call<MyProfile>('/api/me/profile')
export const saveProfile = (patch: { name?: string; tag?: string; prefs?: { default?: Record<string, unknown>; device?: Record<string, unknown> } }) =>
  call<MyProfile & { error?: string; fields?: Record<string, string> }>('/api/me/profile', json('PUT', patch))
export const uploadAvatar = (png: Blob) =>
  call<MyProfile & { error?: string }>('/api/me/avatar', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })
export const removeAvatar = () => call<MyProfile & { error?: string }>('/api/me/avatar', { method: 'DELETE' })
export type { PrefValues }
export const removeLocal = (id: string, messageId: string) =>
  call<{ deleted: string }>(lane(id) + '/messages/' + encodeURIComponent(messageId), { method: 'DELETE' })
export const replyAsk = (id: string, requestId: string, decision: Decision) =>
  call<AskReplyResult>(lane(id) + '/asks/' + encodeURIComponent(requestId) + '/reply', json('POST', { decision }))
export const interrupt = (id: string) => call<unknown>(lane(id) + '/interrupt', json('POST', {}))
export const cardAction = (id: string, cardId: string, actionId: string) =>
  call<{ card?: CardItem; error?: string }>(lane(id) + '/cards/' + encodeURIComponent(cardId) + '/actions/' + encodeURIComponent(actionId), json('POST', {}))
// A file a file_retrieval card points at; the console serves book/, docs/, registry/ and uploads only.
export const fileUrl = (id: string, path: string) => lane(id) + '/files?path=' + encodeURIComponent(path)
export const health = () => call<Health>('/api/health')
export const replyForm = (id: string, formId: string, answer: Record<string, unknown>) =>
  call<FormResult & { error?: string; fields?: Record<string, string> }>(lane(id) + '/forms/' + encodeURIComponent(formId) + '/reply', json('POST', { answer }))
export const cancelForm = (id: string, formId: string) =>
  call<FormResult & { error?: string }>(lane(id) + '/forms/' + encodeURIComponent(formId) + '/cancel', json('POST', {}))

// Devices (owners and admins). GET /api/devices lists the approved ones; pending ones come from /api/devices/pending
// when the console serves it (the HTML page reads them straight from the store).
export const devices = () => call<Device[]>('/api/devices')
export const pendingDevices = () => call<PendingDevice[]>('/api/devices/pending')
export const approveDevice = (id: string, person: string, name: string) =>
  call<{ error?: string }>('/api/devices/' + encodeURIComponent(id), json('POST', { action: 'approve', person, name }))
export const denyDevice = (id: string) => call<{ error?: string }>('/api/devices/' + encodeURIComponent(id), json('POST', { action: 'deny' }))
export const revokeDevice = (id: string) => call<{ error?: string }>('/api/devices/' + encodeURIComponent(id) + '/revoke', json('POST', {}))

// Surfaces (docs/surfaces-spec.md). Everything here is scoped by the console to the lanes the person can see.
export const asks = (state = 'open') => call<AskRow[]>('/api/asks?state=' + encodeURIComponent(state))
export const scratch = (id: string) => call<Scratch>(lane(id) + '/scratch')
export const putScratch = (id: string, text: string, baseVersion: number) =>
  call<Scratch & { error?: string; current?: Scratch }>(lane(id) + '/scratch', json('PUT', { text, base_version: baseVersion }))
export const scratchHistory = (id: string) => call<{ lane: string; versions: ScratchVersion[] }>(lane(id) + '/scratch?history=1')
export const scratchVersion = (id: string, version: number) => call<Scratch & { error?: string }>(lane(id) + '/scratch?version=' + version)
export const laneFiles = (id: string) => call<{ lane: string; files: LaneFileRow[]; truncated: boolean }>(lane(id) + '/files')
export const lanSummary = () => call<LanSummary & { error?: string }>('/api/lan/summary')
// A MAC keeps its colons in the path (they are legal there and read better in logs).
const macPath = (mac: string) => encodeURIComponent(mac).replace(/%3A/gi, ':')
export const lanAssignments = () => call<Record<string, LanAssignment> & { error?: string }>('/api/lan/assignments')
export const putLanAssignment = (mac: string, patch: { person?: string | null; notes?: string; class?: LanClass | null }) =>
  call<LanAssignment & { error?: string }>('/api/lan/devices/' + macPath(mac), json('PUT', patch))
export const lanClasses = () => call<LanClassRow[] | { error: string }>('/api/lan/classes')
export const lanAction = (mac: string, action: LanAction, label?: string) =>
  call<{ ok?: boolean; device?: import('./types').LanDevice; error?: string }>(
    '/api/lan/devices/' + macPath(mac) + '/action',
    json('POST', action === 'rename' ? { do: action, label } : { do: action }),
  )
export const boxInterfaces = () => call<BoxIface[]>('/api/box/interfaces')

// Library (docs/library-spec.md). Uploads go through uploadFile in ./library (XHR, for progress).
const lib = (id: string) => '/api/library/' + encodeURIComponent(id)
export const libraryRows = (laneId?: string) => call<LibraryRow[]>('/api/library' + (laneId ? '?lane=' + encodeURIComponent(laneId) : ''))
export const libraryStatus = (laneId?: string) => call<LibraryStatus>('/api/library/status' + (laneId ? '?lane=' + encodeURIComponent(laneId) : ''))
export const libraryUses = (kinds: string[], laneId?: string) =>
  call<LibraryUse[]>('/api/library/uses?kinds=' + kinds.join(',') + (laneId ? '&lane=' + encodeURIComponent(laneId) : ''))
export const libraryRow = (id: string) => call<{ file: LibraryRow; uses: LibraryUse[] }>(lib(id))
export const libraryPreview = (id: string) => call<LibraryPreview>(lib(id) + '/preview')
export const libraryDownloadUrl = (id: string, inline = false) => lib(id) + '/download' + (inline ? '?inline=1' : '')
export const libraryRetention = (id: string, days: number | null) => call<{ file?: LibraryRow; error?: string }>(lib(id) + '/retention', json('POST', { days }))
export const libraryDelete = (id: string) => call<{ deleted?: string; error?: string }>(lib(id), { method: 'DELETE' })
// The tree: edit a row, move rows, and the folders of a lane (docs/library-spec.md, console/lib/library-routes.js).
export interface LibraryPatch {
  name?: string
  folder?: string
  label?: string | null
  notes?: string | null
  tags?: string[] | string
  assigned_to?: string | null
}
export const libraryPatch = (id: string, fields: LibraryPatch) => call<{ file?: LibraryRow; error?: string }>(lib(id), json('PATCH', fields))
export const libraryMove = (ids: string[], folder: string) =>
  call<{ moved?: LibraryRow[]; skipped?: { id: string; reason: string }[]; error?: string }>('/api/library/move', json('POST', { ids, folder }))
export const libraryFolders = (laneId: string) => call<{ lane: string; folders: string[]; error?: string }>('/api/library/folders?lane=' + encodeURIComponent(laneId))
export const libraryFolderCreate = (laneId: string, path: string) => call<{ error?: string }>('/api/library/folders', json('POST', { lane: laneId, path }))
export const libraryFolderRename = (laneId: string, from: string, to: string) => call<{ moved?: number; error?: string }>('/api/library/folders/rename', json('POST', { lane: laneId, from, to }))
export const libraryFolderDelete = (laneId: string, path: string) => call<{ count?: number; error?: string }>('/api/library/folders', json('DELETE', { lane: laneId, path }))
export const libraryUse = (id: string, use_kind: string, ref: string) => call<{ error?: string }>(lib(id) + '/uses', json('POST', { use_kind, ref }))
export const libraryReprocess = (id: string) => call<{ error?: string }>(lib(id) + '/reprocess', json('POST', {}))
// POST /index answers 202 with an ndjson status stream; each parsed line goes to onLine, the last one comes back.
export async function libraryIndex(id: string, onLine: (l: { stage: string; chunks?: number; reason?: string; status?: string }) => void): Promise<{ ok: boolean; status: number; error?: string }> {
  let r: Response
  try {
    r = await fetch(lib(id) + '/index', { method: 'POST', credentials: 'same-origin' })
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
  if (r.status !== 202 || !r.body) {
    let error = 'failed'
    try {
      error = ((await r.json()) as { error?: string }).error ?? error
    } catch {
      /* not json */
    }
    return { ok: false, status: r.status, error }
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let last: { stage: string; reason?: string } = { stage: 'queued' }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      try {
        last = JSON.parse(line)
        onLine(last)
      } catch {
        /* ignore a broken line */
      }
    }
  }
  return last.stage === 'finished' ? { ok: true, status: 202 } : { ok: false, status: 202, error: last.reason ?? 'index_failed' }
}

// Thumbnails (console/lib/thumbs.js): a 256 px WebP, a pdf's first page, or {"text"} JSON. The grid never loads the file itself.
export const libraryThumbUrl = (id: string) => lib(id) + '/thumb'
export const fileThumbUrl = (id: string, path: string, v?: string | number) => lane(id) + '/files/thumb?path=' + encodeURIComponent(path) + (v ? '&v=' + encodeURIComponent(String(v)) : '')
export async function thumbText(url: string): Promise<string> {
  try {
    const r = await fetch(url, { credentials: 'same-origin' })
    if (!r.ok) return ''
    const j = (await r.json()) as { text?: string }
    return typeof j.text === 'string' ? j.text : ''
  } catch {
    return ''
  }
}

// Universal search (console/lib/search-routes.js). Lanes, pages, surfaces, people and LAN devices are matched in the browser.
export interface SearchMessageHit { id: string; lane: string; lane_title: string; role: string; who: string | null; at: string; snippet: string; link: string }
export interface SearchFileHit { source: 'library' | 'repo'; id?: string; lane: string; name: string; folder?: string; path?: string; kind?: string | null; at: string | null }
export interface SearchDeviceHit { id: string; name: string; person: string | null; ip: string | null; mac: string | null; last_seen: string | null; lan?: boolean }
export interface SearchUserHit { id: string; name: string; role?: string }
export interface SearchGroup<T> { items: T[]; total: number }
export interface SearchResults { q: string; types: string[]; results: { messages?: SearchGroup<SearchMessageHit>; files?: SearchGroup<SearchFileHit>; devices?: SearchGroup<SearchDeviceHit>; users?: SearchGroup<SearchUserHit> }; error?: string }
export const search = (q: string, types = 'messages,files,devices', limit = 30) =>
  call<SearchResults>('/api/search?q=' + encodeURIComponent(q) + '&types=' + encodeURIComponent(types) + '&limit=' + limit)
