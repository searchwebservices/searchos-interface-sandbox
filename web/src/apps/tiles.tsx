// Small visual pieces shared by the app pages: kind icons, status dots, badges. Colours are theme tokens only.
import { BotIcon, BoxIcon, ClockIcon, CpuIcon, DatabaseIcon, EyeIcon, FileIcon, FolderIcon, GitBranchIcon, GlobeIcon, HardDriveIcon, LayersIcon, MessageSquareIcon, PlugIcon, ServerIcon, TimerIcon, WrenchIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from './map/estate'

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  os: LayersIcon, group: FolderIcon, lane: MessageSquareIcon, agent: BotIcon, folder: FolderIcon, file: FileIcon,
  daemon: CpuIcon, timer: TimerIcon, watchdog: EyeIcon, model: BoxIcon, tool: WrenchIcon, connector: PlugIcon,
  service: ServerIcon, repo: GitBranchIcon, surface: GlobeIcon, db: DatabaseIcon, backup: HardDriveIcon,
}
export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const I = ICONS[kind] ?? ClockIcon
  return <I className={cn('size-4 shrink-0', className)} aria-hidden />
}

const DOT: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-destructive', idle: 'bg-muted-foreground' }
export function StatusDot({ tone, label, className }: { tone: Tone; label?: string; className?: string }) {
  return <span role="img" aria-label={label ?? tone} data-tone={tone} className={cn('inline-block size-2 shrink-0 rounded-full', DOT[tone], className)} />
}

export function Pill({ children, tone = 'idle', className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium', tone === 'ok' && 'bg-ok/15 text-ok', tone === 'warn' && 'bg-warn/15 text-warn', tone === 'bad' && 'bg-destructive/15 text-destructive', tone === 'idle' && 'bg-secondary text-secondary-foreground', className)}>
      {children}
    </span>
  )
}
