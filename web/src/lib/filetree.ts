// Lane files as folders. The server lists flat paths; the folders are their prefixes. Uploads live under
// console/data/uploads/<lane>/<id>/<name> on disk but show as ONE folder, `uploads`: its own files at the root and a
// folder per logical path (the `folder` on each manifest row, never the id). Repo files (book/, docs/, registry/) keep
// their paths and are read only.

export const uploadsPrefix = (lane: string): string => 'console/data/uploads/' + lane + '/'

export const UPLOADS = 'uploads'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// ['registry', 'ports.md'] for registry/ports.md; ['uploads', 'sub', 'a.pdf'] for an upload in sub/. The library id
// segment of console/data/uploads/<lane>/<id>/<name> is storage, not a folder: it never shows.
export function treeSegments(path: string, lane: string): string[] {
  const p = uploadsPrefix(lane)
  if (!path.startsWith(p)) return path.split('/').filter(Boolean)
  const segs = path.slice(p.length).split('/').filter(Boolean)
  if (segs.length > 1 && UUID.test(segs[0])) segs.splice(0, 1)
  return [UPLOADS, ...segs]
}

// A manifest folder ('' or 'Garage quotes/2026') as a tree dir under uploads.
export const folderSegs = (folder?: string | null): string[] => (folder ?? '').split('/').filter(Boolean)
export const uploadsDir = (folder?: string | null): string[] => [UPLOADS, ...folderSegs(folder)]
// The logical folder of an uploads dir: ['uploads', 'a', 'b'] is 'a/b'. null when the dir is not inside uploads.
export const folderOfDir = (dir: string[]): string | null => (dir[0] === UPLOADS ? dir.slice(1).join('/') : null)
export const isInside = (dir: string[], root: string[]): boolean => dir.length >= root.length && root.every((s, i) => dir[i] === s)
export const sameDir = (a: string[], b: string[]): boolean => a.length === b.length && isInside(a, b)

// The tree the person sees, built from manifest rows (and the lane's explicit, possibly empty, folders). Names, never ids.
export interface TreeRow {
  name: string
  folder?: string | null
}
export function buildEntries<T extends TreeRow>(rows: T[]): { dir: string[]; item: T }[] {
  return rows.map((r) => ({ dir: uploadsDir(r.folder), item: r }))
}
export function treeOf<T extends TreeRow>(rows: T[], explicit: string[] = []) {
  const entries = buildEntries(rows)
  const extra = explicit.map((f) => uploadsDir(f))
  return { at: (dir: string[]) => listDir(entries, dir, extra) }
}

export const dirOfPath = (path: string, lane: string): string[] => treeSegments(path, lane).slice(0, -1)

export interface Listing<T> {
  folders: { name: string; count: number }[]
  files: T[]
}

// What sits directly inside `dir`: the files whose folder is `dir`, and one folder per next segment (with how many
// files are under it, at any depth).
export function listDir<T>(entries: { dir: string[]; item: T }[], dir: string[], extra: string[][] = []): Listing<T> {
  const files: T[] = []
  const folders = new Map<string, number>()
  // an explicit (maybe empty) folder shows up with 0 files unless rows already count it
  for (const e of extra) if (e.length > dir.length && dir.every((s, i) => e[i] === s) && !folders.has(e[dir.length])) folders.set(e[dir.length], 0)
  for (const e of entries) {
    if (e.dir.length < dir.length || !dir.every((s, i) => e.dir[i] === s)) continue
    if (e.dir.length === dir.length) files.push(e.item)
    else folders.set(e.dir[dir.length], (folders.get(e.dir[dir.length]) ?? 0) + 1)
  }
  return { folders: [...folders].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)), files }
}
