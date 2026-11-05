"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/crm/data-table"
import { EmptyState } from "@/components/crm/empty-state"
import { ROLE_LABELS } from "@/lib/crm/roles"
import { money } from "@/lib/crm/format"
import { CONVERSION_COLUMNS, PERSON_INDICATORS, PROSPECTING_COLUMNS, formatCount, formatRate } from "@/features/metrics/definitions"
import type { PersonRow } from "@/features/metrics/report"

const person: ColumnDef<PersonRow> = {
  accessorKey: "name",
  header: "Personne",
  cell: ({ row }) => (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{row.original.name}</span>
      <Badge variant="neutral">{ROLE_LABELS[row.original.role]}</Badge>
      {!row.original.active && <span className="text-xs text-muted-foreground">Accès désactivé</span>}
    </span>
  ),
}

const count = (key: "contacted" | "replied" | "qualified" | "meetingsBooked" | "meetingsHeld" | "won" | "lost"): ColumnDef<PersonRow> => ({
  accessorKey: key,
  header: PERSON_INDICATORS[key].label,
  cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original[key])}</span>,
})

const amounts: ColumnDef<PersonRow> = {
  id: "wonAmount",
  header: PERSON_INDICATORS.wonAmount.label,
  enableSorting: false, // amounts in different currencies have no common order
  cell: ({ row }) => {
    const { wonAmounts, wonWithoutAmount } = row.original
    return (
      <span className="tabular-nums">
        {wonAmounts.length ? wonAmounts.map((a) => money(a.cents, a.currency)).join(" + ") : "—"}
        {wonWithoutAmount > 0 && <span className="block text-xs text-muted-foreground">{wonWithoutAmount} sans montant</span>}
      </span>
    )
  },
}

const winRate: ColumnDef<PersonRow> = {
  id: "winRate",
  accessorFn: (r) => r.winRate ?? -1,
  header: PERSON_INDICATORS.winRate.label,
  cell: ({ row }) => <span className="tabular-nums">{formatRate(row.original.winRate)}</span>,
}

const COLUMNS = {
  prospecting: [person, ...PROSPECTING_COLUMNS.map(count)],
  conversion: [person, ...CONVERSION_COLUMNS.map((k) => (k === "wonAmount" ? amounts : k === "winRate" ? winRate : count(k)))],
}

/** What each person did in the period: who prospects, then who converts (E10, D57). */
export function PeopleTable({ kind, rows }: { kind: "prospecting" | "conversion"; rows: PersonRow[] }) {
  const prospecting = kind === "prospecting"
  return (
    <DataTable
      columns={COLUMNS[kind]}
      data={rows}
      caption={prospecting ? "Prospection par personne" : "Conversion par personne"}
      getRowId={(r) => r.userId}
      empty={<EmptyState title={prospecting ? "Aucune prospection sur la période" : "Aucun rendez-vous ni signature sur la période"} description="Les chiffres apparaissent dès qu’il y a de l’activité." />}
    />
  )
}
