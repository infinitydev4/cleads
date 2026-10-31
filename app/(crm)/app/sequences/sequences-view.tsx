"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Archive, ChevronDown, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/crm/empty-state"
import { FormField } from "@/components/crm/form-field"
import { formatDateTime } from "@/lib/crm/format"
import { cn } from "@/lib/utils"
import type { EnrollmentView, SequenceView } from "@/features/outreach/sequences"
import { MAX_DELAY_DAYS, MAX_STEPS, STOP_LABELS } from "@/features/outreach/sequence-rules"
import { VARIABLES, templateErrors } from "@/features/outreach/template"
import { api } from "../leads/api"

const NEW_STEP = { delayDays: 3, subject: "", body: "" }
const FIRST_STEP = { delayDays: 0, subject: "{{entreprise}} : une question rapide", body: "Bonjour {{prenom|Madame, Monsieur}},\n\nJ’ai vu que {{entreprise}} intervient à {{ville|votre secteur}}. Nous aidons les artisans à recevoir plus de demandes de devis depuis Google, sans publicité.\n\nSeriez-vous d’accord pour en parler 15 minutes cette semaine ?" }

/** "J0, J+3, J+8": when each message leaves, counted from enrollment. */
function schedule(steps: SequenceView["steps"]) {
  let day = 0
  return steps.map((s, i) => (i === 0 ? "J0" : `J+${(day += s.delayDays)}`)).join(", ")
}

export function SequencesView({ initial }: { initial: SequenceView[] }) {
  const [sequences, setSequences] = useState(initial)
  const [editing, setEditing] = useState<SequenceView | "new" | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function reload() {
    setSequences((await api<{ sequences: SequenceView[] }>("/api/sequences")).sequences)
  }

  async function act(id: string, label: string, fn: () => Promise<unknown>) {
    setBusy(id)
    try {
      await fn()
      await reload()
      toast.success(label)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const archive = (s: SequenceView) => {
    const running = s.stats.active
    if (!window.confirm(`Archiver « ${s.name} » ?${running ? ` Les ${running} fiche(s) en cours seront arrêtées (plus aucun message ne leur partira).` : ""} L’historique des envois est conservé.`)) return
    act(s.id, "Séquence archivée", () => api(`/api/sequences/${s.id}`, { method: "DELETE" }))
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
        Les messages partent du lundi au vendredi, de 9 h à 17 h 30 (heure de Paris), au plus deux par boîte toutes les 5 minutes, à une minute au hasard. Une séquence s’arrête seule dès que la personne répond, se désinscrit, que l’adresse rebondit ou qu’elle signale un spam, et une boîte dont les rebonds ou les désinscriptions montent trop est mise en pause.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle séquence</Button>
      </div>

      {sequences.length === 0 ? (
        <EmptyState art="target" title="Aucune séquence" description="Créez un premier message et ses relances, puis inscrivez-y des prospects depuis la page Prospects (cochez des fiches, « Inscrire dans une séquence »)." />
      ) : (
        <ul className="space-y-3">
          {sequences.map((s) => {
            const expanded = open === s.id
            return (
              <li key={s.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">{s.name} {s.status === "PAUSED" && <Badge variant="warning">En pause</Badge>}</p>
                      <p className="text-sm text-muted-foreground">{s.steps.length} message{s.steps.length > 1 ? "s" : ""} · {schedule(s.steps)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" aria-hidden="true" /> Modifier</Button>
                      {s.status === "ACTIVE" ? (
                        <Button variant="outline" size="sm" loading={busy === s.id} onClick={() => act(s.id, "Séquence en pause", () => api(`/api/sequences/${s.id}`, { method: "PATCH", body: JSON.stringify({ status: "PAUSED" }) }))}><Pause className="h-4 w-4" aria-hidden="true" /> Pause</Button>
                      ) : (
                        <Button variant="outline" size="sm" loading={busy === s.id} onClick={() => act(s.id, "Séquence reprise", () => api(`/api/sequences/${s.id}`, { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) }))}><Play className="h-4 w-4" aria-hidden="true" /> Reprendre</Button>
                      )}
                      <Button variant="ghost" size="sm" aria-label={`Archiver ${s.name}`} onClick={() => archive(s)}><Archive className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span><span className="font-semibold">{s.stats.active}</span> en cours</span>
                    <span><span className="font-semibold">{s.stats.sent}</span> envoyés</span>
                    <span><span className="font-semibold">{s.stats.replied}</span> réponses</span>
                    <span><span className="font-semibold">{s.stats.completed}</span> terminées</span>
                    <span><span className="font-semibold">{s.stats.stopped}</span> arrêtées (rebond, désinscription…)</span>
                  </div>
                  <button type="button" className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)}>
                    Fiches inscrites <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
                  </button>
                  {expanded && <Enrollments sequenceId={s.id} onChange={reload} />}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <SequenceDialog sequence={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload() }} />}
    </div>
  )
}

function stateText(e: EnrollmentView) {
  if (e.status === "ACTIVE") return `Message ${Math.min(e.currentStep + 1, e.totalSteps)} sur ${e.totalSteps}${e.nextAt ? ` · prévu le ${formatDateTime(e.nextAt)}` : ""}`
  if (e.status === "COMPLETED") return `Terminée (${e.totalSteps} messages envoyés)`
  return `Arrêtée : ${e.stoppedReason ? STOP_LABELS[e.stoppedReason] : "—"}`
}

function Enrollments({ sequenceId, onChange }: { sequenceId: string; onChange: () => Promise<void> }) {
  const [items, setItems] = useState<EnrollmentView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [version, setVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    api<{ enrollments: EnrollmentView[] }>(`/api/sequences/${sequenceId}`)
      .then((r) => !cancelled && setItems(r.enrollments))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Échec"))
    return () => {
      cancelled = true
    }
  }, [sequenceId, version])

  async function stop(e: EnrollmentView) {
    if (!window.confirm(`Arrêter les relances automatiques pour ${e.leadName ?? e.email ?? "cette fiche"} ?`)) return
    try {
      await api(`/api/enrollments/${e.id}`, { method: "DELETE" })
      setVersion((v) => v + 1)
      await onChange()
      toast.success("Relances arrêtées")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec")
    }
  }

  if (error) return <p role="status" className="text-sm text-destructive-text">{error}</p>
  if (items === null) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Aucune fiche inscrite pour l’instant.</p>
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <div className="min-w-0">
            <Link className="font-medium underline-offset-4 hover:underline" href={`/app/leads/${e.leadId}`}>{e.leadName ?? e.email ?? "Fiche"}</Link>
            <p className="truncate text-xs text-muted-foreground">{e.email ? `${e.email} · ` : ""}depuis {e.mailbox}{e.enrolledByName ? ` · inscrit par ${e.enrolledByName}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={e.status === "ACTIVE" ? "info" : e.status === "COMPLETED" ? "success" : e.stoppedReason === "REPLIED" ? "success" : "outline"}>{stateText(e)}</Badge>
            {e.status === "ACTIVE" && <Button variant="ghost" size="sm" aria-label="Arrêter les relances" onClick={() => stop(e)}><X className="h-4 w-4" aria-hidden="true" /></Button>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function SequenceDialog({ sequence, onClose, onSaved }: { sequence: SequenceView | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(sequence?.name ?? "")
  const [steps, setSteps] = useState(sequence?.steps ?? [FIRST_STEP, { ...NEW_STEP, body: "Je me permets de relancer mon message précédent. Seriez-vous disponible cette semaine pour un court échange ?" }])
  const [focus, setFocus] = useState(0)
  const [busy, setBusy] = useState(false)
  const errors = steps.flatMap((s) => [...templateErrors(s.subject), ...templateErrors(s.body)])
  const set = (i: number, patch: Partial<(typeof steps)[number]>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (errors.length) return
    setBusy(true)
    try {
      await api(sequence ? `/api/sequences/${sequence.id}` : "/api/sequences", { method: sequence ? "PATCH" : "POST", body: JSON.stringify({ name, steps }) })
      toast.success(sequence ? "Séquence enregistrée" : "Séquence créée")
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <DialogHeader>
            <DialogTitle>{sequence ? "Modifier la séquence" : "Nouvelle séquence"}</DialogTitle>
            <DialogDescription>
              Texte brut. La signature de la boîte et le pied de page (origine de l’adresse, désinscription) sont ajoutés à chaque message. {sequence ? "Les fiches déjà en cours suivront les nouvelles étapes à partir de leur prochain message." : ""}
            </DialogDescription>
          </DialogHeader>
          <FormField label="Nom de la séquence" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artisans : 3 messages" /></FormField>

          {steps.map((s, i) => (
            <fieldset key={i} className="space-y-3 rounded-xl border p-3" onFocus={() => setFocus(i)}>
              <legend className="px-1 text-sm font-semibold">Message {i + 1}</legend>
              {i > 0 && (
                <div className="flex items-end gap-3">
                  <FormField label="Envoyé après (jours)" required><Input type="number" min={1} max={MAX_DELAY_DAYS} value={s.delayDays} onChange={(e) => set(i, { delayDays: Number(e.target.value) })} className="w-28" /></FormField>
                  <p className="pb-2 text-xs text-muted-foreground">après le message précédent, un jour ouvré</p>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" aria-label={`Retirer le message ${i + 1}`} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </div>
              )}
              <FormField label="Objet" required={i === 0} hint={i > 0 ? "Laissez vide pour répondre dans le même fil (« Re: … »), ce qui se lit comme une vraie relance." : undefined}>
                <Input value={s.subject} onChange={(e) => set(i, { subject: e.target.value })} maxLength={150} />
              </FormField>
              <FormField label="Message" required><Textarea value={s.body} onChange={(e) => set(i, { body: e.target.value })} rows={i === 0 ? 8 : 5} /></FormField>
            </fieldset>
          ))}

          {steps.length < MAX_STEPS && (
            <Button type="button" variant="outline" size="sm" onClick={() => setSteps((all) => [...all, { ...NEW_STEP }])}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une relance</Button>
          )}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Insérer une variable dans le message {focus + 1} : {"{{prenom|Madame, Monsieur}}"} remplace une valeur absente par le texte après le |. Sans valeur de secours, la fiche n’est pas inscrite.</p>
            <div className="flex flex-wrap gap-1.5" aria-label="Insérer une variable">
              {Object.entries(VARIABLES).map(([v, label]) => (
                <Button key={v} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" title={label} onClick={() => set(focus, { body: `${steps[focus]?.body ?? ""}{{${v}}}` })}>{`{{${v}}}`}</Button>
              ))}
            </div>
          </div>
          {errors[0] && <p role="alert" className="text-sm text-destructive-text">{errors[0]}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={busy} disabled={!!errors.length || name.trim().length < 2}>{sequence ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
