// #/lan: the LAN as an n8n-style canvas. The page owns the data (shared LAN model) and the header; the canvas, and
// with it @xyflow/react, is a separate chunk.
import { lazy, Suspense } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanData } from '@/lan/useLanData'
import { PageHeader } from './Devices'

const LanCanvas = lazy(() => import('@/lan/LanCanvas'))

export default function LanPage() {
  const data = useLanData('lan-page')
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="lan-route">
      <PageHeader title="LAN">
        <Button type="button" size="icon-xs" variant="ghost" className="ml-auto" aria-label="Refresh LAN" onClick={data.reload} disabled={data.loading}>
          <RefreshCwIcon />
        </Button>
      </PageHeader>
      {!data.model ? (
        <div className="flex flex-col gap-3 p-4 text-sm" data-testid="lan-status">
          <p className="text-muted-foreground">{data.error || 'Reading lan-watch...'}</p>
          {data.error && (
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={data.reload}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        /* touch-none: a finger on the map pans the map. The page never scrolls under it. */
        <div className="flex min-h-0 flex-1 touch-none flex-col overscroll-none" data-testid="lan-pan">
          <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading the map...</p>}>
            <LanCanvas data={data} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
