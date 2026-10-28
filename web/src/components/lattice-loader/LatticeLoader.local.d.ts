import type { ReactElement } from 'react'
import type { LatticeLoaderProps as Base } from './LatticeLoader.jsx'

export type LatticeMarks = { 3?: { done?: number[]; error?: number[] }; 4?: { done?: number[]; error?: number[] } }
export interface LatticeLoaderProps extends Base {
  /** Overrides the done and error marks per grid size, as cell indexes (row * grid + column). */
  marks?: LatticeMarks
}

declare function LatticeLoader(props: LatticeLoaderProps): ReactElement
export default LatticeLoader
