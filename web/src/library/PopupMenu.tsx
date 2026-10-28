// A right-click menu at the pointer. Radix's ContextMenu wraps one trigger, which is too heavy for a few hundred tiles,
// so the browser keeps one menu and opens it where the click was. Arrow keys move, Enter picks, Esc and outside clicks close.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface MenuEntry {
  id: string
  label: string
  disabled?: boolean
  destructive?: boolean
  // A line of text, not an action (for example "Repo files are read only").
  note?: boolean
  separator?: boolean
}

export function PopupMenu({ at, entries, label, onPick, onClose }: { at: { x: number; y: number }; entries: MenuEntry[]; label: string; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  const items = entries.filter((e) => !e.separator && !e.note)
  const [cur, setCur] = useState(() => Math.max(0, items.findIndex((e) => !e.disabled)))
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || !r.width) return
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) })
  }, [at])
  useEffect(() => {
    ref.current?.focus()
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  const move = (d: number) => {
    let i = cur
    for (let n = 0; n < items.length; n++) {
      i = (i + d + items.length) % items.length
      if (!items[i].disabled) break
    }
    setCur(i)
  }
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className="fixed z-50 min-w-48 max-w-72 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
      style={{ left: pos.x, top: pos.y }}
      data-testid="context-menu"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const it = items[cur]
          if (it && !it.disabled) onPick(it.id)
        }
      }}
    >
      {entries.map((e, i) => {
        if (e.separator) return <div key={'s' + i} role="separator" className="-mx-1 my-1 h-px bg-border" />
        if (e.note) return <p key={e.id} className="px-2 py-1.5 text-xs text-muted-foreground" data-testid="context-note">{e.label}</p>
        const active = items[cur]?.id === e.id
        return (
          <button
            key={e.id}
            type="button"
            role="menuitem"
            disabled={e.disabled}
            className={cn('flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm outline-none disabled:pointer-events-none disabled:opacity-50', active && 'bg-accent', e.destructive && 'text-destructive')}
            onPointerEnter={() => setCur(items.findIndex((x) => x.id === e.id))}
            onClick={() => onPick(e.id)}
            data-testid={'menu-' + e.id}
          >
            {e.label}
          </button>
        )
      })}
    </div>
  )
}
