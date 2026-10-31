"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Send, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatDateTime } from "@/lib/crm/format"
import { STOP_LABELS } from "@/features/outreach/sequence-rules"
import type { EnrollmentView } from "@/features/outreach/sequences"
import { api } from "./api"

/** The automatic follow-ups of this fiche: where they stand, and a way to stop them. Hidden when there never were any. */
export function SequenceCard({ leadId, refreshKey, onChange }: { leadId: string; refreshKey: string | undefined; onChange: () => void }) {
  const [items, setItems] = useState<EnrollmentView[]>([])
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    api<{ enrollments: EnrollmentView[] }>(`/api/enrollments?lead=${encodeURIComponent(leadId)}`)
      .then((r) => !cancelled && setItems(r.enrollments))
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [leadId, refreshKey, version])

  async function stop(e: EnrollmentView) {
    if (!window.confirm("Arrêter les relances automatiques pour cette fiche ?")) return
    try {
      await api(`/api/enrollments/${e.id}`, { method: "DELETE" })
      toast.success("Relances arrêtées")
      setVersion((v) => v + 1)
      onChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec")
    }
  }

  if (items.length === 0) return null
  return (
    <Card className="space-y-2 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Send className="h-4 w-4" aria-hidden="true" /> Séquence</h3>
      <ul className="space-y-2">
        {items.slice(0, 3).map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate">
                {e.status === "ACTIVE" ? `Message ${Math.min(e.currentStep + 1, e.totalSteps)} sur ${e.totalSteps}${e.nextAt ? ` prévu le ${formatDateTime(e.nextAt)}` : ""}` : e.status === "COMPLETED" ? `Terminée : ${e.totalSteps} messages envoyés` : `Arrêtée : ${e.stoppedReason ? STOP_LABELS[e.stoppedReason] : "—"}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">depuis {e.mailbox}</p>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant={e.status === "ACTIVE" ? "info" : e.status === "COMPLETED" || e.stoppedReason === "REPLIED" ? "success" : "outline"}>{e.status === "ACTIVE" ? "En cours" : e.status === "COMPLETED" ? "Terminée" : "Arrêtée"}</Badge>
              {e.status === "ACTIVE" && <Button variant="ghost" size="sm" aria-label="Arrêter les relances" onClick={() => stop(e)}><X className="h-4 w-4" aria-hidden="true" /></Button>}
            </div>
          </li>
        ))}
      </ul>
      <Link className="text-xs font-medium underline underline-offset-4" href="/app/sequences">Toutes les séquences</Link>
    </Card>
  )
}
