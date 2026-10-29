import type { PrismaClient, DealStage, LeadStatus, MeetingStatus } from "@prisma/client"

/**
 * Fictitious CRM data for development and demos. Everything is invented: company names, `.example.test`
 * domains (reserved, never resolve) and the 01 99 00 xx xx phone range reserved for fiction.
 * Records carry `externalId = "demo:<n>"`, so running it again adds nothing and `reset` removes exactly them.
 */
const SECTORS = ["plombier", "électricien", "boulangerie", "cabinet comptable", "agence immobilière", "coiffeur", "garage automobile", "restaurant"]
const CITIES = ["Lyon", "Nantes", "Lille", "Bordeaux", "Toulouse", "Rennes", "Strasbourg", "Montpellier"]
const NAMES = ["Atelier", "Maison", "Cabinet", "Groupe", "Studio", "Comptoir", "Espace", "Institut"]
const SURNAMES = ["Durand", "Martin", "Bernard", "Petit", "Moreau", "Lambert", "Fontaine", "Rousseau", "Girard", "Mercier"]
const FIRST = ["Camille", "Alex", "Sam", "Jules", "Inès", "Léo", "Manon", "Noé", "Lina", "Hugo"]

// Small deterministic generator: the same data every time, which makes screenshots and tests comparable.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DemoOptions {
  workspaceId: string
  /** Staff accounts that receive the data (owners of leads, hosts of meetings). At least one SDR/closer is better. */
  staff: { id: string; role: string }[]
  companies?: number
  now?: Date
}

export async function seedDemo(prisma: PrismaClient, options: DemoOptions) {
  const { workspaceId, staff } = options
  const total = options.companies ?? 40
  const now = options.now ?? new Date()
  const rand = rng(2026)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const sdrs = staff.filter((s) => s.role === "SDR" || s.role === "MANAGER" || s.role === "OWNER")
  const closers = staff.filter((s) => s.role === "CLOSER" || s.role === "OWNER")
  if (closers.length === 0) throw new Error("Il faut au moins un closer ou un propriétaire pour héberger les rendez-vous de démonstration.")

  const batch = await prisma.importBatch.create({
    data: { workspaceId, source: "CSV", status: "DONE", params: { demo: true }, total, created: 0, finishedAt: now },
  })
  const created = { companies: 0, leads: 0, deals: 0, meetings: 0, tasks: 0, activities: 0 }
  const statuses: LeadStatus[] = ["NEW", "NEW", "NEW", "CONTACTED", "CONTACTED", "REPLIED", "QUALIFIED", "DISQUALIFIED"]
  const stages: DealStage[] = ["QUALIFIED", "MEETING_SET", "MEETING_SET", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]
  const day = 86400000

  for (let i = 1; i <= total; i++) {
    const externalId = `demo:${i}`
    if (await prisma.company.findUnique({ where: { workspaceId_externalId: { workspaceId, externalId } } })) continue

    const sector = pick(SECTORS)
    const city = pick(CITIES)
    const surname = pick(SURNAMES)
    const name = `${pick(NAMES)} ${surname} — ${sector} ${city}`
    const slug = `${surname}-${i}`.toLowerCase()
    const hasEmail = rand() > 0.3
    const company = await prisma.company.create({
      data: {
        workspaceId,
        name,
        domain: `${slug}.example.test`,
        website: `https://${slug}.example.test`,
        phone: `01 99 00 ${String(i).padStart(2, "0")} ${String(Math.floor(rand() * 100)).padStart(2, "0")}`,
        city,
        sector,
        rating: Math.round((3.5 + rand() * 1.5) * 10) / 10,
        reviewCount: Math.floor(rand() * 300),
        completeness: 40 + Math.floor(rand() * 60),
        source: "CSV",
        externalId,
        externalSource: "demo",
      },
    })
    const contact = hasEmail
      ? await prisma.contact.create({
          data: {
            workspaceId,
            companyId: company.id,
            name: `${pick(FIRST)} ${surname}`,
            jobTitle: "Gérant",
            email: `${slug}@${slug}.example.test`,
            emailKind: "NOMINATIVE",
            source: "CSV",
            collectedFrom: "Données de démonstration",
            collectedAt: now,
            legalBasis: "legitimate_interest_b2b",
          },
        })
      : null

    const status = pick(statuses)
    const owner = status === "NEW" && rand() > 0.5 ? null : pick(sdrs)
    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        companyId: company.id,
        contactId: contact?.id,
        ownerId: owner?.id,
        status,
        score: Math.min(100, 20 + (hasEmail ? 30 : 0) + Math.floor((company.rating ?? 0) * 8) + Math.floor(rand() * 10)),
        scoreReasons: { email: hasEmail, rating: company.rating },
        source: "CSV",
        importBatchId: batch.id,
        lastContactedAt: status === "NEW" ? null : new Date(now.getTime() - Math.floor(rand() * 14) * day),
        createdAt: new Date(now.getTime() - Math.floor(rand() * 30) * day),
      },
    })
    created.companies++
    created.leads++
    await prisma.activity.create({ data: { workspaceId, leadId: lead.id, kind: "SYSTEM", actorKind: "SYSTEM", body: "Importé (données de démonstration)", occurredAt: lead.createdAt } })
    created.activities++

    if (status !== "NEW") {
      await prisma.activity.create({
        data: { workspaceId, leadId: lead.id, actorId: owner?.id, kind: "CALL", body: "Premier appel : à rappeler la semaine prochaine.", occurredAt: lead.lastContactedAt ?? now },
      })
      created.activities++
      await prisma.task.create({
        data: { workspaceId, leadId: lead.id, assigneeId: owner?.id, title: "Relancer par téléphone", dueAt: new Date(now.getTime() + (Math.floor(rand() * 7) - 2) * day) },
      })
      created.tasks++
    }

    if (status === "QUALIFIED") {
      const stage = pick(stages)
      const closer = pick(closers)
      const deal = await prisma.deal.create({
        data: {
          workspaceId,
          leadId: lead.id,
          ownerId: closer.id,
          stage,
          amountCents: rand() > 0.4 ? (1 + Math.floor(rand() * 20)) * 50000 : null,
          wonAt: stage === "WON" ? now : null,
          lostAt: stage === "LOST" ? now : null,
          lostReason: stage === "LOST" ? "Budget" : null,
        },
      })
      created.deals++
      const offset = (Math.floor(rand() * 20) - 7) * day
      const startsAt = new Date(Math.round((now.getTime() + offset) / 1800000) * 1800000)
      const past = startsAt < now
      const meetingStatus: MeetingStatus = past ? (rand() > 0.15 ? "COMPLETED" : "NO_SHOW") : "CONFIRMED"
      await prisma.meeting.create({
        data: {
          workspaceId,
          hostId: closer.id,
          leadId: lead.id,
          contactId: contact?.id,
          dealId: deal.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60000),
          status: meetingStatus,
          source: "sdr",
        },
      })
      created.meetings++
    }
  }
  await prisma.importBatch.update({ where: { id: batch.id }, data: { created: created.companies, existing: total - created.companies } })
  return created
}

/** Removes exactly what `seedDemo` created. */
export async function resetDemo(prisma: PrismaClient, workspaceId: string) {
  const demo = { workspaceId, externalId: { startsWith: "demo:" } }
  const companies = await prisma.company.findMany({ where: demo, select: { id: true } })
  const ids = companies.map((c) => c.id)
  await prisma.lead.deleteMany({ where: { workspaceId, companyId: { in: ids } } }) // cascades deals, activities, tasks, meetings
  await prisma.contact.deleteMany({ where: { workspaceId, companyId: { in: ids } } })
  await prisma.company.deleteMany({ where: { id: { in: ids } } })
  await prisma.importBatch.deleteMany({ where: { workspaceId, source: "CSV", params: { path: ["demo"], equals: true } } })
  return { companies: ids.length }
}
