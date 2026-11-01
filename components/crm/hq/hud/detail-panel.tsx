"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Building2, CalendarDays, ExternalLink, Globe, Lock, Mail, MapPin, Phone, Shirt, Star, UserRound, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/crm/status-badge"
import { Definition } from "@/components/crm/definition"
import { FunnelBars } from "@/components/crm/funnel-bars"
import { campaignStatus, dealStage, leadStatus, meetingStatus, searchStatus } from "@/lib/crm/status"
import { ROLE_LABELS } from "@/lib/crm/roles"
import { ago, euros, formatDateTime } from "@/lib/crm/format"
import { formatPhone } from "@/lib/crm/normalize"
import { cn } from "@/lib/utils"
import { CAMPAIGN_INDICATORS, INDICATORS, formatCount, formatRate } from "@/features/metrics/definitions"
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from "@/features/hq/characters"
import { zoneById, type ZoneId } from "@/features/hq/zones"
import type { HqMember, LeadMini, MeetingMini, ZoneDetail } from "@/features/hq/types"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "@/app/(crm)/app/leads/api"
import { LeadPanel } from "@/app/(crm)/app/leads/lead-panel"
import { MeetingDialog } from "@/app/(crm)/app/leads/meeting-dialog"
import { EmailDialog } from "@/app/(crm)/app/leads/email-dialog"
import { ZONE_ICONS } from "../zone-icons"
import { clearSelection, useHq, useHqStore } from "../store"
import { Glass } from "./parts"

// ---------------------------------------------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------------------------------------------

function PanelHeader({ icon, kicker, title, subtitle, onClose, onBack }: { icon: React.ReactNode; kicker: string; title: string; subtitle?: React.ReactNode; onClose: () => void; onBack?: () => void }) {
  return (
    <header className="flex items-start gap-3 border-b px-4 pb-3 pt-4">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Retour" className="-ml-1 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-sidebar">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{kicker}</p>
        <h2 className="truncate text-lg font-extrabold tracking-[-0.03em]">{title}</h2>
        {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <button type="button" onClick={onClose} aria-label="Fermer le panneau (Échap)" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </header>
  )
}

function Stat({ label, value, definition, tone }: { label: string; value: string; definition?: string; tone?: "attention" }) {
  return (
    <div className={cn("rounded-xl bg-muted/70 px-3 py-2", tone === "attention" && "bg-warning-subtle")}>
      <p className="text-[11px] font-medium text-muted-foreground">{definition ? <Definition label={label} definition={definition} className="no-underline" /> : label}</p>
      <p className={cn("text-lg font-extrabold tabular-nums tracking-[-0.03em]", tone === "attention" && "text-warning")}>{value}</p>
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}{action}</h3>
      {children}
    </section>
  )
}

function LeadRowButton({ lead, onOpen, extra }: { lead: Pick<LeadMini, "id" | "name" | "city" | "status"> & { score?: number }; onOpen: (id: string) => void; extra?: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(lead.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted"><Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{lead.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{[lead.city, extra].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && " · "}{x}</span>)}</span>
        </span>
        <StatusBadge map={leadStatus} value={lead.status} />
      </button>
    </li>
  )
}

function MeetingRow({ m, onOpen }: { m: MeetingMini; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" disabled={!m.leadId} onClick={() => m.leadId && onOpen(m.leadId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{m.leadName}</span>
          <span className="block truncate text-xs text-muted-foreground">{formatDateTime(m.startsAt)} · {m.hostName}</span>
        </span>
        {m.needsOutcome ? <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[11px] font-semibold text-warning">À clôturer</span> : <StatusBadge map={meetingStatus} value={m.status} />}
      </button>
    </li>
  )
}

function OpenModule({ zone }: { zone: ZoneId }) {
  const def = zoneById(zone)!
  return (
    <Button asChild className="w-full">
      <Link href={def.href}>{def.hrefLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
    </Button>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{children}</p>

// ---------------------------------------------------------------------------------------------------------------
// A space
// ---------------------------------------------------------------------------------------------------------------

function ZoneBody({ data, openLead }: { data: ZoneDetail; openLead: (id: string) => void }) {
  if ("locked" in data) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{data.reason} Demandez à un responsable si vous en avez besoin.</p>
      </div>
    )
  }
  switch (data.zone) {
    case "sources":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Imports (30 j)" value={formatCount(data.imports.batches)} />
            <Stat label="Fiches créées" value={formatCount(data.imports.created)} />
          </div>
          {data.health && (
            <p className={cn("rounded-lg px-3 py-2 text-xs font-medium", data.health.state === "ok" ? "bg-success-subtle text-success" : data.health.state === "not_configured" ? "bg-muted text-muted-foreground" : "bg-warning-subtle text-warning")}>
              Cleads Extractor : {{ ok: "opérationnel", degraded: "ralenti", down: "à l’arrêt", unreachable: "injoignable", not_configured: "non configuré" }[data.health.state] ?? data.health.state}
              {data.health.blocked.length > 0 && ` · sources bloquées : ${data.health.blocked.join(", ")}`}
            </p>
          )}
          <Section title="Dernières recherches">
            {data.searches.length === 0 ? <Empty>Aucune recherche lancée.</Empty> : (
              <ul className="space-y-1">
                {data.searches.map((s) => (
                  <li key={s.id}>
                    <Link href={`/app/search/${s.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{s.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatCount(s.found)} trouvées · {formatCount(s.imported)} importées{s.campaignName ? ` · ${s.campaignName}` : ""}</span>
                      </span>
                      <StatusBadge map={searchStatus} value={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="D’où viennent les prospects (30 j)">
            {data.bySource.length === 0 ? <Empty>Aucun prospect créé sur la période.</Empty> : <FunnelBars steps={data.bySource.map((b) => ({ key: b.source, label: b.label, count: b.count }))} />}
          </Section>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.can.search && <Button asChild><Link href="/app/search">Nouvelle recherche</Link></Button>}
            {data.can.import && <Button asChild variant="outline"><Link href="/app/leads/import">Importer un CSV</Link></Button>}
          </div>
        </>
      )
    case "qualification":
      return (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="À qualifier" value={formatCount(data.counts.replied)} tone={data.counts.replied ? "attention" : undefined} />
            <Stat label="Contactés" value={formatCount(data.counts.contacted)} />
            <Stat label="Nouveaux" value={formatCount(data.counts.fresh)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Qualifiés (30 j)" value={formatCount(data.qualified)} definition={INDICATORS.qualified.definition} />
            <Stat label="Non qualifiés (30 j)" value={formatCount(data.disqualified)} />
          </div>
          <Section title="À traiter en premier">
            {data.toQualify.length === 0 ? <Empty>Personne n’attend de décision.</Empty> : <ul className="space-y-0.5">{data.toQualify.map((l) => <LeadRowButton key={l.id} lead={l} onOpen={openLead} extra={`score ${l.score}`} />)}</ul>}
          </Section>
          <OpenModule zone="qualification" />
        </>
      )
    case "coordination":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="En retard" value={formatCount(data.today.overdue)} tone={data.today.overdue ? "attention" : undefined} />
            <Stat label="Pour aujourd’hui" value={formatCount(data.today.dueToday)} />
            <Stat label="RDV du jour" value={formatCount(data.today.meetings)} />
            <Stat label="RDV à clôturer" value={formatCount(data.today.toClose)} tone={data.today.toClose ? "attention" : undefined} />
          </div>
          <Section title="Mes tâches">
            {data.tasks.length === 0 ? <Empty>Rien d’urgent : la file du jour est vide.</Empty> : (
              <ul className="space-y-0.5">
                {data.tasks.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openLead(t.leadId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.overdue ? "bg-[#f0b44a]" : "bg-primary ring-1 ring-sidebar/30")} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{t.title}</span> · {t.leadName}</span>
                      {t.overdue && <span className="text-[11px] font-semibold text-warning">en retard</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {data.team && (
            <Section title="L’équipe aujourd’hui">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="pb-1 font-semibold">Membre</th><th className="pb-1 text-right font-semibold">Tâches</th><th className="pb-1 text-right font-semibold">Retard</th><th className="pb-1 text-right font-semibold">RDV</th></tr></thead>
                <tbody>{data.team.map((m) => <tr key={m.id} className="border-t"><td className="truncate py-1">{m.name} <span className="text-muted-foreground">· {ROLE_LABELS[m.role]}</span></td><td className="py-1 text-right tabular-nums">{m.openTasks}</td><td className={cn("py-1 text-right tabular-nums", m.overdue && "font-bold text-warning")}>{m.overdue}</td><td className="py-1 text-right tabular-nums">{m.meetingsToday}</td></tr>)}</tbody>
              </table>
            </Section>
          )}
          <OpenModule zone="coordination" />
        </>
      )
    case "outreach":
      return (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Emails aujourd’hui" value={formatCount(data.emailsToday)} />
            <Stat label="Sur 7 jours" value={formatCount(data.emails7d)} />
            <Stat label="Réponses 7 j" value={formatCount(data.replies7d)} />
            <Stat label="Non lues" value={formatCount(data.unread)} tone={data.unread ? "attention" : undefined} />
            <Stat label="Appels 7 j" value={formatCount(data.calls7d)} />
            <Stat label="En séquence" value={formatCount(data.sequences.enrollments)} />
          </div>
          <Section title="Canaux">
            <ul className="grid grid-cols-2 gap-2">
              {data.channels.map((c) => (
                <li key={c.id} className={cn("rounded-xl border px-3 py-2", c.state === "soon" && "border-dashed opacity-70")}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className={cn("h-2 w-2 rounded-full", c.state === "active" ? "bg-success" : c.state === "idle" ? "bg-[#f0b44a]" : "bg-border")} aria-hidden="true" />
                    {c.label}
                    {c.state === "soon" && <span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">Bientôt</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{c.detail}</p>
                </li>
              ))}
            </ul>
          </Section>
          {data.mailboxes && data.mailboxes.length > 0 && (
            <Section title="Boîtes d’envoi aujourd’hui">
              <ul className="space-y-1 text-xs">
                {data.mailboxes.map((b) => (
                  <li key={b.address} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{b.address}</span>
                    {b.status !== "ACTIVE" && <span className="font-semibold text-warning">{b.status === "PAUSED" ? "en pause" : "en erreur"}</span>}
                    <span className="tabular-nums text-muted-foreground">{b.sentToday}/{b.allowanceToday}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <OpenModule zone="outreach" />
            <Button asChild variant="outline"><Link href="/app/sequences">Séquences</Link></Button>
          </div>
        </>
      )
    case "pipeline":
      return (
        <>
          <Section title="Par étape">
            <ul className="space-y-1.5">
              {data.stages.map((s) => (
                <li key={s.stage} className="flex items-center gap-2 text-sm">
                  <StatusBadge map={dealStage} value={s.stage} />
                  <span className="ml-auto font-bold tabular-nums">{formatCount(s.count)}</span>
                  <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">{s.amountsKnown ? `${euros(s.amountCents)}${s.amountsKnown < s.count ? ` · ${s.amountsKnown}/${s.count}` : ""}` : "—"}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">Gagnées et perdues : 30 derniers jours. Montants : seulement ceux renseignés.</p>
          </Section>
          <Section title="Opportunités ouvertes">
            {data.deals.length === 0 ? <Empty>Aucune opportunité ouverte.</Empty> : (
              <ul className="space-y-0.5">
                {data.deals.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => openLead(d.leadId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
                      <span className="text-xs text-muted-foreground">{euros(d.amountCents)}</span>
                      <StatusBadge map={dealStage} value={d.stage} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <OpenModule zone="pipeline" />
        </>
      )
    case "meetings":
      return (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Aujourd’hui" value={formatCount(data.today.length)} />
            <Stat label="7 prochains jours" value={formatCount(data.next7)} />
            <Stat label="À clôturer" value={formatCount(data.toClose.length)} tone={data.toClose.length ? "attention" : undefined} />
          </div>
          {data.toClose.length > 0 && <Section title="Résultat à saisir"><ul className="space-y-0.5">{data.toClose.map((m) => <MeetingRow key={m.id} m={m} onOpen={openLead} />)}</ul></Section>}
          <Section title="Prochains rendez-vous">
            {data.upcoming.length === 0 ? <Empty>Aucun rendez-vous planifié cette semaine.</Empty> : <ul className="space-y-0.5">{data.upcoming.map((m) => <MeetingRow key={m.id} m={m} onOpen={openLead} />)}</ul>}
          </Section>
          <OpenModule zone="meetings" />
        </>
      )
    case "analytics":
      return (
        <>
          <Section title="Parcours sur la période">
            <FunnelBars steps={data.journey.map((j) => ({ key: j.key, label: j.label, count: j.count, definition: INDICATORS[j.key as keyof typeof INDICATORS]?.definition }))} />
            <p className="text-xs text-muted-foreground">Période précédente : {data.previous.map((p, i) => <span key={p.key}>{i > 0 && " · "}{data.journey[i].label} {formatCount(p.count)}</span>)}</p>
          </Section>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Conversion" value={formatRate(data.conversion)} definition={INDICATORS.conversion.definition} />
            <Stat label="Taux de réponse" value={formatRate(data.journey[1].count ? data.journey[2].count / data.journey[1].count : null)} definition={INDICATORS.replyRate.definition} />
          </div>
          <Section title="Prospects par semaine (8 sem.)">
            <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
              {data.weekly.map((w) => {
                const top = Math.max(1, ...data.weekly.map((x) => x.leads))
                return <span key={w.weekEnding} className="flex-1 rounded-t bg-sidebar" style={{ height: `${Math.max(w.leads ? 6 : 2, (w.leads / top) * 100)}%` }} />
              })}
            </div>
            <p className="sr-only">{data.weekly.map((w) => `${w.leads} prospects et ${w.meetings} RDV la semaine finissant le ${new Date(w.weekEnding).toLocaleDateString("fr-FR")}`).join(" ; ")}</p>
          </Section>
          <Section title="Campagnes">
            {data.campaigns.length === 0 ? <Empty>Pas encore de campagne.</Empty> : (
              <ul className="space-y-1 text-sm">
                {data.campaigns.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <Link href={`/app/campaigns/${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{c.name}</Link>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatCount(c.leads)} · {formatCount(c.meetings)} RDV</span>
                    <span className="w-14 text-right text-xs font-bold tabular-nums">{formatRate(c.conversion)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <OpenModule zone="analytics" />
        </>
      )
    case "campaigns":
      return (
        <>
          {data.campaigns.length === 0 ? <Empty>Aucune campagne. Une campagne réunit une cible, ses recherches et ses fiches, et mesure ses résultats.</Empty> : (
            <ul className="space-y-2">
              {data.campaigns.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/campaigns/${c.id}`} className="block rounded-xl border px-3 py-2 hover:bg-accent">
                    <span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span><StatusBadge map={campaignStatus} value={c.status} /></span>
                    <span className="mt-1 grid grid-cols-4 gap-1 text-[11px] text-muted-foreground">
                      {(["leads", "contacted", "replied", "meetings"] as const).map((k) => <span key={k}><span className="block font-bold tabular-nums text-foreground">{formatCount(c.stats[k])}</span>{CAMPAIGN_INDICATORS[k].label}</span>)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <OpenModule zone="campaigns" />
            {data.canManage && <Button asChild variant="outline"><Link href="/app/campaigns">Nouvelle campagne</Link></Button>}
          </div>
        </>
      )
  }
}

function ZonePanel({ zone, openLead, onClose }: { zone: ZoneId; openLead: (id: string) => void; onClose: () => void }) {
  const days = useHq((s) => s.days)
  const summary = useHq((s) => s.overview.zones[zone])
  const generatedAt = useHq((s) => s.overview.generatedAt)
  const [state, setState] = useState<{ key: string; data?: ZoneDetail; error?: string } | null>(null)
  const key = `${zone}:${days}:${generatedAt}`
  useEffect(() => {
    let cancelled = false
    api<ZoneDetail>(`/api/hq/zones/${zone}?days=${days}`).then((data) => !cancelled && setState({ key, data })).catch((e) => !cancelled && setState({ key, error: e.message }))
    return () => { cancelled = true }
  }, [zone, days, key])
  const def = zoneById(zone)!
  const Icon = ZONE_ICONS[zone]
  const current = state?.key === key || state?.data?.zone === zone ? state : null
  return (
    <>
      <PanelHeader icon={<Icon className="h-5 w-5" aria-hidden="true" />} kicker={`Espace · touche ${def.key}`} title={def.label} subtitle={def.description} onClose={onClose} />
      <div className="space-y-4 overflow-y-auto px-4 py-4">
        {summary.badge && <p className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", summary.tone === "attention" ? "bg-warning-subtle text-warning" : "bg-primary/30 text-sidebar")}>{summary.badge}</p>}
        {current?.error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-text">{current.error}</p>}
        {!current?.data && !current?.error && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-10 w-full" /></div>}
        {current?.data && <ZoneBody data={current.data} openLead={openLead} />}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// A person, a fiche, the building
// ---------------------------------------------------------------------------------------------------------------

function MemberPanel({ member, onClose, onBack }: { member: HqMember; onClose: () => void; onBack?: () => void }) {
  const store = useHqStore()
  const [busy, setBusy] = useState(false)
  async function choose(character: CharacterId) {
    setBusy(true)
    try {
      await api("/api/hq/character", { method: "PUT", body: JSON.stringify({ character }) })
      const overview = store.get().overview
      store.set({ overview: { ...overview, members: overview.members.map((m) => (m.id === member.id ? { ...m, character } : m)), viewer: { ...overview.viewer, character } } })
      toast.success("Personnage choisi")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }
  const station = member.station === "hq" ? "Bâtiment central" : zoneById(member.station)?.label
  const statusLabel = { meeting: "En rendez-vous", online: "Connecté aujourd’hui", offline: "Pas de session aujourd’hui" }[member.status]
  return (
    <>
      <PanelHeader
        icon={<span className="text-sm font-extrabold">{member.initials}</span>}
        kicker={`${ROLE_LABELS[member.role]}${member.isMe ? " · vous" : ""}`}
        title={member.name}
        subtitle={<span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", member.status === "meeting" ? "bg-[#f0b44a]" : member.status === "online" ? "bg-success" : "bg-border")} aria-hidden="true" />{statusLabel} · {station}</span>}
        onClose={onClose}
        onBack={onBack}
      />
      <div className="space-y-4 overflow-y-auto px-4 py-4">
        {member.load ? (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Tâches ouvertes" value={formatCount(member.load.openTasks)} />
            <Stat label="En retard" value={formatCount(member.load.overdue)} tone={member.load.overdue ? "attention" : undefined} />
            <Stat label="RDV aujourd’hui" value={formatCount(member.load.meetingsToday)} />
            <Stat label="Fiches en cours" value={formatCount(member.load.openLeads)} />
            <Stat label="Opportunités" value={formatCount(member.load.openDeals)} />
          </div>
        ) : (
          <Empty>La charge de travail des collègues est visible par les managers et le propriétaire.</Empty>
        )}
        {member.email && <p className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><a href={`mailto:${member.email}`} className="hover:underline">{member.email}</a></p>}
        {member.isMe && (
          <Section title="Mon personnage">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Choisir mon personnage">
              {CHARACTER_IDS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={member.character === id} disabled={busy} onClick={() => choose(id)} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", member.character === id && "border-sidebar bg-primary/25")}>
                  <Shirt className="h-4 w-4 shrink-0" aria-hidden="true" /> {CHARACTERS[id].label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Visible par toute l’équipe dans la vue 3D.</p>
          </Section>
        )}
        <Button asChild variant="outline" className="w-full"><Link href={`/app/leads?owner=${member.isMe ? "me" : member.id}`}>Voir ses fiches</Link></Button>
      </div>
    </>
  )
}

function LeadCard({ id, onClose, onBack, onChanged }: { id: string; onClose: () => void; onBack?: () => void; onChanged: () => void }) {
  const viewerId = useHq((s) => s.overview.viewer.id)
  const members = useHq((s) => s.overview.members)
  const [state, setState] = useState<{ id: string; lead?: LeadDetail; error?: string } | null>(null)
  const [dialog, setDialog] = useState<"meeting" | "email" | "full" | null>(null)
  const load = useCallback(() => {
    let cancelled = false
    api<LeadDetail>(`/api/leads/${id}`).then((lead) => !cancelled && setState({ id, lead })).catch((e) => !cancelled && setState({ id, error: e.message }))
    return () => { cancelled = true }
  }, [id])
  useEffect(() => load(), [load])
  const current = state?.id === id ? state : null
  const lead = current?.lead
  const assignees = members.filter((m) => m.role !== "VIEWER").map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }))
  const nextTask = lead?.tasks.find((t) => !t.doneAt)
  const nextMeeting = lead?.meetings.filter((m) => new Date(m.startsAt) > new Date() && (m.status === "SCHEDULED" || m.status === "CONFIRMED")).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
  const title = lead?.company?.name ?? lead?.contact?.name ?? "Fiche"
  const done = () => { load(); onChanged() }
  return (
    <>
      <PanelHeader
        icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
        kicker="Prospect"
        title={lead ? title : "Chargement…"}
        subtitle={lead && [lead.company?.sector, lead.campaign?.name].filter(Boolean).join(" · ")}
        onClose={onClose}
        onBack={onBack}
      />
      <div className="space-y-4 overflow-y-auto px-4 py-4">
        {current?.error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-text">{current.error}</p>}
        {!lead && !current?.error && <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-40 w-full" /></div>}
        {lead && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge map={leadStatus} value={lead.status} />
              <span className="ml-auto rounded-full bg-primary/30 px-2.5 py-0.5 text-xs font-bold">Score : {lead.score} / 100</span>
            </div>
            <dl className="space-y-1.5 text-sm">
              {[
                { icon: UserRound, label: "Contact", value: lead.contact?.name ?? lead.contact?.jobTitle },
                { icon: Phone, label: "Téléphone", value: lead.contact?.phone || lead.company?.phone ? <a href={`tel:${lead.contact?.phone ?? lead.company?.phone}`} className="hover:underline">{formatPhone(lead.contact?.phone ?? lead.company?.phone ?? "")}</a> : null },
                { icon: Mail, label: "Email", value: lead.contact?.email ?? lead.company?.email },
                { icon: Globe, label: "Site web", value: lead.company?.website ? <a href={lead.company.website.startsWith("http") ? lead.company.website : `https://${lead.company.website}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">{lead.company.domain ?? lead.company.website}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a> : null },
                { icon: MapPin, label: "Localisation", value: [lead.company?.city, lead.company?.country !== "FR" ? lead.company?.country : null].filter(Boolean).join(", ") },
                { icon: Star, label: "Avis Google", value: lead.company?.rating ? `${lead.company.rating.toFixed(1)} (${lead.company.reviewCount ?? 0})` : null },
              ].filter((r) => r.value).map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <dt className="flex w-28 shrink-0 items-center gap-2 text-muted-foreground"><r.icon className="h-4 w-4" aria-hidden="true" />{r.label}</dt>
                  <dd className="min-w-0 flex-1 truncate text-right font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
            <Section title="Prochaine action">
              {nextMeeting ? (
                <p className="rounded-xl bg-primary/20 px-3 py-2 text-sm"><span className="font-semibold">Rendez-vous</span> · {formatDateTime(nextMeeting.startsAt)}{nextMeeting.hostName ? ` avec ${nextMeeting.hostName}` : ""}</p>
              ) : nextTask ? (
                <p className="rounded-xl bg-primary/20 px-3 py-2 text-sm"><span className="font-semibold">{nextTask.title}</span>{nextTask.dueAt ? ` · ${new Date(nextTask.dueAt).toLocaleDateString("fr-FR")}` : ""}</p>
              ) : (
                <Empty>Rien de prévu. Dernier contact : {ago(lead.lastContactedAt).toLowerCase()}.</Empty>
              )}
            </Section>
            <div className="grid grid-cols-2 gap-2">
              {lead.can.meet && <Button onClick={() => setDialog("meeting")}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Planifier le RDV</Button>}
              {lead.can.email && <Button variant="outline" onClick={() => setDialog("email")}><Mail className="h-4 w-4" aria-hidden="true" /> Contacter</Button>}
              <Button variant="outline" className={cn(!lead.can.meet && !lead.can.email && "col-span-2")} onClick={() => setDialog("full")}>Fiche complète</Button>
              <Button asChild variant="ghost"><Link href={`/app/leads/${lead.id}`}>Ouvrir en 2D</Link></Button>
            </div>
          </>
        )}
      </div>
      {lead && dialog === "meeting" && <MeetingDialog open onOpenChange={(o) => !o && setDialog(null)} leadId={lead.id} leadName={title} currentUserId={viewerId} canOverride={lead.can.meetAnywhere} onDone={() => { setDialog(null); done() }} />}
      {lead && dialog === "email" && <EmailDialog open onOpenChange={(o) => !o && setDialog(null)} leadId={lead.id} leadName={title} onDone={() => { setDialog(null); done() }} />}
      <LeadPanel id={dialog === "full" ? id : null} assignees={assignees} currentUserId={viewerId} onClose={() => { setDialog(null); done() }} />
    </>
  )
}

function HqPanel({ onClose, openLead }: { onClose: () => void; openLead: (id: string) => void }) {
  const store = useHqStore()
  const members = useHq((s) => s.overview.members)
  const recent = useHq((s) => s.overview.recentLeads)
  return (
    <>
      <PanelHeader icon={<Building2 className="h-5 w-5" aria-hidden="true" />} kicker="Bâtiment central" title="QG Cleads" subtitle="L’équipe et les derniers prospects arrivés." onClose={onClose} />
      <div className="space-y-4 overflow-y-auto px-4 py-4">
        <Section title={`Équipe (${members.length})`}>
          <ul className="space-y-0.5">
            {members.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => store.set({ selection: { kind: "member", id: m.id }, focus: m.station })} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-sidebar text-[11px] font-bold text-sidebar-foreground">{m.initials}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.name}{m.isMe ? " (vous)" : ""}</span><span className="block text-xs text-muted-foreground">{ROLE_LABELS[m.role]} · {m.station === "hq" ? "Bâtiment central" : zoneById(m.station)?.label}</span></span>
                  <span className={cn("h-2 w-2 rounded-full", m.status === "meeting" ? "bg-[#f0b44a]" : m.status === "online" ? "bg-success" : "bg-border")} aria-label={m.status === "meeting" ? "En rendez-vous" : m.status === "online" ? "Connecté aujourd’hui" : "Hors ligne"} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Derniers prospects">
          {recent.length === 0 ? <Empty>Pas encore de prospect.</Empty> : <ul className="space-y-0.5">{recent.map((l) => <LeadRowButton key={l.id} lead={l} onOpen={openLead} extra={l.campaignName} />)}</ul>}
        </Section>
        <Button asChild className="w-full"><Link href="/app">Ouvrir Aujourd’hui <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
      </div>
    </>
  )
}

/** Shown when nothing is selected: the newest prospects, and how to use the scene. */
function Idle({ openLead }: { openLead: (id: string) => void }) {
  const recent = useHq((s) => s.overview.recentLeads)
  return (
    <div className="space-y-3 p-4">
      <h2 className="flex items-center justify-between text-sm font-bold">Derniers prospects <Link href="/app/leads?sort=created" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Voir tout</Link></h2>
      {recent.length === 0 ? <Empty>Aucun prospect pour l’instant : lancez une recherche dans l’espace Scraping / Sources.</Empty> : <ul className="space-y-0.5">{recent.map((l) => <LeadRowButton key={l.id} lead={l} onOpen={openLead} extra={l.ownerName ?? "non attribué"} />)}</ul>}
      <p className="rounded-xl bg-muted/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Cliquez un espace ou un membre de l’équipe. Clavier : <kbd className="font-semibold">1</kbd>–<kbd className="font-semibold">8</kbd> pour les espaces, <kbd className="font-semibold">← →</kbd> pour passer de l’un à l’autre, <kbd className="font-semibold">Échap</kbd> pour revenir. Glisser pour se déplacer, clic droit pour tourner.
      </p>
    </div>
  )
}

/** The right-hand panel: whatever is selected in the scene, with the CRM's real actions. */
export function DetailPanel({ onChanged }: { onChanged: () => void }) {
  const store = useHqStore()
  const selection = useHq((s) => s.selection)
  const members = useHq((s) => s.overview.members)
  // Where a fiche was opened from, to come back to it.
  const [origin, setOrigin] = useState<typeof selection>(null)
  const openLead = (id: string) => {
    setOrigin(store.get().selection)
    store.set({ selection: { kind: "lead", id } })
  }
  const close = () => clearSelection(store)
  const back = origin ? () => { store.set({ selection: origin }); setOrigin(null) } : undefined
  let body: React.ReactNode
  if (!selection) body = <Idle openLead={openLead} />
  else if (selection.kind === "zone") body = <ZonePanel key={selection.id} zone={selection.id} openLead={openLead} onClose={close} />
  else if (selection.kind === "hq") body = <HqPanel onClose={close} openLead={openLead} />
  else if (selection.kind === "member") {
    const member = members.find((m) => m.id === selection.id)
    body = member ? <MemberPanel member={member} onClose={close} onBack={back} /> : <Idle openLead={openLead} />
  } else body = <LeadCard key={selection.id} id={selection.id} onClose={close} onBack={back} onChanged={onChanged} />
  return (
    <Glass as="aside" aria-label="Détail" className="flex max-h-full w-full flex-col overflow-hidden">
      {body}
    </Glass>
  )
}
