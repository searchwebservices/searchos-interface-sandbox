import { cn } from '@/lib/utils'

const SIZES = { sm: 'size-6 rounded-md', md: 'size-8 rounded-lg', lg: 'size-16 rounded-xl' } as const

/** Gilfoyle's picture, served by the console at /brand. sm 24px, md 32px, lg 64px. */
// Another agent's picture (lane.agent.avatar, for example Jared's) goes in `src` with its `name`; without them it is Gilfoyle's.
export function GilfoyleAvatar({ size = 'md', className, src, name }: { size?: keyof typeof SIZES; className?: string; src?: string | null; name?: string }) {
  const own = !!src && src !== '/brand/gilfoyle-128.png'
  return (
    <img
      src={own ? src : '/brand/gilfoyle-128.png'}
      srcSet={own ? undefined : '/brand/gilfoyle-128.png 1x, /brand/gilfoyle.png 2x'}
      alt={own && name ? name : 'Gilfoyle'}
      data-testid="gilfoyle-avatar"
      draggable={false}
      className={cn('shrink-0 object-cover', SIZES[size], className)}
    />
  )
}
