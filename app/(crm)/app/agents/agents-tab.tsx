"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Bot, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { ModelProof, proofKey, proofReady, useModelProofs } from "@/components/crm/ai/model-proof"
import { isSuiteId } from "@/features/quality/labels"
import { CHANGE_LABELS, formatEur } from "@/features/ai/labels"
import type { AgentView, AgentsPage } from "@/features/ai/definitions"
import type { SkillView } from "@/features/ai/skills/service"
import { api } from "../leads/api"

const MODE_LABELS = { ALWAYS: "Toujours", ON_DEMAND: "À la demande" } as const
const NONE = "NONE"
const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

function SkillChips({ agent }: { agent: AgentView }) {
  if (!agent.usesSkills) return <p className="text-sm text-muted-foreground">Décide sans consignes écrites : pas de skills.</p>
  if (!agent.skills.length) return <p className="text-sm text-muted-foreground">Aucun skill.</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {agent.skills.map((s) => (
        <Badge key={s.skillId} variant={s.mode === "ALWAYS" ? "info" : "outline"} className={s.archived ? "line-through opacity-60" : undefined} title={`${MODE_LABELS[s.mode]}${s.archived ? " · archivé" : ""}`}>
          {s.name}
        </Badge>
      ))}
    </div>
  )
}

export function AgentsTab({ page, skills }: { page: AgentsPage; skills: SkillView[] }) {
  const [editing, setEditing] = useState<AgentView | null>(null)
  const canEdit = page.canEditInstructions || page.canEditSettings
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Chaque agent a un rôle d’expert écrit dans le code. L’équipe y ajoute ses consignes et ses skills ; le propriétaire choisit un modèle moins cher ou des limites plus basses. Les skills en couleur sont toujours dans ses consignes, les autres sont lus à la demande.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {page.agents.map((a) => (
          <Card key={a.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {a.label}
                  {!a.enabled ? <Badge variant="destructive">Désactivé</Badge> : !a.available && <Badge variant="neutral">Bientôt</Badge>}
                  {a.version > 0 && <Badge variant="outline">v{a.version}</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">{a.mission}</p>
              </div>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Configurer
                </Button>
              )}
            </div>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Modèle</dt>
              <dd>
                {a.modelRoleLabel} · {a.model}
              </dd>
              <dt className="text-muted-foreground">Limites</dt>
              <dd className="tabular-nums">
                {a.maxSteps} étape{a.maxSteps > 1 ? "s" : ""} · {formatEur(a.maxCostEur)} par exécution
              </dd>
              <dt className="text-muted-foreground">Produit</dt>
              <dd>{a.output}</dd>
              <dt className="text-muted-foreground">Validation</dt>
              <dd>{a.approval}</dd>
            </dl>
            <SkillChips agent={a} />
            {a.instructions && (
              <p className="line-clamp-3 whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="font-medium">Consignes de l’équipe : </span>
                {a.instructions}
              </p>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Rôle d’expert et outils</summary>
              <p className="mt-2 whitespace-pre-line">{a.persona}</p>
              <p className="mt-2 text-muted-foreground">
                Outils : <span className="font-mono text-xs">{a.tools.join(", ")}</span>
              </p>
            </details>
          </Card>
        ))}
      </div>
      {editing && <AgentDialog agent={editing} skills={skills} page={page} onClose={() => setEditing(null)} />}
    </>
  )
}

function AgentDialog({ agent, skills, page, onClose }: { agent: AgentView; skills: SkillView[]; page: AgentsPage; onClose: () => void }) {
  const router = useRouter()
  const initialModes = Object.fromEntries(agent.skills.filter((s) => !s.archived).map((s) => [s.skillId, s.mode])) as Record<string, "ALWAYS" | "ON_DEMAND">
  const [instructions, setInstructions] = useState(agent.instructions ?? "")
  const [modes, setModes] = useState(initialModes)
  const [modelRole, setModelRole] = useState(agent.modelRole)
  const [maxSteps, setMaxSteps] = useState(String(agent.maxSteps))
  const [maxCost, setMaxCost] = useState(String(agent.maxCostEur))
  const [enabled, setEnabled] = useState(agent.enabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  // Another role means another model: an agent with an evaluation suite needs it measured first (E27).
  const [confirmed, setConfirmed] = useState(false)
  const target = agent.modelRoles.find((r) => r.id === modelRole)
  const current = agent.modelRoles.find((r) => r.id === agent.modelRole)
  const query = isSuiteId(agent.id) && modelRole !== agent.modelRole && modelRole !== agent.modelRoles[0]?.id && target?.model !== current?.model ? { agent: agent.id, role: modelRole } : null
  const proofs = useModelProofs(query ? [query] : [])
  const proof = query ? proofs[proofKey(query)] : undefined
  const blocked = !!query && !proofReady(proof, confirmed)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = {}
    if (page.canEditInstructions) {
      if (instructions.trim() !== (agent.instructions ?? "")) body.instructions = instructions.trim() || null
      const before = JSON.stringify(Object.entries(initialModes).sort())
      if (JSON.stringify(Object.entries(modes).sort()) !== before) body.skills = Object.entries(modes).map(([skillId, mode]) => ({ skillId, mode }))
    }
    if (page.canEditSettings) {
      if (modelRole !== agent.modelRole) body.modelRole = modelRole
      if (query && confirmed) body.acceptRegression = true
      if (Number(maxSteps) !== agent.maxSteps) body.maxSteps = Math.round(Number(maxSteps))
      if (Number(maxCost) !== agent.maxCostEur) body.maxCostEur = Number(maxCost)
      if (enabled !== agent.enabled) body.enabled = enabled
    }
    if (!Object.keys(body).length) return onClose()
    setBusy(true)
    setError(undefined)
    try {
      await api(`/api/ai/agents/${agent.id}`, { method: "PUT", body: JSON.stringify(body) })
      toast.success(`${agent.label} enregistré`)
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  const usable = skills.filter((s) => !s.archived)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={save} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Configurer : {agent.label}</DialogTitle>
            <DialogDescription>Ce que vous ajoutez complète son rôle d’expert sans le remplacer. Chaque enregistrement crée une version.</DialogDescription>
          </DialogHeader>

          <FormField label="Consignes de l’équipe" hint="Ton, priorités, interdits propres à votre agence. Elles ne peuvent pas lever les règles communes (preuves, validation humaine).">
            <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={4000} rows={5} disabled={!page.canEditInstructions} />
          </FormField>

          {agent.usesSkills && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Skills</legend>
              <p className="text-xs text-muted-foreground">« Toujours » : le skill entre dans ses consignes. « À la demande » : l’agent voit sa description et le lit quand il en a besoin.</p>
              <ul className="divide-y rounded-lg border">
                {usable.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm">{s.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{s.description}</p>
                    </div>
                    <Select
                      value={modes[s.id] ?? NONE}
                      onValueChange={(v) =>
                        setModes((m) => {
                          const next = { ...m }
                          if (v === NONE) delete next[s.id]
                          else next[s.id] = v as "ALWAYS" | "ON_DEMAND"
                          return next
                        })
                      }
                      disabled={!page.canEditInstructions}
                    >
                      <SelectTrigger className="w-40" aria-label={`Mode du skill ${s.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Non</SelectItem>
                        <SelectItem value="ALWAYS">Toujours</SelectItem>
                        <SelectItem value="ON_DEMAND">À la demande</SelectItem>
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Modèle et limites {page.canEditSettings ? "" : "(propriétaire)"}</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Rôle de modèle">
                {(props) => (
                  <Select value={modelRole} onValueChange={(v) => setModelRole(v as typeof modelRole)} disabled={!page.canEditSettings}>
                    <SelectTrigger {...props}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agent.modelRoles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label} · {r.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField label="Étapes au plus" hint={`${agent.codeLimits.maxSteps} au maximum`}>
                <Input type="number" min={1} max={agent.codeLimits.maxSteps} step={1} value={maxSteps} onChange={(e) => setMaxSteps(e.target.value)} disabled={!page.canEditSettings} />
              </FormField>
              <FormField label="Plafond par exécution (€)" hint={`${formatEur(agent.codeLimits.maxCostEur)} au maximum`}>
                <Input type="number" min={0.001} max={agent.codeLimits.maxCostEur} step={0.01} value={maxCost} onChange={(e) => setMaxCost(e.target.value)} disabled={!page.canEditSettings} />
              </FormField>
            </div>
            {query && <ModelProof proof={proof} confirmed={confirmed} onConfirm={setConfirmed} />}
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!page.canEditSettings} aria-label="Agent activé" />
              {enabled ? "Activé : l’équipe peut le lancer" : "Désactivé : personne ne peut le lancer"}
            </label>
          </fieldset>

          {agent.history.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Historique ({agent.history.length} dernière{agent.history.length > 1 ? "s" : ""} version{agent.history.length > 1 ? "s" : ""})</summary>
              <ul className="mt-2 space-y-1">
                {agent.history.map((h) => (
                  <li key={h.version} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">v{h.version}</span>
                    <span>{h.changes.map((c) => CHANGE_LABELS[c] ?? c).join(", ")}</span>
                    <span className="text-muted-foreground">
                      · {h.createdBy ?? "?"} · {when.format(new Date(h.createdAt))}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={busy} disabled={blocked}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
