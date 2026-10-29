"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import Papa from "papaparse"
import { toast } from "sonner"
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { IMPORT_FIELDS, guessMapping, mapRow, type ColumnMapping, type ImportField } from "@/features/leads/mapping"
import type { ImportResult } from "@/features/leads/import"
import { ImportSummary } from "./import-summary"
import { api } from "../api"

const MAX_ROWS = 5000
const IGNORE = "__ignore__"
type Raw = Record<string, string>

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null)
  const [encoding, setEncoding] = useState("UTF-8")
  const [headers, setHeaders] = useState<string[]>([])
  const [raws, setRaws] = useState<Raw[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function parse(f: File, enc: string) {
    setError(undefined)
    setPreview(null)
    Papa.parse<Raw>(f, {
      header: true,
      skipEmptyLines: "greedy",
      encoding: enc,
      transformHeader: (h) => h.trim().replace(/^﻿/, ""),
      complete: (res) => {
        const cols = (res.meta.fields ?? []).filter(Boolean)
        if (cols.length === 0 || res.data.length === 0) return setError("Aucune ligne lisible dans ce fichier. Vérifiez qu’il s’agit d’un CSV avec une ligne d’en-têtes.")
        if (res.data.length > MAX_ROWS) return setError(`${res.data.length.toLocaleString("fr-FR")} lignes : ${MAX_ROWS.toLocaleString("fr-FR")} au maximum par import. Découpez le fichier.`)
        setHeaders(cols)
        setRaws(res.data)
        setMapping(guessMapping(cols))
      },
      error: (e) => setError(`Lecture impossible : ${e.message}`),
    })
  }

  const rows = useMemo(() => raws.map((r) => mapRow(r, mapping)), [raws, mapping])
  const nameMapped = Object.values(mapping).includes("name")
  const garbled = useMemo(() => raws.slice(0, 50).some((r) => Object.values(r).some((v) => v?.includes("�"))), [raws])

  async function run(commit: boolean) {
    setBusy(true)
    setError(undefined)
    try {
      const result = await api<ImportResult>("/api/leads/import", { method: "POST", body: JSON.stringify({ rows, fileName: file?.name, commit }) })
      if (commit) {
        setDone(result)
        toast.success(`${result.summary.created} prospect(s) importé(s)`)
      } else setPreview(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  if (done) return <ImportSummary result={done} title="Import terminé" action={<div className="flex gap-2"><Button asChild><Link href={`/app/leads?batch=${done.batchId}`}>Voir les prospects importés</Link></Button><Button variant="outline" onClick={() => { setDone(null); setPreview(null); setFile(null); setRaws([]); setHeaders([]) }}>Importer un autre fichier</Button></div>} />

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-sidebar text-xs text-sidebar-foreground">1</span> Choisir le fichier</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold shadow-sm hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
            <Upload className="h-4 w-4" aria-hidden="true" /> {file ? "Changer de fichier" : "Choisir un CSV"}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); parse(f, encoding) } }} />
          </label>
          {file && <span className="flex items-center gap-2 text-sm"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> {file.name} · {raws.length.toLocaleString("fr-FR")} lignes</span>}
          <label className="ml-auto flex items-center gap-2 text-sm">Encodage
            <Select value={encoding} onValueChange={(v) => { setEncoding(v); if (file) parse(file, v) }}>
              <SelectTrigger className="h-9 w-48" aria-label="Encodage du fichier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UTF-8">UTF-8 (par défaut)</SelectItem>
                <SelectItem value="windows-1252">Windows-1252 (Excel français)</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        {garbled && <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm font-medium text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Des caractères illisibles (�) apparaissent : essayez l’encodage Windows-1252.</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
      </Card>

      {headers.length > 0 && (
        <Card className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-sidebar text-xs text-sidebar-foreground">2</span> Associer les colonnes</h2>
          <p className="text-sm text-muted-foreground">Reconnues automatiquement quand c’est possible. Seul le nom de l’entreprise est obligatoire ; sans ville, site, téléphone ni email, une ligne est ignorée car on ne pourrait pas éviter les doublons.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-4">Colonne du fichier</th><th className="py-2 pr-4">Exemple</th><th className="py-2">Champ du CRM</th></tr></thead>
              <tbody className="divide-y">
                {headers.map((h) => (
                  <tr key={h}>
                    <td className="py-2 pr-4 font-medium">{h}</td>
                    <td className="max-w-[240px] truncate py-2 pr-4 text-muted-foreground">{raws.find((r) => r[h]?.trim())?.[h] ?? "—"}</td>
                    <td className="py-2">
                      <Select value={mapping[h] || IGNORE} onValueChange={(v) => { setPreview(null); setMapping({ ...mapping, [h]: v === IGNORE ? "" : (v as ImportField) }) }}>
                        <SelectTrigger className="h-9 w-56" aria-label={`Champ pour la colonne ${h}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORE}>Ignorer</SelectItem>
                          {IMPORT_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}{"required" in f && f.required ? " *" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!nameMapped && <p role="alert" className="text-sm font-medium text-destructive-text">Associez une colonne au « Nom de l’entreprise ».</p>}
          <div className="flex justify-end"><Button onClick={() => run(false)} loading={busy} disabled={!nameMapped}>Vérifier avant d’importer</Button></div>
        </Card>
      )}

      {preview && (
        <ImportSummary
          result={preview}
          title="Vérification"
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => run(true)} loading={busy} disabled={preview.summary.created + preview.summary.enriched === 0}>
                Importer {preview.summary.created} prospect{preview.summary.created > 1 ? "s" : ""}
              </Button>
              {preview.summary.created + preview.summary.enriched === 0 && <span className="text-sm text-muted-foreground">Rien de nouveau à importer.</span>}
            </div>
          }
        />
      )}
    </div>
  )
}
