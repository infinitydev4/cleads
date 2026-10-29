"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { DEAL_OWNER_ROLES, DISQUALIFY_REASONS, QUALIFICATION_LABELS } from "@/features/pipeline/rules"
import type { LeadDetail } from "@/features/leads/types"
import { cn } from "@/lib/utils"
import { api } from "./api"
import { personName, type Assignee } from "./filter-bar"

type Answers = NonNullable<LeadDetail["qualification"]>
const NONE = "__none__"

/** A short group of exclusive choices: native radios, so the arrow keys, Tab and screen readers behave as expected. */
function Choice<T extends string>({ name, legend, value, options, onChange }: { name: string; legend: string; value: T | undefined; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(options) as [T, string][]).map(([key, label]) => (
          <label key={key} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring", value === key ? "border-transparent bg-sidebar font-medium text-sidebar-foreground" : "bg-card hover:bg-accent")}>
            <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: LeadDetail
  assignees: Assignee[]
  onDone: (lead: LeadDetail) => void
}

/**
 * Guided qualification: four short questions, then qualify (and hand over to a closer), keep the answers, or disqualify
 * with a reason. Everything is reachable with the keyboard; Ctrl/Cmd+Enter qualifies.
 */
export function QualifyDialog({ open, onOpenChange, lead, assignees, onDone }: Props) {
  const [a, setA] = useState<Answers>(lead.qualification ?? {})
  const [amount, setAmount] = useState(lead.qualification?.budgetAmountCents ? String(lead.qualification.budgetAmountCents / 100) : "")
  const [closer, setCloser] = useState(NONE)
  const [disqualifying, setDisqualifying] = useState(false)
  const [reason, setReason] = useState<string>(DISQUALIFY_REASONS[0])
  const [detail, setDetail] = useState("")
  const [busy, setBusy] = useState<"save" | "qualify" | "disqualify" | null>(null)
  const [error, setError] = useState<string>()
  const closers = assignees.filter((x) => (DEAL_OWNER_ROLES as readonly string[]).includes(x.role))

  const answers = () => ({
    ...(a.need?.trim() ? { need: a.need.trim() } : {}),
    ...(a.budget ? { budget: a.budget } : {}),
    ...(a.budget === "yes" && Number(amount.replace(",", ".")) > 0 ? { budgetAmountCents: Math.round(Number(amount.replace(",", ".")) * 100) } : {}),
    ...(a.authority ? { authority: a.authority } : {}),
    ...(a.timing ? { timing: a.timing } : {}),
    ...(a.notes?.trim() ? { notes: a.notes.trim() } : {}),
  })

  async function submit(decision: "save" | "qualify" | "disqualify") {
    setBusy(decision)
    setError(undefined)
    try {
      const body =
        decision === "disqualify"
          ? { decision, qualification: answers(), reason, detail: detail || undefined }
          : decision === "qualify"
            ? { decision, qualification: answers(), closerId: closer === NONE ? null : closer }
            : { decision, qualification: answers() }
      const r = await api<{ lead: LeadDetail }>(`/api/leads/${lead.id}/qualify`, { method: "POST", body: JSON.stringify(body) })
      toast.success(decision === "qualify" ? "Prospect qualifié, opportunité créée" : decision === "disqualify" ? "Prospect disqualifié" : "Qualification enregistrée")
      onDone(r.lead)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && lead.can.qualify && !disqualifying) { e.preventDefault(); submit("qualify") } }}>
        <DialogHeader>
          <DialogTitle>Qualifier {lead.company?.name ?? "ce prospect"}</DialogTitle>
          <DialogDescription>Quatre questions, toutes facultatives : notez ce que vous savez. <kbd className="rounded border bg-muted px-1 text-[11px]">Ctrl</kbd> + <kbd className="rounded border bg-muted px-1 text-[11px]">Entrée</kbd> qualifie.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <FormField label="Besoin">
            <Textarea value={a.need ?? ""} onChange={(e) => setA({ ...a, need: e.target.value })} placeholder="Quel problème veut-il résoudre ?" autoFocus />
          </FormField>
          <Choice name="budget" legend="Budget" value={a.budget} options={QUALIFICATION_LABELS.budget} onChange={(budget) => setA({ ...a, budget })} />
          {a.budget === "yes" && (
            <FormField label="Montant indicatif (€)" hint="Facultatif. Les chiffres du pipeline ne comptent que les montants renseignés.">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-40" />
            </FormField>
          )}
          <Choice name="authority" legend="Interlocuteur" value={a.authority} options={QUALIFICATION_LABELS.authority} onChange={(authority) => setA({ ...a, authority })} />
          <Choice name="timing" legend="Échéance" value={a.timing} options={QUALIFICATION_LABELS.timing} onChange={(timing) => setA({ ...a, timing })} />
          <FormField label="Notes"><Textarea value={a.notes ?? ""} onChange={(e) => setA({ ...a, notes: e.target.value })} className="min-h-[64px]" /></FormField>

          {lead.can.qualify && !disqualifying && (
            <FormField label="Closer" hint="Celui qui reprend l’opportunité. Vous pouvez laisser un manager l’attribuer.">
              {(field) => (
                <Select value={closer} onValueChange={setCloser}>
                  <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>À attribuer plus tard</SelectItem>
                    {closers.map((c) => <SelectItem key={c.id} value={c.id}>{personName(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}

          {disqualifying && (
            <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive-subtle/40 p-4">
              <FormField label="Motif de disqualification" required>
                {(field) => (
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                    <SelectContent>{DISQUALIFY_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField label="Précision"><Input value={detail} onChange={(e) => setDetail(e.target.value)} /></FormField>
              <p className="text-xs text-muted-foreground">Une opportunité ouverte sur cette fiche sera marquée perdue.</p>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {disqualifying ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setDisqualifying(false)}>Retour</Button>
              <Button type="button" variant="destructive" loading={busy === "disqualify"} onClick={() => submit("disqualify")}>Disqualifier</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" className="text-destructive-text" onClick={() => setDisqualifying(true)}>Disqualifier…</Button>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" loading={busy === "save"} onClick={() => submit("save")}>Enregistrer</Button>
                {lead.can.qualify && <Button type="button" loading={busy === "qualify"} onClick={() => submit("qualify")}>Qualifier et créer l’opportunité</Button>}
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
