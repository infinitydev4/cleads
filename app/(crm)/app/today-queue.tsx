"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { Check, PhoneCall, Phone, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/crm/empty-state"
import { StatCard } from "@/components/crm/stat-card"
import { dayKey } from "@/lib/crm/day"
import { formatDate } from "@/lib/crm/format"
import { formatPhone } from "@/lib/crm/normalize"
import { cn } from "@/lib/utils"
import type { Suggestion, Today, TodayTask } from "@/features/activity/today"
import { api } from "./leads/api"
import { CallDialog } from "./leads/call-dialog"
import { SnoozeMenu, changeTask } from "./leads/tasks-card"

type Calling = { leadId: string; leadName: string; task?: { id: string; title: string } }

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })

function lateness(dueAt: string, today: string) {
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dayKey(new Date(dueAt))}T12:00:00Z`)) / 86400000)
  return days <= 0 ? "" : days === 1 ? "hier" : `il y a ${days} j`
}

/** The daily file: it empties in place. Ticking, postponing, planning and calling never leave the screen. */
export function TodayQueue({ initial }: { initial: Today }) {
  const [data, setData] = useState(initial)
  const [calling, setCalling] = useState<Calling | null>(null)
  const [switching, setSwitching] = useState(false)

  const reload = useCallback(async (scope: Today["scope"] = data.scope) => {
    try {
      setData(await api<Today>(`/api/today?scope=${scope}`))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de rafraîchir la file")
    }
  }, [data.scope])

  const drop = (id: string) =>
    setData((d) => ({ ...d, overdue: d.overdue.filter((t) => t.id !== id), dueToday: d.dueToday.filter((t) => t.id !== id), upcoming: d.upcoming.filter((t) => t.id !== id), undated: d.undated.filter((t) => t.id !== id) }))

  /** Applies a change at once, puts the file back if the server refuses. */
  async function act(task: TodayTask, body: object, success: string, undo?: () => Promise<unknown>) {
    const before = data
    drop(task.id)
    try {
      await changeTask(task.id, body)
      toast.success(success, undo ? { action: { label: "Annuler", onClick: async () => { try { await undo(); await reload() } catch (e) { toast.error(e instanceof Error ? e.message : "Échec") } } } } : undefined)
      await reload()
    } catch (e) {
      setData(before)
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  async function plan(s: Suggestion, dueDay: string) {
    const before = data
    setData((d) => ({ ...d, suggestions: d.suggestions.filter((x) => x.leadId !== s.leadId) }))
    try {
      await api(`/api/leads/${s.leadId}/tasks`, { method: "POST", body: JSON.stringify({ title: s.reason === "to_contact" ? "Appeler" : "Relancer", dueDay }) })
      toast.success(`Planifié : ${s.leadName}`)
      await reload()
    } catch (e) {
      setData(before)
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  async function switchScope(scope: Today["scope"]) {
    if (scope === data.scope) return
    setSwitching(true)
    await reload(scope)
    setSwitching(false)
  }

  const team = data.scope === "team"
  const nothing = !data.overdue.length && !data.dueToday.length && !data.meetings.length && !data.suggestions.length

  return (
    <div className="space-y-8" aria-busy={switching || undefined}>
      <section aria-label="Indicateurs du jour" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="En retard" value={data.overdue.length} hint={team ? "Dans l’équipe" : "À rattraper en premier"} className={data.overdue.length ? "border-destructive/40" : undefined} />
        <StatCard label="Pour aujourd’hui" value={data.dueToday.length} hint={team ? "Dans l’équipe" : "Tâches du jour"} />
        <StatCard label="Rendez-vous du jour" value={data.meetings.length} hint={data.meetings.length ? "Voir ci-dessous" : "Aucun"} />
        <StatCard label="À planifier" value={data.suggestions.length} hint={team ? "Visible dans « Ma file »" : "Sans prochaine étape"} />
      </section>

      {data.canSeeTeam && (
        <div role="group" aria-label="Périmètre" className="flex gap-1">
          <Button size="sm" variant={!team ? "secondary" : "ghost"} aria-pressed={!team} onClick={() => switchScope("mine")}>Ma file</Button>
          <Button size="sm" variant={team ? "secondary" : "ghost"} aria-pressed={team} onClick={() => switchScope("team")}>Équipe</Button>
        </div>
      )}

      {nothing && (
        <EmptyState
          art="target"
          title={team ? "Rien en retard ni prévu aujourd’hui dans l’équipe" : "File vide : rien à traiter"}
          description={team ? "Aucune tâche due, aucun rendez-vous aujourd’hui." : "Toutes vos relances du jour sont faites. Qualifiez un prospect ou lancez une recherche pour alimenter la suite."}
          action={<><Button asChild variant="ink"><Link href="/app/leads">Voir les prospects</Link></Button><Button asChild variant="outline"><Link href="/app/pipeline">Pipeline</Link></Button></>}
        />
      )}

      {data.meetings.length > 0 && (
        <section aria-label="Rendez-vous du jour" className="space-y-2">
          <h2 className="text-sm font-bold">Rendez-vous du jour</h2>
          <Card className="divide-y">
            {data.meetings.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-14 font-semibold tabular-nums">{time.format(new Date(m.startsAt))}</span>
                {m.leadId ? <Link href={`/app/leads/${m.leadId}`} className="font-medium hover:underline">{m.leadName}</Link> : <span className="font-medium">{m.leadName}</span>}
                {team && m.hostName && <span className="text-muted-foreground">avec {m.hostName}</span>}
              </div>
            ))}
          </Card>
        </section>
      )}

      <TaskSection title="En retard" tone="late" tasks={data.overdue} today={data.today} team={team} act={act} onCall={setCalling} />
      <TaskSection title="Aujourd’hui" tasks={data.dueToday} today={data.today} team={team} act={act} onCall={setCalling} />

      {data.suggestions.length > 0 && (
        <section aria-label="À planifier" className="space-y-2">
          <h2 className="text-sm font-bold">À planifier <span className="font-normal text-muted-foreground">· aucune prochaine étape</span></h2>
          <Card className="divide-y">
            {data.suggestions.map((s) => (
              <div key={s.leadId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/leads/${s.leadId}`} className="font-medium hover:underline">{s.leadName}</Link>
                  <p className="text-xs text-muted-foreground">{[s.detail, s.city].filter(Boolean).join(" · ")}</p>
                </div>
                {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{formatPhone(s.phone)}</a>}
                <Button size="sm" variant="outline" onClick={() => setCalling({ leadId: s.leadId, leadName: s.leadName })}><PhoneCall className="h-4 w-4" aria-hidden="true" /> Appel</Button>
                <SnoozeMenuPlan onPick={(day) => plan(s, day)} />
              </div>
            ))}
          </Card>
        </section>
      )}

      <TaskSection title="À venir" tone="quiet" tasks={data.upcoming} today={data.today} team={team} act={act} onCall={setCalling} />
      <TaskSection title="Sans date" tone="quiet" tasks={data.undated} today={data.today} team={team} act={act} onCall={setCalling} />

      {calling && <CallDialog open onOpenChange={(o) => !o && setCalling(null)} leadId={calling.leadId} leadName={calling.leadName} task={calling.task} onDone={() => void reload()} />}
    </div>
  )
}

function SnoozeMenuPlan({ onPick }: { onPick: (day: string) => void }) {
  // Same targets as postponing: "Planifier" reads better than "Reporter" here.
  return <SnoozeMenu onPick={onPick} label="Planifier" icon={<Plus className="h-4 w-4" aria-hidden="true" />} />
}

function TaskSection({ title, tone, tasks, today, team, act, onCall }: { title: string; tone?: "late" | "quiet"; tasks: TodayTask[]; today: string; team: boolean; act: (t: TodayTask, body: object, success: string, undo?: () => Promise<unknown>) => void; onCall: (c: Calling) => void }) {
  if (tasks.length === 0) return null
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className={cn("text-sm font-bold", tone === "late" && "text-destructive-text")}>{title} <span className="font-normal text-muted-foreground">· {tasks.length}</span></h2>
      <Card className="divide-y">
        {tasks.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0 rounded-full" disabled={!t.canChange} aria-label={`Terminer : ${t.title}`} onClick={() => act(t, { done: true }, "Tâche terminée", () => changeTask(t.id, { done: false }))}>
              <Check className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{t.title}</p>
              <p className="text-xs text-muted-foreground">
                <Link href={`/app/leads/${t.leadId}`} className="hover:underline">{t.leadName}</Link>
                {t.city ? ` · ${t.city}` : ""}
                {t.dueAt && tone === "late" ? <span className="font-semibold text-destructive-text"> · {lateness(t.dueAt, today)}</span> : t.dueAt && tone === "quiet" ? ` · ${formatDate(t.dueAt)}` : ""}
                {team && t.assigneeName ? ` · ${t.assigneeName}` : ""}
              </p>
            </div>
            {t.phone && <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{formatPhone(t.phone)}</a>}
            {t.canChange && (
              <>
                <Button size="sm" variant="outline" onClick={() => onCall({ leadId: t.leadId, leadName: t.leadName, task: { id: t.id, title: t.title } })}><PhoneCall className="h-4 w-4" aria-hidden="true" /> Appel</Button>
                <SnoozeMenu onPick={(dueDay) => act(t, { dueDay }, "Tâche reportée")} />
              </>
            )}
          </div>
        ))}
      </Card>
    </section>
  )
}
