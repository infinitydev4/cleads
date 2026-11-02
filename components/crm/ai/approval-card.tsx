"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, ShieldQuestion, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { APPROVAL_STATUS_LABELS } from "@/features/ai/labels"
import type { ApprovalView } from "@/features/ai/approvals"

const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/**
 * An action an agent wants to take outside the CRM, waiting for a person: what will happen, for which fiche, and the
 * two answers. Refusing can carry a short reason, kept in the run's history.
 */
export function ApprovalCard({ approval, onDecide, busy }: { approval: ApprovalView; onDecide?: (id: string, approve: boolean, note?: string) => void; busy?: boolean }) {
  const [refusing, setRefusing] = useState(false)
  const [note, setNote] = useState("")
  return (
    <Card className="border-warning/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">{approval.summary}</p>
          <p className="text-sm text-muted-foreground">
            {approval.agentLabel}
            {approval.lead && (
              <>
                {" · "}
                <Link href={`/app/leads/${approval.lead.id}`} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:underline">
                  {approval.lead.name}
                </Link>
              </>
            )}
            {approval.requestedBy && <> · pour {approval.requestedBy}</>} · expire le {when.format(new Date(approval.expiresAt))}
          </p>
          {approval.status !== "PENDING" && (
            <p className="text-sm">
              <Badge variant="outline">{APPROVAL_STATUS_LABELS[approval.status]}</Badge>
              {approval.decidedBy && <span className="ml-2 text-muted-foreground">par {approval.decidedBy}</span>}
              {approval.note && <span className="ml-2 text-muted-foreground">« {approval.note} »</span>}
            </p>
          )}
        </div>
        {approval.canDecide && onDecide && !refusing && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onDecide(approval.id, true)} disabled={busy}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Approuver
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRefusing(true)} disabled={busy}>
              <X className="h-4 w-4" aria-hidden="true" />
              Refuser
            </Button>
          </div>
        )}
      </div>
      {refusing && onDecide && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onDecide(approval.id, false, note.trim() || undefined)
          }}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Pourquoi (facultatif)" aria-label="Raison du refus" className="min-w-0 flex-1" autoFocus />
          <Button type="submit" size="sm" variant="destructive" disabled={busy}>
            Refuser l’action
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRefusing(false)} disabled={busy}>
            Annuler
          </Button>
        </form>
      )}
    </Card>
  )
}
