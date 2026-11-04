"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2, Radar, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatDate, formatDateTime } from "@/lib/crm/format"
import { SIGNAL_LABELS, WATCH_KINDS, type WatchKind } from "@/features/signals/kinds"
import type { WatchPreview, WatchView } from "@/features/signals/watch-service"
import { api } from "../../leads/api"

const KIND_TEXT: Record<WatchKind, string> = { CREATED: "Créations d’entreprises", TAKEOVER: "Reprises de fonds (cessions)" }
type Sector = { key: string; label: string }

/**
 * The campaign's watch of the BODACC (E30, D50): each morning, the new companies and the businesses that changed
 * hands in the chosen départements, checked in the annuaire, join the campaign; Jev sorts them, and nothing is sent
 * without a person's click.
 */
export function WatchCard({ campaignId, archived }: { campaignId: string; archived: boolean }) {
  const [watch, setWatch] = useState<WatchView | null | undefined>(undefined)
  const [sectors, setSectors] = useState<Sector[]>([])
  const [kinds, setKinds] = useState<WatchKind[]>(["CREATED"])
  const [departments, setDepartments] = useState("")
  const [chosen, setChosen] = useState<Sector[]>([])
  const [query, setQuery] = useState("")
  const [preview, setPreview] = useState<WatchPreview | null>(null)
  const [busy, setBusy] = useState<"preview" | "save" | null>(null)

  useEffect(() => {
    let cancelled = false
    api<{ watch: WatchView | null }>(`/api/campaigns/${campaignId}/watch`)
      .then(({ watch: w }) => {
        if (cancelled) return
        setWatch(w)
        if (w) {
          setKinds(w.kinds)
          setDepartments(w.departments.join(", "))
          setChosen(w.sectors)
        }
      })
      .catch(() => !cancelled && setWatch(null))
    api<Sector[]>("/api/search-sectors")
      .then((list) => !cancelled && setSectors(list))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [campaignId])

  if (watch === undefined) return null
  const manage = watch ? watch.can.manage : true
  const body = (active: boolean) => ({ kinds, departments: departments.split(/[\s,;]+/).filter(Boolean), sectors: chosen.map((s) => s.key), active })

  async function run(kind: "preview" | "save", active = watch?.active ?? false) {
    setBusy(kind)
    try {
      if (kind === "preview") {
        setPreview(await api<WatchPreview>(`/api/campaigns/${campaignId}/watch`, { method: "POST", body: JSON.stringify(body(active)) }))
      } else {
        const { watch: next } = await api<{ watch: WatchView }>(`/api/campaigns/${campaignId}/watch`, { method: "PUT", body: JSON.stringify(body(active)) })
        setWatch(next)
        toast.success(next.active ? "Veille active : un premier passage lit les 7 derniers jours d’ici une minute." : "Veille enregistrée, en pause.")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const options = sectors.filter((s) => !chosen.some((c) => c.key === s.key) && s.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
  const report = watch?.lastReport

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><Radar className="h-4 w-4" aria-hidden="true" /> Veille du registre (BODACC)</h2>
        {watch?.active ? (
          <Badge variant="success">Active{watch.nextRunAt ? ` · prochain passage ${formatDateTime(watch.nextRunAt)}` : ""}</Badge>
        ) : (
          <Badge variant="neutral">{watch ? "En pause" : "Pas de veille"}</Badge>
        )}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Chaque matin, les créations d’entreprises et les reprises de fonds publiées au BODACC dans vos départements sont vérifiées dans l’annuaire (activité, entreprise ouverte, sans opposition) puis rangées dans cette campagne. Jev les trie ; rien n’est envoyé sans votre clic.
      </p>

      {manage && !archived ? (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Événements</legend>
            <div className="flex flex-wrap gap-4">
              {WATCH_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />
                  {KIND_TEXT[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Départements (cinq au plus)
              <Input value={departments} onChange={(e) => setDepartments(e.target.value)} placeholder="69, 01, 38" />
            </label>
            <div className="space-y-1 text-sm">
              <label htmlFor="watch-sector" className="font-medium">Secteurs (vide : toutes les activités)</label>
              <Input id="watch-sector" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="plombier, restaurant…" autoComplete="off" />
              {query.trim() && options.length > 0 && (
                <ul className="rounded-md border bg-popover p-1 shadow-sm">
                  {options.map((s) => (
                    <li key={s.key}>
                      <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-accent" onClick={() => { setChosen([...chosen, s]); setQuery("") }}>{s.label}</button>
                    </li>
                  ))}
                </ul>
              )}
              {chosen.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {chosen.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {s.label}
                      <button type="button" aria-label={`Retirer ${s.label}`} onClick={() => setChosen(chosen.filter((c) => c.key !== s.key))}><X className="h-3 w-3" aria-hidden="true" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => run("preview")}>
              {busy === "preview" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Aperçu sur 7 jours
            </Button>
            {watch?.active ? (
              <>
                <Button disabled={!!busy} onClick={() => run("save", true)}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Enregistrer</Button>
                <Button variant="ghost" disabled={!!busy} onClick={() => run("save", false)}>Mettre en pause</Button>
              </>
            ) : (
              <Button disabled={!!busy} onClick={() => run("save", true)}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Activer la veille</Button>
            )}
          </div>
        </div>
      ) : watch ? (
        <p className="text-sm">
          {watch.kinds.map((k) => KIND_TEXT[k]).join(" et ")} · départements {watch.departments.join(", ")}
          {watch.sectors.length ? ` · ${watch.sectors.map((s) => s.label).join(", ")}` : " · toutes activités"}
          {watch.owner ? ` · pour ${watch.owner.name}` : ""}
        </p>
      ) : null}

      {preview && (
        <section aria-label="Aperçu" className="space-y-2 rounded-lg border p-3">
          <p className="text-sm">
            Du {formatDate(preview.from)} au {formatDate(preview.to)} : <strong>{preview.total}</strong> annonce{preview.total > 1 ? "s" : ""} dans la zone, dont <strong>{preview.matching}</strong> pour vos secteurs
            {WATCH_KINDS.some((k) => preview.byKind[k]) ? ` (${WATCH_KINDS.filter((k) => preview.byKind[k]).map((k) => `${SIGNAL_LABELS[k].toLowerCase()}s ${preview.byKind[k]}`).join(", ")})` : ""}
            {preview.withoutActivity ? `, et ${preview.withoutActivity} sans activité déclarée, que leur code d’activité départagera` : ""}.
            <span className="text-muted-foreground"> Avant la vérification dans l’annuaire, qui écarte les entreprises fermées, non diffusibles ou d’une autre activité.</span>
          </p>
          {preview.sample.length > 0 && (
            <ul className="divide-y text-sm">
              {preview.sample.map((n, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                  <span className="text-xs tabular-nums text-muted-foreground">{formatDate(n.publishedOn)}</span>
                  <Badge variant={n.kind === "CREATED" ? "success" : "info"}>{SIGNAL_LABELS[n.kind]}</Badge>
                  <span className="font-medium">{n.name}</span>
                  {n.city && <span className="text-muted-foreground">{n.city}</span>}
                  {n.activity && <span className="w-full truncate text-muted-foreground sm:w-auto sm:max-w-md">{n.activity}</span>}
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center text-muted-foreground" aria-label="Annonce BODACC"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {report && (
        <p className="text-xs text-muted-foreground">
          Dernier passage le {formatDateTime(report.at)} : {report.notices} annonces lues, {report.created} fiche{report.created > 1 ? "s" : ""} créée{report.created > 1 ? "s" : ""}, {report.existing} déjà présente{report.existing > 1 ? "s" : ""}
          {report.pending ? `, ${report.pending} en attente de l’annuaire` : ""}. Écartées : {report.rejected.sector} hors secteur, {report.rejected.closed} fermées, {report.rejected.withheld} non diffusibles ou opposées.
          {report.error ? ` Erreur : ${report.error}` : ""}
        </p>
      )}
    </Card>
  )
}
