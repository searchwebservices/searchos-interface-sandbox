// The canvas pulls in @xyflow/react, so it loads on demand. The cast keeps the generic that lazy() drops.
import { lazy } from 'react'

export const TreeCanvas = lazy(() => import('./TreeCanvas')) as unknown as typeof import('./TreeCanvas').default
