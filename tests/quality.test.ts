import { describe, expect, it } from "vitest"
import { SITES } from "@/evals/sites"
import { collectSite } from "@/features/prospect-audit/collect"
import { buildReport } from "@/features/prospect-audit/handler"
import { measure } from "@/features/prospect-audit/rules"
import type { SiteContent } from "@/features/prospect-audit/schemas"
import { EVAL_NOW, frozenFacts, frozenFetcher, frozenPsi } from "@/features/quality/frozen"
import { siteUrl } from "@/features/prospect-audit/net"
import { isSocialProfile } from "@/features/prospect-audit/html"

/** What a perfect reading step would say of a frozen site: only what the case states. */
const oracle = (read: { faq: boolean; entityClear: boolean }): SiteContent => ({
  activity: "",
  services: [],
  area: null,
  audience: null,
  headline: null,
  ctas: [],
  proofs: [],
  faq: read.faq,
  entityClear: read.entityClear,
  outdatedSigns: [],
  frictions: [],
})

describe("the Auditeur's frozen sites (evals/sites.ts)", () => {
  it("are thirty, with unique ids and fictional addresses", () => {
    expect(SITES).toHaveLength(30)
    expect(new Set(SITES.map((s) => s.id)).size).toBe(30)
    for (const s of SITES) {
      if (s.website && !isSocialProfile(s.website)) expect(new URL(s.website).hostname.endsWith(".example"), s.id).toBe(true)
      if (s.listing.phone) expect(s.listing.phone.startsWith("01 99 00"), s.id).toBe(true)
      expect(s.expect.signals.filter((k) => s.expect.absent.includes(k)), s.id).toEqual([])
    }
  })

  it.each(SITES.map((s) => [s.id, s] as const))("%s raises what it expects, and nothing it forbids, with a perfect reading", async (_id, s) => {
    const website = siteUrl(s.website)
    const collected = website && !isSocialProfile(website) ? await collectSite(website, frozenFetcher(s)) : null
    const target = collected?.reachable ? collected.finalUrl : null
    const facts = frozenFacts(s, collected, { mobile: target ? frozenPsi(s, "mobile") : null, desktop: target ? frozenPsi(s, "desktop") : null })
    const content = collected?.reachable && s.read ? oracle(s.read) : null
    const measured = measure(facts, content, EVAL_NOW)
    const { report } = buildReport(facts, measured, null, { extraction: null, analysis: null }, EVAL_NOW)
    const found = report.signals.map((x) => x.key)
    expect(s.expect.signals.filter((k) => !found.includes(k)), "missing").toEqual([])
    expect(s.expect.absent.filter((k) => found.includes(k)), "forbidden").toEqual([])
    // A site that can be read says what a careful reading finds; one that cannot, says nothing.
    expect(!!s.read, "read").toBe(!!collected?.reachable)
  })
})

describe("the other reference sets (evals/)", () => {
  it("label 80 replies across every class, with their urgency", async () => {
    const { REPLIES } = await import("@/evals/replies")
    expect(REPLIES).toHaveLength(80)
    expect(new Set(REPLIES.map((r) => r.id)).size).toBe(80)
    expect(new Set(REPLIES.map((r) => r.label.reply))).toEqual(new Set(["INTERESTED", "NOT_NOW", "NOT_INTERESTED", "OUT_OF_OFFICE", "WRONG_PERSON", "STOP", "OTHER"]))
    expect(REPLIES.filter((r) => r.label.reply === "STOP").length).toBeGreaterThanOrEqual(10)
  })

  it("judge 45 fiches for three campaigns built on real V1 offers", async () => {
    const { FICHES, CAMPAIGNS } = await import("@/evals/fiches")
    expect(FICHES).toHaveLength(45)
    for (const c of Object.values(CAMPAIGNS)) expect(c.offer.signals.length).toBeGreaterThan(0)
    expect(new Set(FICHES.map((f) => f.label))).toEqual(new Set(["RELEVANT", "MAYBE", "NOT_RELEVANT"]))
  })

  it("give audits whose expected offers are candidates, and valid briefs", async () => {
    const { AUDITS } = await import("@/evals/audits")
    const { BRIEFS } = await import("@/evals/briefs")
    const { auditReportSchema } = await import("@/features/prospect-audit/schemas")
    const { briefSchema } = await import("@/features/studio/schemas")
    const { candidatesFor } = await import("@/features/offer-pitch/rules")
    const { FROZEN_OFFERS } = await import("@/features/quality/cases/offers")
    for (const a of AUDITS) {
      expect(() => auditReportSchema.parse(a.audit.report), a.id).not.toThrow()
      const known = new Set(a.audit.report.evidence.map((e) => e.id))
      for (const item of [...a.audit.report.findings, ...a.audit.report.signals]) expect(item.evidence.every((id) => known.has(id)), a.id).toBe(true)
      const candidates = candidatesFor(a.audit.report, FROZEN_OFFERS).map((c) => c.offer.slug)
      expect(a.expect.main.some((slug) => candidates.includes(slug)), a.id).toBe(true)
      expect(a.expect.main.filter((slug) => a.expect.never.includes(slug)), a.id).toEqual([])
    }
    for (const b of BRIEFS) expect(() => briefSchema.parse(b.brief), b.id).not.toThrow()
  })

  it("keep their quick samples inside the full sets, with a stable version each", async () => {
    const { SUITES } = await import("@/features/quality/suites")
    for (const s of Object.values(SUITES)) {
      expect(s.quick.every((id) => s.cases.includes(id)), s.info.id).toBe(true)
      expect(s.version).toMatch(/^[0-9a-f]{12}$/)
    }
    // The quick sample of replies keeps every trap.
    const { REPLIES } = await import("@/evals/replies")
    expect(REPLIES.filter((r) => r.trap).every((r) => SUITES.replies.quick.includes(r.id))).toBe(true)
  })
})

describe("the rules contender", () => {
  it("never misses a request to stop writing, and files most replies right", async () => {
    const { REPLIES } = await import("@/evals/replies")
    const { replyRules } = await import("@/features/quality/baselines")
    const answers = REPLIES.map((r) => ({ expected: r.label.reply, got: replyRules({ subject: r.subject, body: r.body }).reply }))
    expect(answers.filter((a) => a.expected === "STOP").every((a) => a.got === "STOP")).toBe(true)
    expect(answers.filter((a) => a.got === a.expected).length / answers.length).toBeGreaterThan(0.6)
  })

  it("judges a fiche on trade, zone and size", async () => {
    const { relevanceRules } = await import("@/features/quality/baselines")
    const target = { name: "Plombiers", sector: "Plombier", area: "Lyon et Villeurbanne", offer: null }
    const company = (c: object) => ({ company: { name: "X", sector: "Plombier", city: "Lyon", postalCode: null, website: null, rating: null, reviewCount: 10, hasPhone: true, hasEmail: false, ...c } })
    expect(relevanceRules(target, company({})).verdict).toBe("RELEVANT")
    expect(relevanceRules(target, company({ city: "Marseille" })).verdict).toBe("NOT_RELEVANT")
    expect(relevanceRules(target, company({ sector: "Boulangerie" })).verdict).toBe("NOT_RELEVANT")
    expect(relevanceRules(target, company({ reviewCount: 2_000 })).verdict).toBe("NOT_RELEVANT")
    expect(relevanceRules(target, company({ sector: null })).verdict).toBe("MAYBE")
  })
})

describe("measures", () => {
  it("aggregate a decision suite with its calibration, and count a failure as a wrong answer", async () => {
    const { aggregate } = await import("@/features/quality/metrics")
    const row = (expected: string, predicted: string | null, confidence: number | null, outcome: string, error: string | null = null) => ({
      ok: expected === predicted,
      score: expected === predicted ? 1 : 0,
      detail: error ? {} : { expected: { value: expected }, predicted: { value: predicted }, confidence, outcome },
      error,
      costMicros: 100,
      judgeMicros: 0,
      durationMs: 400,
    })
    const r = aggregate("replies", "typesafe-ai/jev", [row("STOP", "STOP", 0.95, "auto"), row("STOP", "NOT_INTERESTED", 0.92, "auto"), row("INTERESTED", "INTERESTED", 0.7, "review"), row("OTHER", null, null, "human", "Gateway refusé")])
    expect(r).toMatchObject({ score: 50, cases: 4, ok: 2, failed: 1 })
    expect(r.measures).toMatchObject({ accuracy: 2 / 3, stopRecall: 0.5, autoShare: 2 / 3, autoAccuracy: 0.5, duration: 400 })
    expect(r.hard).toEqual(["Une demande de ne plus écrire n'a pas été repérée", "Plus d'un cas sur cinq a échoué"])
    expect(r.calibration!.find((b) => b.from === 0.9)).toMatchObject({ cases: 2, accuracy: 0.5 })
    expect(r.measures.calibration).toBeGreaterThan(0)
  })

  it("compare a candidate with the model in service: better, equivalent, or a regression", async () => {
    const { compare } = await import("@/features/quality/metrics")
    const res = (score: number, cost: number, hard: string[] = []) => ({ contender: "x", score, cases: 10, ok: 0, failed: 0, skipped: 0, measures: { cost, duration: 1000 }, hard, costMicros: 0, judgeMicros: 0 })
    expect(compare(res(80, 0.02), res(85, 0.01))).toMatchObject({ verdict: "better", scoreDelta: 5, costRatio: 0.5 })
    expect(compare(res(80, 0.02), res(78, 0.002))).toMatchObject({ verdict: "equivalent", costRatio: 0.1 })
    expect(compare(res(80, 0.02), res(70, 0.002)).verdict).toBe("regression")
    expect(compare(res(80, 0.02), res(90, 0.02, ["Une page a été coupée avant la fin"]))).toMatchObject({ verdict: "regression", newHard: ["Une page a été coupée avant la fin"] })
  })

  it("check a first email by the skill's rules", async () => {
    const { emailChecks } = await import("@/features/quality/cases/writer")
    const body = `Bonjour Claire, ${"votre site est lent sur téléphone et vos clients partent. ".repeat(8)}Auriez-vous quinze minutes cette semaine ?`
    expect(emailChecks("Votre site sur téléphone", body, 1).every((c) => c.ok)).toBe(true)
    const bad = emailChecks("UNE OFFRE EXCEPTIONNELLE POUR VOTRE ENTREPRISE AUJOURD'HUI", "Salut ! -50 % sur nos sites ? Voir https://cleads.fr ? [prénom]", 0)
    expect(bad.filter((c) => !c.ok).map((c) => c.name)).toEqual(["60 à 120 mots", "Objet de moins de 50 caractères", "Commence par « Bonjour »", "Une seule question", "Aucun lien", "Ni prix ni promesse chiffrée", "Rien à compléter entre crochets", "Au moins un fait sourcé"])
  })

  it("offer the right contenders and price them", async () => {
    const { contenderChoices } = await import("@/features/quality/suites")
    const { perCaseMicros } = await import("@/features/quality/service")
    const { DEFAULT_PRICES } = await import("@/lib/ai/pricing")
    // The Auditeur measured with Haiku is the proof it may work in the « fast » role.
    expect(contenderChoices("auditor", "writer", "writer")).toContain("anthropic/claude-haiku-5.5")
    expect(contenderChoices("auditor", "fast", "writer")).not.toContain("anthropic/claude-opus-5.5")
    expect(contenderChoices("replies", "decision", "decision")).toEqual(expect.arrayContaining(["typesafe-ai/jev", "anthropic/claude-haiku-5.5", "rules"]))
    const settings = { roleModels: {}, eurPerUsd: 0.92 }
    expect(perCaseMicros("replies", "decision", "rules", settings, DEFAULT_PRICES)).toBe(0)
    expect(perCaseMicros("designer", "designer", "anthropic/claude-opus-5.5", settings, DEFAULT_PRICES)).toBeGreaterThan(perCaseMicros("designer", "designer", "anthropic/claude-sonnet-5.5", settings, DEFAULT_PRICES))
  })

  it("group errors by what they say", async () => {
    const { errorKey } = await import("@/features/quality/dashboard")
    expect(errorKey("Le budget IA du mois ne suffit plus : il reste 3,20 € sur 100 €.")).toBe(errorKey("Le budget IA du mois ne suffit plus : il reste 0,10 € sur 100 €."))
  })
})
