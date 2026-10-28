import { GilfoyleAvatar } from '@/components/GilfoyleAvatar'
import { useApp } from '@/app/AppContext'
import { cn } from '@/lib/utils'
import { displayName, initials } from '@/lib/time'

const SIZES = { xs: 'size-5 text-[0.625rem]', sm: 'size-6 text-[0.625rem]', md: 'size-8 text-xs', lg: 'size-24 text-2xl' } as const

// A person's picture when they uploaded one, else their initials. Gilfoyle always shows his own avatar.
export function PersonAvatar({ id, name, size = 'sm', className }: { id: string; name?: string; size?: keyof typeof SIZES; className?: string }) {
  const { store } = useApp()
  if (id === 'gilfoyle') return <GilfoyleAvatar size={size === 'xs' ? 'sm' : size === 'lg' ? 'lg' : size} className={className} />
  const p = store.profiles[id]
  const label = name || p?.name || displayName(id)
  if (p?.avatar) {
    return <img src={p.avatar} alt={label} data-testid="person-avatar" draggable={false} className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)} />
  }
  return (
    <span
      data-testid="person-initials"
      aria-label={label}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground', SIZES[size], className)}
    >
      {initials(label)}
    </span>
  )
}
