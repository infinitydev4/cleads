"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Handshake } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { dealStage } from "@/lib/crm/status"
import { euros } from "@/lib/crm/format"
import { DEAL_OWNER_ROLES, STAGES } from "@/features/pipeline/rules"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"
import { LostDialog } from "./lost-dialog"
import { personName, type Assignee } from "./filter-bar"

const NONE = "__none__"

/** The opportunities of a fiche. Editable by whoever may move them; the server applies the rules per role either way. */
export function DealsEditor({ lead, assignees, onChange }: { lead: LeadDetail; assignees: Assignee[]; onChange: (lead: LeadDetail) => void }) {
  const [lostFor, setLostFor] = useState<string | null>(null)
  const owners = assignees.filter((a) => (DEAL_OWNER_ROLES as readonly string[]).includes(a.role))

  async function patch(dealId: string, body: object) {
    try {
      await api(`/api/deals/${dealId}`, { method: "PATCH", body: JSON.stringify(body) })
      onChange(await api<LeadDetail>(`/api/leads/${lead.id}`))
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
      return false
    }
  }

  if (lead.deals.length === 0) return null
  const target = lead.deals.find((d) => d.id === lostFor)

  return (
    <section aria-label="Opportunités" className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Handshake className="h-4 w-4" aria-hidden="true" /> Opportunités</h3>
      {lead.deals.map((d) => (
        <div key={d.id} className="grid gap-3 rounded-xl border p-3 text-sm sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Étape
            <Select value={d.stage} disabled={!d.canMove} onValueChange={(stage) => (stage === "LOST" ? setLostFor(d.id) : patch(d.id, { stage }))}>
              <SelectTrigger aria-label="Étape de l’opportunité"><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{dealStage[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsable
            <Select value={d.ownerId ?? NONE} disabled={!lead.can.assignOthers} onValueChange={(v) => patch(d.id, { ownerId: v === NONE ? null : v })}>
              <SelectTrigger aria-label="Responsable de l’opportunité"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>À attribuer</SelectItem>
                {owners.map((o) => <SelectItem key={o.id} value={o.id}>{personName(o)}</SelectItem>)}
                {d.ownerId && !owners.some((o) => o.id === d.ownerId) && <SelectItem value={d.ownerId}>{d.ownerName}</SelectItem>}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Montant (€)
            <Input key={`${d.id}-${d.amountCents}`} inputMode="decimal" defaultValue={d.amountCents != null ? String(d.amountCents / 100) : ""} disabled={!d.canMove} placeholder={d.canMove ? "Non renseigné" : euros(d.amountCents)} aria-label="Montant de l’opportunité"
              onBlur={(e) => {
                const raw = e.target.value.trim().replace(",", ".")
                const cents = raw === "" ? null : Math.round(Number(raw) * 100)
                if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return toast.error("Montant invalide")
                if (cents !== d.amountCents) patch(d.id, { amountCents: cents })
              }} />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signature prévue
            <Input key={`${d.id}-${d.expectedCloseAt}`} type="date" defaultValue={d.expectedCloseAt?.slice(0, 10) ?? ""} disabled={!d.canMove} aria-label="Date de signature prévue"
              onBlur={(e) => {
                const value = e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : null
                if (value !== d.expectedCloseAt) patch(d.id, { expectedCloseAt: value })
              }} />
          </label>
          {d.stage === "LOST" && d.lostReason && <p className="text-sm text-muted-foreground sm:col-span-2">Perdue : {d.lostReason}</p>}
        </div>
      ))}
      <LostDialog
        key={lostFor ?? "closed"}
        name={lead.company?.name ?? "Opportunité"}
        open={!!target}
        onCancel={() => setLostFor(null)}
        onConfirm={async (reason, detail) => {
          if (await patch(lostFor!, { stage: "LOST", lostReason: reason, lostDetail: detail || undefined })) setLostFor(null)
        }}
      />
    </section>
  )
}
