"use client"

import Link from "next/link"
import { Bot, ListTree, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RUN_STATUS_LABELS, RUN_STATUS_TONE, formatEur } from "@/features/ai/labels"
import type { RunView } from "@/features/ai/runs"

const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** One AI run: agent, status, fiche, who asked, cost against its cap. `onOpen` shows its steps and result. */
export function RunCard({ run, onCancel, onOpen, busy }: { run: RunView; onCancel?: (id: string) => void; onOpen?: (id: string) => void; busy?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {run.agentLabel}
            <Badge variant={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
          </p>
          <p className="text-sm text-muted-foreground">
            {run.lead ? (
              <Link href={`/app/leads/${run.lead.id}`} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:underline">
                {run.lead.name}
              </Link>
            ) : (
              "Sans fiche"
            )}
            {run.requestedBy && <> · lancée par {run.requestedBy}</>} · {when.format(new Date(run.createdAt))}
          </p>
          {run.error && <p className="text-sm text-destructive-text">{run.error}</p>}
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold tabular-nums">{formatEur(run.costEur)}</p>
          <p className="text-muted-foreground tabular-nums">
            sur {formatEur(run.capEur)} · {run.steps} étape{run.steps > 1 ? "s" : ""}
          </p>
        </div>
        {onOpen && (
          <Button variant="ghost" size="sm" onClick={() => onOpen(run.id)}>
            <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
            Détails
          </Button>
        )}
        {run.canCancel && onCancel && (
          <Button variant="outline" size="sm" onClick={() => onCancel(run.id)} disabled={busy}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            Arrêter
          </Button>
        )}
      </div>
    </Card>
  )
}
