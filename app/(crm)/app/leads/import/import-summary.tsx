"use client"

import { CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { ImportResult, RowOutcome } from "@/features/leads/import"

/** What an import did or would do: counts first, then the lines that need a look. Shared by the CSV and the Extractor imports. */
export function ImportSummary({ result, title, action }: { result: ImportResult; title: string; action: React.ReactNode }) {
  const s = result.summary
  const tiles = [
    { label: result.committed ? "Créés" : "À créer", value: s.created, tone: "success" as const },
    { label: "Déjà présents", value: s.existing, hint: s.enriched ? `${s.enriched} complétés` : undefined, tone: "info" as const },
    { label: "Ignorés", value: s.skipped, tone: "warning" as const },
    { label: "Avertissements", value: s.warnings, tone: "neutral" as const },
  ]
  return (
    <Card className="space-y-5 p-6">
      <h2 className="flex items-center gap-2 font-bold">{result.committed && <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />}{title} · {s.total.toLocaleString("fr-FR")} lignes</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{t.label}</p><p className="text-3xl font-extrabold tabular-nums tracking-[-0.04em]">{t.value.toLocaleString("fr-FR")}</p>{t.hint && <p className="text-xs text-muted-foreground">{t.hint}</p>}</div>
        ))}
      </div>
      {result.issues.length > 0 && (
        <details className="rounded-xl border" open={result.issues.length <= 8}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">À regarder : {result.issues.length} ligne{result.issues.length > 1 ? "s" : ""}</summary>
          <ul className="divide-y border-t text-sm">{result.issues.slice(0, 100).map((o) => <Issue key={o.line} o={o} />)}</ul>
        </details>
      )}
      {!result.committed && (
        <details className="rounded-xl border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Aperçu des {result.rows.length} premières lignes</summary>
          <ul className="divide-y border-t text-sm">{result.rows.map((o) => <li key={o.line} className="flex items-center justify-between gap-3 px-4 py-2"><span className="truncate"><span className="text-muted-foreground">Ligne {o.line} · </span>{o.name || "—"}</span><Badge variant={o.status === "created" ? "success" : o.status === "existing" ? "info" : "warning"}>{o.status === "created" ? "nouveau" : o.status === "existing" ? "déjà là" : "ignoré"}</Badge></li>)}</ul>
        </details>
      )}
      {action}
    </Card>
  )
}

function Issue({ o }: { o: RowOutcome }) {
  return (
    <li className="px-4 py-2">
      <span className="font-medium">Ligne {o.line}{o.name ? ` · ${o.name}` : ""}</span>
      {o.reason && <span className="block text-muted-foreground">{o.reason}</span>}
      {o.warnings?.map((w) => <span key={w} className="block text-warning">{w}</span>)}
    </li>
  )
}
