// The actions of each row type in the left panel. Every handler here is wired to something that exists today.
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpIcon, CheckCheckIcon, ExternalLinkIcon, LinkIcon, MonitorIcon, MoonIcon, PinIcon, PinOffIcon, SquareArrowOutUpRightIcon, SunIcon, UserIcon } from 'lucide-react'
import type { MenuAction } from './RowMenu'
import { wired } from './RowMenu'
import type { ThemeChoice } from '@/lib/prefs'

// A hash route in a new window of this console.
export const openHashInTab = (hash: string): void => { window.open(location.origin + location.pathname + hash, '_blank', 'noopener') }

// Apps rows and quick actions: Open, Open in new tab.
export const openActions = (hash: string, open: () => void): MenuAction[] => [
  { id: 'open', label: 'Open', icon: ExternalLinkIcon, run: open },
  { id: 'tab', label: 'Open in new tab', icon: SquareArrowOutUpRightIcon, run: () => openHashInTab(hash) },
]

export function appActions(o: { hash: string; open: () => void; index: number; count: number; move: (how: 'up' | 'down' | 'top') => void }): MenuAction[] {
  const first = o.index <= 0
  return [
    ...openActions(o.hash, o.open),
    { id: 'up', label: 'Move up', icon: ArrowUpIcon, run: () => o.move('up'), disabled: first, separatorBefore: true },
    { id: 'down', label: 'Move down', icon: ArrowDownIcon, run: () => o.move('down'), disabled: o.index >= o.count - 1 },
    { id: 'top', label: 'Move to top', icon: ChevronsUpIcon, run: () => o.move('top'), disabled: first },
  ]
}

// DM rows, group lanes, desks and Bay's lanes. Move up and down only exist on Bay's lanes (`move` given).
export function laneActions(o: { pinned: boolean; open: () => void; togglePin: () => void; markRead: () => void; copyLink: () => void; classic: () => void; move?: { up: (() => void) | null; down: (() => void) | null } }): MenuAction[] {
  return wired([
    { id: 'open', label: 'Open', icon: ExternalLinkIcon, run: o.open },
    { id: 'pin', label: o.pinned ? 'Unpin' : 'Pin', icon: o.pinned ? PinOffIcon : PinIcon, run: o.togglePin },
    { id: 'read', label: 'Mark as read', icon: CheckCheckIcon, run: o.markRead },
    o.move && { id: 'up', label: 'Move up', icon: ArrowUpIcon, run: o.move.up ?? (() => {}), disabled: !o.move.up, separatorBefore: true },
    o.move && { id: 'down', label: 'Move down', icon: ArrowDownIcon, run: o.move.down ?? (() => {}), disabled: !o.move.down },
    { id: 'link', label: 'Copy link', icon: LinkIcon, run: o.copyLink, separatorBefore: true },
    { id: 'classic', label: 'Open in classic', icon: ExternalLinkIcon, run: o.classic },
  ])
}

// The person footer: Profile and the theme. There is no per device sign out in the console, so none is offered.
export function personActions(o: { profile: () => void; theme: ThemeChoice; pick: (t: ThemeChoice) => void }): MenuAction[] {
  const t = (id: ThemeChoice, label: string, icon: MenuAction['icon'], sep = false): MenuAction => ({ id: 'theme-' + id, label: label + (o.theme === id ? ' (on)' : ''), icon, run: () => o.pick(id), separatorBefore: sep })
  return [
    { id: 'profile', label: 'Profile', icon: UserIcon, run: o.profile },
    t('light', 'Light', SunIcon, true),
    t('dark', 'Dark', MoonIcon),
    t('system', 'System', MonitorIcon),
  ]
}
