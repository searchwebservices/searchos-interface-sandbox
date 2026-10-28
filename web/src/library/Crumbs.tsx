// The path bar: one button per level, each a drop target, so a file or folder dragged onto "Garage quotes" moves there.
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { sameDir } from '@/lib/filetree'
import { cn } from '@/lib/utils'
import { useDropTarget } from './dnd'
import type { DropTargetOps } from './dnd'

function Crumb({ name, dir, last, onGo, ops }: { name: string; dir: string[]; last: boolean; onGo: (dir: string[]) => void; ops: DropTargetOps }) {
  const t = useDropTarget(dir, ops)
  if (last) return <span className={cn('rounded px-1 font-medium [overflow-wrap:anywhere]', t.over && 'bg-accent ring-2 ring-primary')} aria-current="page" data-testid="crumb-current" {...t.props}>{name}</span>
  return (
    <button type="button" className={cn('rounded px-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]', t.over && 'bg-accent text-foreground ring-2 ring-primary')} onClick={() => onGo(dir)} data-testid="crumb" data-drop-over={t.over} {...t.props}>
      {name}
    </button>
  )
}

// root: the name of the top level ("Lane files", "Library"). viewing: the path ends in an open file, so no crumb is current.
export function Crumbs({ root, dir, viewing, onGo, ops, tail, label = 'Path', nameOf }: { root: string; dir: string[]; viewing?: boolean; onGo: (dir: string[]) => void; ops: DropTargetOps; tail?: ReactNode; label?: string; nameOf?: (dir: string[], name: string) => string }) {
  const parts = [{ name: root, dir: [] as string[] }, ...dir.map((name, i) => ({ name: nameOf ? nameOf(dir.slice(0, i + 1), name) : name, dir: dir.slice(0, i + 1) }))]
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-x-1" aria-label={label}>
      {parts.map((c, i) => (
        <Fragment key={c.dir.join('/')}>
          {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
          <li className="min-w-0">
            <Crumb name={c.name} dir={c.dir} last={i === parts.length - 1 && !viewing && sameDir(c.dir, dir)} onGo={onGo} ops={ops} />
          </li>
        </Fragment>
      ))}
      {tail}
    </ol>
  )
}
