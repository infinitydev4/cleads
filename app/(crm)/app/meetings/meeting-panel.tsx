"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, ExternalLink, Mail, Phone, Video } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/crm/status-badge"
import { meetingStatus } from "@/lib/crm/status"
import type { MeetingView } from "@/features/meetings/service"
import { MEETING_TYPE_LABELS, OUTCOME_LABELS, OUTCOMES } from "@/features/meetings/rules"
import { LOST_REASONS } from "@/features/pipeline/rules"
import { api } from "../leads/api"
import { ChipChoice, DayChoice } from "../leads/call-dialog"
import { MeetingDialog } from "../leads/meeting-dialog"

interface Props {
  meeting: MeetingView | null
  onClose: () => void
  onChanged: () => void
  currentUserId: string
  canAct: boolean
  canOutcome: boolean
  isManager: boolean
}

const when = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...opts }).format(new Date(iso))

export function MeetingPanel({ meeting, onClose, onChanged, currentUserId, canAct, canOutcome, isManager }: Props) {
  const [mode, setMode] = useState<"view" | "outcome" | "cancel">("view")
  const [moving, setMoving] = useState(false)
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number] | null>(null)
  const [lostReason, setLostReason] = useState<(typeof LOST_REASONS)[number] | null>(null)
  const [followDay, setFollowDay] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  // Mounted afresh for each meeting (the parent keys it), so this reading of the clock holds for the whole visit.
  const [now] = useState(() => Date.now())

  async function run(body: object, message: string) {
    if (!meeting) return
    setBusy(true)
    try {
      await api(`/api/meetings/${meeting.id}`, { method: "PATCH", body: JSON.stringify(body) })
      toast.success(message)
      onChanged()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  const active = meeting && (meeting.status === "SCHEDULED" || meeting.status === "CONFIRMED")
  const started = meeting ? new Date(meeting.startsAt).getTime() <= now : false
  const canComplete = outcome !== null && (outcome !== "LOST" || lostReason !== null)

  return (
    <>
      <Sheet open={!!meeting} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {meeting && (
            <>
              <SheetHeader>
                <SheetTitle>{meeting.leadName}</SheetTitle>
                <SheetDescription className="first-letter:uppercase">{when(meeting.startsAt, { weekday: "long", day: "numeric", month: "long" })}, {when(meeting.startsAt, { hour: "2-digit", minute: "2-digit" })} à {when(meeting.endsAt, { hour: "2-digit", minute: "2-digit" })}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge map={meetingStatus} value={meeting.status} />
                  <span>{MEETING_TYPE_LABELS[meeting.type]}</span>
                  <span className="text-muted-foreground">avec {meeting.hostName}</span>
                  {meeting.outcome && <span className="font-medium">· {OUTCOME_LABELS[meeting.outcome as keyof typeof OUTCOME_LABELS] ?? meeting.outcome}</span>}
                </div>
                <dl className="space-y-2 text-sm">
                  {meeting.contactName && <div className="flex gap-2"><dt className="sr-only">Contact</dt><dd className="font-medium">{meeting.contactName}</dd></div>}
                  {meeting.contactEmail && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><dd><a className="underline" href={`mailto:${meeting.contactEmail}`}>{meeting.contactEmail}</a></dd></div>}
                  {meeting.contactPhone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><dd><a className="underline" href={`tel:${meeting.contactPhone}`}>{meeting.contactPhone}</a></dd></div>}
                  {meeting.videoUrl && <div className="flex items-center gap-2"><Video className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><dd><a className="underline" href={meeting.videoUrl} target="_blank" rel="noreferrer">Ouvrir la visio</a></dd></div>}
                </dl>
                {meeting.notes && <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{meeting.notes}</p>}
                {meeting.leadId && <Button asChild variant="outline" size="sm"><Link href={`/app/leads/${meeting.leadId}`}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Ouvrir la fiche</Link></Button>}

                {active && mode === "view" && (
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    {canOutcome && started && <Button onClick={() => setMode("outcome")}><Check className="h-4 w-4" aria-hidden="true" /> Indiquer le résultat</Button>}
                    {canOutcome && started && <Button variant="outline" loading={busy} onClick={() => run({ action: "no_show" }, "Absence enregistrée, relance planifiée")}>Absent</Button>}
                    {canAct && !started && meeting.status === "SCHEDULED" && <Button variant="outline" loading={busy} onClick={() => run({ action: "confirm" }, "Rendez-vous confirmé")}>Confirmer</Button>}
                    {canAct && !started && <Button variant="outline" onClick={() => setMoving(true)}>Déplacer</Button>}
                    {canAct && <Button variant="ghost" onClick={() => setMode("cancel")}>Annuler</Button>}
                  </div>
                )}
                {active && !canOutcome && started && <p className="text-sm text-muted-foreground">Seul le closer du rendez-vous ou un manager en indique le résultat.</p>}

                {active && mode === "outcome" && (
                  <form className="space-y-4 border-t pt-4" onSubmit={(e) => { e.preventDefault(); if (canComplete) void run({ action: "complete", outcome, notes: notes.trim() || undefined, lostReason: outcome === "LOST" ? lostReason : undefined, followUpDay: outcome === "FOLLOW_UP" ? followDay ?? undefined : undefined }, "Rendez-vous clôturé") }}>
                    <ChipChoice label="Résultat" name="outcome" value={outcome} options={OUTCOMES.map((o) => ({ value: o, label: OUTCOME_LABELS[o] }))} onChange={setOutcome} />
                    {outcome === "LOST" && <ChipChoice label="Raison" name="lost" value={lostReason} options={LOST_REASONS.map((r) => ({ value: r, label: r }))} onChange={setLostReason} />}
                    {outcome === "FOLLOW_UP" && <DayChoice label="Relancer" value={followDay} onChange={setFollowDay} allowNone={false} />}
                    <label className="block text-sm font-medium">Compte rendu (facultatif)<Textarea className="mt-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></label>
                    <div className="flex gap-2">
                      <Button type="submit" loading={busy} disabled={!canComplete}>Clôturer</Button>
                      <Button type="button" variant="ghost" onClick={() => setMode("view")}>Retour</Button>
                    </div>
                  </form>
                )}

                {active && mode === "cancel" && (
                  <div className="space-y-3 border-t pt-4">
                    <label className="block text-sm font-medium">Raison (facultatif)<Textarea className="mt-2" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
                    <p className="text-xs text-muted-foreground">Le contact reçoit un email d’annulation.</p>
                    <div className="flex gap-2">
                      <Button variant="destructive" loading={busy} onClick={() => run({ action: "cancel", reason: reason.trim() || undefined }, "Rendez-vous annulé")}>Annuler le rendez-vous</Button>
                      <Button variant="ghost" onClick={() => setMode("view")}>Retour</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {moving && meeting && meeting.leadId && (
        <MeetingDialog open={moving} onOpenChange={setMoving} leadId={meeting.leadId} leadName={meeting.leadName} currentUserId={currentUserId} canOverride={isManager || meeting.hostId === currentUserId} moving={{ id: meeting.id, hostId: meeting.hostId }} onDone={() => { onChanged(); onClose() }} />
      )}
    </>
  )
}
