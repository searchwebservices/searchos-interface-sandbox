// The filter bar of the LAN page. Chips inside one group are alternatives, the groups combine, and a node that does
// not match is dimmed on the map (never removed), so the wires still read.
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import './lan.css'
import { ACT_LABEL, ACT_ORDER, CLASS_LABEL, CLASS_ORDER, CONN_ORDER, lensActive, NO_LENS, TYPE_LABEL, TYPE_ORDER, type Lens } from './model'
import type { LanClass } from '@/lib/types'

const CONN_LABEL = { wired: 'Wired', wifi: 'Wi-Fi', unknown: 'Unknown' } as const

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

function Chip({ group, value, on, label, count, cls, onClick }: { group: string; value: string; on: boolean; label: string; count?: number; cls?: LanClass; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid="lens-chip"
      data-group={group}
      data-value={value}
      data-class={cls}
      onClick={onClick}
      className={cn('lan-chip inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring')}
    >
      {cls && <span className="lan-class-dot size-2 rounded-full" aria-hidden />}
      {label}
      {count != null && <span className="text-muted-foreground">{count}</span>}
    </button>
  )
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={title}>
    <span className="w-16 shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">{title}</span>
    {children}
  </div>
)

export function LensBar({ lens, onChange, matching, total, classCounts }: { lens: Lens; onChange: (l: Lens) => void; matching: number; total: number; classCounts: Record<LanClass | 'none', number> }) {
  const set = (p: Partial<Lens>) => onChange({ ...lens, ...p })
  return (
    <div className="flex flex-col gap-1.5 border-b px-3 py-2" data-testid="lens-bar" aria-label="Filters">
      <Group title="Class">
        {CLASS_ORDER.map((c) => (
          <Chip key={c} group="class" value={c} cls={c} on={lens.classes.includes(c)} label={CLASS_LABEL[c]} count={classCounts[c]} onClick={() => set({ classes: toggle(lens.classes, c) })} />
        ))}
        <Chip group="class" value="none" on={lens.classes.includes('none')} label="Unclassified" count={classCounts.none} onClick={() => set({ classes: toggle(lens.classes, 'none') })} />
      </Group>
      <Group title="Type">
        {TYPE_ORDER.map((t) => (
          <Chip key={t} group="type" value={t} on={lens.types.includes(t)} label={TYPE_LABEL[t]} onClick={() => set({ types: toggle(lens.types, t) })} />
        ))}
      </Group>
      <Group title="Link">
        {CONN_ORDER.map((c) => (
          <Chip key={c} group="conn" value={c} on={lens.conns.includes(c)} label={CONN_LABEL[c]} onClick={() => set({ conns: toggle(lens.conns, c) })} />
        ))}
      </Group>
      <Group title="Activity">
        {ACT_ORDER.map((a) => (
          <Chip key={a} group="act" value={a} on={lens.acts.includes(a)} label={ACT_LABEL[a]} onClick={() => set({ acts: toggle(lens.acts, a) })} />
        ))}
      </Group>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span data-testid="lens-count" aria-live="polite">
          {lensActive(lens) ? `${matching} of ${total} devices match` : `${total} devices`}
        </span>
        {lensActive(lens) && (
          <Button type="button" size="xs" variant="ghost" onClick={() => onChange(NO_LENS)} data-testid="lens-clear">
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
