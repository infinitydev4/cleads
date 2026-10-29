"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/crm/data-table"
import { EmptyState } from "@/components/crm/empty-state"
import { auditLabel } from "@/features/audit/labels"

interface Row {
  id: string
  at: string
  action: string
  actor: string
  subject: string
  ip: string
  detail: string
}

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "at",
    header: "Date",
    cell: ({ row }) => (
      <time dateTime={row.original.at} className="whitespace-nowrap text-muted-foreground">
        {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(row.original.at))}
      </time>
    ),
  },
  {
    accessorKey: "action",
    header: "Événement",
    cell: ({ row }) => <Badge variant={row.original.action.endsWith("failed") ? "destructive" : "neutral"}>{auditLabel(row.original.action)}</Badge>,
  },
  { accessorKey: "actor", header: "Par" },
  { accessorKey: "subject", header: "Concerne", cell: ({ row }) => row.original.subject || "—" },
  { accessorKey: "ip", header: "Adresse IP", cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.ip || "—"}</span> },
  { accessorKey: "detail", header: "Détail", enableSorting: false, cell: ({ row }) => <code className="break-all text-xs text-muted-foreground">{row.original.detail}</code> },
]

export function AuditTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      caption="Journal d’audit"
      getRowId={(r) => r.id}
      empty={<EmptyState title="Rien à afficher" description="Les connexions et changements d’accès apparaîtront ici." />}
    />
  )
}
