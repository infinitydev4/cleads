"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Megaphone } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"

const NONE = "__none__"

export interface CampaignOption {
  id: string
  name: string
  status: string
}

/** The campaign of a fiche (E15): a selector for who may file it, a link for everyone else. */
export function CampaignField({ lead, onChange }: { lead: LeadDetail; onChange: (campaignId: string | null) => void }) {
  const [options, setOptions] = useState<CampaignOption[] | null>(null)

  useEffect(() => {
    if (!lead.can.campaign) return
    let cancelled = false
    api<{ campaigns: CampaignOption[] }>("/api/campaigns?options=1").then((r) => !cancelled && setOptions(r.campaigns)).catch(() => !cancelled && setOptions([]))
    return () => { cancelled = true }
  }, [lead.can.campaign])

  if (!lead.can.campaign || !options) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Campagne :</span>
        {lead.campaign ? <Link href={`/app/campaigns/${lead.campaign.id}`} className="font-medium underline-offset-2 hover:underline">{lead.campaign.name}</Link> : <span>aucune</span>}
      </p>
    )
  }
  return (
    <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campagne
      <Select value={lead.campaign?.id ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger aria-label="Campagne"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Aucune campagne</SelectItem>
          {options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          {lead.campaign && !options.some((c) => c.id === lead.campaign!.id) && <SelectItem value={lead.campaign.id}>{lead.campaign.name}{lead.campaign.archived ? " (archivée)" : ""}</SelectItem>}
        </SelectContent>
      </Select>
    </label>
  )
}
