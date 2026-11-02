"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, ChevronDown, CircleAlert, ClipboardCopy, Loader2, Mail, PhoneCall, RefreshCw, Sparkles, Target, Undo2, X, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { modelLabel } from "@/lib/ai/models"
import { RUN_STATUS_LABELS, formatEur } from "@/features/ai/labels"
import { CATEGORY_LABELS, withPriceNote } from "@/features/offers/labels"
import { REASON_LABELS, REJECTION_REASONS, ROLE_HINTS, ROLE_LABELS, SCRIPT_STEPS, fitLabel, stepTimes } from "@/features/offer-pitch/labels"
import type { LeadPitchState, PitchView, RecommendationView } from "@/features/offer-pitch/service"
import type { Evidence } from "@/features/prospect-audit/schemas"
import { api } from "@/app/(crm)/app/leads/api"
import { EvidenceChips } from "./evidence"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
const short = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
const ACTIVE = ["QUEUED", "RUNNING", "WAITING_APPROVAL"]
const TIMES = stepTimes()

type Decision = RecommendationView["status"]

/** The pitch as plain text, to paste into notes or a call tool. */
function scriptText(pitch: PitchView): string {
  const s = pitch.script
  const body: Record<(typeof SCRIPT_STEPS)[number]["key"], string> = {
    opening: s.opening,
    hook: s.hook.text,
    questions: s.questions.map((q) => `- ${q}`).join("\n"),
    proposal: s.proposal,
    objections: pitch.objections.map((o) => `- « ${o.objection} » → ${o.answer}`).join("\n"),
    close: s.close,
  }
  return [
    `Script d’appel · 15 min`,
    pitch.headline,
    ...SCRIPT_STEPS.filter((step) => body[step.key]).map((step) => `\n${TIMES[step.key]} · ${step.label}\n${body[step.key]}`),
  ].join("\n")
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copié`)
  } catch {
    toast.error("Copie impossible : sélectionnez le texte à la main.")
  }
}

function Hint({ icon: Icon = Target, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  )
}

function DecisionBar({ rec, canDecide, busy, locked, onDecide }: { rec: RecommendationView; canDecide: boolean; busy: boolean; locked: boolean; onDecide: (status: Decision, reason?: (typeof REJECTION_REASONS)[number]) => void }) {
  if (rec.status !== "SUGGESTED") {
    const when = [rec.decidedBy && `par ${rec.decidedBy}`, rec.decidedAt && `le ${short.format(new Date(rec.decidedAt))}`].filter(Boolean).join(", ")
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rec.status === "ACCEPTED" ? "success" : "neutral"}>
          {rec.status === "ACCEPTED" ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
          {rec.status === "ACCEPTED" ? "Retenue" : `Écartée${rec.reason ? ` · ${REASON_LABELS[rec.reason]}` : ""}`}
        </Badge>
        {when && <span className="text-xs text-muted-foreground">{when}</span>}
        {canDecide && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onDecide("SUGGESTED")} loading={busy} disabled={locked}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Annuler
          </Button>
        )}
      </div>
    )
  }
  if (!canDecide) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => onDecide("ACCEPTED")} loading={busy} disabled={locked || !rec.offer.active} title={rec.offer.active ? "Vous proposerez cette offre au prospect" : "Cette offre n’est plus active dans le catalogue"}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Retenir
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" disabled={locked}>
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Écarter <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Pourquoi l’écarter ?</DropdownMenuLabel>
          {REJECTION_REASONS.map((reason) => (
            <DropdownMenuItem key={reason} onSelect={() => onDecide("REJECTED", reason)}>
              {REASON_LABELS[reason]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function RecommendationItem({ rec, evidence, canDecide, busy, locked, onDecide }: { rec: RecommendationView; evidence: Map<string, Evidence>; canDecide: boolean; busy: boolean; locked: boolean; onDecide: (status: Decision, reason?: (typeof REJECTION_REASONS)[number]) => void }) {
  const fit = fitLabel(rec.fit)
  return (
    <li className={cn("space-y-2 rounded-xl border p-3 transition-colors duration-200", rec.status === "ACCEPTED" && "border-success/40 bg-success-subtle/40", rec.status === "REJECTED" && "bg-muted/40 text-muted-foreground")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums", rec.role === "MAIN" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-hidden="true">
          {rec.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("font-semibold", rec.status === "REJECTED" && "line-through decoration-1")}>{rec.offer.name}</span>
            <Badge variant={rec.role === "MAIN" ? "default" : "outline"} className="font-medium" title={ROLE_HINTS[rec.role]}>
              {ROLE_LABELS[rec.role]}
            </Badge>
            <Badge variant={fit.tone} className="font-medium tabular-nums" title="Adéquation au prospect, selon le Conseiller offres">
              {rec.fit} % · {fit.label}
            </Badge>
            {!rec.offer.active && <Badge variant="warning">Plus au catalogue</Badge>}
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {CATEGORY_LABELS[rec.offer.category]} · {withPriceNote(rec.offer.price, rec.offer.priceNote)}
          </p>
        </div>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div>
          <dt className="sr-only">Pourquoi cette offre</dt>
          <dd>
            {rec.why}
            <EvidenceChips ids={rec.evidence} evidence={evidence} />
          </dd>
        </div>
        {rec.gain && (
          <div>
            <dt className="inline font-medium">Ce qu’il y gagne : </dt>
            <dd className="inline text-muted-foreground">{rec.gain}</dd>
          </div>
        )}
        {rec.objection && (
          <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
            <dt className="font-medium">« {rec.objection.objection} »</dt>
            <dd className="text-muted-foreground">→ {rec.objection.answer}</dd>
          </div>
        )}
      </dl>
      {rec.signals.length > 0 && (
        <p className="flex flex-wrap gap-1" aria-label="Signaux de l’audit">
          {rec.signals.map((s) => (
            <span key={s.key} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {s.label}
            </span>
          ))}
        </p>
      )}
      <DecisionBar rec={rec} canDecide={canDecide} busy={busy} locked={locked} onDecide={onDecide} />
    </li>
  )
}

function CallScript({ pitch, evidence }: { pitch: PitchView; evidence: Map<string, Evidence> }) {
  const s = pitch.script
  const body: Record<(typeof SCRIPT_STEPS)[number]["key"], React.ReactNode> = {
    opening: s.opening || null,
    hook: s.hook.text ? (
      <>
        {s.hook.text}
        <EvidenceChips ids={s.hook.evidence} evidence={evidence} />
      </>
    ) : null,
    questions: s.questions.length ? (
      <ul className="list-disc space-y-0.5 pl-4">
        {s.questions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ul>
    ) : null,
    proposal: s.proposal || null,
    objections: pitch.objections.length ? (
      <dl className="space-y-1">
        {pitch.objections.map((o, i) => (
          <div key={i}>
            <dt className="font-medium">« {o.objection} »</dt>
            <dd className="text-muted-foreground">→ {o.answer}</dd>
          </div>
        ))}
      </dl>
    ) : null,
    close: s.close || null,
  }
  return (
    <section aria-labelledby={`script-${pitch.id}`} className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <h4 id={`script-${pitch.id}`} className="flex items-center gap-2 text-sm font-semibold">
          <PhoneCall className="h-4 w-4" aria-hidden="true" /> Script d’appel · 15 min
        </h4>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => copy(scriptText(pitch), "Script")}>
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /> Copier
        </Button>
      </div>
      <ol className="space-y-3 border-l-2 border-border pl-4">
        {SCRIPT_STEPS.filter((step) => body[step.key]).map((step) => (
          <li key={step.key} className="relative">
            <span className={cn("absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-4 ring-card", step.key === "hook" ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="tabular-nums">{TIMES[step.key]}</span> · {step.label}
            </p>
            <div className="mt-0.5 text-sm">{body[step.key]}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Suggested offers of a fiche (E21): the candidates its audit calls for, the Conseiller offres' pitch (ranked offers
 * with their evidence, pack and budget, 15-minute call script, objections, email angle), and the person's decision on
 * each offer. `compact` is the 3D panel's version; `embedded` sits in the fiche's AI tabs.
 */
export function OffersCard({
  leadId,
  compact = false,
  embedded = false,
  onChanged,
  onShowAudit,
  onOpenFull,
}: {
  leadId: string
  compact?: boolean
  embedded?: boolean
  onChanged?: () => void
  onShowAudit?: () => void
  onOpenFull?: () => void
}) {
  const [state, setState] = useState<{ leadId: string; data?: LeadPitchState; error?: string } | null>(null)
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [deciding, setDeciding] = useState<string | null>(null)
  const current = state?.leadId === leadId ? state : null
  const data = current?.data
  const running = !!data?.run && ACTIVE.includes(data.run.status)

  useEffect(() => {
    let cancelled = false
    api<LeadPitchState>(`/api/leads/${leadId}/offers`)
      .then((next) => !cancelled && setState({ leadId, data: next }))
      .catch((e) => !cancelled && setState({ leadId, error: e instanceof Error ? e.message : "Chargement impossible" }))
    return () => {
      cancelled = true
    }
  }, [leadId, reloads])

  // While the advisor works, look again every few seconds; once it is done, the fiche reloads its count of offers.
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => setReloads((n) => n + 1), 3_000)
    return () => clearTimeout(timer)
  }, [running, reloads])
  const [wasRunning, setWasRunning] = useState(false)
  if (running !== wasRunning) {
    setWasRunning(running)
    if (wasRunning && !running) onChanged?.()
  }

  async function start() {
    setBusy(true)
    try {
      await api(`/api/leads/${leadId}/offers`, { method: "POST", body: "{}" })
      toast.success("Le Conseiller offres prépare le pitch : comptez une minute.")
      setReloads((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function decide(rec: RecommendationView, status: Decision, reason?: (typeof REJECTION_REASONS)[number]) {
    setDeciding(rec.id)
    try {
      const next = await api<RecommendationView>(`/api/leads/${leadId}/offers/${rec.id}`, { method: "PATCH", body: JSON.stringify(reason ? { status, reason } : { status }) })
      setState((s) => (s?.leadId === leadId && s.data?.pitch ? { ...s, data: { ...s.data, pitch: { ...s.data.pitch, recommendations: s.data.pitch.recommendations.map((r) => (r.id === next.id ? next : r)) } } } : s))
      toast.success(status === "ACCEPTED" ? `« ${rec.offer.name} » retenue` : status === "REJECTED" ? `« ${rec.offer.name} » écartée` : "Décision annulée")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setDeciding(null)
    }
  }

  const pitch = data?.pitch
  const evidence = new Map((pitch?.evidence ?? []).map((e) => [e.id, e]))

  if (compact) {
    // The 3D panel shows the pitch's gist, or how to get one; nothing at all while there is no audit to start from.
    if (!data || !data.audit || (!pitch && !running && !data.candidates.length)) return null
    const shown = pitch?.recommendations.filter((r) => r.role !== "LATER") ?? []
    return (
      <Card className="space-y-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Target className="h-4 w-4" aria-hidden="true" /> Offres suggérées
        </h3>
        {running ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Le Conseiller offres prépare le pitch…
          </p>
        ) : pitch ? (
          <>
            <p className="text-sm font-medium">{pitch.headline}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Offres du pitch">
              {shown.map((r) => (
                <li key={r.id}>
                  <Badge variant={r.status === "ACCEPTED" ? "success" : r.role === "MAIN" ? "default" : "outline"} className="font-medium">
                    {r.status === "ACCEPTED" && <Check className="h-3 w-3" aria-hidden="true" />}
                    {r.offer.name}
                  </Badge>
                </li>
              ))}
            </ul>
            {onOpenFull && (
              <Button variant="outline" size="sm" onClick={onOpenFull}>
                Voir le pitch et le script <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {data.candidates.length} offre{data.candidates.length > 1 ? "s" : ""} du catalogue {data.candidates.length > 1 ? "répondent" : "répond"} à l’audit : {data.candidates.map((c) => c.name).join(", ")}.
            </p>
            {data.canRun && (
              <Button size="sm" onClick={start} loading={busy}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Préparer le pitch
              </Button>
            )}
          </>
        )}
      </Card>
    )
  }

  const Box = embedded ? "div" : Card
  const box = embedded ? "" : "p-4"
  // In the tabs, the tab says what this is: the header only shows when it has a date or an action.
  const header = (!embedded || pitch) && (
    <div className="flex min-h-8 flex-wrap items-center gap-2">
      {!embedded && (
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Target className="h-4 w-4" aria-hidden="true" /> Offres suggérées
        </h3>
      )}
      {pitch && <span className="text-xs text-muted-foreground">Pitch du {day.format(new Date(pitch.createdAt))}</span>}
      {pitch && data?.canRun && !running && data.candidates.length > 0 && (
        <Button size="sm" variant="ghost" className="ml-auto" onClick={start} loading={busy} title="Le Conseiller reprend l’audit actuel et le catalogue : quelques centimes.">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refaire le pitch
        </Button>
      )}
    </div>
  )

  if (current?.error) {
    return (
      <Box className={cn("space-y-2", box)}>
        {header}
        <p className="text-sm text-destructive-text">{current.error}</p>
      </Box>
    )
  }
  if (!data) {
    return (
      <Box className={cn("space-y-2", box)}>
        {header}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
        </p>
      </Box>
    )
  }

  const progress = running && (
    <div role="status" className="space-y-1 rounded-lg bg-muted p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {data.run!.status === "QUEUED" ? "En file d’attente" : data.run!.status === "RUNNING" ? "Le Conseiller offres prépare le pitch" : RUN_STATUS_LABELS[data.run!.status]}
      </p>
      <p className="text-muted-foreground">Classement des offres candidates, argumentaire appuyé sur les preuves de l’audit, script d’appel et angle d’email. Comptez une minute.</p>
      {!data.workerOnline && <p className="text-warning">Le worker IA est hors ligne : le pitch attend son retour.</p>}
      {data.run!.error && <p className="text-muted-foreground">Dernière tentative : {data.run!.error}</p>}
    </div>
  )
  const failure = !running && data.lastFailure && (
    <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Le dernier pitch n’a pas abouti ({day.format(new Date(data.lastFailure.at))}) : {data.lastFailure.error}
      </span>
    </p>
  )

  if (!pitch) {
    let body: React.ReactNode = null
    if (!data.audit) {
      body = (
        <Hint>
          <p>Les offres partent de l’audit : chaque suggestion s’appuie sur ses constats et leurs preuves.</p>
          {onShowAudit && (
            <Button size="sm" variant="outline" onClick={onShowAudit}>
              Aller à l’audit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </Hint>
      )
    } else if (!data.activeOffers) {
      body = (
        <Hint icon={CircleAlert}>
          <p>Aucune offre n’est encore active dans le catalogue : le Conseiller ne recommande que des offres validées.</p>
          {data.canManageOffers ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/app/agents?tab=offers">
                Valider le catalogue <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <p className="text-muted-foreground">Le propriétaire ou un manager doit d’abord les vérifier et les activer.</p>
          )}
        </Hint>
      )
    } else if (!data.candidates.length) {
      body = (
        <Hint>
          <p>Aucune offre active ne répond aux signaux de cet audit.</p>
          <p className="text-muted-foreground">Chaque offre du catalogue liste les signaux qui la justifient : complétez-les dans Agents IA › Offres si une offre devrait convenir.</p>
        </Hint>
      )
    } else if (!running) {
      body = (
        <div className="space-y-3">
          <p className="text-sm">
            D’après l’audit, {data.candidates.length} offre{data.candidates.length > 1 ? "s" : ""} du catalogue {data.candidates.length > 1 ? "répondent" : "répond"} à ses signaux :
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Offres candidates">
            {data.candidates.map((c) => (
              <li key={c.slug}>
                <Badge variant="outline" className="font-medium" title={c.signals.join(" · ")}>
                  {c.name}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Le Conseiller offres les classe, argumente chacune avec les preuves de l’audit, compose un pack réaliste et prépare votre appel de 15 minutes. Quelques centimes, pris sur votre quota du jour.</p>
          {data.canRun && (
            <Button onClick={start} loading={busy}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Préparer le pitch
            </Button>
          )}
          {!data.audit.fresh && <p className="text-xs text-warning">L’audit a plus de 30 jours : refaites-le d’abord si le site a changé.</p>}
        </div>
      )
    }
    return (
      <Box className={cn("space-y-3", box)}>
        {header}
        {progress}
        {failure}
        {body}
        {!data.configured && (
          <p className="flex items-start gap-2 text-sm text-warning">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            La passerelle IA n’est pas encore branchée sur ce serveur.
          </p>
        )}
      </Box>
    )
  }

  const groups = [
    { title: "Pack proposé", list: pitch.recommendations.filter((r) => r.role === "MAIN" || r.role === "COMPLEMENT") },
    { title: "Offre d’entrée", list: pitch.recommendations.filter((r) => r.role === "ENTRY") },
    { title: "Pour plus tard", list: pitch.recommendations.filter((r) => r.role === "LATER") },
  ].filter((g) => g.list.length)
  return (
    <Box className={cn("space-y-4", box)}>
      {header}
      {progress}
      {failure}
      {pitch.stale && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Ce pitch a été préparé sur un audit précédent.{data.canRun && data.candidates.length > 0 ? " Refaites-le pour qu’il suive l’audit actuel." : ""}</span>
        </p>
      )}
      <div className="space-y-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
        <p className="border-l-4 border-primary pl-3 text-base font-semibold leading-snug">{pitch.headline}</p>
        {pitch.pack.names.length > 0 && (
          <p className="text-sm">
            <span className="font-medium">{pitch.pack.names.join(" + ")}</span>
            {pitch.pack.budget && <span className="tabular-nums text-muted-foreground"> · {pitch.pack.budget}</span>}
          </p>
        )}
      </div>
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h4>
          <ol className="space-y-2">
            {g.list.map((r) => (
              <RecommendationItem key={r.id} rec={r} evidence={evidence} canDecide={data.canDecide} busy={deciding === r.id} locked={!!deciding} onDecide={(status, reason) => decide(r, status, reason)} />
            ))}
          </ol>
        </section>
      ))}
      <CallScript pitch={pitch} evidence={evidence} />
      {pitch.email && (
        <section aria-labelledby={`email-${pitch.id}`} className="space-y-1.5 rounded-xl border p-3 text-sm">
          <div className="flex items-center gap-2">
            <h4 id={`email-${pitch.id}`} className="flex items-center gap-2 font-semibold">
              <Mail className="h-4 w-4" aria-hidden="true" /> Angle du premier email
            </h4>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => copy(`Objet : ${pitch.email!.subject}\n\n${pitch.email!.angle}`, "Angle d’email")}>
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /> Copier
            </Button>
          </div>
          <p>
            <span className="text-muted-foreground">Objet : </span>
            <span className="font-medium">{pitch.email.subject}</span>
          </p>
          <p>
            {pitch.email.angle}
            <EvidenceChips ids={pitch.email.evidence} evidence={evidence} />
          </p>
        </section>
      )}
      {pitch.notes.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Laissé de côté ({pitch.notes.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {pitch.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        Préparé par le Conseiller offres{pitch.model && ` (${modelLabel(pitch.model)})`}
        {pitch.createdBy && ` pour ${pitch.createdBy}`} · coût {formatEur(pitch.costEur)} · les prix sont ceux du catalogue, le devis final revient au closer.
      </p>
    </Box>
  )
}
