"use client"

import { useId, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { dayKey, snoozeTargets } from "@/lib/crm/day"
import { cn } from "@/lib/utils"
import { CALL_OUTCOMES, type CallOutcome } from "@/features/activity/rules"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"

/** Outcomes after which a follow-up is the normal next step. */
const FOLLOW_UP_BY_DEFAULT: CallOutcome[] = ["callback", "no_answer", "voicemail"]

/** A row of single-choice chips; native radios, so arrow keys and screen readers work without extra code. */
export function ChipChoice<T extends string>({ label, name, value, options, onChange }: { label: string; name: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const group = useId()
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={`${name}-${group}`} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring", value === o.value ? "border-transparent bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Picks a follow-up day: none, a quick target or a date. Returns a "YYYY-MM-DD" day or null. */
export function DayChoice({ label, value, onChange, allowNone = true }: { label: string; value: string | null; onChange: (day: string | null) => void; allowNone?: boolean }) {
  const today = dayKey(new Date())
  const targets = snoozeTargets(today)
  const quick = targets.some((t) => t.day === value)
  return (
    <div className="space-y-2">
      <ChipChoice
        label={label}
        name="day"
        value={value === null ? "none" : quick ? targets.find((t) => t.day === value)!.id : "custom"}
        options={[...(allowNone ? [{ value: "none", label: "Aucune" }] : []), ...targets.map((t) => ({ value: t.id as string, label: t.label })), { value: "custom", label: "Autre date" }]}
        onChange={(v) => onChange(v === "none" ? null : v === "custom" ? (value ?? targets[0].day) : targets.find((t) => t.id === v)!.day)}
      />
      {value !== null && !quick && <Input type="date" min={today} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Date" className="w-44" />}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  leadName: string
  /** Opened from a task: offers to tick it off with the call. */
  task?: { id: string; title: string }
  onDone: (lead: LeadDetail) => void
}

/** Logs a call: outcome first (one choice), everything else optional, follow-up planned in the same step. */
export function CallDialog({ open, onOpenChange, leadId, leadName, task, onDone }: Props) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [duration, setDuration] = useState("")
  const [body, setBody] = useState("")
  const [followDay, setFollowDay] = useState<string | null>(null)
  const [completeTask, setCompleteTask] = useState(true)
  const [busy, setBusy] = useState(false)

  function pick(o: CallOutcome) {
    setOutcome(o)
    // Suggest the usual next step, unless the person already chose a date themselves.
    if (followDay === null || snoozeTargets(dayKey(new Date())).some((t) => t.day === followDay)) setFollowDay(FOLLOW_UP_BY_DEFAULT.includes(o) ? snoozeTargets(dayKey(new Date()))[0].day : null)
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (!outcome || busy) return
    setBusy(true)
    try {
      const minutes = duration.trim() === "" ? undefined : Number(duration)
      const next = await api<LeadDetail>(`/api/leads/${leadId}/activities`, {
        method: "POST",
        body: JSON.stringify({ kind: "CALL", outcome, body: body.trim() || undefined, durationMin: minutes != null && Number.isFinite(minutes) ? Math.round(minutes) : undefined, followUp: followDay ? { dueDay: followDay } : undefined }),
      })
      if (task && completeTask) await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ done: true }) })
      toast.success(followDay ? "Appel enregistré, relance planifiée" : "Appel enregistré")
      onDone(next)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() } }}>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Appel : {leadName}</DialogTitle>
            <DialogDescription>Un seul choix suffit ; le reste est facultatif. <kbd className="rounded border px-1 text-xs">Ctrl</kbd> ou <kbd className="rounded border px-1 text-xs">⌘</kbd> + <kbd className="rounded border px-1 text-xs">Entrée</kbd> enregistre.</DialogDescription>
          </DialogHeader>
          <ChipChoice label="Résultat" name="outcome" value={outcome} options={Object.entries(CALL_OUTCOMES).map(([value, label]) => ({ value: value as CallOutcome, label }))} onChange={pick} />
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <FormField label="Durée (min)" hint="Facultatif."><Input type="number" inputMode="numeric" min={0} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} /></FormField>
            <FormField label="Note" hint="Ce qui a été dit, ce qui a été promis."><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} /></FormField>
          </div>
          <DayChoice label="Relancer" value={followDay} onChange={setFollowDay} />
          {task && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={completeTask} onChange={(e) => setCompleteTask(e.target.checked)} className="h-4 w-4" /> Terminer la tâche « {task.title} »
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={busy} disabled={!outcome}>Enregistrer l’appel</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
