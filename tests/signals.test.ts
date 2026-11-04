// E30 lot 1 (BODACC, registry): everything that needs no database. The network is a fake: nothing leaves the machine.
import { describe, expect, it } from "vitest"
import { fetchNotices, parseNotice, whereOf } from "@/features/enrichment/sources/bodacc"
import { identityUpdate } from "@/features/enrichment/identity"
import { pickCompany } from "@/features/enrichment/sources/annuaire"
import { activityMatches, changeKind, headcountLabel, judgmentKind, legallyBlocked, nafMatches, sectorStems, signalsOf, type WatchSector } from "@/features/signals/kinds"
import { nextMorning, sectorsOf } from "@/features/signals/watch"
import { leadBlockers } from "@/features/outreach/rules"
import { annuaireResult, fakeRegistry, rawNotice } from "./helpers/registry-fixtures"

const PLUMBER: WatchSector = { key: "plumber", label: "plombier", naf: ["43.22A"], keywords: ["plomberie", "chauffagiste"] }
const RESTAURANT: WatchSector = { key: "restaurant", label: "restaurant", naf: ["56.10A"], keywords: [] }

describe("BODACC notices", () => {
  it("reads a sole trader's creation, its trade name, activity and start", () => {
    const n = parseNotice(rawNotice({ id: "A1", family: "creation", day: "2026-11-04", sirens: ["900000001"], person: { nom: "EXEMPLE", prenom: ["Camille", "Marie"], nomCommercial: "ATELIER LUMEN" }, activity: "Travaux de plomberie et chauffage", city: "Villeurbanne", postalCode: "69100", startedOn: "2026-11-01" }))!
    expect(n).toMatchObject({ id: "A1", family: "creation", publishedOn: "2026-11-04", sirens: ["900000001"], name: "Camille EXEMPLE", tradeName: "ATELIER LUMEN", city: "Villeurbanne", postalCode: "69100", startedOn: "2026-11-01" })
    expect(n.activity).toContain("plomberie")
  })

  it("reads a sale: the buyer first, the seller apart", () => {
    const n = parseNotice(rawNotice({ id: "A2", family: "vente", day: "2026-11-04", sirens: ["900000002", "900000003"], person: { pm: "NOUVEAU FOURNIL" }, activity: "Boulangerie, pâtisserie", seller: { pm: "ANCIEN FOURNIL", siren: "900 000 003" } }))!
    expect(n.sirens).toEqual(["900000002", "900000003"])
    expect(n.name).toBe("NOUVEAU FOURNIL")
    expect(n.seller).toEqual({ name: "ANCIEN FOURNIL", siren: "900000003" })
  })

  it("ignores a deposit of accounts, a broken record or broken JSON", () => {
    expect(parseNotice({ id: "x", dateparution: "2026-11-04", familleavis: "dpc" })).toBeNull()
    expect(parseNotice({ nothing: true })).toBeNull()
    const n = parseNotice({ ...rawNotice({ id: "A3", family: "radiation", day: "2026-11-04", sirens: ["900000004"] }), listepersonnes: "{cassé" })!
    expect(n.name).toBe("SOCIETE EXEMPLE")
  })

  it("keeps the filter safe: values are reduced to letters and digits", () => {
    const w = whereOf({ families: ["creation"], departments: ['69") or (1=1', "2A"], from: "2026-11-01", to: "2026-11-04" })
    expect(w).toBe(`familleavis in ("creation") and dateparution >= date'2026-11-01' and dateparution <= date'2026-11-04' and numerodepartement in ("69or11","2A")`)
  })

  it("reads every page, and fails plainly when the BODACC does not answer", async () => {
    const notices = Array.from({ length: 230 }, (_, i) => rawNotice({ id: `B${i}`, family: "creation", day: "2026-11-04", sirens: [String(900000100 + i)] }))
    const { fetchImpl, calls } = fakeRegistry(notices, [])
    const r = await fetchNotices({ families: ["creation"], departments: ["69"], from: "2026-11-04", to: "2026-11-04" }, { fetchImpl })
    expect(r.notices).toHaveLength(230)
    expect(r.truncated).toBe(false)
    expect(calls.bodacc).toBe(3)
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch
    await expect(fetchNotices({ families: ["creation"], from: "2026-11-04", to: "2026-11-04" }, { fetchImpl: down })).rejects.toThrow("Le BODACC a répondu 503")
  })
})

describe("signals of a notice", () => {
  const one = (o: Parameters<typeof rawNotice>[0]) => signalsOf(parseNotice(rawNotice(o))!)

  it("a creation, dated by its start of activity", () => {
    const [s] = one({ id: "C1", family: "creation", day: "2026-11-04", sirens: ["900000001"], person: { pm: "ATELIER LUMEN" }, activity: "Plomberie", city: "Lyon", startedOn: "2026-11-01" })
    expect(s).toMatchObject({ siren: "900000001", kind: "CREATED", occurredAt: "2026-11-01", publishedOn: "2026-11-04", externalKey: "bodacc:C1" })
    expect(s.summary).toBe("Création « Plomberie » (Lyon), activité commencée le 01/11/2026.")
  })

  it("a sale gives a takeover to the buyer and a sale to the seller", () => {
    const out = one({ id: "C2", family: "vente", day: "2026-11-04", sirens: ["900000002", "900000003"], person: { pm: "NOUVEAU FOURNIL" }, activity: "Boulangerie", city: "Lyon", seller: { pm: "ANCIEN FOURNIL", siren: "900000003" } })
    expect(out.map((s) => [s.siren, s.kind])).toEqual([["900000002", "TAKEOVER"], ["900000003", "TAKEOVER"]])
    expect(out[0].summary).toContain("cédé par ANCIEN FOURNIL")
    expect(out[1].summary).toContain("à NOUVEAU FOURNIL")
    expect(out[1].details.role).toBe("seller")
  })

  it("modifications: leader, move, closure; capital says nothing", () => {
    expect(changeKind("Modification de l'administration.")).toBe("NEW_LEADER")
    expect(changeKind("modification survenue sur l'administration")).toBe("NEW_LEADER")
    expect(changeKind("Nouveau siège.")).toBe("MOVED")
    expect(changeKind("modification survenue sur l'adresse du siège")).toBe("MOVED")
    expect(changeKind("Cessation d'activité de la société. Dissolution de la société. Modification de l'administration.")).toBe("CLOSED")
    expect(changeKind("Nouvel établissement principal.")).toBe("NEW_SITE")
    expect(changeKind("Modification du capital.")).toBeNull()
    expect(one({ id: "C3", family: "modification", day: "2026-11-04", sirens: ["900000005"], change: "Modification du capital." })).toEqual([])
  })

  it("proceedings, and a liquidation closed for want of assets", () => {
    const [p] = one({ id: "C4", family: "collective", day: "2026-11-04", sirens: ["900000006"], judgment: { nature: "Jugement d'ouverture de redressement judiciaire", date: "2026-10-28" } })
    expect(p).toMatchObject({ kind: "INSOLVENCY", occurredAt: "2026-10-28" })
    expect(judgmentKind("Jugement de clôture pour insuffisance d'actif")).toBe("CLOSED")
    expect(one({ id: "C5", family: "radiation", day: "2026-11-04", sirens: ["900000007"] })[0].kind).toBe("CLOSED")
  })

  it("a merger published among the sales is no takeover", () => {
    expect(one({ id: "C8", family: "vente", day: "2026-11-04", sirens: ["900000009", "900000010"], person: { pm: "GROUPE EXEMPLE" }, change: "Avis au Bodacc relatif au projet commun de fusion nationale" })).toEqual([])
  })

  it("a registration after a transfer is a move; a notice without SIREN gives nothing", () => {
    expect(one({ id: "C6", family: "immatriculation", day: "2026-11-04", sirens: ["900000008"], registration: "Immatriculation d'une personne morale suite à transfert de son siège social" })[0].kind).toBe("MOVED")
    expect(one({ id: "C7", family: "creation", day: "2026-11-04", sirens: [] })).toEqual([])
  })
})

describe("sectors of a watch", () => {
  it("recognises a sector by word starts, never inside a word", () => {
    expect(sectorStems(PLUMBER)).toEqual(expect.arrayContaining(["plomb", "chauf"]))
    expect(activityMatches("Travaux de PLOMBERIE, chauffage", [PLUMBER])).toBe(true)
    expect(activityMatches("Restauration traditionnelle", [RESTAURANT])).toBe(true)
    expect(activityMatches("Prestations de services administratifs", [RESTAURANT])).toBe(false)
    expect(activityMatches("Transport de personnes avec chauffeur", [PLUMBER])).toBe(false)
    expect(activityMatches("Coiffure", [])).toBe(true)
    expect(nafMatches("43.22A", [PLUMBER])).toBe(true)
    expect(nafMatches("56.10A", [PLUMBER])).toBe(false)
    expect(nafMatches(null, [])).toBe(true)
  })

  it("reads the sectors a watch kept, dropping anything malformed", () => {
    expect(sectorsOf([{ key: "plumber", label: "plombier", naf: ["43.22A", 3], keywords: "x" }, { key: 1 }, null])).toEqual([{ key: "plumber", label: "plombier", naf: ["43.22A"], keywords: [] }])
    expect(sectorsOf(null)).toEqual([])
  })
})

describe("legal state", () => {
  const at = (iso: string) => new Date(iso)
  it("blocks proceedings and closures until an owner or a manager chooses, and blocks again after a newer judgment", () => {
    expect(legallyBlocked({ legalState: "ACTIVE", legalStateAt: null, legalOverrideAt: null })).toBe(false)
    expect(legallyBlocked({ legalState: "INSOLVENT", legalStateAt: at("2026-10-28"), legalOverrideAt: null })).toBe(true)
    expect(legallyBlocked({ legalState: "INSOLVENT", legalStateAt: at("2026-10-28"), legalOverrideAt: at("2026-11-02") })).toBe(false)
    expect(legallyBlocked({ legalState: "CLOSED", legalStateAt: at("2026-11-03"), legalOverrideAt: at("2026-11-02") })).toBe(true)
  })

  it("stops a one-to-one email and a sequence alike", () => {
    const base = { status: "NEW" as const, recipient: { email: "contact@exemple.test", kind: "GENERIC" as const, contactId: null }, contactDoNotContact: false, suppressed: false, mayWrite: true }
    expect(leadBlockers(base)).toEqual([])
    expect(leadBlockers({ ...base, legalBlocked: true })).toEqual(["legal_state"])
  })
})

describe("identity from the registry", () => {
  const company = { id: "c1", name: "Atelier Lumen", siren: null, siret: null, postalCode: "69003", legalState: "ACTIVE" as const, data: { placeId: "p1" } }
  const now = new Date("2026-11-04T08:00:00Z")

  it("fills the identity, keeps the raw data, proposes officers", () => {
    const record = pickCompany({ results: [annuaireResult({ siren: "900000001", name: "ATELIER LUMEN", created: "2026-10-20", band: "01", officers: [{ nom: "EXEMPLE", prenoms: "Camille Marie", qualite: "Gérant" }] })] }, { siren: "900000001", name: "x" })
    const u = identityUpdate(company, { record, error: null }, now)
    expect(u).toMatchObject({ siren: "900000001", nafCode: "43.22A", headcountBand: "01", identityCheckedAt: now })
    expect(u.siret).toMatch(/^900000001\d{5}$/)
    expect((u.foundedOn as Date).toISOString()).toBe("2026-10-20T00:00:00.000Z")
    const data = u.data as { placeId: string; identity: { found: boolean; officers: unknown[]; category: string } }
    expect(data.placeId).toBe("p1")
    expect(data.identity).toMatchObject({ found: true, category: "PME", officers: [{ name: "Camille Exemple", role: "Gérant" }] })
    expect(headcountLabel("01")).toBe("1 ou 2 salariés")
  })

  it("never proposes the officers of a company that objected, and closes a closed one", () => {
    const record = pickCompany({ results: [annuaireResult({ siren: "900000009", name: "X", opposition: true, active: false, officers: [{ nom: "A", prenoms: "B", qualite: "Président" }] })] }, { siren: "900000009", name: "x" })
    const u = identityUpdate(company, { record, error: null }, now)
    expect((u.data as { identity: { officers: unknown[] } }).identity.officers).toEqual([])
    expect(u).toMatchObject({ legalState: "CLOSED", legalStateAt: now })
  })

  it("records a miss without touching the identity", () => {
    const u = identityUpdate(company, { record: null, error: "Annuaire des entreprises injoignable" }, now)
    expect(u.siren).toBeUndefined()
    expect((u.data as { identity: { found: boolean; error: string } }).identity).toMatchObject({ found: false, error: "Annuaire des entreprises injoignable" })
  })
})

describe("schedule", () => {
  it("runs at 7:30 in Paris, today if still ahead, else tomorrow", () => {
    expect(nextMorning(new Date("2026-11-04T05:00:00Z")).toISOString()).toBe("2026-11-04T06:30:00.000Z")
    expect(nextMorning(new Date("2026-11-04T07:00:00Z")).toISOString()).toBe("2026-11-05T06:30:00.000Z")
    expect(nextMorning(new Date("2026-07-01T12:00:00Z")).toISOString()).toBe("2026-07-02T05:30:00.000Z")
  })
})
