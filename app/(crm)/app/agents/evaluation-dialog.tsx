"use client"

import { useState } from "react"
import { FlaskConical } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatEur } from "@/features/ai/labels"
import { TEAM_MIN_CASES, type EvaluationSource, type Sample } from "@/features/quality/labels"
import type { EvaluationView, SuiteView } from "@/features/quality/service"
import type { AiRole } from "@/lib/ai/models"
import { api } from "../leads/api"

const KIND_LABELS = { decision: "Décision", language: "Lecture", rules: "Sans modèle" } as const
/** Three models at most next to the one in service. */
const MAX_EXTRA = 3

export interface EvaluationPreset {
  role?: AiRole
  model?: string
}

/**
 * Launching an evaluation (E27): the role whose model is compared, the models measured next to the one in service, the
 * sample, and the cost before anything runs. The run reserves the estimate and a margin; it is billed to the person.
 */
export function EvaluationDialog({ suite, preset, onClose, onStarted }: { suite: SuiteView; preset?: EvaluationPreset; onClose: () => void; onStarted: (e: EvaluationView) => void }) {
  const [role, setRole] = useState<AiRole>(suite.roles.find((r) => r.id === preset?.role)?.id ?? suite.roles[0].id)
  const option = suite.roles.find((r) => r.id === role) ?? suite.roles[0]
  const [picked, setPicked] = useState<string[]>(() => (preset?.model && preset.model !== option.current && option.contenders.some((c) => c.id === preset.model) ? [preset.model] : []))
  const [sample, setSample] = useState<Sample>("quick")
  const [source, setSource] = useState<EvaluationSource>("reference")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const team = suite.cases.team ?? 0
  const cases = source === "team" ? team : sample === "quick" ? suite.cases.quick : suite.cases.full
  const measured = [option.current, ...picked]
  const perCase = measured.reduce((s, id) => s + (option.contenders.find((c) => c.id === id)?.perCaseMicros ?? 0), 0)
  const estimate = (perCase * cases) / 1_000_000

  function changeRole(next: string) {
    setRole(next as AiRole)
    setPicked([])
  }

  function toggle(id: string, on: boolean) {
    setPicked((list) => (on ? [...list, id].slice(0, MAX_EXTRA) : list.filter((x) => x !== id)))
  }

  async function launch() {
    setBusy(true)
    setError(undefined)
    try {
      const view = await api<EvaluationView>("/api/ai/evaluations", { method: "POST", body: JSON.stringify({ suite: suite.id, role, contenders: picked, sample, source }) })
      toast.success(`Évaluation de ${suite.info.label} lancée : le worker la prend en charge`)
      onStarted(view)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec du lancement")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Évaluer : {suite.info.label}
          </DialogTitle>
          <DialogDescription>
            {suite.info.set}. Le modèle en service est toujours mesuré, avec ceux que vous ajoutez, sur les mêmes cas : « {suite.info.score} ».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {suite.roles.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="eval-role">Étape comparée</Label>
              <Select value={role} onValueChange={changeRole}>
                <SelectTrigger id="eval-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {suite.roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.id === suite.agentRole ? `L’analyse (rôle « ${r.label} »)` : `La lecture du site (rôle « ${r.label} »)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Modèles mesurés</legend>
            <ul className="divide-y rounded-lg border">
              {option.contenders.map((c) => {
                const inService = c.id === option.current
                const on = inService || picked.includes(c.id)
                const full = !on && picked.length >= MAX_EXTRA
                return (
                  <li key={c.id}>
                    <label className={cn("flex items-center gap-3 px-3 py-2 text-sm", full ? "opacity-50" : "cursor-pointer")}>
                      <Checkbox checked={on} disabled={inService || full} onCheckedChange={(v) => toggle(c.id, v === true)} aria-label={c.label} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{c.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.price === "gratuit" ? "Gratuit" : `${c.price} par million de jetons`} · ≈ {formatEur(c.perCaseMicros / 1_000_000)} par cas
                        </span>
                      </span>
                      {inService ? <Badge variant="info">En service</Badge> : suite.info.decision && <Badge variant="outline">{KIND_LABELS[c.kind]}</Badge>}
                    </label>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">Jusqu’à {MAX_EXTRA} modèles à côté de celui en service. Ce qu’un juge note (emails, pages) l’est toujours par le même modèle, facturé à part.</p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Cas</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["reference", "quick", "Échantillon rapide", `${suite.cases.quick} cas, les pièges compris`],
                  ["reference", "full", "Jeu complet", `${suite.cases.full} cas`],
                  ...(suite.info.team ? ([["team", "full", "Étiquettes de l’équipe", team >= TEAM_MIN_CASES ? `${team} cas classés dans le CRM` : `${team} cas : ${TEAM_MIN_CASES} au moins`]] as const) : []),
                ] as const
              ).map(([src, smp, title, hint]) => {
                const active = source === src && (src === "team" || sample === smp)
                const disabled = src === "team" && team < TEAM_MIN_CASES
                return (
                  <button
                    key={`${src}-${smp}`}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => {
                      setSource(src)
                      setSample(smp)
                    }}
                    className={cn("rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted")}
                  >
                    <span className="block font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-muted p-3">
            <p className="text-sm">
              Coût estimé <span className="text-lg font-bold tabular-nums">≈ {formatEur(estimate)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {measured.length} modèle{measured.length > 1 ? "s" : ""} × {cases} cas · facturé sur votre quota du jour
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={launch} loading={busy} disabled={!cases}>
            Lancer pour ≈ {formatEur(estimate)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
