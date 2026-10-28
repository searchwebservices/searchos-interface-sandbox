import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppProvider, useApp } from './app/AppContext'
import { resolveVariant } from './ui/variants'

// The shell is chosen by the viewer's `ui` (from /api/me); a missing value is marvin-v1.
function Variant() {
  const { store } = useApp()
  const Shell = resolveVariant(store.me?.ui)
  return <Shell />
}

export default function App() {
  return (
    <TooltipProvider>
      <AppProvider>
        <SidebarProvider>
          <Variant />
        </SidebarProvider>
      </AppProvider>
    </TooltipProvider>
  )
}
