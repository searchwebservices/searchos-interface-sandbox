import type { CSSProperties, ReactElement } from 'react'

export type LatticePattern =
  | 'arrow'
  | 'dots'
  | 'ripple'
  | 'spiral'
  | 'orbit'
  | 'snake'
  | 'sweep'
  | 'spin'
  | 'rain'
  | 'pulse'
  | { cells: (number | null)[]; loop?: number; scale?: number; lit?: number }

export interface LatticeLoaderProps {
  label?: string
  doneLabel?: string
  errorLabel?: string
  status?: 'working' | 'done' | 'error'
  pattern?: LatticePattern
  grid?: 3 | 4
  shape?: string
  color?: string
  doneColor?: string
  errorColor?: string
  cellSize?: number
  gap?: number
  fontSize?: number
  step?: number
  idleOpacity?: number
  glow?: boolean
  glowColor?: string
  showTimer?: boolean
  /** Seconds. When set the timer shows this value instead of running its own clock. */
  elapsed?: number
  className?: string
  style?: CSSProperties
}

declare function LatticeLoader(props: LatticeLoaderProps): ReactElement
export default LatticeLoader
