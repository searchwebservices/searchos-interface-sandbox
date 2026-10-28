// What the file browser's actions do on the server: one hook shared by Lane files and the Library page. A tree dir
// maps to a lane and a logical folder through `scope`, so the same code serves ['uploads', 'Garage quotes'] in Lane files
// and ['hardware', 'Garage quotes'] in the Library.
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '@/lib/api'
import type { LibraryRow } from '@/lib/library'
import type { DriveOps } from './DriveBrowser'
import type { Person } from './MetaFields'

export interface DriveScope {
  laneOf: (dir: string[]) => string | null
  // The logical folder of a tree dir, null where the tree is read only (the repo folders, the lane level).
  folderPath: (dir: string[]) => string | null
  dirOfFolder: (dir: string[], folder: string) => string[]
}

const ERR: Record<string, string> = {
  name_taken: 'A file with that name is already in that folder',
  folder_exists: 'That folder already exists',
  owners_only: 'Only owners can delete',
  not_a_member: 'You are not a member of this lane',
  credential_name: 'That name looks like a credential file',
  bad_name: 'That name will not work',
  inside_itself: 'A folder cannot go inside itself',
  no_such_folder: 'That folder is gone',
  unknown_person: 'That person is not known',
  one_lane_per_move: 'Files move inside one lane',
}
export const errText = (e: string | undefined, status?: number): string => (e && ERR[e]) || e || 'error ' + (status ?? '')
const join = (a: string, b: string) => (a ? a + '/' + b : b)
const parentOf = (p: string) => p.split('/').slice(0, -1).join('/')

// The explicit folders of some lanes, with a reload for after a change.
export function useLaneFolders(lanes: string[]): { folders: Record<string, string[]>; reload: () => Promise<void> } {
  const key = lanes.join(',')
  const [folders, setFolders] = useState<Record<string, string[]>>({})
  const reload = useCallback(async () => {
    const out: Record<string, string[]> = {}
    await Promise.all(
      key
        .split(',')
        .filter(Boolean)
        .map(async (l) => {
          const r = await api.libraryFolders(l)
          if (r.ok && Array.isArray(r.body.folders)) out[l] = r.body.folders
        }),
    )
    setFolders((cur) => ({ ...cur, ...out }))
  }, [key])
  useEffect(() => {
    void reload()
  }, [reload])
  return { folders, reload }
}

export function useDriveOps({ scope, rows, folders, isMember, admin, people, refresh, toast, pickFiles, pickFolder }: {
  scope: DriveScope
  rows: LibraryRow[]
  folders: Record<string, string[]>
  isMember: (lane: string) => boolean
  admin: boolean
  people: Person[]
  refresh: () => Promise<void> | void
  toast: (m: string) => void
  pickFiles: (dir: string[]) => void
  pickFolder: (dir: string[]) => void
}): DriveOps {
  const { laneOf, folderPath, dirOfFolder } = scope
  return useMemo<DriveOps>(() => {
    const done = async () => {
      await refresh()
    }
    const writableDir = (dir: string[]) => {
      const lane = laneOf(dir)
      return !!lane && folderPath(dir) !== null && isMember(lane)
    }
    return {
      canDelete: admin,
      people,
      writableDir,
      laneOf,
      folderPath,
      dirOfFolder,
      folderList: (dir) => {
        const lane = laneOf(dir)
        if (!lane) return []
        const set = new Set<string>()
        const add = (p: string) => {
          const segs = p.split('/').filter(Boolean)
          for (let i = 1; i <= segs.length; i++) set.add(segs.slice(0, i).join('/'))
        }
        for (const r of rows) if (r.lane === lane && r.folder) add(r.folder)
        for (const f of folders[lane] ?? []) add(f)
        return [...set].sort((a, b) => a.localeCompare(b))
      },
      moveTo: async (fileIds, folderDirs, target) => {
        const lane = laneOf(target)
        const to = folderPath(target)
        if (!lane || to === null) return toast('That folder is read only')
        let moved = 0
        let problem = ''
        if (fileIds.length) {
          const r = await api.libraryMove(fileIds, to)
          if (r.ok) {
            moved += r.body.moved?.length ?? 0
            const skipped = r.body.skipped?.[0]
            if (skipped) problem = errText(skipped.reason)
          } else problem = errText(r.body.error, r.status)
        }
        for (const d of folderDirs) {
          const from = folderPath(d)
          if (from === null || !from) continue
          const name = from.split('/').pop()!
          const next = join(to, name)
          if (next === from) continue
          const r = await api.libraryFolderRename(lane, from, next)
          if (r.ok) moved++
          else problem = errText(r.body.error, r.status)
        }
        toast(problem ? (moved ? `Moved ${moved}. ${problem}` : problem) : moved ? `Moved ${moved} ${moved === 1 ? 'item' : 'items'}` : 'Nothing to move')
        await done()
      },
      renameFile: async (row, name) => {
        const r = await api.libraryPatch(row.id, { name })
        if (!r.ok) toast(errText(r.body.error, r.status))
        await done()
      },
      renameFolder: async (dir, name) => {
        const lane = laneOf(dir)
        const from = folderPath(dir)
        if (!lane || !from) return
        if (name.includes('/')) return toast(errText('bad_name'))
        const r = await api.libraryFolderRename(lane, from, join(parentOf(from), name))
        if (!r.ok) toast(errText(r.body.error, r.status))
        await done()
      },
      newFolder: async (parent, name) => {
        const lane = laneOf(parent)
        const base = folderPath(parent)
        if (!lane || base === null) return toast('That folder is read only')
        if (name.includes('/')) return toast(errText('bad_name'))
        const r = await api.libraryFolderCreate(lane, join(base, name))
        if (!r.ok) toast(errText(r.body.error, r.status))
        await done()
      },
      remove: async (rs, fs) => {
        if (!admin) return toast(errText('owners_only'))
        let n = 0
        for (const d of fs) {
          const lane = laneOf(d)
          const p = folderPath(d)
          if (!lane || !p) continue
          const r = await api.libraryFolderDelete(lane, p)
          if (r.ok) n += 1
          else toast(errText(r.body.error, r.status))
        }
        for (const row of rs) {
          const r = await api.libraryDelete(row.id)
          if (r.ok) n += 1
          else toast(errText(r.body.error, r.status))
        }
        if (n) toast(n === 1 ? 'Moved to the bin' : `Moved ${n} items to the bin`)
        await done()
      },
      patch: async (rs, p) => {
        let bad = ''
        for (const row of rs) {
          const r = await api.libraryPatch(row.id, p)
          if (!r.ok) bad = errText(r.body.error, r.status)
        }
        toast(bad || (rs.length === 1 ? 'Saved' : `Saved ${rs.length} files`))
        await done()
      },
      uploadFiles: pickFiles,
      uploadFolder: pickFolder,
    }
  }, [laneOf, folderPath, dirOfFolder, rows, folders, isMember, admin, people, refresh, toast, pickFiles, pickFolder])
}
