// Typed entry for LatticeLoader. The working indicator for every tool-using turn in SovereignOS runs at grid 4 with the
// Search pattern, and its done state is the Search magnifier (search-mark.ts). The verbatim upstream file cannot take a
// custom done mark (MARKS is a module constant), so this wraps LatticeLoader.local.jsx, the one-prop fork that adds
// `marks`. Colours are theme tokens only: --g-mark is lime on dark and the dark mark colour on light, --g-danger is the cross.
import LatticeLoader from './LatticeLoader.local.jsx'
import type { LatticeLoaderProps } from './LatticeLoader.local.jsx'
import { SEARCH_MARKS, SEARCH_PATTERN } from './search-mark'

export type { LatticeLoaderProps }
export { CROSS_ERROR, MAGNIFIER_DONE, SEARCH_MARKS, SEARCH_PATTERN } from './search-mark'

export function Loader(props: LatticeLoaderProps) {
  return <LatticeLoader grid={4} pattern={SEARCH_PATTERN} marks={SEARCH_MARKS} shape="round" doneColor="rgb(var(--g-mark))" errorColor="rgb(var(--g-danger))" {...props} />
}

export default Loader
