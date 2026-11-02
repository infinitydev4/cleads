"use client"

import { useState } from "react"
import { RunCard } from "@/components/crm/ai/run-card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RUN_STATUS_LABELS } from "@/features/ai/labels"
import type { RunView } from "@/features/ai/runs"

const ALL = "all"

/** The latest runs (all of them for owners and managers, one's own otherwise), filtered by agent and status. */
export function RunsTab({ runs, onOpen, onCancel, acting }: { runs: RunView[]; onOpen: (id: string) => void; onCancel: (id: string) => void; acting: string | null }) {
  const [agent, setAgent] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const agents = [...new Map(runs.map((r) => [r.agentId, r.agentLabel])).entries()]
  const statuses = [...new Set(runs.map((r) => r.status))]
  const shown = runs.filter((r) => (agent === ALL || r.agentId === agent) && (status === ALL || r.status === status))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="w-52" aria-label="Filtrer par agent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les agents</SelectItem>
            {agents.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Filtrer par statut">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les statuts</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {RUN_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {shown.length} exécution{shown.length > 1 ? "s" : ""}
        </p>
      </div>
      {shown.length ? (
        <div className="space-y-3">
          {shown.map((r) => (
            <RunCard key={r.id} run={r} onOpen={onOpen} onCancel={onCancel} busy={acting === r.id} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{runs.length ? "Aucune exécution ne correspond à ces filtres." : "Aucune exécution pour l’instant. Un test de skill ou, bientôt, un audit apparaîtra ici avec ses étapes et son coût."}</p>
      )}
    </div>
  )
}
