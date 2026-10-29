"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Download, OctagonX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/crm/status-badge"
import { searchStatus } from "@/lib/crm/status"
import { formatPhone } from "@/lib/crm/normalize"
import type { ExtractorImportResult, ResultRow, SearchView } from "@/features/search/service"
import { api } from "../../leads/api"
import { ImportSummary } from "../../leads/import/import-summary"

interface Filters {
  useful: boolean
  hasEmail: boolean
  minCompleteness: number
}

const duration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`
}

export function SearchDetail({ initial, canImport }: { initial: SearchView; canImport: boolean }) {
  const [view, setView] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const [filters, setFilters] = useState<Filters>({ useful: true, hasEmail: false, minCompleteness: 0 })
  const [rows, setRows] = useState<ResultRow[]>([])
  const [errors, setErrors] = useState<string>()
  // A verification belongs to the criteria and the results it was made on: it disappears when either changes.
  const [previewed, setPreviewed] = useState<{ key: string; result: ExtractorImportResult } | null>(null)
  const [done, setDone] = useState<ExtractorImportResult | null>(null)
  const [busy, setBusy] = useState<"preview" | "import" | "cancel" | null>(null)
  const polls = useRef(0)

  // Follow the search while it runs: every 2.5 s at first, then slower; paused while the tab is hidden.
  useEffect(() => {
    if (!view.active) return
    let timer: ReturnType<typeof setTimeout>
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (!document.hidden) {
        try {
          setView(await api<SearchView>(`/api/searches/${view.id}`))
        } catch {
          /* a failed poll is retried; the stored state stays on screen */
        }
        polls.current++
      }
      timer = setTimeout(tick, polls.current > 20 ? 8000 : 2500)
    }
    timer = setTimeout(tick, 2500)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [view.active, view.id])

  useEffect(() => {
    if (!view.active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [view.active])

  // Refresh the sample when results arrived or the criteria changed.
  useEffect(() => {
    let cancelled = false
    const q = new URLSearchParams({ limit: "25", useful: filters.useful ? "1" : "0", hasEmail: filters.hasEmail ? "1" : "0", minCompleteness: String(filters.minCompleteness) })
    api<{ rows: ResultRow[] }>(`/api/searches/${view.id}/results?${q}`)
      .then((r) => !cancelled && setRows(r.rows))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [view.id, filters, view.counters.unique])

  useEffect(() => {
    if (view.active || (view.status !== "FAILED" && view.counters.tasksFailed === 0)) return
    api<{ summary: string }>(`/api/searches/${view.id}/errors`).then((e) => setErrors(e.summary)).catch(() => undefined)
  }, [view.active, view.status, view.counters.tasksFailed, view.id])

  async function run(commit: boolean) {
    const criteriaKey = `${filters.useful}-${filters.hasEmail}-${filters.minCompleteness}-${view.counters.unique}`
    setBusy(commit ? "import" : "preview")
    try {
      const result = await api<ExtractorImportResult>(`/api/searches/${view.id}/import`, { method: "POST", body: JSON.stringify({ commit, ...filters }) })
      if (commit) {
        setDone(result)
        setPreviewed(null)
        setView((v) => ({ ...v, importedCount: v.importedCount + result.summary.created }))
        toast.success(`${result.summary.created} prospect(s) importé(s)`)
      } else setPreviewed({ key: criteriaKey, result })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function cancel() {
    setBusy("cancel")
    try {
      setView(await api<SearchView>(`/api/searches/${view.id}`, { method: "DELETE" }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const c = view.counters
  const criteriaKey = `${filters.useful}-${filters.hasEmail}-${filters.minCompleteness}-${c.unique}`
  const preview = previewed?.key === criteriaKey ? previewed.result : null
  const elapsed = (view.finishedAt ? new Date(view.finishedAt).getTime() : now) - new Date(view.createdAt).getTime()
  const progress = c.tasksTotal > 0 ? Math.min(100, Math.round((c.tasksDone / c.tasksTotal) * 100)) : 0
  const tiles = [
    { label: "Entreprises trouvées", value: c.unique, hint: c.rawFound > c.unique ? `${c.rawFound} lignes avant dédoublonnage` : undefined },
    { label: "Joignables", value: c.crmUseful, hint: "en activité, avec un moyen de contact" },
    { label: "Fiches complètes", value: c.complete, hint: "identité, adresse, téléphone, site ou email" },
    { label: "Avec email trouvé", value: c.enriched, hint: view.spec.enrich ? undefined : "recherche d’emails désactivée" },
  ]

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge map={searchStatus} value={view.status} />
            <span className="text-sm text-muted-foreground">{view.active ? "En cours depuis" : "Durée"} {duration(elapsed)} · lancée par {view.createdByName ?? "—"}</span>
          </div>
          {view.active && <Button variant="outline" size="sm" onClick={cancel} loading={busy === "cancel"}><OctagonX className="h-4 w-4" aria-hidden="true" /> Annuler</Button>}
        </div>

        {view.active && (
          <div>
            <div role="progressbar" aria-label="Avancement de la recherche" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-sidebar transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Avancement indicatif ({c.tasksDone}/{c.tasksTotal} étapes) : la recherche découvre de nouvelles étapes en route. Les résultats ci-dessous sont déjà utilisables.</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p className="text-3xl font-extrabold tabular-nums tracking-[-0.04em]">{t.value.toLocaleString("fr-FR")}</p>
              {t.hint && <p className="text-xs text-muted-foreground">{t.hint}</p>}
            </div>
          ))}
        </div>

        {(view.error || errors) && (
          <div role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-text">
            <p className="font-semibold">{view.status === "FAILED" ? "La recherche a échoué" : "Des étapes ont échoué"}</p>
            <p className="whitespace-pre-line">{view.error ?? errors}</p>
            {view.error && errors && <p className="mt-1 whitespace-pre-line opacity-90">{errors}</p>}
          </div>
        )}
        {!view.active && c.unique === 0 && view.status === "COMPLETED" && <p className="rounded-lg bg-warning-subtle p-3 text-sm font-medium text-warning">Aucune entreprise trouvée. Essayez une activité plus courante ou une zone plus large.</p>}
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold">Résultats</h2>
            <p className="text-sm text-muted-foreground">Un échantillon de {rows.length} entreprise{rows.length > 1 ? "s" : ""}{view.active ? ", mis à jour pendant la recherche" : ""}.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.useful} onChange={(e) => setFilters({ ...filters, useful: e.target.checked })} /> Joignables seulement</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.hasEmail} onChange={(e) => setFilters({ ...filters, hasEmail: e.target.checked })} /> Avec email</label>
            <Select value={String(filters.minCompleteness)} onValueChange={(v) => setFilters({ ...filters, minCompleteness: Number(v) })}>
              <SelectTrigger className="h-9 w-44" aria-label="Complétude minimale"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Toute complétude</SelectItem>
                <SelectItem value="60">Complétude ≥ 60</SelectItem>
                <SelectItem value="80">Complétude ≥ 80</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{view.active ? "Les premiers résultats arrivent…" : "Aucun résultat avec ces critères."}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Échantillon de résultats</caption>
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Entreprise", "Ville", "Contact", "Avis", "Complétude"].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-[260px] px-4 py-2.5"><p className="truncate font-semibold">{r.name}</p><p className="truncate text-xs text-muted-foreground">{r.category}</p></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.city ?? "—"}</td>
                    <td className="max-w-[240px] px-4 py-2.5 text-xs text-muted-foreground"><span className="block truncate">{r.email ?? r.website ?? "—"}</span>{r.phone && <span>{formatPhone(r.phone)}</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.rating != null ? `${r.rating}/5 · ${r.reviews ?? 0}` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.completeness ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {done ? (
        <ImportSummary
          result={done}
          title="Import terminé"
          action={<div className="flex flex-wrap gap-2"><Button asChild><Link href={`/app/leads?batch=${done.batchId}`}>Voir les prospects importés</Link></Button><Button variant="outline" onClick={() => setDone(null)}>Vérifier un autre import</Button></div>}
        />
      ) : preview ? (
        <ImportSummary
          result={preview}
          title="Vérification de l’import"
          action={
            <div className="space-y-3">
              {preview.excluded.closed > 0 && <p className="text-sm text-muted-foreground">{preview.excluded.closed} entreprise{preview.excluded.closed > 1 ? "s" : ""} fermée{preview.excluded.closed > 1 ? "s" : ""} définitivement ne seront pas importées.</p>}
              {view.active && <p className="text-sm text-muted-foreground">La recherche tourne encore : vous pourrez importer la suite plus tard, sans doublon.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => run(true)} loading={busy === "import"} disabled={preview.summary.created + preview.summary.enriched === 0}>
                  <Download className="h-4 w-4" aria-hidden="true" /> Importer {preview.summary.created} prospect{preview.summary.created > 1 ? "s" : ""}
                </Button>
                {preview.summary.created + preview.summary.enriched === 0 && <span className="text-sm text-muted-foreground">Rien de nouveau à importer.</span>}
              </div>
            </div>
          }
        />
      ) : (
        canImport && (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="font-bold">Importer dans les prospects</h2>
              <p className="text-sm text-muted-foreground">Avec les critères ci-dessus. Vous voyez ce qui sera créé, ce qui existe déjà et ce qui est ignoré avant que rien ne soit écrit.{view.importedCount > 0 && ` ${view.importedCount} déjà importée${view.importedCount > 1 ? "s" : ""} depuis cette recherche.`}</p>
            </div>
            <Button onClick={() => run(false)} loading={busy === "preview"} disabled={c.unique === 0}>Vérifier l’import</Button>
          </Card>
        )
      )}
    </div>
  )
}
