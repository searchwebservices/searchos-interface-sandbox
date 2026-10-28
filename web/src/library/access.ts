// What a person may do to a library file. Mirrors the console's scopes: members upload versions and index, owners and
// admins delete, nobody indexes a file that has no processed text yet.
import type { LibraryRow } from '@/lib/library'
import type { RowAction } from './LibraryTable'

export interface Access {
  admin: boolean
  member: boolean
}
export function canDo(row: LibraryRow, a: RowAction, who: Access): boolean {
  switch (a) {
    case 'preview':
    case 'download':
    case 'uses':
      return true
    case 'index':
      return (who.admin || who.member) && !row.needs_parser && ['processed', 'indexed', 'available'].includes(row.status)
    case 'reprocess':
      return (who.admin || who.member) && (row.status === 'failed' || !!row.needs_parser)
    case 'version':
      return who.member
    case 'retention':
    case 'delete':
      return who.admin
  }
}
