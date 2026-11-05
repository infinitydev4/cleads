"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/crm/data-table"
import { EmptyState } from "@/components/crm/empty-state"
import { TEAM_TZ } from "@/lib/crm/day"
import { money } from "@/lib/crm/format"
import type { WonRow } from "@/features/metrics/report"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TEAM_TZ })

const columns: ColumnDef<WonRow>[] = [
  { accessorKey: "wonAt", header: "Gagnée le", cell: ({ row }) => <time dateTime={row.original.wonAt} className="whitespace-nowrap">{day.format(new Date(row.original.wonAt))}</time> },
  {
    accessorKey: "company",
    header: "Entreprise",
    cell: ({ row }) => <Link href={`/app/leads/${row.original.leadId}`} className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{row.original.company}</Link>,
  },
  { accessorKey: "owner", header: "Closer", cell: ({ row }) => row.original.owner ?? <span className="italic text-muted-foreground">Non attribuée</span> },
  { accessorKey: "createdBy", header: "Créée par", cell: ({ row }) => row.original.createdBy ?? <span className="text-muted-foreground">—</span> },
  {
    id: "amount",
    accessorFn: (r) => r.amountCents ?? -1,
    header: "Montant HT",
    cell: ({ row }) => (row.original.amountCents == null ? <span className="text-muted-foreground">Non renseigné</span> : <span className="font-semibold tabular-nums">{money(row.original.amountCents, row.original.currency)}</span>),
  },
]

/** The opportunities won in the period, the base for the closers' commissions (computed outside Cleads). */
export function WonTable({ rows }: { rows: WonRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      caption="Opportunités gagnées"
      getRowId={(r) => r.dealId}
      empty={<EmptyState title="Aucune opportunité gagnée sur la période" description="Une opportunité passée à « Gagné » apparaît ici avec son montant HT." />}
    />
  )
}
