"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { campaignStatus } from "@/lib/crm/status"
import type { CampaignView } from "@/features/campaigns/service"
import { api } from "../leads/api"

const NONE = "__none__"

export interface Person {
  id: string
  name: string | null
  email: string | null
}

/** Creates a campaign, or edits one. Every rule is checked again by the server. `offers`: the active catalogue (E25). */
export function CampaignDialog({ campaign, people, offers = [], currentUserId, onClose, onSaved }: { campaign: CampaignView | null; people: Person[]; offers?: { id: string; name: string }[]; currentUserId: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({
    name: campaign?.name ?? "",
    description: campaign?.description ?? "",
    status: campaign?.status ?? "DRAFT",
    sector: campaign?.sector ?? "",
    area: campaign?.area ?? "",
    ownerId: campaign ? (campaign.ownerId ?? NONE) : currentUserId,
    startsOn: campaign?.startsOn ?? "",
    endsOn: campaign?.endsOn ?? "",
    goalLeads: campaign?.goalLeads ? String(campaign.goalLeads) : "",
    goalMeetings: campaign?.goalMeetings ? String(campaign.goalMeetings) : "",
    offerId: campaign?.offer?.id ?? NONE,
  })
  // An offer archived since stays selectable on the campaign that leads with it.
  const offerChoices = campaign?.offer && !offers.some((o) => o.id === campaign.offer!.id) ? [...offers, { id: campaign.offer.id, name: `${campaign.offer.name} (archivée)` }] : offers
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const int = (v: string) => (v.trim() ? Math.round(Number(v)) : null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    const body = {
      name: form.name,
      description: form.description || null,
      status: form.status,
      sector: form.sector || null,
      area: form.area || null,
      ownerId: form.ownerId === NONE ? null : form.ownerId,
      startsOn: form.startsOn || null,
      endsOn: form.endsOn || null,
      goalLeads: int(form.goalLeads),
      goalMeetings: int(form.goalMeetings),
      ...(offerChoices.length ? { offerId: form.offerId === NONE ? null : form.offerId } : {}),
    }
    try {
      const r = campaign
        ? await api<{ id: string }>(`/api/campaigns/${campaign.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api<{ id: string }>("/api/campaigns", { method: "POST", body: JSON.stringify(body) })
      toast.success(campaign ? "Campagne enregistrée" : "Campagne créée")
      onSaved(r.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{campaign ? "Modifier la campagne" : "Nouvelle campagne"}</DialogTitle>
            <DialogDescription>Une cible (secteur et zone) travaillée sur une période. Ses chiffres sont calculés à partir des fiches que vous y rangez.</DialogDescription>
          </DialogHeader>
          <FormField label="Nom" required hint="Par exemple « Assurance – PME » ou « Services IT – Suisse ».">
            <Input value={form.name} onChange={set("name")} maxLength={80} autoFocus />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Secteur">
              <Input value={form.sector} onChange={set("sector")} maxLength={100} placeholder="Assurance" />
            </FormField>
            <FormField label="Zone">
              <Input value={form.area} onChange={set("area")} maxLength={120} placeholder="Suisse romande" />
            </FormField>
          </div>
          {offerChoices.length > 0 && (
            <FormField label="Offre phare" hint="L’offre du catalogue que la campagne met en avant : Jev trie ses fiches pour elle.">
              {(props) => (
                <Select value={form.offerId} onValueChange={(v) => setForm((f) => ({ ...f, offerId: v }))}>
                  <SelectTrigger {...props}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Aucune</SelectItem>
                    {offerChoices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}
          <FormField label="Offre et angle" hint="Ce que l’on propose, à qui, avec quel argument.">
            <Textarea value={form.description} onChange={set("description")} maxLength={1000} rows={3} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Statut">
              {(props) => (
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}>
                  <SelectTrigger {...props}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(campaignStatus).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Responsable">
              {(props) => (
                <Select value={form.ownerId} onValueChange={(v) => setForm((f) => ({ ...f, ownerId: v }))}>
                  <SelectTrigger {...props}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Personne</SelectItem>
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name ?? p.email}{p.id === currentUserId ? " (moi)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Début">
              <Input type="date" value={form.startsOn} onChange={set("startsOn")} />
            </FormField>
            <FormField label="Fin">
              <Input type="date" value={form.endsOn} onChange={set("endsOn")} min={form.startsOn || undefined} />
            </FormField>
            <FormField label="Objectif de prospects" hint="Facultatif.">
              <Input type="number" inputMode="numeric" min={1} value={form.goalLeads} onChange={set("goalLeads")} />
            </FormField>
            <FormField label="Objectif de rendez-vous" hint="Facultatif.">
              <Input type="number" inputMode="numeric" min={1} value={form.goalMeetings} onChange={set("goalMeetings")} />
            </FormField>
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={busy}>{campaign ? "Enregistrer" : "Créer la campagne"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
