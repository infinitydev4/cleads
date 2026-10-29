"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Merge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/crm/empty-state"
import { StatusBadge } from "@/components/crm/status-badge"
import { leadStatus } from "@/lib/crm/status"
import { formatPhone } from "@/lib/crm/normalize"
import type { DuplicateGroup } from "@/features/leads/duplicates"
import { api } from "../api"

export function DuplicatesList({ groups }: { groups: DuplicateGroup[] }) {
  if (groups.length === 0) return <EmptyState art="target" title="Aucun doublon repéré" description="Les fiches sont comparées sur le SIRET, le site web, le nom avec la ville et le téléphone." />
  return <div className="space-y-6">{groups.map((g) => <Group key={g.id} group={g} />)}</div>
}

function Group({ group }: { group: DuplicateGroup }) {
  const router = useRouter()
  const [keep, setKeep] = useState(group.members[0].leadId)
  const [busy, setBusy] = useState(false)

  async function merge() {
    setBusy(true)
    try {
      for (const m of group.members) if (m.leadId !== keep) await api("/api/leads/duplicates/merge", { method: "POST", body: JSON.stringify({ keepId: keep, dropId: m.leadId }) })
      toast.success("Fiches fusionnées")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">Repérées par : {group.reasons.join(", ")}</p>
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="sr-only">Fiche à garder</legend>
        {group.members.map((m) => (
          <label key={m.leadId} className={`cursor-pointer rounded-xl border p-4 text-sm transition-colors ${keep === m.leadId ? "border-foreground bg-accent/50" : "hover:bg-accent/30"}`}>
            <span className="flex items-start gap-3">
              <input type="radio" name={`keep-${group.id}`} checked={keep === m.leadId} onChange={() => setKeep(m.leadId)} className="mt-1" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-semibold">{m.name}{keep === m.leadId && <span className="ml-2 text-xs font-normal text-muted-foreground">à garder</span>}</span>
                <span className="block text-muted-foreground">{[m.city, m.website, m.email, formatPhone(m.phone)].filter(Boolean).join(" · ") || "—"}</span>
                <span className="flex flex-wrap items-center gap-2 pt-1"><StatusBadge map={leadStatus} value={m.status} /><span>score {m.score}</span><span>{m.activities} entrée{m.activities > 1 ? "s" : ""}</span><span>{m.ownerName ?? "pool"}</span></span>
                <Link href={`/app/leads/${m.leadId}`} className="inline-block text-xs underline" onClick={(e) => e.stopPropagation()}>Voir la fiche</Link>
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex justify-end">
        <Button onClick={merge} loading={busy}><Merge className="h-4 w-4" aria-hidden="true" /> Fusionner dans la fiche gardée</Button>
      </div>
    </Card>
  )
}
