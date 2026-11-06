// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import type { Prisma } from "@prisma/client"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

// The route reads the signed-in member from the session: the suite chooses who it is.
const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string; workspaceId: string; name: string; email: string } }))
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? { user: session.user } : null) }))

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("export of a person's data (E14, D65)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("@/features/leads/person-export")
  let route: typeof import("@/app/api/contacts/[id]/export/route")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const at = (day: string, hour = "10:00") => new Date(`2026-10-${day}T${hour}:00Z`)
  let n = 0
  let marie: { id: string }
  let paul: { id: string }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("@/features/leads/person-export")
    route = await import("@/app/api/contacts/[id]/export/route")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  // Rows are written in batches: the suites share one database server, which can be busy.
  const email = (mailboxId: string, leadId: string, contactId: string | null, peer: string, direction: "OUTBOUND" | "INBOUND", when: Date, subject: string, bodyText: string, extra: Partial<Prisma.EmailMessageCreateManyInput> = {}): Prisma.EmailMessageCreateManyInput => ({
    workspaceId: ws, mailboxId, leadId, contactId, direction, status: direction === "OUTBOUND" ? "SENT" : "RECEIVED", subject, bodyText, messageId: `<p${++n}@test>`, sentAt: when, createdAt: when,
    ...(direction === "OUTBOUND" ? { fromEmail: "sdr@send.example.test", toEmail: peer } : { fromEmail: peer, toEmail: "sdr@send.example.test" }),
    ...extra,
  })
  const meeting = (leadId: string, contactId: string | null, day: string, notes: string): Prisma.MeetingCreateManyInput =>
    ({ workspaceId: ws, leadId, contactId, hostId: u.closer.id, createdById: u.sdr.id, startsAt: at(day), endsAt: at(day, "10:30"), status: "COMPLETED", outcome: "QUALIFIED", notes })
  const candidate = (companyId: string, day: string, name: string, url: string, extra: Partial<Prisma.ContactCandidateCreateManyInput> = {}): Prisma.ContactCandidateCreateManyInput =>
    ({ workspaceId: ws, companyId, role: "EXECUTIVE", name, title: "Gérante", url, confidence: 0.82, evidence: `${name}, gérante de la boulangerie`, createdAt: at(day), ...extra })

  beforeEach(async () => {
    await resetDatabase(prisma)
    session.user = null
    const team = [["owner", "OWNER", "Olga Propriétaire"], ["manager", "MANAGER", "Max Manager"], ["sdr", "SDR", "Sam Vendeur"], ["closer", "CLOSER", "Cléo Closer"], ["viewer", "VIEWER", "Vic Lecteur"]] as const
    const members = await prisma.user.createManyAndReturn({ data: team.map(([key, role, name]) => ({ email: `${key}@export.test`, name, role, workspaceId: ws })) })
    for (const [key, role, name] of team) u[key] = { id: members.find((m) => m.email === `${key}@export.test`)!.id, workspaceId: ws, name, email: `${key}@export.test`, image: null, role }
    const box = await prisma.mailbox.create({ data: { workspaceId: ws, ownerId: u.sdr.id, address: "sdr@send.example.test", displayName: "Sam Vendeur", smtpHost: "smtp.example.test", smtpPort: 465, username: "sdr", secret: "v1.x.x.x" } })

    // The person (fictional), her colleague in the same company, and the officer the registry gave.
    // As an import does, the company carries her address too.
    const bakery = await prisma.company.create({ data: { workspaceId: ws, name: "Boulangerie Fictive", city: "Lyon", siret: "12345678900011", email: "marie@boulangerie-fictive.test", data: { identity: { officers: [{ name: "Paul Officier", role: "Président" }] } } } })
    marie = await prisma.contact.create({ data: { workspaceId: ws, companyId: bakery.id, name: "Marie Fictive", jobTitle: "Gérante", email: "marie@boulangerie-fictive.test", phone: "+33612345678", linkedinUrl: "https://www.linkedin.com/in/marie-fictive", role: "EXECUTIVE", source: "EXTRACTOR", collectedFrom: "Cleads Extractor", collectedAt: at("01"), legalBasis: "legitimate_interest_b2b" } })
    paul = await prisma.contact.create({ data: { workspaceId: ws, companyId: bakery.id, name: "Paul Collègue", email: "paul@boulangerie-fictive.test", linkedinUrl: "https://www.linkedin.com/in/paul-collegue" } })
    const fiche = await prisma.lead.create({ data: { workspaceId: ws, companyId: bakery.id, contactId: marie.id, ownerId: u.sdr.id, status: "CONTACTED", source: "EXTRACTOR", createdAt: at("01") } })

    // Her fiche's history: what was written, said and decided is exported; meetings and tasks are not.
    await prisma.activity.createMany({
      data: [
        { workspaceId: ws, leadId: fiche.id, actorId: u.sdr.id, kind: "NOTE", body: "Rappeler après 14 h", occurredAt: at("02") },
        { workspaceId: ws, leadId: fiche.id, actorId: u.sdr.id, kind: "CALL", body: "Intéressée par un site", data: { outcome: "reached", durationMin: 5 }, occurredAt: at("04") },
        { workspaceId: ws, leadId: fiche.id, actorId: u.sdr.id, kind: "STATUS_CHANGE", data: { from: "NEW", to: "CONTACTED" }, occurredAt: at("05") },
        { workspaceId: ws, leadId: fiche.id, actorId: u.sdr.id, kind: "MEETING", body: "Rendez-vous planifié avec Cléo Closer", occurredAt: at("06") },
        { workspaceId: ws, leadId: fiche.id, actorId: u.sdr.id, kind: "TASK", body: "Tâche : préparer le devis", occurredAt: at("06") },
      ],
    })
    await prisma.deal.create({ data: { workspaceId: ws, leadId: fiche.id, ownerId: u.closer.id, createdById: u.sdr.id, stage: "WON", amountCents: 450000, wonAt: at("20") } })

    // Emails: hers (one of her answers came on a message to the company's address), a test to a member, one to the
    // colleague on the same fiche, and the colleague's answer on her thread, which the reader files under her.
    const m = "marie@boulangerie-fictive.test"
    const p = "paul@boulangerie-fictive.test"
    await prisma.emailMessage.createMany({
      data: [
        email(box.id, fiche.id, marie.id, m, "OUTBOUND", at("03", "09:00"), "Votre site", "Bonjour Marie, …"),
        email(box.id, fiche.id, marie.id, m, "INBOUND", at("03", "11:00"), "Re: Votre site", "Merci, rappelez-moi."),
        email(box.id, fiche.id, marie.id, "sam@export.test", "OUTBOUND", at("03", "12:00"), "Essai", "Test interne", { isTest: true }),
        email(box.id, fiche.id, paul.id, p, "OUTBOUND", at("03", "13:00"), "Pour Paul", "Bonjour Paul"),
        email(box.id, fiche.id, marie.id, p, "INBOUND", at("03", "13:30"), "Réponse de Paul", "Je suis son collègue, rappelez-moi."),
        email(box.id, fiche.id, null, m.toUpperCase(), "INBOUND", at("03", "15:00"), "Question", "Faites-vous les devis ?"),
      ],
    })

    // Meetings: hers, one of the fiche with nobody named, one booked by the colleague.
    await prisma.meeting.createMany({ data: [meeting(fiche.id, marie.id, "12", "Devis à envoyer"), meeting(fiche.id, null, "13", "Visite de la boutique"), meeting(fiche.id, paul.id, "14", "Rendez-vous de Paul")] })

    // Profiles: hers not yet checked, an older one confirmed for her; the colleague's, and a homonym set aside.
    await prisma.contactCandidate.createMany({
      data: [
        candidate(bakery.id, "02", "Marie Fictive", "https://www.linkedin.com/in/marie-fictive"),
        candidate(bakery.id, "03", "Marie Fictive", "https://www.linkedin.com/in/marie-fictive-old", { status: "CONFIRMED", contactId: marie.id, decidedById: u.sdr.id, decidedAt: at("03") }),
        candidate(bakery.id, "04", "Paul Collègue", "https://www.linkedin.com/in/paul-collegue", { role: "DECISION_MAKER" }),
        candidate(bakery.id, "05", "Marie Fictive", "https://www.linkedin.com/in/marie-fictive-homonyme", { status: "DISMISSED", decidedAt: at("06") }),
      ],
    })

    // The opposition list: her address, the colleague's, and the company's domain.
    await prisma.suppression.createMany({
      data: [
        { workspaceId: ws, email: "marie@boulangerie-fictive.test", reason: "UNSUBSCRIBED", source: "lien de désinscription", createdAt: at("08") },
        { workspaceId: ws, email: "paul@boulangerie-fictive.test", reason: "COMPLAINED" },
        { workspaceId: ws, domain: "boulangerie-fictive.test", reason: "MANUAL" },
      ],
    })

    // Someone else entirely, with a fiche of their own.
    const garage = await prisma.company.create({ data: { workspaceId: ws, name: "Garage Autre" } })
    const jean = await prisma.contact.create({ data: { workspaceId: ws, companyId: garage.id, name: "Jean Autre", email: "jean@garage-autre.test" } })
    const other = await prisma.lead.create({ data: { workspaceId: ws, companyId: garage.id, contactId: jean.id, ownerId: u.sdr.id } })
    await prisma.activity.create({ data: { workspaceId: ws, leadId: other.id, actorId: u.sdr.id, kind: "NOTE", body: "Note sur Jean" } })
    await prisma.deal.create({ data: { workspaceId: ws, leadId: other.id, ownerId: u.closer.id, amountCents: 99900 } })
    await prisma.emailMessage.create({ data: email(box.id, other.id, jean.id, "jean@garage-autre.test", "OUTBOUND", at("03", "14:00"), "Pour Jean", "Bonjour Jean") })
    await prisma.meeting.create({ data: meeting(other.id, jean.id, "15", "Rendez-vous de Jean") })
  }, 30_000)

  it("gives her identity, her company, her fiche with its history and opportunities", async () => {
    const out = await svc.exportPerson(u.owner, marie.id)
    expect(out.contactId).toBe(marie.id)
    expect(out.identite).toMatchObject({
      nom: "Marie Fictive", fonction: "Gérante", email: "marie@boulangerie-fictive.test", telephone: "+33612345678", linkedin: "https://www.linkedin.com/in/marie-fictive",
      role: "Dirigeant", source: "Cleads Extractor (fiches d’entreprises publiques)", origine: "Cleads Extractor", collecteLe: "2026-10-01T10:00:00.000Z",
      baseLegale: "Intérêt légitime (RGPD art. 6.1.f) : prospection B2B", nePasContacter: false,
    })
    expect(out.entreprise).toMatchObject({ nom: "Boulangerie Fictive", ville: "Lyon", siret: "12345678900011", email: "marie@boulangerie-fictive.test" })
    expect(out.fiches).toHaveLength(1)
    expect(out.fiches[0]).toMatchObject({ statut: "Contacté", source: "Cleads Extractor (fiches d’entreprises publiques)", creeLe: "2026-10-01T10:00:00.000Z" })
    expect(out.fiches[0].historique).toEqual([
      { date: "2026-10-02T10:00:00.000Z", type: "Note", texte: "Rappeler après 14 h", detail: null },
      { date: "2026-10-04T10:00:00.000Z", type: "Appel", texte: "Intéressée par un site", detail: "Joint · 5 min" },
      { date: "2026-10-05T10:00:00.000Z", type: "Changement de statut", texte: null, detail: "Nouveau → Contacté" },
    ])
    expect(out.fiches[0].opportunites).toEqual([expect.objectContaining({ etape: "Gagné", montant: 4500, devise: "EUR", gagneeLe: "2026-10-20T10:00:00.000Z" })])
  })

  it("gives her emails, her meetings, the profiles found for her and her place on the opposition list", async () => {
    const out = await svc.exportPerson(u.manager, marie.id)
    expect(out.emails.map((e) => [e.sens, e.statut, e.objet, e.texte])).toEqual([
      ["Envoyé à la personne", "Envoyé", "Votre site", "Bonjour Marie, …"],
      ["Reçu de la personne", "Reçu", "Re: Votre site", "Merci, rappelez-moi."],
      ["Reçu de la personne", "Reçu", "Question", "Faites-vous les devis ?"],
    ])
    expect(out.rendezVous.map((m) => m.notes)).toEqual(["Devis à envoyer", "Visite de la boutique"])
    expect(out.rendezVous[0]).toMatchObject({ debut: "2026-10-12T10:00:00.000Z", fin: "2026-10-12T10:30:00.000Z", fuseau: "Europe/Paris", type: "Découverte", statut: "Terminé", issue: "Qualifié, on avance" })
    expect(out.profilsProposes.map((p) => [p.profil, p.statut])).toEqual([
      ["https://www.linkedin.com/in/marie-fictive", "À vérifier"],
      ["https://www.linkedin.com/in/marie-fictive-old", "Confirmé"],
    ])
    expect(out.profilsProposes[0]).toMatchObject({ nom: "Marie Fictive", role: "Dirigeant", confiance: "82 %" })
    expect(out.listeOpposition).toEqual({ adresse: "marie@boulangerie-fictive.test", presente: true, motif: "Désinscription", depuis: "2026-10-08T10:00:00.000Z" })
  })

  it("holds nothing about anyone else: no colleague, no officer, no other prospect, no member of the team", async () => {
    const text = JSON.stringify(await svc.exportPerson(u.owner, marie.id))
    for (const other of ["Paul", "paul@", "Jean", "garage-autre", "Garage Autre", "homonyme", "Olga", "Max Manager", "Sam Vendeur", "Cléo", "Vic Lecteur", "export.test", "sdr@send.example.test", "Test interne", "Tâche"]) {
      expect(text, other).not.toContain(other)
    }
  })

  it("lists the colleague's data when the colleague is the one asking", async () => {
    const out = await svc.exportPerson(u.owner, paul.id)
    expect(out.identite.nom).toBe("Paul Collègue")
    expect(out.fiches).toEqual([]) // the company's fiche is Marie's
    expect(out.emails.map((e) => e.objet)).toEqual(["Pour Paul", "Réponse de Paul"])
    expect(out.rendezVous.map((m) => m.notes)).toEqual(["Rendez-vous de Paul"])
    expect(out.profilsProposes.map((p) => p.nom)).toEqual(["Paul Collègue"])
    expect(out.listeOpposition).toMatchObject({ presente: true, motif: "Signalement comme spam" })
    // The company's address is Marie's own: it is not the colleague's to read. A shared one would be.
    expect(out.entreprise).toMatchObject({ nom: "Boulangerie Fictive", email: null })
    expect(JSON.stringify(out)).not.toMatch(/marie/i)
    await prisma.company.updateMany({ where: { name: "Boulangerie Fictive" }, data: { email: "contact@boulangerie-fictive.test" } })
    expect((await svc.exportPerson(u.owner, paul.id)).entreprise?.email).toBe("contact@boulangerie-fictive.test")
  })

  it("writes the export in the audit log, without its content", async () => {
    await svc.exportPerson(u.owner, marie.id, "1.2.3.4")
    const logs = await prisma.auditLog.findMany({ where: { action: "contact.exported" } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actorId: u.owner.id, workspaceId: ws, entityType: "Contact", entityId: marie.id, ip: "1.2.3.4", subject: null, metadata: null })
  })

  it("refuses SDRs, closers and viewers, and a contact of another workspace", async () => {
    for (const who of ["sdr", "closer", "viewer"]) await expect(svc.exportPerson(u[who], marie.id), who).rejects.toMatchObject({ status: 403 })
    await expect(svc.exportPerson({ ...u.owner, workspaceId: "ws_other" }, marie.id)).rejects.toMatchObject({ status: 404 })
    expect(await prisma.auditLog.count({ where: { action: "contact.exported" } })).toBe(0)
  })

  describe("the route", () => {
    const get = (id: string) => route.GET(new Request(`http://localhost/api/contacts/${id}/export`, { headers: { "x-forwarded-for": "5.6.7.8" } }), { params: Promise.resolve({ id }) })
    const signIn = (who: string) => {
      session.user = { id: u[who].id, role: u[who].role, workspaceId: ws, name: u[who].name, email: u[who].email }
    }

    it("downloads the JSON for an owner and a manager, never from a cache", async () => {
      for (const who of ["owner", "manager"]) {
        signIn(who)
        const res = await get(marie.id)
        expect(res.status, who).toBe(200)
        expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
        expect(res.headers.get("content-disposition")).toBe(`attachment; filename="cleads-donnees-personnelles-${marie.id}.json"`)
        expect(res.headers.get("cache-control")).toBe("no-store")
        const body = await res.json()
        expect(body.identite.nom).toBe("Marie Fictive")
      }
      const logs = await prisma.auditLog.findMany({ where: { action: "contact.exported" }, orderBy: { createdAt: "asc" } })
      expect(logs.map((l) => [l.actorId, l.ip])).toEqual([[u.owner.id, "5.6.7.8"], [u.manager.id, "5.6.7.8"]])
    })

    it("answers 403 to SDRs, closers and viewers, 401 to a visitor and 404 to an unknown contact", async () => {
      for (const who of ["sdr", "closer", "viewer"]) {
        signIn(who)
        const res = await get(marie.id)
        expect(res.status, who).toBe(403)
        expect(JSON.stringify(await res.json())).not.toContain("Marie")
      }
      session.user = null
      expect((await get(marie.id)).status).toBe(401)
      signIn("owner")
      expect((await get("inconnu")).status).toBe(404)
      expect(await prisma.auditLog.count({ where: { action: "contact.exported" } })).toBe(0)
    })
  })
})
