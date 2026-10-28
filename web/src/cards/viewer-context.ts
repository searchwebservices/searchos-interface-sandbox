import { createContext, useContext } from 'react'

// Where "Close" goes when the viewer fills a surface. Lane files provides it (back to the folder); without a host the
// viewer falls back to closing the dock surface.
export interface ViewerHost {
  close: () => void
}
export const ViewerHostContext = createContext<ViewerHost | null>(null)
export const useViewerHost = (): ViewerHost | null => useContext(ViewerHostContext)
