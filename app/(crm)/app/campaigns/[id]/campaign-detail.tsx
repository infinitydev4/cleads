"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Archive, ArchiveRestore, CheckCircle2, Pause, Pencil, Play, Search, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { StatusBadge } from "@/components/crm/status-badge"
import { Definition } from "@/components/crm/definition"
import { FunnelBars } from "@/components/crm/funnel-bars"
import { campaignStatus, searchStatus } from "@/lib/crm/status"
import { formatDate } from "@/lib/crm/format"
import { CAMPAIGN_INDICATORS, INDICATORS, formatCount, formatRate } from "@/features/metrics/definitions"
import type { CampaignDetail } from "@/features/campaigns/service"
import { api } from "../../leads/api"
import type { RelevanceView } from "@/features/relevance/service"
import { CampaignDialog, type Person } from "../campaign-dialog"
import { RelevanceCard } from "./relevance-card"
import { WatchCard } from "./watch-card"
import { PeopleCard } from "./people-card"
import { Goal } from "../campaigns-view"

/** Eight weeks of fiches created and meetings booked, as plain bars (values are also in the accessible table). */
function WeeklyBars({ weekly }: { weekly: CampaignDetail["weekly"] }) {
  const top = Math.max(1, ...weekly.map((w) => w.leads))
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
  return (
    <figure>
      <div className="flex h-36 gap-2" aria-hidden="true">
        {weekly.map((w) => (
          <div key={w.weekEnding} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-0.5">
              <div className="w-1/2 rounded-t bg-sidebar" style={{ height: `${(w.leads / top) * 100}%`, minHeight: w.leads ? 3 : 0 }} />
              <div className="w-1/3 rounded-t bg-primary" style={{ height: `${(w.meetings / top) * 100}%`, minHeight: w.meetings ? 3 : 0 }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{day.format(new Date(w.weekEnding))}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sidebar" aria-hidden="true" /> Prospects créés</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" aria-hidden="true" /> RDV pris</span>
      </figcaption>
      <table className="sr-only">
        <caption>Par semaine</caption>
        <thead><tr><th>Semaine se terminant le</th><th>Prospects</th><th>RDV</th></tr></thead>
        <tbody>{weekly.map((w) => <tr key={w.weekEnding}><td>{day.format(new Date(w.weekEnding))}</td><td>{w.leads}</td><td>{w.meetings}</td></tr>)}</tbody>
      </table>
    </figure>
  )
}

function Figure({ k, value, sub }: { k: keyof typeof CAMPAIGN_INDICATORS; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground"><Definition label={CAMPAIGN_INDICATORS[k].label} definition={CAMPAIGN_INDICATORS[k].definition} /></p>
      <p className="mt-1 text-2xl font-extrabold tracking-[-0.04em] tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

export function CampaignDetailView({
  campaign: c,
  people,
  offers = [],
  relevance = null,
  currentUserId,
  canSearch,
}: {
  campaign: CampaignDetail
  people: Person[]
  offers?: { id: string; name: string }[]
  /** E25: Jev's sorting of the campaign's fiches, for those who may read it. */
  relevance?: RelevanceView | null
  currentUserId: string
  canSearch: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function patch(body: object, label: string) {
    setBusy(true)
    try {
      await api(`/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify(body) })
      toast.success(label)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  const s = c.stats
  const target = [c.sector, c.area].filter(Boolean).join(" · ")
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge map={campaignStatus} value={c.status} />
        {c.archived && <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold">Archivée</span>}
        {target && <span className="text-sm text-muted-foreground">{target}</span>}
        {(c.startsOn || c.endsOn) && <span className="text-sm text-muted-foreground">· {c.startsOn ? formatDate(c.startsOn) : "…"} → {c.endsOn ? formatDate(c.endsOn) : "…"}</span>}
        {c.ownerName && <span className="text-sm text-muted-foreground">· Responsable : {c.ownerName}</span>}
        {c.offer && <span className="text-sm text-muted-foreground">· Offre phare : {c.offer.name}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/app/leads?campaign=${c.id}`}><Users className="h-4 w-4" aria-hidden="true" /> Voir les fiches</Link></Button>
          {canSearch && c.can.manage && !c.archived && <Button asChild variant="outline" size="sm"><Link href={`/app/search?campaign=${c.id}`}><Search className="h-4 w-4" aria-hidden="true" /> Nouvelle recherche</Link></Button>}
          {c.can.manage && !c.archived && (
            <>
              {c.status !== "ACTIVE" && c.status !== "COMPLETED" && <Button size="sm" loading={busy} onClick={() => patch({ status: "ACTIVE" }, "Campagne lancée")}><Play className="h-4 w-4" aria-hidden="true" /> Lancer</Button>}
              {c.status === "ACTIVE" && <Button variant="outline" size="sm" loading={busy} onClick={() => patch({ status: "PAUSED" }, "Campagne en pause")}><Pause className="h-4 w-4" aria-hidden="true" /> Pause</Button>}
              {(c.status === "ACTIVE" || c.status === "PAUSED") && <Button variant="outline" size="sm" loading={busy} onClick={() => patch({ status: "COMPLETED" }, "Campagne terminée")}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Terminer</Button>}
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden="true" /> Modifier</Button>
              <Button variant="ghost" size="sm" loading={busy} onClick={() => window.confirm(`Archiver « ${c.name} » ? Ses fiches et ses chiffres sont conservés ; elle ne sera plus proposée.`) && patch({ archived: true }, "Campagne archivée")}><Archive className="h-4 w-4" aria-hidden="true" /> Archiver</Button>
            </>
          )}
          {c.can.manage && c.archived && <Button variant="outline" size="sm" loading={busy} onClick={() => patch({ archived: false }, "Campagne restaurée")}><ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restaurer</Button>}
        </div>
      </div>

      {c.description && <p className="max-w-3xl whitespace-pre-line rounded-xl border bg-card p-4 text-sm">{c.description}</p>}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Figure k="leads" value={formatCount(s.leads)} />
        <Figure k="contacted" value={formatCount(s.contacted)} />
        <Figure k="replied" value={formatCount(s.replied)} sub={`${formatRate(s.replyRate)} des contactés`} />
        <Figure k="qualified" value={formatCount(s.qualified)} />
        <Figure k="meetings" value={formatCount(s.meetings)} sub={`Conversion ${formatRate(s.conversion)}`} />
        <Figure k="won" value={formatCount(s.won)} />
      </div>

      {relevance && <RelevanceCard view={relevance} campaignId={c.id} userId={currentUserId} />}

      <WatchCard campaignId={c.id} archived={c.archived} />

      <PeopleCard campaignId={c.id} archived={c.archived} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-4 p-5">
          <h2 className="font-bold">Jusqu’où vont les fiches</h2>
          <FunnelBars steps={(["leads", "contacted", "replied", "qualified", "meetings", "won"] as const).map((k) => ({ key: k, label: CAMPAIGN_INDICATORS[k].label, count: s[k], definition: CAMPAIGN_INDICATORS[k].definition }))} />
          {(c.goalLeads || c.goalMeetings) && (
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <Goal label="Objectif de prospects" value={s.leads} goal={c.goalLeads} />
              <Goal label="Objectif de rendez-vous" value={s.meetings} goal={c.goalMeetings} />
            </div>
          )}
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="font-bold">Huit dernières semaines</h2>
          <WeeklyBars weekly={c.weekly} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-sm">
            <dt className="text-muted-foreground">Sur 30 jours</dt><dd />
            {(["leads", "contacted", "replied", "meetings"] as const).map((k) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground"><Definition label={INDICATORS[k].label} definition={INDICATORS[k].definition} /></dt>
                <dd className="text-right font-semibold tabular-nums">{formatCount(c.recent[k])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">Recherches pour cette campagne</h2>
          {c.searches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune. Une recherche lancée depuis cette page range ses imports dans la campagne.</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.searches.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/app/search/${r.id}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">{r.label}</Link>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><StatusBadge map={searchStatus} value={r.status} /> {formatCount(r.importedCount)} importées</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">Séquences utilisées</h2>
          {c.sequences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune fiche de la campagne n’est inscrite dans une séquence.</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.sequences.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-medium">{q.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatCount(q.active)} en cours · {formatCount(q.total)} inscrites</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && <CampaignDialog campaign={c} people={people} offers={offers} currentUserId={currentUserId} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh() }} />}
    </div>
  )
}
