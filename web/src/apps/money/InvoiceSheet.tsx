// The invoice detail sheet (Midday's invoice-details-sheet): the row's numbers, then the facturas, Facturapi invoices and
// Stripe charges that belong to it. "Belongs" is a match on client name or exact amount, see relatedToInvoice.
import { DownloadIcon, ExternalLinkIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { INVOICE_STATUS, relatedToInvoice } from './ledger'
import { moneyOf } from './money'
import { Chip, Muted } from './parts'
import type { FacturaRow, FacturapiBody, InvoiceRow, StripeBody } from './types'

const Block = ({ title, count, testid, children }: { title: string; count: number; testid: string; children: React.ReactNode }) => (
  <section className="grid gap-1" data-testid={testid} data-count={count}>
    <h3 className="text-sm font-semibold">{title} <Muted>{count}</Muted></h3>
    {count === 0 ? <Muted>Nothing linked to this invoice.</Muted> : <ul className="divide-y rounded-md border px-2">{children}</ul>}
  </section>
)

export function InvoiceSheet({ inv, facturas, stripe, facturapi, onClose }: { inv: InvoiceRow; facturas: FacturaRow[]; stripe: StripeBody | null; facturapi: FacturapiBody | null; onClose: () => void }) {
  const st = INVOICE_STATUS[inv.state]
  const rel = relatedToInvoice(inv, facturas, stripe?.charges ?? [])
  const fp = relatedToInvoice(inv, (facturapi?.invoices ?? []).map((i) => ({ ...i, total: i.total ?? Number.NaN })), [])
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="invoice-sheet" data-id={inv.id}>
        <SheetHeader>
          <SheetTitle className="truncate pr-6">{inv.client_name ?? 'No client'}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-semibold text-foreground">{moneyOf(inv.amount, inv.currency)}</span>
            <Chip label={st.label} tone={st.tone} testid="invoice-sheet-status" />
            {inv.state === 'overdue' && <Muted>{inv.days_overdue} d late</Muted>}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><Muted>Due</Muted><dd>{inv.due_date ?? '-'}</dd></div>
            <div><Muted>Paid</Muted><dd>{inv.paid_date ?? '-'}</dd></div>
            <div><Muted>Type</Muted><dd>{inv.type ?? '-'}</dd></div>
            <div><Muted>Status text</Muted><dd>{inv.status ?? '-'}</dd></div>
          </dl>
          <Block title="Facturas" count={rel.facturas.length} testid="invsheet-facturas">
            {rel.facturas.map((f) => <li key={f.id} className="flex items-center gap-2 py-1.5" data-testid="invsheet-factura"><span className="min-w-0 flex-1 truncate">{f.folio ?? f.id} <Muted>{f.receptor ?? ''}</Muted></span><span className="font-mono text-xs">{moneyOf(f.total)}</span><Muted>{f.fecha ?? ''}</Muted></li>)}
          </Block>
          <Block title="Facturapi" count={fp.facturas.length} testid="invsheet-facturapi">
            {fp.facturas.map((f) => <li key={f.id} className="flex items-center gap-2 py-1.5" data-testid="invsheet-facturapi-row"><span className="min-w-0 flex-1 truncate">{f.folio ?? f.id}</span><a href={f.pdf} download className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><DownloadIcon className="size-3" />PDF</a><a href={f.xml} download className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><DownloadIcon className="size-3" />XML</a></li>)}
          </Block>
          <Block title="Stripe" count={rel.charges.length} testid="invsheet-stripe">
            {rel.charges.map((c) => <li key={c.id} className="flex items-center gap-2 py-1.5" data-testid="invsheet-charge"><a href={c.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-primary hover:underline">{c.email ?? c.description ?? c.id}<ExternalLinkIcon className="size-3 shrink-0" /></a><span className="font-mono text-xs">{moneyOf(c.amount, c.currency.toUpperCase())}</span><Muted>{c.created?.slice(0, 10) ?? ''}</Muted></li>)}
          </Block>
        </div>
      </SheetContent>
    </Sheet>
  )
}
