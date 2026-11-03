"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, Ban, Check, CheckCircle2, ChevronDown, Circle, Clock, ExternalLink, Hand, Loader2, Pause, Play, Repeat, Tag, Workflow, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RUN_STATUS_LABELS, formatEur } from "@/features/ai/labels"
import { MISSION_STATUS_LABELS, MISSION_STATUS_TONE, type MissionDetail, type MissionStepView, type MissionView, type StepState } from "@/features/missions/labels"
import { formatParis } from "@/features/missions/recurrence"
import { cn } from "@/lib/utils"
import { api } from "@/app/(crm)/app/leads/api"
import { useMission } from "./use-mission"

/**
 * A mission (E28) as the person follows it: in the copilot's panel where it was proposed, and in Agents IA › Missions.
 * Proposed, it shows its steps in words, the clicks it will still ask for, and what it may cost against the cap, with
 * « Lancer » (or « Lancer quand même » above the cap, D32). Launched, each step says where it stands, live; a step that
 * contacts prospects waits for its own click, given here or in « À valider ».
 */

const STATE_ICON: Record<StepState, { icon: typeof Circle; className: string; label: string }> = {
  todo: { icon: Circle, className: "text-muted-foreground/60", label: "À venir" },
  working: { icon: Loader2, className: "animate-spin text-info", label: "En cours" },
  waiting: { icon: Clock, className: "text-info", label: "En attente" },
  approval: { icon: Hand, className: "text-warning", label: "Attend votre clic" },
  done: { icon: CheckCircle2, className: "text-success", label: "Faite" },
  skipped: { icon: Ban, className: "text-muted-foreground", label: "Passée" },
  failed: { icon: AlertTriangle, className: "text-destructive-text", label: "En échec" },
}

/** A second confirmation gives the plan's most, rounded up to the half euro (as the server asks). */
const confirmCap = (eur: number) => Math.ceil(eur * 2 - 1e-9) / 2

function Step({ step, launched, onDecide, busy }: { step: MissionStepView; launched: boolean; onDecide: (approvalId: string, approve: boolean) => void; busy: boolean }) {
  const s = STATE_ICON[step.state]
  const Icon = s.icon
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 shrink-0" title={launched ? s.label : undefined}>
        <Icon className={cn("h-4 w-4", launched ? s.className : "text-muted-foreground/60")} aria-hidden="true" />
        <span className="sr-only">{launched ? s.label : "À venir"}</span>
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm leading-snug">
          <span className="mr-1 font-medium tabular-nums text-muted-foreground">{step.index}.</span>
          {step.text}
        </p>
        {step.level === "explicit" && !launched && (
          <p className="flex items-center gap-1 text-xs font-medium text-warning">
            <Hand className="h-3 w-3" aria-hidden="true" />
            Attendra votre propre clic : elle contacte des prospects.
          </p>
        )}
        {launched && step.detail && <p className={cn("text-xs", step.state === "failed" ? "text-destructive-text" : "text-muted-foreground")}>{step.detail}</p>}
        {step.approvalId && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => onDecide(step.approvalId!, true)} disabled={busy}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Valider l’envoi
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecide(step.approvalId!, false)} disabled={busy}>
              Refuser
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

function Runs({ missionId }: { missionId: string }) {
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        aria-expanded={open}
        onClick={async () => {
          setOpen(!open)
          if (!detail) setDetail(await api<MissionDetail>(`/api/ai/missions/${missionId}?view=detail`).catch(() => null))
        }}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
        Exécutions et coûts
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-xs">
          {!detail ? (
            <li className="text-muted-foreground">Chargement…</li>
          ) : detail.runs.length ? (
            detail.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.agentLabel}</span>
                {r.task && <span className="text-muted-foreground">({r.task})</span>}
                {r.lead && (
                  <Link href={`/app/leads/${r.lead.id}`} prefetch={false} className="truncate underline-offset-4 hover:underline">
                    {r.lead.name}
                  </Link>
                )}
                <span className="text-muted-foreground">{RUN_STATUS_LABELS[r.status as keyof typeof RUN_STATUS_LABELS] ?? r.status}</span>
                <span className="ml-auto tabular-nums">{formatEur(r.costEur)}</span>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">Aucune exécution d’agent pour l’instant.</li>
          )}
        </ul>
      )}
    </div>
  )
}

export function MissionCard({ missionId, userId, initial = null, compact = false }: { missionId: string; userId: string | null; initial?: MissionView | null; compact?: boolean }) {
  const { view, setView, reload, missing } = useMission(missionId, userId, initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [askCap, setAskCap] = useState<number | null>(null)

  if (missing) return <p className="text-xs text-muted-foreground">Cette mission n’est plus visible.</p>
  if (!view) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Chargement de la mission…
      </div>
    )
  }

  const launched = !["PROPOSED", "REFUSED", "EXPIRED"].includes(view.status)
  const over = view.cost.maxEur > view.cost.capEur + 1e-9
  const raise = askCap ?? (view.pause?.kind === "budget" ? confirmCap(Math.max(view.cost.maxEur, view.cost.capEur * 1.5)) : null)

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      setView(await api<MissionView>(`/api/ai/missions/${missionId}`, { method: "POST", body: JSON.stringify(body) }))
      setAskCap(null)
      setConfirmCancel(false)
    } catch (e) {
      const extra = (e as { body?: { capEur?: unknown } }).body
      if (typeof extra?.capEur === "number") setAskCap(extra.capEur)
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function decide(approvalId: string, approve: boolean) {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/ai/approvals/${approvalId}`, { method: "POST", body: JSON.stringify({ decision: approve ? "approve" : "reject" }) })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function stopRecurrence() {
    if (!view?.recurrence?.scheduleId) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/ai/missions/schedules/${view.recurrence.scheduleId}`, { method: "POST", body: JSON.stringify({ action: "stop" }) })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  const proposed = view.status === "PROPOSED"
  return (
    <section aria-label={`Mission : ${view.title}`} className={cn("space-y-3 rounded-lg border p-3 text-sm", proposed ? "border-primary/40 bg-primary/5" : "bg-card shadow-sm", compact ? "" : "sm:p-4")}>
      <header className="flex items-start gap-2">
        <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{view.title}</p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {view.requestedBy && !view.mine ? `Pour ${view.requestedBy} · ` : ""}
              {view.approvedAt ? `lancée le ${formatParis(view.approvedAt)}` : `proposée le ${formatParis(view.createdAt)}`}
            </p>
          )}
        </div>
        <Badge variant={MISSION_STATUS_TONE[view.status]}>{MISSION_STATUS_LABELS[view.status]}</Badge>
      </header>

      {view.recurrence && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {view.recurrence.text}
          {proposed ? " · premier passage au lancement" : view.recurrence.status === "STOPPED" ? " · récurrence arrêtée" : view.recurrence.status === "PAUSED" ? " · récurrence en pause" : view.recurrence.nextRunAt ? ` · prochain passage ${formatParis(view.recurrence.nextRunAt)}` : ""}
        </p>
      )}

      <ol className="space-y-2.5">
        {view.steps.map((s) => (
          <Step key={s.key} step={s} launched={launched} onDecide={decide} busy={busy} />
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        {launched ? (
          <>
            IA : <span className="font-medium tabular-nums text-foreground">{formatEur(view.cost.spentEur)}</span> engagés sur un plafond de {formatEur(view.cost.capEur)}
          </>
        ) : (
          <>
            IA : environ <span className="font-medium tabular-nums text-foreground">{formatEur(view.cost.probableEur)}</span>, {formatEur(view.cost.maxEur)} au plus · plafond {formatEur(view.cost.capEur)} par mission
          </>
        )}
      </p>

      {view.pause && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-warning">
          {view.pause.reason}
        </p>
      )}

      {view.report && (
        <div className="space-y-1.5 rounded-md bg-success-subtle/60 px-3 py-2 text-xs">
          {view.report.leads > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
              <Tag className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              {view.report.leads.toLocaleString("fr-FR")} fiche{view.report.leads > 1 ? "s" : ""}
              {view.report.tag && <span className="font-normal text-muted-foreground">étiquetée{view.report.leads > 1 ? "s" : ""} « {view.report.tag} »</span>}
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {view.report.listUrl && (
              <Link href={view.report.listUrl} prefetch={false} className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Voir les fiches
              </Link>
            )}
            {view.report.campaigns.map((c) => (
              <Link key={c.id} href={`/app/campaigns/${c.id}`} prefetch={false} className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {view.status === "EXPIRED" && <p className="text-xs text-muted-foreground">Ce plan n’a pas été lancé à temps : demandez-le à nouveau au copilote.</p>}
      {view.status === "REFUSED" && <p className="text-xs text-muted-foreground">Plan refusé : rien n’a été fait.</p>}

      {proposed && view.can.approve && (
        <div className="space-y-2">
          {(over || askCap) && (
            <p className="text-xs text-warning">
              Ce plan peut coûter jusqu’à {formatEur(view.cost.maxEur)}, au-delà du plafond de {formatEur(view.cost.capEur)} par mission : confirmez-le une seconde fois.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {over || askCap ? (
              <Button size="sm" onClick={() => act({ action: "approve", capEur: askCap ?? confirmCap(view.cost.maxEur) })} disabled={busy}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Lancer quand même ({formatEur(askCap ?? confirmCap(view.cost.maxEur))})
              </Button>
            ) : (
              <Button size="sm" onClick={() => act({ action: "approve" })} disabled={busy}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Lancer
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => act({ action: "refuse" })} disabled={busy}>
              Refuser
            </Button>
          </div>
        </div>
      )}

      {(view.can.pause || view.can.resume || view.can.cancel || view.can.stopRecurrence) && (
        <div className="flex flex-wrap items-center gap-2">
          {view.can.resume && (
            <Button size="sm" onClick={() => act(raise ? { action: "resume", capEur: raise } : { action: "resume" })} disabled={busy}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {raise ? `Continuer jusqu’à ${formatEur(raise)}` : "Reprendre"}
            </Button>
          )}
          {view.can.pause && (
            <Button size="sm" variant="outline" onClick={() => act({ action: "pause" })} disabled={busy}>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              Pause
            </Button>
          )}
          {view.can.cancel &&
            (confirmCancel ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => act({ action: "cancel" })} disabled={busy}>
                  Confirmer l’annulation
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)} disabled={busy}>
                  Garder
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Annuler
              </Button>
            ))}
          {view.can.stopRecurrence && (
            <Button size="sm" variant="ghost" onClick={stopRecurrence} disabled={busy}>
              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
              Arrêter la récurrence
            </Button>
          )}
        </div>
      )}
      {confirmCancel && <p className="text-xs text-muted-foreground">Ses recherches et travaux en cours s’arrêtent ; ce qui est fait reste.</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive-text">
          {error}
        </p>
      )}

      {compact ? (
        launched && (
          <Link href="/app/agents?tab=missions" prefetch={false} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Suivre dans Agents IA › Missions
          </Link>
        )
      ) : (
        launched && <Runs missionId={missionId} />
      )}
    </section>
  )
}
