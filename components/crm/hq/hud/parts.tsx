"use client"

import Link from "next/link"
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck2, Filter, Rocket, Users } from "lucide-react"
import { Definition } from "@/components/crm/definition"
import { campaignStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import { CAMPAIGN_INDICATORS, INDICATORS, formatCount, formatDeltaPct, formatDeltaPts, formatRate } from "@/features/metrics/definitions"
import { zoneById } from "@/features/hq/zones"
import { ZONE_ICONS } from "../zone-icons"
import { selectZone, useHq, useHqStore } from "../store"

/** The white floating card every HUD piece sits in. */
export function Glass({ as: Tag = "section", className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "aside" }) {
  return (
    <Tag {...rest} className={cn("pointer-events-auto rounded-2xl border border-white/70 bg-card/95 shadow-pop backdrop-blur-md supports-[backdrop-filter]:bg-card/85", className)}>
      {children}
    </Tag>
  )
}

function Trend({ text, up }: { text: string | null; up: boolean }) {
  if (!text) return null
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", up ? "text-success" : "text-destructive-text")}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
      {text}
    </span>
  )
}

/** The four key figures of the reference design, each with its definition and its trend against the previous period. */
export function KpiStrip() {
  const kpis = useHq((s) => s.overview.kpis)
  const days = useHq((s) => s.days)
  const cards = [
    { key: "leads", icon: Users, label: "Prospects générés", definition: INDICATORS.leads.definition, value: formatCount(kpis.leads.value), trend: formatDeltaPct(kpis.leads.delta), up: (kpis.leads.delta ?? 0) >= 0, hint: `vs ${days} jours précédents` },
    { key: "meetings", icon: CalendarCheck2, label: "RDV pris", definition: INDICATORS.meetings.definition, value: formatCount(kpis.meetings.value), trend: formatDeltaPct(kpis.meetings.delta), up: (kpis.meetings.delta ?? 0) >= 0, hint: `vs ${days} jours précédents` },
    { key: "conversion", icon: Filter, label: "Taux de conversion", definition: INDICATORS.conversion.definition, value: formatRate(kpis.conversion.value), trend: formatDeltaPts(kpis.conversion.deltaPts), up: (kpis.conversion.deltaPts ?? 0) >= 0, hint: "vs période précédente" },
    { key: "campaigns", icon: Rocket, label: "Campagnes actives", definition: INDICATORS.activeCampaigns.definition, value: formatCount(kpis.campaigns.active), trend: kpis.campaigns.createdInPeriod ? `+${kpis.campaigns.createdInPeriod}` : null, up: true, hint: `sur ${formatCount(kpis.campaigns.total)} campagne${kpis.campaigns.total > 1 ? "s" : ""}` },
  ]
  return (
    <ul className="pointer-events-none flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3" aria-label={`Indicateurs sur ${days} jours`}>
      {cards.map((c) => (
        <li key={c.key} className="shrink-0">
          <Glass as="div" className="flex min-w-[178px] items-center gap-3 px-3.5 py-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/25 text-sidebar"><c.icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-foreground"><Definition label={c.label} definition={c.definition} className="no-underline" /></span>
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold tracking-[-0.04em] tabular-nums">{c.value}</span>
                <Trend text={c.trend} up={c.up} />
              </span>
              <span className="block text-[11px] text-muted-foreground">{c.hint}</span>
            </span>
          </Glass>
        </li>
      ))}
    </ul>
  )
}

/** "Parcours d'acquisition": the steps of the funnel; a step opens the space where it happens. */
export function Journey() {
  const store = useHqStore()
  const journey = useHq((s) => s.overview.journey)
  const conversion = useHq((s) => s.overview.conversion)
  const days = useHq((s) => s.days)
  const focus = useHq((s) => s.focus)
  const reached = journey.findIndex((j) => j.zone === focus)
  return (
    <Glass className="px-4 pb-3 pt-3">
      <h2 className="mb-2 flex items-center justify-between gap-3 text-sm font-bold">
        Parcours d’acquisition <span className="text-xs font-medium text-muted-foreground">{days} derniers jours</span>
      </h2>
      <ol className="flex items-start gap-1">
        {journey.map((j, i) => {
          const Icon = ZONE_ICONS[j.zone]
          const done = reached === -1 ? true : i <= reached
          const current = i === reached
          return (
            <li key={j.key} className="relative flex min-w-[68px] flex-1 flex-col items-center">
              {i > 0 && <span aria-hidden="true" className={cn("absolute right-1/2 top-4 h-0.5 w-full", done ? "bg-primary" : "bg-border")} />}
              <button
                type="button"
                onClick={() => selectZone(store, j.zone)}
                title={`${INDICATORS[j.key as keyof typeof INDICATORS]?.definition ?? ""} Ouvre l’espace ${zoneById(j.zone)?.label}.`}
                className="group relative flex flex-col items-center gap-1 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("grid h-8 w-8 place-items-center rounded-full border-2 transition-transform group-hover:scale-110", current ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/30" : done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-semibold leading-tight">{j.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{formatCount(j.count)}</span>
              </button>
            </li>
          )
        })}
        <li className="flex min-w-[72px] flex-1 flex-col items-center gap-1 border-l pl-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-sidebar text-[10px] font-bold text-primary" aria-hidden="true">%</span>
          <span className="text-[11px] font-semibold leading-tight"><Definition label="Conversion" definition={INDICATORS.conversion.definition} className="no-underline" /></span>
          <span className="text-[11px] font-bold tabular-nums">{formatRate(conversion)}</span>
        </li>
      </ol>
    </Glass>
  )
}

/** "Performances des campagnes": the leading campaigns, measured on their own fiches. */
export function CampaignsCard() {
  const campaigns = useHq((s) => s.overview.campaigns)
  return (
    <Glass className="p-4">
      <h2 className="mb-2 flex items-center justify-between gap-3 text-sm font-bold">
        Performances des campagnes
        <Link href="/app/campaigns" prefetch={false} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">Voir toutes <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </h2>
      {campaigns.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune campagne pour l’instant. Créez-en une pour mesurer une cible.</p>
      ) : (
        <table className="w-full text-xs">
          <caption className="sr-only">Campagnes et résultats</caption>
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="pb-1 font-semibold">Campagne</th>
              <th scope="col" className="pb-1 text-right font-semibold">{CAMPAIGN_INDICATORS.leads.label}</th>
              <th scope="col" className="pb-1 text-right font-semibold">{CAMPAIGN_INDICATORS.meetings.label}</th>
              <th scope="col" className="pb-1 text-right font-semibold"><Definition label="Conv." definition={CAMPAIGN_INDICATORS.conversion.definition} className="no-underline" /></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.slice(0, 3).map((c) => (
              <tr key={c.id} className="border-t">
                <td className="max-w-[150px] truncate py-1.5">
                  <Link href={`/app/campaigns/${c.id}`} prefetch={false} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", c.status === "ACTIVE" ? "bg-primary ring-1 ring-sidebar/30" : "bg-border")} aria-hidden="true" />
                    {c.name}
                    <span className="sr-only">, {campaignStatus[c.status].label}</span>
                  </Link>
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatCount(c.leads)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCount(c.meetings)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{formatRate(c.conversion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Glass>
  )
}
