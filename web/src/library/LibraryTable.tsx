// The Library table: shadcn data table pattern on TanStack Table. Sort, global search, a status filter and paging
// live here; what a row action does is decided by the page (onAction).
import { useMemo, useState } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnFiltersState, SortingState } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, MoreHorizontalIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PIPELINE, fmtSize } from '@/lib/library'
import type { LibraryRow } from '@/lib/library'
import { relTime } from '@/lib/time'
import { cn } from '@/lib/utils'

export type RowAction = 'preview' | 'download' | 'index' | 'version' | 'retention' | 'delete' | 'uses' | 'reprocess'
export interface TableCtx {
  laneTitle: (id: string) => string
  personName: (id: string | null | undefined) => string
  can: (row: LibraryRow, action: RowAction) => boolean
  busy: Record<string, string>
  onAction: (row: LibraryRow, action: RowAction) => void
}

export function StatusBadge({ row, stage }: { row: LibraryRow; stage?: string }) {
  if (stage) return <Badge variant="secondary" data-testid="status-badge">{'indexing: ' + stage}</Badge>
  if (row.status === 'failed') return <Badge variant="destructive" title={row.fail_reason ?? ''} data-testid="status-badge">failed</Badge>
  if (row.needs_parser) return <Badge className="bg-warn/20 text-warn" title={row.note ?? ''} data-testid="status-badge">needs a parser</Badge>
  if (row.status === 'available') return <Badge className="bg-ok/15 text-ok" data-testid="status-badge">available</Badge>
  return <Badge variant={row.status === 'processed' ? 'outline' : 'secondary'} title={row.note ?? row.index_error ?? ''} data-testid="status-badge">{row.status}</Badge>
}

const col = createColumnHelper<LibraryRow>()

function SortHead({ label, column }: { label: string; column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void } }) {
  const s = column.getIsSorted()
  return (
    <Button type="button" variant="ghost" size="xs" className="-ml-2" onClick={() => column.toggleSorting(s === 'asc')}>
      {label}
      {s === 'asc' ? <ArrowUpIcon /> : s === 'desc' ? <ArrowDownIcon /> : <ArrowUpDownIcon className="opacity-50" />}
    </Button>
  )
}

export function LibraryTable({ rows, ctx, showLane }: { rows: LibraryRow[]; ctx: TableCtx; showLane: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'uploaded_at', desc: true }])
  const [filters, setFilters] = useState<ColumnFiltersState>([])
  const [global, setGlobal] = useState('')
  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: ({ column }) => <SortHead label="Name" column={column} />,
        cell: (c) => (
          <div className="flex max-w-64 flex-col">
            <span className="truncate font-medium" title={c.getValue()}>{c.getValue()}</span>
            {c.row.original.folder ? <span className="truncate text-xs text-muted-foreground">{c.row.original.folder}</span> : null}
          </div>
        ),
      }),
      col.accessor('kind', { header: ({ column }) => <SortHead label="Kind" column={column} />, cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
      col.accessor((r) => ctx.laneTitle(r.lane), { id: 'lane', header: ({ column }) => <SortHead label="Lane" column={column} />, cell: (c) => <span className="text-xs">{c.getValue()}</span> }),
      col.accessor('size', { header: ({ column }) => <SortHead label="Size" column={column} />, cell: (c) => <span className="font-mono text-xs">{fmtSize(c.getValue())}</span> }),
      col.accessor((r) => ctx.personName(r.uploader), { id: 'uploader', header: ({ column }) => <SortHead label="Uploader" column={column} />, cell: (c) => <span className="text-xs">{c.getValue()}</span> }),
      col.accessor('uploaded_at', { header: ({ column }) => <SortHead label="Uploaded" column={column} />, cell: (c) => <span className="text-xs text-muted-foreground">{relTime(c.getValue())}</span> }),
      col.accessor('status', {
        header: ({ column }) => <SortHead label="Status" column={column} />,
        filterFn: 'equals',
        cell: (c) => <StatusBadge row={c.row.original} stage={ctx.busy[c.row.original.id]} />,
      }),
      col.accessor((r) => r.tags.join(' '), {
        id: 'tags',
        header: 'Tags',
        cell: (c) => (
          <div className="flex max-w-40 flex-wrap gap-1">
            {c.row.original.tags.map((t) => (
              <Badge key={t} variant="outline">{t}</Badge>
            ))}
          </div>
        ),
      }),
      col.accessor((r) => r.linked_skills.length, {
        id: 'skills',
        header: 'Linked skills',
        cell: (c) => (c.row.original.linked_skills.length ? <span className="text-xs">{c.row.original.linked_skills.join(', ')}</span> : <span className="text-xs text-muted-foreground">none</span>),
      }),
      col.accessor('uses_count', {
        header: ({ column }) => <SortHead label="Used by" column={column} />,
        cell: (c) => (
          <Button type="button" size="xs" variant="ghost" disabled={!c.getValue()} onClick={() => ctx.onAction(c.row.original, 'uses')} data-testid="used-by">
            {c.getValue()}
          </Button>
        ),
      }),
      col.accessor('version', { header: ({ column }) => <SortHead label="Version" column={column} />, cell: (c) => <span className="font-mono text-xs">v{c.getValue()}</span> }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: (c) => <RowMenu row={c.row.original} ctx={ctx} />,
      }),
    ],
    [ctx],
  )
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters: filters, globalFilter: global, columnVisibility: { lane: showLane } },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    onGlobalFilterChange: setGlobal,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    getRowId: (r) => r.id,
    globalFilterFn: (row, _id, value: string) => {
      const q = String(value).toLowerCase()
      const r = row.original
      return [r.name, r.kind, r.folder ?? '', r.tags.join(' '), ctx.personName(r.uploader), r.status].join(' ').toLowerCase().includes(q)
    },
  })
  const statusFilter = (filters.find((f) => f.id === 'status')?.value as string | undefined) ?? 'all'
  return (
    <div className="flex flex-col gap-2" data-testid="library-table">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-64" placeholder="Search name, tag, uploader" aria-label="Search files" value={global} onChange={(e) => setGlobal(e.target.value)} />
        <Select value={statusFilter} onValueChange={(v) => setFilters(v === 'all' ? [] : [{ id: 'status', value: v }])}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PIPELINE.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground" data-testid="row-count">{table.getFilteredRowModel().rows.length} of {rows.length}</span>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((r) => (
                <TableRow key={r.id} data-testid="library-row" data-name={r.original.name}>
                  {r.getVisibleCells().map((c) => (
                    <TableCell key={c.id} className={cn(c.column.id === 'actions' && 'w-8 text-right')}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-20 text-center text-muted-foreground" data-testid="library-empty">
                  {rows.length ? 'No file matches.' : 'No files yet. Drop some above.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="xs" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
          <Button type="button" size="xs" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button>
        </div>
      )}
    </div>
  )
}

function RowMenu({ row, ctx }: { row: LibraryRow; ctx: TableCtx }) {
  const item = (a: RowAction, label: string, extra?: { destructive?: boolean }) =>
    ctx.can(row, a) ? (
      <DropdownMenuItem key={a} variant={extra?.destructive ? 'destructive' : undefined} onSelect={() => ctx.onAction(row, a)} data-testid={'action-' + a}>
        {label}
      </DropdownMenuItem>
    ) : null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={'Actions for ' + row.name} data-testid="row-menu">
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {item('preview', 'Preview')}
        {item('download', 'Download')}
        {item('index', row.status === 'indexed' || row.status === 'available' ? 'Index again' : 'Index into recall')}
        {item('reprocess', 'Process again')}
        {item('version', 'New version')}
        {item('retention', 'Retention')}
        {ctx.can(row, 'delete') && <DropdownMenuSeparator />}
        {item('delete', 'Delete', { destructive: true })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
