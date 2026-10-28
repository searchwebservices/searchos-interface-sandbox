// A combobox over the shared LAN model, plus "This box". Used by Interface health to choose a device when nothing is
// selected in the lane (and to switch to another one afterwards).
import { useState } from 'react'
import { ChevronsUpDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { STATUS_WORD, type LanModel, type NodeStatus } from './model'

const DOT: Record<NodeStatus, string> = { online: 'bg-ok', offline: 'bg-muted-foreground', pending: 'bg-warn', denied: 'bg-destructive' }

export function DevicePicker({ model, valueId, valueLabel, onPick }: { model: LanModel | null; valueId: string; valueLabel?: string; onPick: (id: string, label: string) => void }) {
  const [open, setOpen] = useState(false)
  const pick = (id: string, label: string) => {
    setOpen(false)
    onPick(id, label)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label="Choose a device" className="w-full justify-between" data-testid="iface-picker">
          <span className="truncate">{valueLabel || 'Choose a device'}</span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder="Search by name, ip, mac or vendor" />
          <CommandList>
            <CommandEmpty>No device matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="this box box" data-testid="picker-item" data-id="box" data-checked={valueId === 'box'} onSelect={() => pick('box', 'This box')}>
                <span className="size-2 shrink-0 rounded-full bg-ok" />
                This box
                <span className="ml-auto font-mono text-xs text-muted-foreground">{model?.box.ip ?? ''}</span>
              </CommandItem>
              {model?.devices.map((n) => (
                <CommandItem
                  key={n.id}
                  value={[n.label, n.ip, n.mac, n.vendor].filter(Boolean).join(' ')}
                  data-testid="picker-item"
                  data-id={n.id}
                  data-checked={valueId === n.id}
                  onSelect={() => pick(n.id, n.label)}
                >
                  <span className={cn('size-2 shrink-0 rounded-full', DOT[n.status])} aria-label={STATUS_WORD[n.status]} />
                  <span className="truncate">{n.label}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{n.ip ?? ''}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
