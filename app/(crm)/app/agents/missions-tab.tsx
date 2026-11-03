"use client"

import Link from "next/link"
import { useState } from "react"
import { CircleStop, Pause, Play, Repeat } from "lucide-react"
import { toast } from "sonner"
import { MissionCard } from "@/components/crm/ai/mission-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { MISSION_STATUS_LABELS, SCHEDULE_STATUS_LABELS, type MissionView, type ScheduleView } from "@/features/missions/labels"
import { formatParis } from "@/features/missions/recurrence"
import { api } from "../leads/api"

/**
 * Agents IA › Missions (E28): the plans the copilot proposed and the person launched in one click, carried out by the
 * worker. Each one's own, the team's for owners and managers: those at work, those waiting to be launched, the
 * recurring ones, and the last finished.
 */

function ScheduleRow({ schedule, onChange }: { schedule: ScheduleView; onChange: (next: ScheduleView) => void }) {
  const [busy, setBusy] = useState(false)
  async function act(action: "pause" | "resume" | "stop") {
    setBusy(true)
    try {
      onChange(await api<ScheduleView>(`/api/ai/missions/schedules/${schedule.id}`, { method: "POST", body: JSON.stringify({ action }) }))
      toast.success(action === "stop" ? "Récurrence arrêtée" : action === "pause" ? "Mission récurrente en pause" : "Mission récurrente reprise")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="flex flex-wrap items-start gap-3 p-4">
      <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {schedule.title}
          <Badge variant={schedule.status === "ACTIVE" ? "info" : schedule.status === "PAUSED" ? "warning" : "neutral"}>{SCHEDULE_STATUS_LABELS[schedule.status]}</Badge>
        </p>
        <p className="text-sm text-muted-foreground">
          {schedule.recurrence}
          {schedule.nextRunAt && <> · prochain passage {formatParis(schedule.nextRunAt)}</>}
          {schedule.requestedBy && <> · pour {schedule.requestedBy}</>}
        </p>
        {schedule.lastMission && (
          <p className="text-xs text-muted-foreground">
            Dernier passage : {MISSION_STATUS_LABELS[schedule.lastMission.status].toLowerCase()}, le {formatParis(schedule.lastMission.createdAt)}
          </p>
        )}
        {schedule.pauseReason && <p className="text-xs text-warning">{schedule.pauseReason}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {schedule.can.resume && (
          <Button size="sm" onClick={() => act("resume")} disabled={busy}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Reprendre
          </Button>
        )}
        {schedule.can.pause && (
          <Button size="sm" variant="outline" onClick={() => act("pause")} disabled={busy}>
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            Pause
          </Button>
        )}
        {schedule.can.stop && (
          <Button size="sm" variant="ghost" onClick={() => act("stop")} disabled={busy}>
            <CircleStop className="h-3.5 w-3.5" aria-hidden="true" />
            Arrêter
          </Button>
        )}
      </div>
    </Card>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-sm font-semibold text-muted-foreground">
        {title} <span className="tabular-nums">({count})</span>
      </h2>
      {children}
    </section>
  )
}

export function MissionsTab({ userId, missions, schedules: initialSchedules }: { userId: string; missions: MissionView[]; schedules: ScheduleView[] }) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const active = missions.filter((m) => m.status === "RUNNING" || m.status === "PAUSED")
  const proposed = missions.filter((m) => m.status === "PROPOSED")
  const finished = missions.filter((m) => !["RUNNING", "PAUSED", "PROPOSED"].includes(m.status)).slice(0, 10)
  const recurring = schedules.filter((s) => s.status !== "STOPPED")

  if (!missions.length && !recurring.length) {
    return (
      <Card className="space-y-2 p-5 text-sm">
        <p className="font-semibold">Aucune mission pour l’instant</p>
        <p className="text-muted-foreground">
          Demandez au copilote un travail en plusieurs étapes, par exemple « Recherche 300 architectes à Nantes, importe-les et fais-les trier par Jev », ou « Chaque lundi, cherche les nouveaux restaurants de Nantes ». Il vous propose un plan,
          que vous lancez d’un clic ; le worker le mène ensuite seul, et ce qui contacte un prospect attend toujours votre propre clic.
        </p>
        <p className="text-muted-foreground">
          Le plafond d’IA par mission se règle dans{" "}
          <Link href="/app/settings/ai" className="font-medium text-foreground underline-offset-4 hover:underline">
            Réglages › IA
          </Link>
          .
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <Section title="En cours" count={active.length}>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {active.map((m) => (
            <MissionCard key={m.id} missionId={m.id} userId={userId} initial={m} />
          ))}
        </div>
      </Section>
      <Section title="À lancer" count={proposed.length}>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {proposed.map((m) => (
            <MissionCard key={m.id} missionId={m.id} userId={userId} initial={m} />
          ))}
        </div>
      </Section>
      <Section title="Récurrentes" count={recurring.length}>
        <div className="space-y-3">
          {recurring.map((s) => (
            <ScheduleRow key={s.id} schedule={s} onChange={(next) => setSchedules((list) => list.map((x) => (x.id === next.id ? next : x)))} />
          ))}
        </div>
      </Section>
      <Section title="Terminées" count={finished.length}>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {finished.map((m) => (
            <MissionCard key={m.id} missionId={m.id} userId={userId} initial={m} />
          ))}
        </div>
      </Section>
    </div>
  )
}
