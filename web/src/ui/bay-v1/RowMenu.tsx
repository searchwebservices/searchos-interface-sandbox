// One menu for every row of the left panel: right click (long press on touch) opens the context menu, a kebab that
// shows on hover opens the same actions. Rows only list actions that have a handler, so nothing in a menu is decorative.
import { MoreHorizontalIcon } from 'lucide-react'
import type { ComponentProps, ComponentType } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarMenuAction, SidebarMenuItem } from '@/components/ui/sidebar'

export interface MenuAction {
  id: string
  label: string
  icon?: ComponentType
  run: () => void
  disabled?: boolean
  separatorBefore?: boolean
}

// Drops the entries that have nothing to run, so a menu never offers an unwired action.
export const wired = (list: (MenuAction | null | false | undefined)[]): MenuAction[] => list.filter((a): a is MenuAction => !!a && typeof a.run === 'function')

function Items({ actions, Item, Sep }: { actions: MenuAction[]; Item: typeof ContextMenuItem | typeof DropdownMenuItem; Sep: typeof ContextMenuSeparator | typeof DropdownMenuSeparator }) {
  return (
    <>
      {actions.map((a) => (
        <span key={a.id} className="contents">
          {a.separatorBefore && <Sep />}
          <Item data-action={a.id} disabled={a.disabled} onSelect={a.run}>
            {a.icon && <a.icon />}
            {a.label}
          </Item>
        </span>
      ))}
    </>
  )
}

export function RowKebab({ actions, label, testid }: { actions: MenuAction[]; label: string; testid?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction showOnHover aria-label={label + ' menu'} data-testid={testid}>
          <MoreHorizontalIcon />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid={testid ? testid + '-options' : undefined}>
        <Items actions={actions} Item={DropdownMenuItem} Sep={DropdownMenuSeparator} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A sidebar row (an li) with the menu around it. `kebab` is off on the phone list, which has no hover.
export function MenuItemRow({ actions, label, menuId, menuTestid, kebab = true, children, ...li }: { actions: MenuAction[]; label: string; menuId: string; menuTestid?: string; kebab?: boolean } & ComponentProps<'li'>) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem {...li}>
          {children}
          {kebab && <RowKebab actions={actions} label={label} testid={menuId + '-kebab'} />}
        </SidebarMenuItem>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid={menuTestid ?? menuId + '-menu'}>
        <Items actions={actions} Item={ContextMenuItem} Sep={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

// A plain element (the phone's anchor rows) with the context menu only.
export function MenuWrap({ actions, menuId, children }: { actions: MenuAction[]; menuId: string; children: React.ReactElement }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent data-testid={menuId + '-menu'}>
        <Items actions={actions} Item={ContextMenuItem} Sep={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
