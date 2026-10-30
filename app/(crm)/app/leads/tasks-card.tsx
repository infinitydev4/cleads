"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CalendarClock, Check, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/crm/form-field"
import { dayKey, snoozeTargets } from "@/lib/crm/day"
import { formatDate } from "@/lib/crm/format"
import { cn } from "@/lib/utils"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"
import { DayChoice } from "./call-dialog"
import { personName, type Assignee } from "./filter-bar"

/** Postponement menu shared by the fiche and the daily file. */
export function SnoozeMenu({ onPick, disabled, label = "Reporter", icon }: { onPick: (day: string) => void; disabled?: boolean; label?: string; icon?: React.ReactNode }) {
  const targets = snoozeTargets(dayKey(new Date()))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label={label}>{icon ?? <CalendarClock className="h-4 w-4" aria-hidden="true" />}<span className="hidden sm:inline">{label}</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {targets.map((t) => <DropdownMenuItem key={t.id} onSelect={() => onPick(t.day)}>{t.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export async function changeTask(id: string, body: object) {
  await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) })
}

interface Props {
  lead: LeadDetail
  assignees: Assignee[]
  currentUserId: string
  adding: boolean
  onAddingChange: (adding: boolean) => void
  onChange: (lead: LeadDetail) => void
  refresh: () => Promise<void>
}

export function TasksCard({ lead, assignees, currentUserId, adding, onAddingChange, onChange, refresh }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const startOfToday = dayKey(new Date())

  async function run(id: string, action: () => Promise<unknown>, success: string) {
    setBusyId(id)
    try {
      await action()
      toast.success(success)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusyId(null)
    }
  }

  if (lead.tasks.length === 0 && !adding && !lead.can.log) return null
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">À faire</h3>
        {lead.can.log && !adding && (
          <Button variant="ghost" size="sm" onClick={() => onAddingChange(true)} title="Raccourci : t"><Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle tâche</Button>
        )}
      </div>
      {lead.tasks.length === 0 && !adding && <p className="text-sm text-muted-foreground">Rien de prévu. Une fiche qui avance a toujours une prochaine étape datée.</p>}
      <ul className="space-y-1">
        {lead.tasks.map((t) => {
          const overdue = t.dueAt && dayKey(new Date(t.dueAt)) < startOfToday
          return (
            <li key={t.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-muted/50">
              <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 rounded-full" disabled={!t.canChange || busyId === t.id} aria-label={`Terminer : ${t.title}`} onClick={() => run(t.id, () => changeTask(t.id, { done: true }), "Tâche terminée")}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <span className="min-w-0 flex-1">
                <span className="break-words">{t.title}</span>{" "}
                <span className={cn("text-muted-foreground", overdue && "font-semibold text-destructive-text")}>
                  {t.dueAt ? `· ${overdue ? "en retard, " : ""}${formatDate(t.dueAt)}` : "· sans date"}
                  {t.assigneeId !== currentUserId && t.assigneeName ? ` · ${t.assigneeName}` : ""}
                </span>
              </span>
              {t.canChange && (
                <>
                  <SnoozeMenu disabled={busyId === t.id} onPick={(dueDay) => run(t.id, () => changeTask(t.id, { dueDay }), "Tâche reportée")} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Supprimer : ${t.title}`} disabled={busyId === t.id} onClick={() => run(t.id, () => api(`/api/tasks/${t.id}`, { method: "DELETE" }), "Tâche supprimée")}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {adding && <NewTask lead={lead} assignees={assignees} currentUserId={currentUserId} onCancel={() => onAddingChange(false)} onCreated={(next) => { onChange(next); onAddingChange(false) }} />}
    </Card>
  )
}

function NewTask({ lead, assignees, currentUserId, onCancel, onCreated }: { lead: LeadDetail; assignees: Assignee[]; currentUserId: string; onCancel: () => void; onCreated: (lead: LeadDetail) => void }) {
  const [title, setTitle] = useState("")
  const [day, setDay] = useState<string | null>(snoozeTargets(dayKey(new Date()))[0].day)
  const [assigneeId, setAssigneeId] = useState(currentUserId)
  const [busy, setBusy] = useState(false)
  // Managers hand tasks to anyone; the others to themselves or to the people holding the fiche (the server checks again).
  const holders = new Set([currentUserId, lead.ownerId, ...lead.deals.map((d) => d.ownerId)])
  const options = lead.can.assignOthers ? assignees : assignees.filter((a) => holders.has(a.id))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      onCreated(await api<LeadDetail>(`/api/leads/${lead.id}/tasks`, { method: "POST", body: JSON.stringify({ title, dueDay: day, assigneeId }) }))
      toast.success("Tâche planifiée")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-3">
      <FormField label="Quoi ?" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rappeler, envoyer le devis…" autoFocus maxLength={200} /></FormField>
      <DayChoice label="Pour quand ?" value={day} onChange={setDay} />
      {options.length > 1 && (
        <FormField label="Confiée à">
          {(field) => (
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger {...field}><SelectValue /></SelectTrigger>
              <SelectContent>{options.map((a) => <SelectItem key={a.id} value={a.id}>{a.id === currentUserId ? `${personName(a)} (moi)` : personName(a)}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>Planifier</Button>
      </div>
    </form>
  )
}
