"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { CheckCircle2, CircleAlert } from "lucide-react"
import { toast } from "sonner"
import { ApprovalCard } from "@/components/crm/ai/approval-card"
import { ModelProof, proofKey, proofReady, useModelProofs } from "@/components/crm/ai/model-proof"
import { RunCard } from "@/components/crm/ai/run-card"
import { SpendList } from "@/components/crm/ai/spend-list"
import { useLiveRuns } from "@/components/crm/ai/use-live-runs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ACTIVE_STATUSES, formatEur } from "@/features/ai/labels"
import type { ApprovalView } from "@/features/ai/approvals"
import type { RunView } from "@/features/ai/runs"
import type { AiSettingsView } from "@/features/ai/settings"
import type { AiRole } from "@/lib/ai/models"
import { api } from "../../leads/api"

const monthName = (key: string) => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`))

const seen = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export function AiSettings({ userId, initial, approvals: initialApprovals, runs: initialRuns }: { userId: string; initial: AiSettingsView; approvals: ApprovalView[]; runs: RunView[] }) {
  const router = useRouter()
  useLiveRuns(userId, initialRuns.some((r) => ACTIVE_STATUSES.includes(r.status)) || initialApprovals.length > 0)
  const [base, setBase] = useState(initial)
  const [view, setView] = useState(initial)
  // A refresh brings new server figures (after a decision or a cancel): show them.
  if (base !== initial) {
    setBase(initial)
    setView(initial)
  }
  const [models, setModels] = useState<Record<AiRole, string>>(() => Object.fromEntries(initial.roles.map((r) => [r.id, r.model])) as Record<AiRole, string>)
  const [monthlyCap, setMonthlyCap] = useState(String(initial.caps.monthlyCapEur))
  const [dailyCap, setDailyCap] = useState(String(initial.caps.userDailyCapEur))
  const [rate, setRate] = useState(String(initial.caps.eurPerUsd))
  const [missionCap, setMissionCap] = useState(String(initial.caps.missionCapEur))
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  // A role moved to a model other than its own needs that model's evaluation first (E27).
  const [confirmed, setConfirmed] = useState<Partial<Record<AiRole, boolean>>>({})
  const changes = view.roles.filter((r) => models[r.id] !== r.model && models[r.id] !== r.defaultModel)
  const proofs = useModelProofs(changes.map((r) => ({ role: r.id, model: models[r.id] })))
  const proofOf = (r: (typeof changes)[number]) => proofs[proofKey({ role: r.id, model: models[r.id] })]
  const unproven = changes.filter((r) => !proofReady(proofOf(r), !!confirmed[r.id]))

  const month = view.month
  const tone = month.percent >= 100 ? "bg-destructive" : month.percent >= 80 ? "bg-warning" : "bg-primary"
  const dirty =
    view.roles.some((r) => models[r.id] !== r.model) ||
    Number(monthlyCap) !== view.caps.monthlyCapEur ||
    Number(dailyCap) !== view.caps.userDailyCapEur ||
    Number(rate) !== view.caps.eurPerUsd ||
    Number(missionCap) !== view.caps.missionCapEur

  async function save() {
    setBusy(true)
    try {
      const next = await api<AiSettingsView>("/api/ai/settings", {
        method: "PUT",
        body: JSON.stringify({ roleModels: models, monthlyCapEur: Number(monthlyCap), userDailyCapEur: Number(dailyCap), eurPerUsd: Number(rate), missionCapEur: Number(missionCap), acceptRegressions: changes.filter((r) => confirmed[r.id]).map((r) => r.id) }),
      })
      setView(next)
      toast.success("Réglages IA enregistrés")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l’enregistrement")
    } finally {
      setBusy(false)
    }
  }

  async function decide(id: string, approve: boolean, note?: string) {
    setActing(id)
    try {
      await api(`/api/ai/approvals/${id}`, { method: "POST", body: JSON.stringify({ decision: approve ? "approve" : "reject", note }) })
      toast.success(approve ? "Action approuvée : l’agent reprend" : "Action refusée")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setActing(null)
    }
  }

  async function cancel(id: string) {
    setActing(id)
    try {
      await api(`/api/ai/runs/${id}/cancel`, { method: "POST" })
      toast.success("Exécution arrêtée")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-8">
      {view.configured ? (
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          Passerelle IA connectée. Seuls les fournisseurs qui n’entraînent pas leurs modèles sur vos données sont utilisés.
        </p>
      ) : (
        <Card className="flex items-start gap-3 border-warning/40 p-4 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            L’IA n’est pas encore branchée : ajoutez la clé <code className="font-mono">AI_GATEWAY_API_KEY</code> (Vercel AI Gateway) aux variables d’environnement du site. Les réglages ci-dessous s’enregistrent déjà.
          </span>
        </Card>
      )}
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {view.worker.online ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
        {view.worker.online
          ? `Worker IA en ligne (version ${view.worker.version}) · ${view.worker.running} en cours`
          : view.worker.lastSeen
            ? `Worker IA hors ligne depuis le ${seen.format(new Date(view.worker.lastSeen))} : les tâches longues attendent son retour.`
            : "Worker IA pas encore installé : les tâches longues (audits, maquettes) attendront son démarrage."}
        {view.worker.queued > 0 && <Badge variant="outline">{view.worker.queued} en file</Badge>}
      </p>

      <section aria-labelledby="ai-month" className="space-y-4">
        <h2 id="ai-month" className="text-lg font-bold">
          Consommation de {monthName(month.key)}
        </h2>
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p>
              <span className="text-3xl font-extrabold tabular-nums">{formatEur(month.spentEur)}</span>
              <span className="ml-2 text-muted-foreground">sur {formatEur(month.capEur)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Vous aujourd’hui : <span className="font-medium text-foreground tabular-nums">{formatEur(view.me.todayEur)}</span> sur {formatEur(view.me.quotaEur)}
            </p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Part du plafond mensuel dépensée" aria-valuenow={Math.round(month.percent)} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(month.percent, 100)}%` }} />
          </div>
          {month.heldEur > 0 && <p className="text-sm text-muted-foreground">{formatEur(month.heldEur)} réservés par des exécutions en cours.</p>}
          {month.spentEur === 0 && month.heldEur === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune dépense ce mois-ci. Les alertes partent à 50 %, 80 % et 100 % du plafond.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <SpendList title="Par agent" lines={month.byAgent} />
              <SpendList title="Par modèle" lines={month.byModel} />
              {month.byUser && <SpendList title="Par personne" lines={month.byUser} />}
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="ai-models" className="space-y-4">
        <div>
          <h2 id="ai-models" className="text-lg font-bold">
            Modèles par rôle
          </h2>
          <p className="text-sm text-muted-foreground">Les agents demandent un rôle, jamais un modèle : changer un modèle ici s’applique à tous, sans toucher au code. Prix par million de jetons (entrée / sortie).</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {view.roles.map((role) => (
            <Card key={role.id} className="space-y-3 p-4">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {role.label}
                  {role.kind === "decision" && <Badge variant="info">Décision</Badge>}
                  {!role.isDefault && <Badge variant="outline">Modifié</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
              {view.canManage ? (
                <Select value={models[role.id]} onValueChange={(v) => setModels((m) => ({ ...m, [role.id]: v }))}>
                  <SelectTrigger aria-label={`Modèle pour « ${role.label} »`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {role.choices.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label} · {c.price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium">{role.modelLabel}</p>
              )}
              <p className="text-xs text-muted-foreground">Secours : {role.fallbacks.map((f) => f.label).join(", ") || "aucun"}</p>
              {changes.includes(role) && <ModelProof proof={proofOf(role)} confirmed={!!confirmed[role.id]} onConfirm={(v) => setConfirmed((c) => ({ ...c, [role.id]: v }))} />}
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="ai-caps" className="space-y-4">
        <h2 id="ai-caps" className="text-lg font-bold">
          Plafonds
        </h2>
        <Card className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-monthly">Plafond mensuel (€)</Label>
            <Input id="ai-monthly" type="number" min={0} max={10000} step={1} value={monthlyCap} onChange={(e) => setMonthlyCap(e.target.value)} disabled={!view.canManage} />
            <p className="text-xs text-muted-foreground">Au-delà, l’IA se met en pause jusqu’au mois suivant.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-daily">Quota par personne et par jour (€)</Label>
            <Input id="ai-daily" type="number" min={0} max={1000} step={0.5} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} disabled={!view.canManage} />
            <p className="text-xs text-muted-foreground">Dans la limite du plafond mensuel.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-mission">Plafond par mission (€)</Label>
            <Input id="ai-mission" type="number" min={0} max={100} step={0.5} value={missionCap} onChange={(e) => setMissionCap(e.target.value)} disabled={!view.canManage} />
            <p className="text-xs text-muted-foreground">Au-delà, la personne confirme une seconde fois avant de lancer.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-rate">Taux euro pour un dollar</Label>
            <Input id="ai-rate" type="number" min={0.5} max={2} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} disabled={!view.canManage} />
            <p className="text-xs text-muted-foreground">Les prix des fournisseurs sont en dollars.</p>
          </div>
        </Card>
        {view.canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {unproven.length > 0 && <p className="text-sm text-muted-foreground">Chaque changement de modèle s’appuie sur une évaluation chiffrée : voir sous {unproven.map((r) => `« ${r.label} »`).join(", ")}.</p>}
            <Button onClick={save} disabled={!dirty || busy || unproven.length > 0}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Seul le propriétaire modifie ces réglages.</p>
        )}
      </section>

      <section aria-labelledby="ai-approvals" className="space-y-3">
        <h2 id="ai-approvals" className="text-lg font-bold">
          À valider
        </h2>
        {initialApprovals.length ? (
          initialApprovals.map((a) => <ApprovalCard key={a.id} approval={a} onDecide={decide} busy={acting === a.id} />)
        ) : (
          <p className="text-sm text-muted-foreground">Rien à valider. Un email, une recherche ou un lien envoyé au prospect par un agent attendra ici votre accord.</p>
        )}
      </section>

      <section aria-labelledby="ai-runs" className="space-y-3">
        <h2 id="ai-runs" className="text-lg font-bold">
          Exécutions récentes
        </h2>
        {initialRuns.length ? (
          initialRuns.map((r) => <RunCard key={r.id} run={r} onCancel={cancel} busy={acting === r.id} />)
        ) : (
          <p className="text-sm text-muted-foreground">Aucune exécution pour l’instant.</p>
        )}
      </section>
    </div>
  )
}
