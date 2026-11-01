"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/crm/empty-state"
import { StatusBadge } from "@/components/crm/status-badge"
import { Definition } from "@/components/crm/definition"
import { campaignStatus } from "@/lib/crm/status"
import { formatDate } from "@/lib/crm/format"
import { CAMPAIGN_INDICATORS, formatCount, formatRate } from "@/features/metrics/definitions"
import type { CampaignView } from "@/features/campaigns/service"
import { CampaignDialog, type Person } from "./campaign-dialog"

const COLUMNS = ["leads", "contacted", "replied", "meetings", "won"] as const

function period(c: CampaignView) {
  if (!c.startsOn && !c.endsOn) return null
  return `${c.startsOn ? formatDate(c.startsOn) : "…"} → ${c.endsOn ? formatDate(c.endsOn) : "…"}`
}

/** Progress towards an optional goal; nothing at all when there is no goal (no invented target). */
function Goal({ value, goal, label }: { value: number; goal: number | null; label: string }) {
  if (!goal) return null
  const pct = Math.min(100, Math.round((value / goal) * 100))
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span className="tabular-nums">{formatCount(value)} / {formatCount(goal)}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${label} : ${pct} % de l’objectif`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function CampaignsView({ campaigns, archived, people, currentUserId, canManage }: { campaigns: CampaignView[]; archived: boolean; people: Person[]; currentUserId: string; canManage: boolean }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Les chiffres suivent les fiches de chaque campagne depuis leur rangement{archived ? "" : " et ne comptent que les fiches que vous voyez"}. Survolez un intitulé pour sa définition.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm"><Link href={archived ? "/app/campaigns" : "/app/campaigns?archived=1"}><Archive className="h-4 w-4" aria-hidden="true" /> {archived ? "Campagnes en cours" : "Archives"}</Link></Button>
          {canManage && !archived && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle campagne</Button>}
        </div>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          art="rocket"
          title={archived ? "Aucune campagne archivée" : "Pas encore de campagne"}
          description={archived ? undefined : "Une campagne réunit une cible (secteur et zone), les recherches lancées pour elle et les fiches qu’on y range. Ses résultats sont mesurés, pas estimés."}
          action={canManage && !archived ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Créer une campagne</Button> : undefined}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">Campagnes et leurs résultats</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-semibold">Campagne</th>
                {COLUMNS.map((k) => (
                  <th key={k} scope="col" className="px-3 py-3 text-right font-semibold"><Definition label={CAMPAIGN_INDICATORS[k].label} definition={CAMPAIGN_INDICATORS[k].definition} /></th>
                ))}
                <th scope="col" className="px-3 py-3 text-right font-semibold"><Definition label="Conv." definition={CAMPAIGN_INDICATORS.conversion.definition} /></th>
                <th scope="col" className="w-48 px-4 py-3 font-semibold">Objectifs</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <Link href={`/app/campaigns/${c.id}`} className="font-semibold underline-offset-2 hover:underline">{c.name}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge map={campaignStatus} value={c.status} />
                      {[c.sector, c.area].filter(Boolean).join(" · ")}
                      {period(c) && <span>{period(c)}</span>}
                      {c.ownerName && <span>· {c.ownerName}</span>}
                    </div>
                  </td>
                  {COLUMNS.map((k) => (
                    <td key={k} className="px-3 py-3 text-right font-semibold tabular-nums">
                      {k === "leads" ? <Link href={`/app/leads?campaign=${c.id}`} className="underline-offset-2 hover:underline">{formatCount(c.stats[k])}</Link> : formatCount(c.stats[k])}
                      {k === "replied" && <div className="text-xs font-normal text-muted-foreground">{formatRate(c.stats.replyRate)}</div>}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatRate(c.stats.conversion)}</td>
                  <td className="space-y-2 px-4 py-3">
                    <Goal label="Prospects" value={c.stats.leads} goal={c.goalLeads} />
                    <Goal label="RDV" value={c.stats.meetings} goal={c.goalMeetings} />
                    {!c.goalLeads && !c.goalMeetings && <span className="text-xs text-muted-foreground">Aucun objectif</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {creating && <CampaignDialog campaign={null} people={people} currentUserId={currentUserId} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/app/campaigns/${id}`)} />}
    </div>
  )
}

export { Goal }
