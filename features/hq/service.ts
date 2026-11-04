import type { DealStage, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, scopeOf } from "@/lib/rbac"
import { dayBounds } from "@/lib/crm/day"
import { dealStage } from "@/lib/crm/status"
import { toCrmRole } from "@/lib/crm/roles"
import { getToday, canSeeTeam } from "@/features/activity/today"
import { listBoard } from "@/features/pipeline/service"
import { STAGES, OPEN_STAGES } from "@/features/pipeline/rules"
import { listMeetings, listToClose, type MeetingView } from "@/features/meetings/service"
import { extractorHealth } from "@/features/search/service"
import { mayUseAnyMailbox, usableMailboxes } from "@/features/outreach/mailboxes"
import { listCampaigns } from "@/features/campaigns/service"
import { campaignCohorts, periodCounts, periodsOf, visibleLeads, weeklySeries } from "@/features/metrics/service"
import { deltaPct, deltaPts, formatCount, formatRate, rate, type PeriodDays } from "@/features/metrics/definitions"
import { characterFor, isCharacterId, type CharacterId } from "./characters"
import { JOURNEY, ZONES, assignStations, type ZoneId } from "./zones"
import type { CampaignPerf, HqMember, HqOverview, LeadMini, MeetingMini, ZoneDetail, ZoneSummary } from "./types"
import { agencySummaries } from "./agency"
import { agencyPulse, agentsZone, studioZone } from "./agency-service"
import { LeadError } from "@/features/leads/errors"

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n > 1 ? many : one}`
const initials = (name: string) => name.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"
const leadName = (l: { company: { name: string } | null; contact: { name: string | null; email: string | null } | null }) => l.company?.name ?? l.contact?.name ?? l.contact?.email ?? "Sans nom"

const miniSelect = {
  id: true,
  status: true,
  score: true,
  company: { select: { name: true, city: true, sector: true } },
  contact: { select: { name: true, email: true } },
  owner: { select: { name: true, email: true } },
  campaign: { select: { name: true } },
} satisfies Prisma.LeadSelect

function toMini(l: Prisma.LeadGetPayload<{ select: typeof miniSelect }>): LeadMini {
  return { id: l.id, name: leadName(l), city: l.company?.city ?? null, sector: l.company?.sector ?? null, status: l.status, score: l.score, ownerName: l.owner?.name ?? l.owner?.email ?? null, campaignName: l.campaign?.name ?? null }
}

const toMeetingMini = (m: MeetingView): MeetingMini => ({ id: m.id, leadId: m.leadId, leadName: m.leadName, hostName: m.hostName, startsAt: m.startsAt, status: m.status, needsOutcome: m.needsOutcome })

/** Emails a person may count: the team's for owners and managers, their own otherwise (same rule as the email log). */
const emailScope = (user: CurrentUser): Prisma.EmailMessageWhereInput => ({ workspaceId: user.workspaceId, isTest: false, ...(mayUseAnyMailbox(user) ? {} : { sentById: user.id }) })
const sentSince = (since: Date): Prisma.EmailMessageWhereInput => ({ direction: "OUTBOUND", status: { in: ["SENT", "BOUNCED"] }, createdAt: { gte: since } })

function toPerf(c: { id: string; name: string; status: CampaignPerf["status"]; stats: { leads: number; meetings: number; conversion: number | null; replyRate: number | null } }): CampaignPerf {
  return { id: c.id, name: c.name, status: c.status, leads: c.stats.leads, meetings: c.stats.meetings, conversion: c.stats.conversion, replyRate: c.stats.replyRate }
}

// ---------------------------------------------------------------------------------------------------------------
// Overview: everything the scene and its HUD show at once
// ---------------------------------------------------------------------------------------------------------------

export async function getOverview(user: CurrentUser, days: PeriodDays = 30, now = new Date()): Promise<HqOverview> {
  const { current, previous } = periodsOf(days, now)
  const { start, end } = dayBounds(now)
  const leads = visibleLeads(user)
  const team = canSeeTeam(user)
  const week = new Date(now.getTime() - 7 * 86_400_000)

  const [cur, prev, campaignRows, campaignsCreated, members, recent, replied, overdueMine, tasksToday, emailsToday, emails7d, searchesRunning, deals, meetingsToday, toClose, meetingsNext7, weekly, mailboxes, agency] = await Promise.all([
    periodCounts(user, current),
    periodCounts(user, previous),
    prisma.campaign.findMany({ where: { workspaceId: user.workspaceId, archivedAt: null }, select: { id: true, name: true, status: true } }),
    prisma.campaign.count({ where: { workspaceId: user.workspaceId, createdAt: { gte: current.from } } }),
    prisma.user.findMany({ where: { workspaceId: user.workspaceId, active: true }, select: { id: true, name: true, email: true, role: true, hqCharacter: true, lastLoginAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.lead.findMany({ where: leads, select: miniSelect, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.lead.count({ where: { AND: [leads, { status: "REPLIED" }] } }),
    prisma.task.count({ where: { workspaceId: user.workspaceId, assigneeId: user.id, doneAt: null, dueAt: { lt: start } } }),
    prisma.task.count({ where: { workspaceId: user.workspaceId, assigneeId: user.id, doneAt: null, dueAt: { gte: start, lt: end } } }),
    can(user.role, "email:send") ? prisma.emailMessage.count({ where: { ...emailScope(user), ...sentSince(start) } }) : Promise.resolve(0),
    can(user.role, "email:send") ? prisma.emailMessage.count({ where: { ...emailScope(user), ...sentSince(week) } }) : Promise.resolve(0),
    can(user.role, "search:run") ? prisma.extractionSearch.count({ where: { workspaceId: user.workspaceId, status: { in: ["QUEUED", "RUNNING"] } } }) : Promise.resolve(0),
    prisma.deal.groupBy({ by: ["stage"], where: { workspaceId: user.workspaceId, lead: { is: leads } }, _count: { _all: true } }),
    can(user.role, "meeting:read") ? prisma.meeting.findMany({ where: { workspaceId: user.workspaceId, status: { in: ["SCHEDULED", "CONFIRMED"] }, endsAt: { gt: new Date(now.getTime() - 12 * 3600_000) }, startsAt: { lt: end }, ...(scopeOf(user.role, "meeting:read") === "own" ? { hostId: user.id } : {}) }, select: { hostId: true, startsAt: true, endsAt: true } }) : Promise.resolve([]),
    can(user.role, "meeting:read") ? listToClose(user, 50) : Promise.resolve([]),
    can(user.role, "meeting:read") ? prisma.meeting.count({ where: { workspaceId: user.workspaceId, status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) }, ...(scopeOf(user.role, "meeting:read") === "own" ? { hostId: user.id } : {}) } }) : Promise.resolve(0),
    weeklySeries(user, 8, now),
    can(user.role, "email:send") ? usableMailboxes(user) : Promise.resolve([]),
    agencyPulse(user, now),
  ])

  const stats = await campaignCohorts(user, campaignRows.map((c) => c.id))
  const active = campaignRows.filter((c) => c.status === "ACTIVE")
  const perf = campaignRows
    .map((c) => toPerf({ ...c, stats: stats.get(c.id)! }))
    .sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") || b.leads - a.leads)

  const dealsByStage = Object.fromEntries(STAGES.map((s) => [s, deals.find((d) => d.stage === s)?._count._all ?? 0])) as Record<DealStage, number>
  const openDeals = OPEN_STAGES.reduce((n, s) => n + dealsByStage[s], 0)
  const conversion = rate(cur.meetings, cur.leads)
  const previousConversion = rate(prev.meetings, prev.leads)
  const meetingsNow = new Set(meetingsToday.filter((m) => m.startsAt <= now && m.endsAt > now).map((m) => m.hostId))
  const todayCount = meetingsToday.filter((m) => m.startsAt >= start).length

  // Seat the team: managers first so the coordination desk goes to them, then by arrival in the CRM.
  const crew = members
    .map((m) => ({ ...m, role: toCrmRole(m.role) }))
    .filter((m): m is typeof m & { role: NonNullable<ReturnType<typeof toCrmRole>> } => !!m.role)
  const loads = await memberLoads(user, team ? crew.map((m) => m.id) : [user.id], start, end)
  const seated = assignStations(crew).map(
    (m): HqMember => ({
      id: m.id,
      name: m.name ?? m.email ?? "Membre",
      email: m.email,
      initials: initials(m.name ?? m.email ?? ""),
      role: m.role,
      character: characterFor(m),
      station: m.station,
      seat: m.seat,
      status: meetingsNow.has(m.id) ? "meeting" : m.lastLoginAt && now.getTime() - m.lastLoginAt.getTime() < 12 * 3600_000 ? "online" : "offline",
      isMe: m.id === user.id,
      load: loads.get(m.id) ?? null,
    })
  )

  const lockedFor = (zone: ZoneId) => {
    const permission = ZONES.find((z) => z.id === zone)!.permission
    return permission ? !can(user.role, permission) : false
  }
  const summary = (zone: ZoneId, badge: string, tone: ZoneSummary["tone"] = "neutral"): ZoneSummary => (lockedFor(zone) ? { badge: null, tone: "neutral", locked: true } : { badge, tone, locked: false })
  const errorBoxes = mailboxes.filter((m) => m.status !== "ACTIVE").length

  return {
    generatedAt: now.toISOString(),
    days,
    viewer: { id: user.id, name: user.name, role: user.role, character: characterFor({ id: user.id, role: user.role, hqCharacter: members.find((m) => m.id === user.id)?.hqCharacter }) },
    kpis: {
      leads: { value: cur.leads, previous: prev.leads, delta: deltaPct(cur.leads, prev.leads) },
      meetings: { value: cur.meetings, previous: prev.meetings, delta: deltaPct(cur.meetings, prev.meetings) },
      conversion: { value: conversion, previous: previousConversion, deltaPts: deltaPts(conversion, previousConversion) },
      campaigns: { active: active.length, total: campaignRows.length, createdInPeriod: campaignsCreated },
    },
    journey: JOURNEY.map((j) => ({ ...j, count: cur[j.key] })),
    conversion,
    zones: {
      sources: summary("sources", searchesRunning ? plural(searchesRunning, "recherche en cours", "recherches en cours") : `${plural(cur.leads, "prospect", "prospects")} · ${days} j`, searchesRunning ? "active" : "neutral"),
      qualification: summary("qualification", replied ? `${formatCount(replied)} à qualifier` : "Rien à qualifier", replied ? "attention" : "neutral"),
      coordination: summary("coordination", overdueMine ? `${formatCount(overdueMine)} en retard` : plural(tasksToday, "tâche aujourd’hui", "tâches aujourd’hui"), overdueMine ? "attention" : "neutral"),
      outreach: summary("outreach", errorBoxes ? plural(errorBoxes, "boîte arrêtée", "boîtes arrêtées") : plural(emailsToday, "email aujourd’hui", "emails aujourd’hui"), errorBoxes ? "attention" : emailsToday ? "active" : "neutral"),
      pipeline: summary("pipeline", plural(openDeals, "opportunité ouverte", "opportunités ouvertes"), openDeals ? "active" : "neutral"),
      analytics: summary("analytics", `Conversion ${formatRate(conversion)}`),
      meetings: summary("meetings", toClose.length ? `${formatCount(toClose.length)} à clôturer` : plural(todayCount, "RDV aujourd’hui", "RDV aujourd’hui"), toClose.length ? "attention" : todayCount ? "active" : "neutral"),
      campaigns: summary("campaigns", plural(active.length, "active", "actives"), active.length ? "active" : "neutral"),
      ...agencySummaries(agency, { agents: lockedFor("agents"), studio: lockedFor("studio") }),
    },
    campaigns: perf.slice(0, 5),
    members: seated,
    recentLeads: recent.map(toMini),
    signals: { searchesRunning, emails7d, dealsByStage, meetingsNext7, weekly, mailboxesActive: mailboxes.length - errorBoxes },
    agency,
  }
}

/** Open tasks, overdue, meetings today, open fiches and opportunities of each person. */
async function memberLoads(user: CurrentUser, ids: string[], start: Date, end: Date) {
  const ws = user.workspaceId
  const [tasks, overdue, meetings, leads, deals] = await Promise.all([
    prisma.task.groupBy({ by: ["assigneeId"], where: { workspaceId: ws, assigneeId: { in: ids }, doneAt: null }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { workspaceId: ws, assigneeId: { in: ids }, doneAt: null, dueAt: { lt: start } }, _count: { _all: true } }),
    prisma.meeting.groupBy({ by: ["hostId"], where: { workspaceId: ws, hostId: { in: ids }, status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gte: start, lt: end } }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["ownerId"], where: { workspaceId: ws, ownerId: { in: ids }, status: { in: ["NEW", "CONTACTED", "REPLIED"] } }, _count: { _all: true } }),
    prisma.deal.groupBy({ by: ["ownerId"], where: { workspaceId: ws, ownerId: { in: ids }, stage: { in: [...OPEN_STAGES] } }, _count: { _all: true } }),
  ])
  const n = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string | null>)[], key: K, id: string) => rows.find((r) => r[key] === id)?._count._all ?? 0
  return new Map(
    ids.map((id) => [
      id,
      {
        openTasks: n(tasks, "assigneeId", id),
        overdue: n(overdue, "assigneeId", id),
        meetingsToday: n(meetings, "hostId", id),
        openLeads: n(leads, "ownerId", id),
        openDeals: n(deals, "ownerId", id),
      },
    ])
  )
}

// ---------------------------------------------------------------------------------------------------------------
// One space in detail (panel opened on click)
// ---------------------------------------------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = { EXTRACTOR: "Cleads Extractor", CSV: "Import CSV", INBOUND: "Formulaire du site", MANUAL: "Saisie", LEGACY: "Ancien back-office", REGISTRY: "Veille du registre" }

export async function getZone(user: CurrentUser, zone: ZoneId, days: PeriodDays = 30, now = new Date()): Promise<ZoneDetail> {
  const def = ZONES.find((z) => z.id === zone)
  if (!def) throw new LeadError("not_found", "Espace inconnu.", 404)
  if (def.permission && !can(user.role, def.permission)) return { zone, locked: true, reason: "Votre rôle ne donne pas accès à ce module." }
  const { current, previous } = periodsOf(days, now)
  const leads = visibleLeads(user)

  switch (zone) {
    case "sources": {
      const [searches, bySource, batches, health] = await Promise.all([
        prisma.extractionSearch.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { createdAt: "desc" }, take: 6, include: { campaign: { select: { name: true } } } }),
        prisma.lead.groupBy({ by: ["source"], where: { AND: [leads, { createdAt: { gte: current.from } }] }, _count: { _all: true } }),
        prisma.importBatch.aggregate({ where: { workspaceId: user.workspaceId, createdAt: { gte: current.from }, status: "DONE" }, _count: { _all: true }, _sum: { created: true } }),
        extractorHealth().catch(() => null),
      ])
      return {
        zone,
        searches: searches.map((s) => {
          const c = (s.counters as { unique?: number } | null) ?? {}
          return { id: s.id, label: s.label, status: s.status, found: c.unique ?? 0, imported: s.importedCount, createdAt: s.createdAt.toISOString(), campaignName: s.campaign?.name ?? null }
        }),
        health: health && { state: health.state, blocked: health.blocked },
        bySource: bySource.map((r) => ({ source: r.source, label: SOURCE_LABELS[r.source] ?? r.source, count: r._count._all })).sort((a, b) => b.count - a.count),
        imports: { batches: batches._count._all, created: batches._sum.created ?? 0 },
        can: { search: can(user.role, "search:run"), import: can(user.role, "lead:import") },
      }
    }
    case "qualification": {
      const [toQualify, replied, contacted, fresh, qualified, disqualified] = await Promise.all([
        prisma.lead.findMany({ where: { AND: [leads, { status: { in: ["REPLIED", "CONTACTED"] } }] }, select: miniSelect, orderBy: [{ status: "desc" }, { score: "desc" }], take: 8 }),
        prisma.lead.count({ where: { AND: [leads, { status: "REPLIED" }] } }),
        prisma.lead.count({ where: { AND: [leads, { status: "CONTACTED" }] } }),
        prisma.lead.count({ where: { AND: [leads, { status: "NEW" }] } }),
        prisma.deal.count({ where: { workspaceId: user.workspaceId, createdAt: { gte: current.from }, lead: { is: leads } } }),
        prisma.activity.count({ where: { workspaceId: user.workspaceId, kind: "STATUS_CHANGE", occurredAt: { gte: current.from }, data: { path: ["to"], equals: "DISQUALIFIED" }, lead: { is: leads } } }),
      ])
      // REPLIED first: they wrote back and wait for a decision.
      toQualify.sort((a, b) => Number(b.status === "REPLIED") - Number(a.status === "REPLIED") || b.score - a.score)
      return { zone, toQualify: toQualify.map(toMini), counts: { replied, contacted, fresh }, qualified, disqualified }
    }
    case "coordination": {
      const today = await getToday(user, "mine", now)
      const team = canSeeTeam(user)
      let rows: Extract<ZoneDetail, { zone: "coordination" }>["team"] = null
      if (team) {
        const members = await prisma.user.findMany({ where: { workspaceId: user.workspaceId, active: true }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" } })
        const crew = members.map((m) => ({ ...m, role: toCrmRole(m.role) })).filter((m) => m.role)
        const { start, end } = dayBounds(now)
        const loads = await memberLoads(user, crew.map((m) => m.id), start, end)
        rows = crew.map((m) => ({ id: m.id, name: m.name ?? m.email ?? "Membre", role: m.role!, openTasks: loads.get(m.id)!.openTasks, overdue: loads.get(m.id)!.overdue, meetingsToday: loads.get(m.id)!.meetingsToday }))
      }
      const tasks = [...today.overdue.map((t) => ({ ...t, overdue: true })), ...today.dueToday.map((t) => ({ ...t, overdue: false }))].slice(0, 8)
      return {
        zone,
        today: { overdue: today.overdue.length, dueToday: today.dueToday.length, meetings: today.meetings.length, toClose: today.meetingsToClose.length },
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, leadId: t.leadId, leadName: t.leadName, overdue: t.overdue })),
        team: rows,
      }
    }
    case "outreach": {
      const { start } = dayBounds(now)
      const week = new Date(now.getTime() - 7 * 86_400_000)
      const scope = emailScope(user)
      const enrollmentScope: Prisma.SequenceEnrollmentWhereInput = { workspaceId: user.workspaceId, status: "ACTIVE", ...(mayUseAnyMailbox(user) ? {} : { enrolledById: user.id }) }
      const [emailsToday, emails7d, replies7d, unread, calls7d, activeSequences, enrollments, boxes] = await Promise.all([
        prisma.emailMessage.count({ where: { ...scope, ...sentSince(start) } }),
        prisma.emailMessage.count({ where: { ...scope, ...sentSince(week) } }),
        prisma.emailMessage.count({ where: { ...scope, direction: "INBOUND", createdAt: { gte: week }, OR: [{ replyClass: null }, { replyClass: { not: "OUT_OF_OFFICE" } }] } }),
        prisma.emailMessage.count({ where: { ...scope, direction: "INBOUND", readAt: null } }),
        prisma.activity.count({ where: { workspaceId: user.workspaceId, kind: "CALL", occurredAt: { gte: week }, ...(mayUseAnyMailbox(user) ? {} : { actorId: user.id }) } }),
        prisma.sequence.count({ where: { workspaceId: user.workspaceId, status: "ACTIVE", archivedAt: null, enrollments: { some: { status: "ACTIVE" } } } }),
        prisma.sequenceEnrollment.count({ where: enrollmentScope }),
        usableMailboxes(user),
      ])
      const working = boxes.filter((b) => b.status === "ACTIVE").length
      return {
        zone,
        emailsToday,
        emails7d,
        replies7d,
        unread,
        calls7d,
        sequences: { active: activeSequences, enrollments },
        mailboxes: boxes.map((b) => ({ address: b.address, status: b.status, sentToday: b.sentToday, allowanceToday: b.allowanceToday })),
        channels: [
          { id: "email", label: "Email", state: working ? "active" : "idle", detail: working ? `${plural(working, "boîte active", "boîtes actives")} · ${plural(emails7d, "envoi", "envois")} sur 7 j` : "Aucune boîte d’envoi active" },
          { id: "phone", label: "Téléphone", state: calls7d ? "active" : "idle", detail: `${plural(calls7d, "appel enregistré", "appels enregistrés")} sur 7 j` },
          { id: "linkedin", label: "LinkedIn", state: "soon", detail: "Pas encore dans le CRM (V1.1)" },
          { id: "whatsapp", label: "WhatsApp", state: "soon", detail: "Pas encore dans le CRM (V1.1)" },
        ],
      }
    }
    case "pipeline": {
      const board = await listBoard(user)
      const stages = STAGES.map((stage) => {
        const cards = board.filter((d) => d.stage === stage)
        const known = cards.filter((d) => d.amountCents != null)
        return { stage, label: dealStage[stage].label, count: cards.length, amountCents: known.reduce((n, d) => n + d.amountCents!, 0), amountsKnown: known.length }
      })
      const deals = board
        .filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage))
        .sort((a, b) => (b.amountCents ?? -1) - (a.amountCents ?? -1) || b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6)
        .map((d) => ({ id: d.id, leadId: d.leadId, name: d.name, stage: d.stage, amountCents: d.amountCents, ownerName: d.ownerName }))
      return { zone, stages, deals }
    }
    case "meetings": {
      const { start, end } = dayBounds(now)
      const [today, week, toClose] = await Promise.all([
        listMeetings(user, { from: start.toISOString(), to: end.toISOString() }),
        listMeetings(user, { from: now.toISOString(), to: new Date(now.getTime() + 7 * 86_400_000).toISOString() }),
        listToClose(user, 6),
      ])
      const held = (m: MeetingView) => m.status === "SCHEDULED" || m.status === "CONFIRMED"
      return { zone, today: today.filter((m) => m.status !== "CANCELED" && m.status !== "RESCHEDULED").map(toMeetingMini), upcoming: week.filter(held).slice(0, 6).map(toMeetingMini), next7: week.filter(held).length, toClose: toClose.map(toMeetingMini) }
    }
    case "analytics": {
      const [cur, prev, weekly, campaigns] = await Promise.all([periodCounts(user, current), periodCounts(user, previous), weeklySeries(user, 8, now), listCampaigns(user)])
      return {
        zone,
        journey: JOURNEY.map((j) => ({ ...j, count: cur[j.key] })),
        previous: JOURNEY.map((j) => ({ key: j.key, count: prev[j.key] })),
        conversion: rate(cur.meetings, cur.leads),
        weekly,
        campaigns: campaigns.slice(0, 6).map(toPerf),
      }
    }
    case "campaigns":
      return { zone, campaigns: await listCampaigns(user), canManage: can(user.role, "campaign:manage") }
    case "agents":
      return agentsZone(user, now)
    case "studio":
      return studioZone(user)
  }
}

/** The character a member appears as; only for oneself. */
export async function setCharacter(user: CurrentUser, character: string | null): Promise<CharacterId> {
  if (character !== null && !isCharacterId(character)) throw new LeadError("invalid", "Personnage inconnu.")
  await prisma.user.update({ where: { id: user.id }, data: { hqCharacter: character } })
  return characterFor({ id: user.id, role: user.role, hqCharacter: character })
}
