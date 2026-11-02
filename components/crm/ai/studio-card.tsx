"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, CircleAlert, Copy, Eye, Link2, Loader2, PanelsTopLeft, RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RunProgress } from "@/components/crm/studio/run-progress"
import { VersionReport } from "@/components/crm/studio/version-report"
import { STATE_LABELS, STATE_TONE, type LeadStudio } from "@/features/studio/labels"
import { api } from "@/app/(crm)/app/leads/api"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" })

/**
 * The fiche's Studio Web (E23), in its AI tabs: « Générer une landing », the brief to review, the run in progress, then
 * the page with its scores and its link. The full work (brief editor, versions, sharing) is in /app/studio.
 */
export function StudioCard({ leadId, onChanged }: { leadId: string; onChanged?: () => void }) {
  const [state, setState] = useState<{ leadId: string; data?: LeadStudio; error?: string } | null>(null)
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const current = state?.leadId === leadId ? state : null
  const data = current?.data
  const site = data?.site ?? null
  const running = site?.state === "briefing" || site?.state === "building"

  useEffect(() => {
    let cancelled = false
    api<LeadStudio>(`/api/leads/${leadId}/studio`)
      .then((next) => !cancelled && setState({ leadId, data: next }))
      .catch((e) => !cancelled && setState({ leadId, error: e instanceof Error ? e.message : "Chargement impossible" }))
    return () => {
      cancelled = true
    }
  }, [leadId, reloads])

  // While the Designer works, look again every few seconds; once it is done, the fiche reloads its history.
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => setReloads((n) => n + 1), 5_000)
    return () => clearTimeout(timer)
  }, [running, reloads])
  const [wasRunning, setWasRunning] = useState(false)
  if (running !== wasRunning) {
    setWasRunning(running)
    if (wasRunning && !running) onChanged?.()
  }

  async function act(key: string, url: string, body: unknown, done: string) {
    setBusy(key)
    try {
      await api(url, { method: "POST", body: JSON.stringify(body) })
      toast.success(done)
      setReloads((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Lien copié")
    } catch {
      toast.error("Copie impossible : ouvrez la maquette dans le Studio.")
    }
  }

  if (current?.error) return <p className="text-sm text-destructive-text">{current.error}</p>
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
      </p>
    )
  }

  const start = (
    <Button size="sm" onClick={() => act("start", `/api/leads/${leadId}/studio`, {}, "Le Designer lit le site : le brief sera prêt dans une minute environ.")} loading={busy === "start"} disabled={!data.canGenerate}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {site ? "Nouvelle maquette" : "Générer une landing"}
    </Button>
  )

  if (!site) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Le Designer construit une landing de démonstration à partir du site, de l’audit et de l’identité du prospect : un brief à relire d’abord, puis la page, rendue sur ordinateur et téléphone, critiquée et corrigée. Environ 1 € par maquette (plafond 2 €).
        </p>
        {data.blocked && (
          <p className="flex items-start gap-2 text-sm text-warning">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {data.blocked}
          </p>
        )}
        {start}
      </div>
    )
  }

  const version = site.versions.find((v) => v.number === site.currentVersion) ?? null
  const failed = (site.state === "brief_failed" || site.state === "build_failed") && site.run?.error
  const link = site.link && !site.link.expired ? site.link : null
  return (
    <div className="space-y-4">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <Badge variant={STATE_TONE[site.state]}>{STATE_LABELS[site.state]}</Badge>
        {site.currentVersion && <span className="text-xs text-muted-foreground">version {site.currentVersion}</span>}
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link href={`/app/studio/${site.id}`}>
            Ouvrir dans le Studio <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {running && site.run && <RunProgress run={site.run} />}
      {failed && (
        <div role="alert" className="flex flex-wrap items-start gap-2 rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-text">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{site.run?.error}</span>
          {site.can.edit && (
            <Button size="sm" variant="outline" onClick={() => act("retry", `/api/studio/sites/${site.id}/${site.state === "brief_failed" ? "brief" : "build"}`, {}, "Relancé")} loading={busy === "retry"}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Relancer
            </Button>
          )}
        </div>
      )}

      {site.state === "brief_ready" && site.brief && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brief à relire</p>
          <p className="text-lg font-bold leading-snug">{site.brief.headline}</p>
          <p className="text-sm text-muted-foreground">{site.brief.subheadline}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {[site.brief.palette.primary, site.brief.palette.accent].filter((c): c is string => !!c).map((c) => (
              <span key={c} className="inline-flex items-center gap-1 font-mono">
                <span className="h-3.5 w-3.5 rounded-full border" style={{ background: c }} aria-hidden="true" /> {c}
              </span>
            ))}
            <span>· {site.brief.fonts.heading} / {site.brief.fonts.body}</span>
            <span>· {site.brief.sections.length} sections</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/app/studio/${site.id}`}>Relire le brief</Link>
            </Button>
            {site.can.edit && (
              <Button size="sm" variant="outline" onClick={() => act("build", `/api/studio/sites/${site.id}/build`, {}, "Génération lancée : comptez 3 à 8 minutes.")} loading={busy === "build"}>
                Générer sans modifier
              </Button>
            )}
          </div>
        </div>
      )}

      {version && (
        <>
          <Link href={`/app/studio/${site.id}`} className="group block overflow-hidden rounded-xl border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {version.renders.thumb ? (
              <img src={version.renders.thumb} alt={`Maquette de ${site.companyName}, premier écran`} loading="lazy" className="aspect-[16/10] w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.01] motion-reduce:transition-none" />
            ) : (
              <div className="grid aspect-[16/10] place-items-center text-muted-foreground">
                <PanelsTopLeft className="h-8 w-8" aria-hidden="true" />
              </div>
            )}
          </Link>
          <VersionReport version={version} compact />
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
            {link?.url ? (
              <>
                <Badge variant="success">Lien actif</Badge>
                <span className="text-xs text-muted-foreground">jusqu’au {day.format(new Date(link.expiresAt))}</span>
                <Button size="sm" variant="outline" onClick={() => copy(link.url!)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copier le lien
                </Button>
              </>
            ) : (
              site.can.share && (
                <Button size="sm" variant="outline" onClick={() => act("link", `/api/studio/sites/${site.id}/link`, { action: "create" }, "Lien créé : valable 30 jours.")} loading={busy === "link"}>
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Créer le lien (30 jours)
                </Button>
              )
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {site.visits.count} visite{site.visits.count > 1 ? "s" : ""}
            </span>
          </div>
        </>
      )}

      {!running && site.state !== "brief_ready" && data.canGenerate && <div className="border-t pt-3">{start}</div>}
    </div>
  )
}
