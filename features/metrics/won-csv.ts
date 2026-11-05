import { dayKey } from "@/lib/crm/day"
import type { WonRow } from "./report"

const HEADER = ["Date du gain", "Entreprise", "Closer", "Opportunité créée par", "Montant HT", "Devise", "Identifiant de l’opportunité"]

/** One CSV cell. A value Excel would read as a formula (=, +, -, @) starts with an apostrophe: names come from the web. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const frenchDate = (iso: string) => dayKey(new Date(iso)).split("-").reverse().join("/")
const frenchAmount = (cents: number) => (cents / 100).toFixed(2).replace(".", ",")

/** The won list for Excel in French (E10): UTF-8 with its mark, ";" between cells, decimal comma, dates in Paris. */
export function wonCsv(rows: WonRow[]): string {
  const lines = [HEADER, ...rows.map((r) => [frenchDate(r.wonAt), r.company, r.owner ?? "", r.createdBy ?? "", r.amountCents == null ? "" : frenchAmount(r.amountCents), r.currency, r.dealId])]
  return `﻿${lines.map((line) => line.map(csvCell).join(";")).join("\r\n")}\r\n`
}
