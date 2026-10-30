"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { SlotPicker, longDay } from "@/components/meetings/slot-picker"
import { MEETING_TYPE_LABELS, MEETING_TYPES } from "@/features/meetings/rules"
import { api } from "./api"
import { ChipChoice } from "./call-dialog"

interface Host {
  id: string
  name: string
  role: string
  hasHours: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  leadName: string
  /** The person booking, for the default host and the manager override. */
  currentUserId: string
  canOverride: boolean
  /** Existing meeting being moved: the dialog then reschedules instead of booking. */
  moving?: { id: string; hostId: string }
  onDone: () => void
}

/** Books (or moves) a meeting: closer, then a time among the slots they really have open. */
export function MeetingDialog({ open, onOpenChange, leadId, leadName, currentUserId, canOverride, moving, onDone }: Props) {
  const [hosts, setHosts] = useState<Host[] | null>(null)
  const [hostId, setHostId] = useState<string>(moving?.hostId ?? "")
  const [slot, setSlot] = useState<string | null>(null)
  const [type, setType] = useState<(typeof MEETING_TYPES)[number]>("DISCOVERY")
  const [notes, setNotes] = useState("")
  const [notifyGuest, setNotifyGuest] = useState(true)
  const [custom, setCustom] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ hosts: Host[] }>("/api/meetings/hosts")
      .then(({ hosts }) => {
        setHosts(hosts)
        setHostId((h) => h || (hosts.find((x) => x.id === currentUserId) ?? hosts.find((x) => x.role === "CLOSER" && x.hasHours) ?? hosts[0])?.id || "")
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Échec"))
  }, [currentUserId])

  const host = hosts?.find((h) => h.id === hostId)
  const chosen = custom ? new Date(custom).toISOString() : slot

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!chosen || !hostId || busy) return
    setBusy(true)
    try {
      if (moving) await api(`/api/meetings/${moving.id}`, { method: "PATCH", body: JSON.stringify({ action: "reschedule", startsAt: chosen, override: !!custom || undefined }) })
      else await api("/api/meetings", { method: "POST", body: JSON.stringify({ leadId, hostId, startsAt: chosen, type, notes: notes.trim() || undefined, notifyGuest, override: !!custom || undefined }) })
      toast.success(moving ? "Rendez-vous déplacé" : "Rendez-vous planifié")
      onDone()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="min-w-0 space-y-5">
          <DialogHeader>
            <DialogTitle>{moving ? "Déplacer le rendez-vous" : "Planifier un rendez-vous"} : {leadName}</DialogTitle>
            <DialogDescription>Seuls les créneaux réellement libres du closer sont proposés.</DialogDescription>
          </DialogHeader>
          {!moving && hosts && hosts.length > 1 && (
            <FormField label="Avec">
              <select value={hostId} onChange={(e) => { setHostId(e.target.value); setSlot(null) }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}{h.hasHours ? "" : " (aucune disponibilité réglée)"}</option>)}
              </select>
            </FormField>
          )}
          {!moving && <ChipChoice label="Type" name="type" value={type} options={MEETING_TYPES.map((t) => ({ value: t, label: MEETING_TYPE_LABELS[t] }))} onChange={setType} />}
          {hostId && host?.hasHours === false && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">Ce closer n’a réglé aucune disponibilité : demandez-lui de le faire dans « Disponibilités ».{canOverride ? " Vous pouvez aussi saisir une heure précise ci-dessous." : ""}</p>}
          {hostId && <SlotPicker load={(from, days) => api(`/api/meetings/slots?hostId=${hostId}&from=${from}&days=${days}${moving ? `&ignore=${moving.id}` : ""}`)} value={slot} onChange={(s) => { setSlot(s); setCustom("") }} timezone="Europe/Paris" reloadKey={hostId} />}
          {canOverride && (
            <details className="rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Hors des disponibilités (manager)</summary>
              <div className="mt-3"><FormField label="Date et heure (heure de Paris)"><Input type="datetime-local" value={custom} onChange={(e) => { setCustom(e.target.value); setSlot(null) }} /></FormField></div>
            </details>
          )}
          {chosen && <p className="text-sm font-medium first-letter:uppercase">{longDay(chosen, "Europe/Paris")}, {new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(chosen))}</p>}
          {!moving && (
            <>
              <FormField label="Note pour le closer" hint="Contexte, besoin, ce qui a été promis."><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} /></FormField>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notifyGuest} onChange={(e) => setNotifyGuest(e.target.checked)} className="h-4 w-4" /> Envoyer la confirmation (avec invitation de calendrier) au contact</label>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={busy} disabled={!chosen || !hostId}>{moving ? "Déplacer" : "Planifier"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
