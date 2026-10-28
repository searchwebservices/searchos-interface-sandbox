import { useEffect, useRef } from 'react'
import type { ComponentType, HTMLAttributes, Ref } from 'react'
import { CompassIcon } from '@/components/ui/compass'
import { CoffeeIcon } from '@/components/ui/coffee'
import { CpuIcon } from '@/components/ui/cpu'
import { DollarSignIcon } from '@/components/ui/dollar-sign'
import { EarthIcon } from '@/components/ui/earth'
import { HammerIcon } from '@/components/ui/hammer'
import { HomeIcon } from '@/components/ui/home'
import { PaletteIcon } from '@/components/ui/palette'
import { PartyPopperIcon } from '@/components/ui/party-popper'
import { SparklesIcon } from '@/components/ui/sparkles'
import { SunIcon } from '@/components/ui/sun'
import { TerminalIcon } from '@/components/ui/terminal'
import { TrendingUpIcon } from '@/components/ui/trending-up'
import { UsersIcon } from '@/components/ui/users'
import { ZapIcon } from '@/components/ui/zap'
import { BookTextIcon } from '@/components/ui/book-text'
import { FlaskIcon } from '@/components/ui/flask'
import { ServerIcon } from '@/components/ui/server'
import { cn } from '@/lib/utils'

export interface IconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}
type AnimatedIcon = ComponentType<HTMLAttributes<HTMLDivElement> & { size?: number; ref?: Ref<IconHandle> }>

// Lucide Animated (pqoqubbw/icons) per group lane. The animation plays once per trigger (about 1.8s), so a
// busy lane re-triggers on an interval.
const ICONS: Record<string, AnimatedIcon> = {
  hardware: ServerIcon as AnimatedIcon,
  standards: BookTextIcon as AnimatedIcon,
  lab: FlaskIcon as AnimatedIcon,
  // Bay's lanes under Jared (DM lanes), one icon each.
  'jared-command': CompassIcon as AnimatedIcon,
  'jared-money': DollarSignIcon as AnimatedIcon,
  'jared-growth': TrendingUpIcon as AnimatedIcon,
  'jared-clients': UsersIcon as AnimatedIcon,
  'jared-build': HammerIcon as AnimatedIcon,
  'jared-infra': CpuIcon as AnimatedIcon,
  'jared-arido': CoffeeIcon as AnimatedIcon,
  'jared-gs': SunIcon as AnimatedIcon,
  'jared-scott': HomeIcon as AnimatedIcon,
  'jared-uniqueos': SparklesIcon as AnimatedIcon,
  'jared-bpe': PartyPopperIcon as AnimatedIcon,
  'jared-site': EarthIcon as AnimatedIcon,
  'jared-studio': PaletteIcon as AnimatedIcon,
  'jared-kimi-flex': ZapIcon as AnimatedIcon,
  'jared-command-glm': TerminalIcon as AnimatedIcon,
}
export const LOOP_MS = 2000

export const hasLaneIcon = (laneId: string) => laneId in ICONS

function reducedMotion() {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Static while idle, looping while busy (never looping under prefers-reduced-motion). */
export function LaneIcon({ laneId, busy, size = 16, className }: { laneId: string; busy?: boolean; size?: number; className?: string }) {
  const ref = useRef<IconHandle>(null)
  const Icon = ICONS[laneId]
  useEffect(() => {
    const h = ref.current
    if (!h) return
    if (!busy || reducedMotion()) { h.stopAnimation(); return }
    h.startAnimation()
    const t = setInterval(() => ref.current?.startAnimation(), LOOP_MS)
    return () => { clearInterval(t); ref.current?.stopAnimation() }
  }, [busy])
  if (!Icon) return null
  return <Icon ref={ref} size={size} data-testid="lane-icon" data-busy={busy ? 'true' : 'false'} className={cn('inline-flex shrink-0 items-center justify-center text-muted-foreground', className)} />
}
