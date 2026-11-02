"use client"

import { useEffect, useState } from "react"
import { CircleAlert, ExternalLink, Loader2, RefreshCw, Sparkles, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { RUN_STATUS_LABELS, formatEur } from "@/features/ai/labels"
import { signalLabel } from "@/features/offers/signals"
import { AREA_HINTS, AREA_LABELS, AUDIT_STATUS_LABELS, SEVERITY_LABELS, SEVERITY_TONE } from "@/features/prospect-audit/labels"
import { AREAS, type Evidence, type Point } from "@/features/prospect-audit/schemas"
import type { LeadAuditState } from "@/features/prospect-audit/service"
import { api } from "@/app/(crm)/app/leads/api"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
const ACTIVE = ["QUEUED", "RUNNING", "WAITING_APPROVAL"]
const safeLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

function EvidenceChips({ ids, evidence }: { ids: string[]; evidence: Map<string, Evidence> }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const e = evidence.get(id)
        if (!e) return null
        const label = `${e.label}${e.value ? ` : ${e.value}` : ""}`
        const href = safeLink(e.url)
        return href ? (
          <a key={id} href={href} target="_blank" rel="noopener noreferrer nofollow" title={label} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
            {id}
            <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
          </a>
        ) : (
          <span key={id} title={label} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {id}
          </span>
        )
      })}
    </span>
  )
}

function Points({ title, points, evidence }: { title: string; points: Point[]; evidence: Map<string, Evidence> }) {
  if (!points.length) return null
  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {points.map((p, i) => (
          <li key={i}>
            {p.text}
            <EvidenceChips ids={p.evidence} evidence={evidence} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The AI audit of a fiche (E20): start it, follow it, read it. Every finding shows its evidence (P page, M measure,
 * C screenshot, S source) with a link when there is one. `compact` is the 3D panel's version.
 */
export function AuditCard({ leadId, canRun, compact = false, onChanged, onOpenFull }: { leadId: string; canRun: boolean; compact?: boolean; onChanged?: () => void; onOpenFull?: () => void }) {
  const [state, setState] = useState<{ leadId: string; data?: LeadAuditState; error?: string } | null>(null)
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const current = state?.leadId === leadId ? state : null
  const data = current?.data
  const running = !!data?.run && ACTIVE.includes(data.run.status)

  useEffect(() => {
    let cancelled = false
    api<LeadAuditState>(`/api/leads/${leadId}/audit`)
      .then((next) => !cancelled && setState({ leadId, data: next }))
      .catch((e) => !cancelled && setState({ leadId, error: e instanceof Error ? e.message : "Chargement impossible" }))
    return () => {
      cancelled = true
    }
  }, [leadId, reloads])

  // While an audit runs, look again every few seconds; once it ends, the fiche reloads its score.
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => setReloads((n) => n + 1), 4_000)
    return () => clearTimeout(timer)
  }, [running, reloads])
  const [wasRunning, setWasRunning] = useState(false)
  if (running !== wasRunning) {
    setWasRunning(running)
    if (wasRunning && !running) onChanged?.()
  }

  async function start(force: boolean) {
    setBusy(true)
    try {
      const r = await api<{ reused: boolean }>(`/api/leads/${leadId}/audit`, { method: "POST", body: JSON.stringify({ force }) })
      toast.success(r.reused ? "Un audit récent de ce site existe déjà : le voici." : "Audit lancé : comptez une à deux minutes.")
      setReloads((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function addContact(auditId: string, index: number) {
    setAdding(index)
    try {
      const r = await api<{ linked: boolean }>(`/api/leads/${leadId}/audit/contacts`, { method: "POST", body: JSON.stringify({ auditId, index }) })
      toast.success(r.linked ? "Contact ajouté et associé à la fiche" : "Contact ajouté à l’entreprise")
      setReloads((n) => n + 1)
      onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setAdding(null)
    }
  }

  const audit = data?.audit
  const evidence = new Map((audit?.report.evidence ?? []).map((e) => [e.id, e]))
  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Sparkles className="h-4 w-4" aria-hidden="true" /> Audit IA
      </h3>
      {audit && <Badge variant={audit.status === "COMPLETE" ? "success" : "warning"}>{AUDIT_STATUS_LABELS[audit.status]}</Badge>}
      {audit && <span className="text-xs text-muted-foreground">du {day.format(new Date(audit.createdAt))}</span>}
      {data?.canRun && !running && (
        <Button size="sm" variant={audit ? "ghost" : "default"} className="ml-auto" onClick={() => start(!!audit)} loading={busy} title={audit?.fresh ? "Un audit de moins de 30 jours existe : le refaire coûte quelques centimes." : undefined}>
          {audit ? <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
          {audit ? "Refaire l’audit" : "Auditer"}
        </Button>
      )}
    </div>
  )

  if (current?.error) {
    return (
      <Card className="space-y-2 p-4">
        {header}
        <p className="text-sm text-destructive-text">{current.error}</p>
      </Card>
    )
  }
  if (!data) {
    return (
      <Card className="space-y-2 p-4">
        {header}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
        </p>
      </Card>
    )
  }

  const progress = running && (
    <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {data.run!.status === "QUEUED" ? "En file d’attente" : "Audit en cours"} · {RUN_STATUS_LABELS[data.run!.status]}
      </p>
      <p className="text-muted-foreground">Lecture du site, mesure PageSpeed, annuaire des entreprises, puis analyse des captures. Comptez une à deux minutes.</p>
      {!data.workerOnline && <p className="text-warning">Le worker IA est hors ligne : l’audit attend son retour.</p>}
      {data.run!.error && <p className="text-muted-foreground">Dernière tentative : {data.run!.error}</p>}
    </div>
  )

  if (!audit) {
    return (
      <Card className="space-y-3 p-4">
        {header}
        {progress}
        {!running && (
          <p className="text-sm text-muted-foreground">
            {canRun || data.canRun
              ? "L’Auditeur lit le site (5 pages au plus), mesure sa vitesse avec PageSpeed, consulte l’annuaire des entreprises et analyse les captures ; chaque constat cite sa preuve. Quelques centimes, pris sur votre quota du jour."
              : "Aucun audit pour cette fiche."}
          </p>
        )}
        {!data.configured && <p className="flex items-start gap-2 text-sm text-warning"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />La passerelle IA n’est pas encore branchée sur ce serveur.</p>}
      </Card>
    )
  }

  const scoreTone = audit.score == null ? "bg-muted" : audit.score < 50 ? "bg-destructive" : audit.score < 70 ? "bg-warning" : "bg-success"
  return (
    <Card className="space-y-4 p-4">
      {header}
      {progress}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <p>
          <span className="text-3xl font-extrabold tabular-nums">{audit.score ?? "—"}</span>
          <span className="text-muted-foreground"> / 100</span>
        </p>
        {audit.potential && <Badge variant={audit.potential.level === "high" ? "success" : audit.potential.level === "medium" ? "info" : "neutral"}>{audit.potential.label}</Badge>}
        <span className="text-xs text-muted-foreground">
          {audit.measured} volet{audit.measured > 1 ? "s" : ""} sur 8 mesurés{audit.shared ? " · audit du même site, fait pour une autre fiche" : ""}
          {!audit.fresh && " · plus de 30 jours : à refaire"}
        </span>
      </div>
      {audit.summary.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-sm font-medium">
          {audit.summary.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      {compact ? (
        onOpenFull && (
          <Button variant="outline" size="sm" onClick={onOpenFull}>
            Voir l’audit complet
          </Button>
        )
      ) : (
        <>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {AREAS.map((a) => {
              const v = audit.scores[a]
              return (
                <div key={a} title={AREA_HINTS[a]} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{AREA_LABELS[a]}</span>
                    <span className="tabular-nums text-muted-foreground">{v == null ? "non mesuré" : `${v}/100`}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={AREA_LABELS[a]} aria-valuenow={v ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                    {v != null && <div className={cn("h-full rounded-full", v < 50 ? "bg-destructive" : v < 70 ? "bg-warning" : "bg-success")} style={{ width: `${v}%` }} />}
                  </div>
                </div>
              )
            })}
          </div>
          <div className={cn("h-1 rounded-full", scoreTone)} aria-hidden="true" />

          {audit.captures.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {audit.captures.map((k) => {
                const src = `/api/ai/audits/${audit.id}/captures/${k}?lead=${encodeURIComponent(leadId)}`
                return (
                  <a key={k} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border" title={`Capture ${k === "mobile" ? "mobile" : "ordinateur"} (PageSpeed)`}>
                    <img src={src} alt={`Capture ${k === "mobile" ? "mobile" : "ordinateur"} du site`} className={cn("block object-cover object-top", k === "mobile" ? "h-48 w-24" : "h-48 w-72")} loading="lazy" />
                  </a>
                )
              })}
            </div>
          )}

          {audit.report.findings.length > 0 && (
            <details className="space-y-2" open>
              <summary className="cursor-pointer text-sm font-semibold">Constats ({audit.report.findings.length})</summary>
              <ul className="mt-2 space-y-2">
                {audit.report.findings.map((f, i) => (
                  <li key={i} className="rounded-lg border p-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <Badge variant={SEVERITY_TONE[f.severity]}>{SEVERITY_LABELS[f.severity]}</Badge>
                      <span className="text-xs text-muted-foreground">{AREA_LABELS[f.area]}</span>
                      {f.title}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {f.detail}
                      <EvidenceChips ids={f.evidence} evidence={evidence} />
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Points title="Opportunités" points={audit.report.opportunities} evidence={evidence} />
          <Points title="Forces" points={audit.report.strengths} evidence={evidence} />
          <Points title="Freins" points={audit.report.frictions} evidence={evidence} />

          {audit.report.signals.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="text-sm font-semibold">Signaux pour les offres</h4>
              <div className="flex flex-wrap gap-1.5">
                {audit.report.signals.map((s) => (
                  <Badge key={s.key} variant="outline" className="font-normal">
                    {signalLabel(s.key)}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {(audit.report.registry || audit.people.length > 0) && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">Entreprise</h4>
              {audit.report.registry && (
                <p className="text-sm text-muted-foreground">
                  <a href={audit.report.registry.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    SIREN {audit.report.registry.siren}
                  </a>
                  {audit.report.registry.naf && ` · NAF ${audit.report.registry.naf}`}
                  {audit.report.registry.createdOn && ` · créée le ${day.format(new Date(audit.report.registry.createdOn))}`}
                  {audit.report.registry.labels.length > 0 && ` · ${audit.report.registry.labels.join(", ")}`}
                </p>
              )}
              {audit.people.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  {p.role && <span className="text-muted-foreground">{p.role}</span>}
                  {p.added ? (
                    <Badge variant="success">Contact ajouté</Badge>
                  ) : (
                    data.canRun && (
                      <Button size="sm" variant="outline" className="ml-auto" onClick={() => addContact(audit.id, i)} loading={adding === i}>
                        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Ajouter comme contact
                      </Button>
                    )
                  )}
                </div>
              ))}
              {audit.people.length > 0 && <p className="text-xs text-muted-foreground">Source : annuaire des entreprises (données publiques). Base légale : intérêt légitime, prospection B2B. Aucune adresse email n’est devinée.</p>}
            </section>
          )}

          {audit.report.notes.length > 0 && (
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">Non vérifié</h4>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {audit.report.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            {audit.url && (
              <>
                Site audité :{" "}
                <a href={safeLink(audit.url) ?? undefined} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">
                  {audit.domain ?? audit.url}
                </a>{" "}
                ·{" "}
              </>
            )}
            coût {formatEur(audit.costEur)} · valable jusqu’au {day.format(new Date(audit.validUntil))}
          </p>
        </>
      )}
    </Card>
  )
}
