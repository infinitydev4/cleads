"use client"

import { useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface DataTableProps<T> {
  // Column value types differ per column, so the value generic must stay open.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  data: T[]
  /** Accessible name of the table. */
  caption: string
  getRowId?: (row: T) => string
  loading?: boolean
  /** Shown instead of the body when there is no row. */
  empty?: React.ReactNode
  onRowClick?: (row: T) => void
  className?: string
}

/**
 * Dense, sortable table. Rows are keyboard reachable (Tab, ↑/↓, Enter) when `onRowClick` is set.
 * Server-side filters, pagination and virtualisation arrive with the prospects epic (E4).
 */
export function DataTable<T>({ columns, data, caption, getRowId, loading, empty, onRowClick, className }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  // TanStack Table returns unstable function references; the React Compiler warning is expected here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const rows = table.getRowModel().rows

  function onKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onRowClick?.(row)
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const sibling = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling
      ;(sibling as HTMLElement | null)?.focus()
    }
  }

  if (!loading && rows.length === 0 && empty) return <>{empty}</>

  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-card shadow-card", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-muted/60 backdrop-blur">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : sorted === "desc" ? <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => onKeyDown(e, row.original) : undefined}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}
