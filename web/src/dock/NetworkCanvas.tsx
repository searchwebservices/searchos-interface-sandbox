// The Network topology surface is the LAN canvas itself, in its compact form: the same lenses bar, spacing control and
// device profile as #/lan, with the state shared through lan/lanState. xyflow is a separate chunk, loaded when the
// surface is first shown. A link out to the full page stays in the corner.
import { lazy, Suspense } from 'react'
import { ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanData } from '@/lan/useLanData'

const LanCanvas = lazy(() => import('@/lan/LanCanvas'))

export function NetworkCanvas({ lane }: { lane: string }) {
  const data = useLanData(lane)
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="topology">
      <div className="flex items-center px-3 pb-1 text-xs text-muted-foreground">
        <a href="#/lan" className="ml-auto flex items-center gap-1 underline-offset-2 hover:underline" data-testid="topology-open-lan">
          Full map <ExternalLinkIcon className="size-3" />
        </a>
      </div>
      {!data.model ? (
        <div className="flex flex-col gap-3 px-4 text-sm" data-testid="topology-status-box">
          <p className="text-muted-foreground" data-testid="topology-status">{data.error || 'Reading lan-watch...'}</p>
          {data.error && (
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={data.reload}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        <Suspense fallback={<p className="px-4 text-sm text-muted-foreground">Loading the map...</p>}>
          <LanCanvas data={data} compact />
        </Suspense>
      )}
    </div>
  )
}
