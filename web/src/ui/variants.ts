// Layout variants. `people.ui` (carried on /api/me as `ui`) picks the shell inside the one build, so fixes reach
// every variant and layout work lands only in the variant it belongs to. docs/searchos-architecture.md section 5.3.
import type { ComponentType } from 'react'
import { MarvinV1Shell } from './marvin-v1'
import { BayV1Shell } from './bay-v1'
import { MarvinV2Shell } from './marvin-v2'

export const DEFAULT_VARIANT = 'marvin-v1'

export const VARIANTS: Record<string, ComponentType> = {
  'marvin-v1': MarvinV1Shell,
  // Bay's shell: the same composition as Marvin's with a per-agent sidebar and the #/engines page. No dani or borja variant yet; the fallback covers them.
  'bay-v1': BayV1Shell,
  // Marvin's one-chat shell with the Help cheat sheet. people.ui switches him to it; marvin-v1 stays the default and the fallback.
  'marvin-v2': MarvinV2Shell,
}

const warned = new Set<string>()

export function resolveVariant(id?: string | null, log: (msg: string) => void = (m) => console.warn(m)): ComponentType {
  const key = id || DEFAULT_VARIANT
  const hit = VARIANTS[key]
  if (hit) return hit
  if (!warned.has(key)) {
    warned.add(key)
    log('ui variant "' + key + '" is not in this build, falling back to ' + DEFAULT_VARIANT)
  }
  return VARIANTS[DEFAULT_VARIANT]
}

// Test hook: forget which ids were already logged.
export const resetVariantLog = (): void => warned.clear()
