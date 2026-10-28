// Interface health: the selected device from its lan-watch record; for the box itself, the interface list
// (ip -br addr, link speed, MTU, errors) from the read-only box route.
import { RefreshCwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { relTime } from '@/lib/time'
import type { BoxIface, LanDevice } from '@/lib/types'
import { useDock } from './context'
import { useBoxInterfaces } from './lan'
import { DevicePicker } from '@/lan/DevicePicker'
import { deviceName, findNode, nodeStatus, selectionNodeId } from '@/lan/model'
import { useLanData } from '@/lan/useLanData'

const Row = ({ k, v }: { k: string; v: string }) => (
  <>
    <dt className="font-mono text-muted-foreground">{k}</dt>
    <dd className="font-mono break-all">{v || 'unknown'}</dd>
  </>
)

export function DeviceHealth({ dev, now }: { dev: LanDevice; now?: number }) {
  const st = nodeStatus(dev)
  return (
    <section className="flex flex-col gap-2" data-testid="device-health">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{deviceName(dev)}</h3>
        <Badge variant={st === 'denied' ? 'destructive' : 'secondary'}>{st === 'online' ? 'Link up' : st === 'offline' ? 'Link down' : st === 'pending' ? 'Pending approval' : 'Denied'}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <Row k="status" v={dev.status} />
        <Row k="ip" v={dev.last_ip ?? ''} />
        <Row k="mac" v={dev.mac} />
        <Row k="vendor" v={dev.vendor ?? ''} />
        <Row k="mac type" v={dev.is_random ? 'randomized' : 'hardware'} />
        <Row k="last seen" v={dev.last_seen ? relTime(dev.last_seen, now) : ''} />
        <Row k="first seen" v={dev.first_seen ? relTime(dev.first_seen, now) : ''} />
        <Row k="speed, mtu, errors" v="not reported for a LAN device" />
      </dl>
    </section>
  )
}

const n = (v: number | null | undefined) => (v == null ? 'unknown' : String(v))

export function IfaceCard({ i }: { i: BoxIface }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3" data-testid="iface-card" data-iface={i.name}>
      <div className="flex items-center gap-2">
        <h4 className="font-mono text-sm font-semibold">{i.name}</h4>
        <Badge variant={i.state === 'UP' ? 'secondary' : 'outline'}>{i.state}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <Row k="ip" v={i.addrs.join(', ')} />
        <Row k="mac" v={i.mac ?? ''} />
        <Row k="speed" v={i.speed_mbps == null ? 'unknown' : i.speed_mbps + ' Mb/s'} />
        <Row k="mtu" v={n(i.mtu)} />
        <Row k="rx errors" v={i.rx ? `${i.rx.errors} errors, ${i.rx.dropped} dropped` : ''} />
        <Row k="tx errors" v={i.tx ? `${i.tx.errors} errors, ${i.tx.dropped} dropped` : ''} />
        <Row k="link changes" v={n(i.carrier_changes)} />
      </dl>
    </section>
  )
}

export function InterfaceHealth({ lane }: { lane: string }) {
  const d = useDock()
  const sel = d.selection?.kind === 'device' ? d.selection : null
  const data = useLanData(lane)
  const { model, error, reload: reloadLan } = data
  const isBox = !!sel && (sel.id === 'box' || sel.id === model?.box.mac)
  const { state: ifs, reload } = useBoxInterfaces(lane, isBox)
  const nodeId = sel ? selectionNodeId(model, sel.id) : ''
  const picker = (
    <DevicePicker model={model} valueId={nodeId} valueLabel={sel?.label} onPick={(id, label) => d.select({ kind: 'device', id, label })} />
  )
  if (!sel) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4" data-testid="iface-health">
        {picker}
        <p className="text-sm text-muted-foreground" data-testid="iface-empty">
          Select a device above, or click one in the network topology, to see its link.
        </p>
        {!model && error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }
  if (isBox) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="iface-health">
        {picker}
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-base font-semibold">This box</h3>
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Refresh interfaces" onClick={reload} disabled={ifs.loading}>
            <RefreshCwIcon />
          </Button>
        </div>
        {ifs.error && <p className="text-sm text-destructive">{ifs.error}</p>}
        {!ifs.list && !ifs.error && <p className="text-sm text-muted-foreground">Reading interfaces...</p>}
        {ifs.list?.map((i) => <IfaceCard key={i.name} i={i} />)}
      </div>
    )
  }
  const found = findNode(model, sel.id)?.device ?? null
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="iface-health">
      {picker}
      {found ? (
        <DeviceHealth dev={found} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{error || `${sel.label} is not in the last lan-watch reading.`}</p>
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={reloadLan}>
            Read again
          </Button>
        </>
      )}
    </div>
  )
}
