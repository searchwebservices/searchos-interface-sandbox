import { ActivityIcon, FolderIcon, NetworkIcon, NotebookPenIcon, ShieldCheckIcon, TerminalIcon, GaugeIcon, FileDiffIcon, BellIcon, ListChecksIcon, ClipboardListIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { DockSurface } from '@/lib/dock'

type Icon = ComponentType<{ className?: string }>
const STANDING_ICON: Record<string, Icon> = {
  topology: NetworkIcon,
  iface: ActivityIcon,
  files: FolderIcon,
  approvals: ShieldCheckIcon,
  scratch: NotebookPenIcon,
}
const CARD_ICON: Record<string, Icon> = {
  command_output: TerminalIcon,
  metrics_snapshot: GaugeIcon,
  config_diff: FileDiffIcon,
  alert: BellIcon,
  approval: ShieldCheckIcon,
  requested_input: ClipboardListIcon,
  tool_run: ListChecksIcon,
}

export function iconOf(s: DockSurface): Icon {
  if (s.kind === 'standing') return STANDING_ICON[s.id] ?? FolderIcon
  return CARD_ICON[s.cardKind ?? ''] ?? ListChecksIcon
}
export const standingIcon = (id: string): Icon => STANDING_ICON[id] ?? FolderIcon
