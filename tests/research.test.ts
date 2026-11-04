// E30 lot 2: the Enquêteur's pure parts — search prices, sources, profile matching, GEO probe, brief, reference set.
import { describe, expect, it } from "vitest"
import { RESEARCH_CASES } from "@/evals/research"
import { SEARCH_PRICES, countSearches, isSearchTool, searchMicros, worstSearchMicros } from "@/lib/ai/pricing"
import { flat, quotes, sourcesOf, urlKey, type WebSource } from "@/lib/ai/search"
import { MODEL_LABELS } from "@/lib/ai/models"
import { OFFER_SIGNALS, isOfferSignal } from "@/features/offers/signals"
import { OFFERS_V1 } from "@/features/offers/catalog-v1"
import { AGENTS } from "@/features/ai/agents"
import { CONTROL_ROOM, postOf } from "@/features/hq/agency"
import { companyProfile, keepJudgment, missingNetworks, peopleTargets, personProfile, type Judgment, type PeopleTarget } from "@/features/research/people"
import { geoFinding, geoQuestions, geoSummary, tradeOf } from "@/features/research/geo"
import { briefQueries, settleBrief } from "@/features/research/brief"
import { briefOutputSchema, type BriefOutput } from "@/features/research/brief-schemas"
import { withResearch } from "@/features/research/evidence"
import { caseInputs, gradeResearch } from "@/features/quality/cases/researcher"
import type { SkillOffer } from "@/features/offers/skill"

const src = (url: string, text: string, title = text.slice(0, 40)): WebSource => ({ tool: "exa_search", url, title, text: `${title} … ${text}`, date: null })

describe("web searches: price and count (E30 lot 2)", () => {
  it("counts the searches the Gateway ran, one per Perplexity query", () => {
    const content = [
      { type: "tool-call", toolName: "exa_search", providerExecuted: true, input: { query: "a" } },
      { type: "tool-call", toolName: "perplexity_search", providerExecuted: true, input: { query: ["a", "b", "c"] } },
      { type: "tool-call", toolName: "exa_search", providerExecuted: true, input: { query: "b" } },
      // A tool of ours, or a result: not a search the Gateway billed.
      { type: "tool-call", toolName: "get_lead", input: {} },
      { type: "tool-call", toolName: "exa_search", input: { query: "client-side" } },
      { type: "tool-result", toolName: "exa_search", providerExecuted: true, output: { results: [] } },
    ]
    expect(countSearches(content)).toEqual({ exa_search: 2, perplexity_search: 3 })
    expect(isSearchTool("exa_search")).toBe(true)
    expect(isSearchTool("toString")).toBe(false)
  })

  it("prices searches in micro-euros, rounded up, and sets aside the dearest", () => {
    expect(searchMicros({ exa_search: 1 }, 1)).toBe(7_000)
    expect(searchMicros({ exa_search: 2, perplexity_search: 3 }, 0.92)).toBe(Math.ceil((2 * 0.007 + 3 * 0.005) * 0.92 * 1e6))
    expect(worstSearchMicros(["perplexity_search", "exa_search"], 4, 1)).toBe(28_000)
    expect(worstSearchMicros([], 4, 1)).toBe(0)
    // Réglages › IA shows each search engine apart.
    for (const p of Object.values(SEARCH_PRICES)) expect(MODEL_LABELS[p.usage]).toBeTruthy()
  })
})

describe("sources of a search", () => {
  it("reads Exa and Perplexity results, skips errors and keeps each page once", () => {
    const content = [
      { type: "tool-result", toolName: "exa_search", output: { requestId: "r", results: [{ title: "Julien Roche - Gérant", url: "https://www.linkedin.com/in/exemple-julien/", id: "1", highlights: ["Gérant chez Plomberie Roche"], publishedDate: "2026-10-01" }, { title: "sans lien", url: "javascript:alert(1)", id: "2" }] } },
      { type: "tool-result", toolName: "perplexity_search", output: { id: "p", results: [{ title: "Plombiers à Lyon", url: "https://annuaire.example/plombiers-lyon", snippet: "Les 10 meilleurs plombiers", date: "2026-09-12" }, { title: "Doublon", url: "http://www.linkedin.com/in/exemple-julien", snippet: "x" }] } },
      { type: "tool-result", toolName: "exa_search", output: { error: "rate_limit", message: "Too many requests" } },
      { type: "tool-result", toolName: "get_lead", output: { results: [{ url: "https://crm.example" }] } },
    ]
    const sources = sourcesOf(content)
    expect(sources.map((s) => s.url)).toEqual(["https://www.linkedin.com/in/exemple-julien/", "https://annuaire.example/plombiers-lyon"])
    expect(sources[0]).toMatchObject({ tool: "exa_search", date: "2026-10-01" })
    expect(sources[0].text).toContain("Gérant chez Plomberie Roche")
    expect(sources[1]).toMatchObject({ tool: "perplexity_search", date: "2026-09-12" })
  })

  it("finds a quote whatever its accents, case or spaces, and never a short or invented one", () => {
    const s = src("https://x.example", "Élodie Martin, gérante du Cabinet Martin Architectes à Lyon.")
    expect(quotes(s, "elodie martin  gérante du cabinet")).toBe(true)
    expect(quotes(s, "Martin")).toBe(false)
    expect(quotes(s, "gérante du Cabinet Durand")).toBe(false)
    expect(flat("Rénovation, Énergie !")).toBe("renovation energie")
    expect(urlKey("https://www.Exemple.example/Page/?utm=1#x")).toBe(urlKey("http://exemple.example/Page"))
  })
})

describe("decision makers and accounts", () => {
  const company = (o: Partial<{ headcountBand: string | null; officers: { name: string; role: string }[]; opposition: boolean; socials: Record<string, string> }> = {}) => ({
    name: "Plomberie Roche",
    city: "Villeurbanne",
    headcountBand: o.headcountBand ?? "02",
    data: { identity: { officers: o.officers ?? [{ name: "Julien Roche", role: "Gérant" }, { name: "Anne Roche", role: "Associée" }, { name: "Paul Roche", role: "Associé" }], opposition: o.opposition ?? false }, socials: o.socials ?? {} },
    contacts: [] as { name: string | null; linkedinUrl: string | null }[],
  })

  it("looks for two officers, and the marketing or sales lead from ten people up", () => {
    expect(peopleTargets(company()).map((t) => t.name)).toEqual(["Julien Roche", "Anne Roche"])
    expect(peopleTargets(company({ headcountBand: "11" })).map((t) => t.role)).toEqual(["EXECUTIVE", "EXECUTIVE", "DECISION_MAKER"])
    expect(peopleTargets(company({ headcountBand: "11" }))[2].query).toContain("Plomberie Roche Villeurbanne")
    // A company that objected to commercial use of its registry data: nobody is searched for.
    expect(peopleTargets(company({ opposition: true }))).toEqual([])
    // An officer already tied to a profile is not searched again.
    const linked = { ...company(), contacts: [{ name: "Julien ROCHE", linkedinUrl: "https://www.linkedin.com/in/x" }] }
    expect(peopleTargets(linked).map((t) => t.name)).toEqual(["Anne Roche", "Paul Roche"])
  })

  it("searches only the networks the company has no account on", () => {
    expect(missingNetworks(null)).toEqual(["instagram", "facebook", "linkedin", "tiktok"])
    expect(missingNetworks({ socials: { facebook: "https://www.facebook.com/roche", youtube: "https://youtube.com/@roche" } })).toEqual(["instagram", "linkedin", "tiktok"])
  })

  it("tells a profile from a post, a group, a hashtag or a person", () => {
    expect(personProfile("https://fr.linkedin.com/in/exemple-julien/")).toBe("https://www.linkedin.com/in/exemple-julien")
    expect(personProfile("https://www.linkedin.com/company/roche")).toBeNull()
    expect(personProfile("https://www.instagram.com/roche")).toBeNull()
    expect(companyProfile("https://www.instagram.com/roche.plomberie/")).toEqual({ network: "instagram", url: "https://www.instagram.com/roche.plomberie" })
    expect(companyProfile("https://www.instagram.com/p/ABC/")).toBeNull()
    expect(companyProfile("https://www.instagram.com/explore/tags/lyon/")).toBeNull()
    expect(companyProfile("https://m.facebook.com/profile.php?id=1000123")).toEqual({ network: "facebook", url: "https://www.facebook.com/profile.php?id=1000123" })
    expect(companyProfile("https://www.facebook.com/groups/lyon")).toBeNull()
    expect(companyProfile("https://www.linkedin.com/company/roche/about/")).toEqual({ network: "linkedin", url: "https://www.linkedin.com/company/roche" })
    expect(companyProfile("https://www.linkedin.com/in/julien")).toBeNull()
    expect(companyProfile("https://www.tiktok.com/@roche")).toEqual({ network: "tiktok", url: "https://www.tiktok.com/@roche" })
    expect(companyProfile("https://www.tiktok.com/@roche/video/123")).toBeNull()
    expect(companyProfile("https://www.youtube.com/@roche")).toBeNull()
  })

  it("keeps a profile only on a real quote, the right surname and enough confidence", () => {
    const targets: PeopleTarget[] = [{ role: "EXECUTIVE", name: "Julien Roche", title: "Gérant", query: "q" }, { role: "DECISION_MAKER", name: null, title: null, query: "q" }]
    const people = [
      src("https://www.linkedin.com/in/a", "Julien Roche. Gérant chez Plomberie Roche, Villeurbanne."),
      src("https://www.linkedin.com/in/b", "Julien Rocher. Gérant chez Rocher Toitures, Lyon."),
      src("https://www.linkedin.com/in/c", "Claire Moreau. Responsable marketing chez Plomberie Roche."),
      src("https://www.linkedin.com/in/d", "Kévin Blanc. Responsable commercial chez Habitat Services."),
    ]
    const j: Judgment = {
      people: [
        { result: 1, target: 1, name: "Julien Roche", title: "Gérant", match: "yes", confidence: 0.93, evidence: "Gérant chez Plomberie Roche, Villeurbanne" },
        // Surname absent from the result: whatever the model says, not him.
        { result: 2, target: 1, name: "Julien Rocher", title: "Gérant", match: "yes", confidence: 0.9, evidence: "Gérant chez Rocher Toitures" },
        { result: 3, target: 2, name: "Claire Moreau", title: "Responsable marketing", match: "yes", confidence: 0.88, evidence: "Responsable marketing chez Plomberie Roche" },
        // A sales lead of another company: the name of ours is not in the result, so at best to check.
        { result: 4, target: 2, name: "Kévin Blanc", title: "Responsable commercial", match: "yes", confidence: 0.85, evidence: "Responsable commercial chez Habitat Services" },
      ],
      accounts: [],
    }
    const kept = keepJudgment(j, { name: "Plomberie Roche SARL" }, targets, people, [], [])
    expect(kept.people.map((p) => [p.url, p.status])).toEqual([
      ["https://www.linkedin.com/in/a", "PROBABLE"],
      ["https://www.linkedin.com/in/c", "PROBABLE"],
      ["https://www.linkedin.com/in/d", "TO_CHECK"],
    ])
    // An invented quote, a doubt, a low confidence.
    const shaky = keepJudgment(
      {
        people: [
          { result: 1, target: 1, name: "Julien Roche", title: null, match: "yes", confidence: 0.95, evidence: "Gérant fondateur de Plomberie Roche depuis 1990" },
          { result: 1, target: 1, name: "Julien Roche", title: null, match: "unsure", confidence: 0.9, evidence: "Julien Roche. Gérant chez Plomberie Roche" },
          { result: 9, target: 1, name: "Personne", title: null, match: "yes", confidence: 0.99, evidence: "Julien Roche. Gérant" },
        ],
        accounts: [],
      },
      { name: "Plomberie Roche" },
      targets,
      people,
      [],
      []
    )
    expect(shaky.people).toEqual([expect.objectContaining({ url: "https://www.linkedin.com/in/a", status: "TO_CHECK" })])
    expect(keepJudgment({ people: [{ ...j.people[0], confidence: 0.4 }], accounts: [] }, { name: "Plomberie Roche" }, targets, people, [], []).people).toEqual([])
  })

  it("keeps an account only when sure, quoted, of a wanted network, the best one per network", () => {
    const accounts = [
      src("https://www.instagram.com/roche.a", "Plomberie Roche, plombier à Villeurbanne"),
      src("https://www.instagram.com/roche.b", "Plomberie Roche officiel, Villeurbanne, dépannage"),
      src("https://www.facebook.com/roche", "Plomberie Roche, page officielle"),
      src("https://www.linkedin.com/company/roche", "Plomberie Roche sur LinkedIn"),
    ]
    const kept = keepJudgment(
      {
        people: [],
        accounts: [
          { result: 1, match: "yes", confidence: 0.82, evidence: "Plomberie Roche, plombier à Villeurbanne" },
          { result: 2, match: "yes", confidence: 0.95, evidence: "Plomberie Roche officiel" },
          { result: 3, match: "unsure", confidence: 0.9, evidence: "Plomberie Roche, page officielle" },
          { result: 4, match: "yes", confidence: 0.95, evidence: "Plomberie Roche sur LinkedIn" },
        ],
      },
      { name: "Plomberie Roche" },
      [],
      [],
      accounts,
      ["instagram", "facebook"]
    )
    expect(kept.accounts).toEqual([expect.objectContaining({ network: "instagram", url: "https://www.instagram.com/roche.b" })])
  })
})

describe("the Enquêteur's reference set (E27)", () => {
  it("is fictional and tells its expectations through the real code", () => {
    expect(new Set(RESEARCH_CASES.map((c) => c.id)).size).toBe(RESEARCH_CASES.length)
    for (const c of RESEARCH_CASES) {
      expect(c.company.domain ?? "x.example", c.id).toMatch(/\.example$/)
      for (const r of [...c.people, ...c.accounts]) expect(r.url, c.id).toMatch(/exemple|EXEMPLE|explore\/tags/)
      // A perfect judge: yes to the expected profiles and accounts, no to the rest.
      const inputs = caseInputs(c)
      const expected = new Set(c.expect.people.map((u) => personProfile(u)))
      const perfect: Judgment = {
        people: inputs.people.map((s, i) => {
          const url = personProfile(s.url)!
          const target = Math.max(0, inputs.targets.findIndex((t) => (t.name ? flat(s.text).includes(flat(t.name).split(" ").at(-1)!) : true)))
          const right = expected.has(url)
          return { result: i + 1, target: target + 1, name: s.title.split(" - ")[0], title: s.title.split(" - ")[1] ?? null, match: right ? "yes" : "no", confidence: right ? 0.95 : 0.1, evidence: s.text.split(" … ")[1].slice(0, 60) }
        }),
        accounts: inputs.accounts.map((s, i) => {
          const p = companyProfile(s.url)!
          const right = urlKey(c.expect.accounts[p.network] ?? "none") === urlKey(p.url)
          return { result: i + 1, match: right ? "yes" : "no", confidence: right ? 0.95 : 0.1, evidence: s.text.split(" … ")[1].slice(0, 40) }
        }),
      }
      const graded = gradeResearch(c, perfect)
      expect(graded.ok, `${c.id} : ${JSON.stringify(graded.detail)}`).toBe(true)
    }
  })

  it("catches a judge that believes everything", () => {
    let caught = 0
    for (const c of RESEARCH_CASES) {
      const inputs = caseInputs(c)
      const naive: Judgment = {
        people: inputs.people.map((s, i) => ({ result: i + 1, target: 1, name: "x", title: s.title.split(" - ")[1] ?? null, match: "yes", confidence: 0.99, evidence: s.text.split(" … ")[1].slice(0, 50) })),
        accounts: inputs.accounts.map((s, i) => ({ result: i + 1, match: "yes", confidence: 0.99, evidence: s.text.split(" … ")[1].slice(0, 30) })),
      }
      if (!gradeResearch(c, naive).ok) caught++
    }
    // Every case with a homonym, an ex-employee or a post is a trap for it.
    expect(caught).toBeGreaterThanOrEqual(RESEARCH_CASES.filter((c) => c.trap).length - 1)
  })
})

describe("GEO probe", () => {
  const base = { checkedAt: "2026-11-04T08:00:00Z", trade: "plombier", city: "Lyon", questions: geoQuestions("plombier", "Lyon") }

  it("writes three questions of trade and city", () => {
    expect(tradeOf("Plombier, chauffagiste")).toBe("plombier")
    expect(tradeOf("  Restaurant italien (Pizzeria) ")).toBe("restaurant italien")
    expect(tradeOf("")).toBeNull()
    expect(base.questions).toEqual(["meilleur plombier à Lyon", "plombier Lyon avis", "quel plombier choisir à Lyon"])
    expect(geoQuestions("couvreur", "Le Havre")[0]).toBe("meilleur couvreur au Havre")
    expect(geoQuestions("couvreur", "Les Mureaux")[2]).toBe("quel couvreur choisir aux Mureaux")
    expect(geoQuestions("couvreur", "La Rochelle")[0]).toBe("meilleur couvreur à La Rochelle")
  })

  it("finds the prospect by its site, or by a distinctive full name, and lists who is cited", () => {
    const sources = [
      src("https://www.annuaire.example/plombiers-lyon", "Les 10 meilleurs plombiers à Lyon : Plomberie Roche, Lyon Eau Services…", "Top 10 plombiers Lyon"),
      src("https://concurrent.example/", "Lyon Eau Services, plombier", "Lyon Eau Services"),
      src("https://blog.plomberie-roche.example/conseils", "Nos conseils", "Blog"),
    ]
    const byDomain = geoFinding(sources, { name: "Plomberie Roche", domain: "plomberie-roche.example" }, base)
    expect(byDomain.present).toBe(true)
    expect(byDomain.matches.map((m) => m.how)).toEqual(["name", "domain"])
    expect(byDomain.cited.map((c) => c.host)).toEqual(["annuaire.example", "concurrent.example"])
    // A one-word name, or one made of the question's words, proves nothing.
    expect(geoFinding(sources.slice(0, 2), { name: "Plomberie Lyon", domain: null }, base).present).toBe(false)
    // A whole name: « Plomberie Rocher » is someone else.
    expect(geoFinding([src("https://x.example", "Plomberie Rocher, Lyon")], { name: "Plomberie Roche", domain: null }, base).present).toBe(false)
    const absent = geoFinding(sources.slice(1, 2), { name: "Plomberie Roche", domain: "plomberie-roche.example" }, base)
    expect(absent.present).toBe(false)
    expect(geoSummary(absent)).toBe("Absente des 1 sources que Perplexity donne pour « meilleur plombier à Lyon » et 2 autres questions ; y figurent notamment concurrent.example.")
  })
})

describe("meeting brief", () => {
  const offers = [{ slug: "geo", name: "GEO : visibilité dans les moteurs IA" }, { slug: "seo-local", name: "SEO local" }] as SkillOffer[]
  const sources: WebSource[] = [
    { tool: "perplexity_search", url: "https://presse.example/roche-ouvre", title: "Plomberie Roche ouvre un showroom", text: "…", date: "2026-10-02" },
    { tool: "exa_search", url: "https://annuaire.example/plombiers", title: "Plombiers à Villeurbanne", text: "…", date: null },
  ]

  it("asks who they are, what clients say, their market and their news", () => {
    expect(briefQueries({ name: "Plomberie Roche", city: "Villeurbanne", sector: "Plombier" })).toEqual({
      perplexity: ["Plomberie Roche Villeurbanne", "Plomberie Roche Villeurbanne avis clients", "plombier Villeurbanne"],
      news: "Plomberie Roche Villeurbanne",
    })
    expect(briefQueries({ name: "Plomberie Roche", city: null, sector: null }).perplexity).toEqual(["Plomberie Roche", "Plomberie Roche avis clients"])
  })

  it("keeps the facts that cite a page read or the fiche, and counts the others", () => {
    const out: BriefOutput = {
      who: [
        { text: "Plombier chauffagiste à Villeurbanne depuis 2009.", sources: ["CRM"], date: null },
        { text: "Ouvre un showroom.", sources: ["w1", "W1"], date: "octobre 2026" },
        { text: "Leader régional.", sources: ["W9"], date: null },
      ],
      news: [
        { text: "Showroom ouvert en octobre.", sources: ["W1"], date: "2026-10-02" },
        { text: "Rachat d'un concurrent.", sources: ["CRM"], date: null },
      ],
      market: [{ text: "Les annuaires dominent la recherche locale.", sources: ["W2"], date: null }],
      angles: [
        { title: "Être cité par les moteurs IA", offer: "geo", why: "Absente des sources de Perplexity.", sources: ["W2", "CRM"] },
        { title: "Angle sans offre", offer: null, why: "Montrer le showroom.", sources: [] },
        { title: "", offer: "seo-local", why: "vide", sources: [] },
      ],
      questions: ["  Comment vos clients vous trouvent-ils ?  ", ""],
    }
    expect(briefOutputSchema(offers.map((o) => o.slug)).safeParse(out).success).toBe(true)
    const settled = settleBrief(out, sources, offers)
    expect(settled.content.who).toEqual([
      { text: "Plombier chauffagiste à Villeurbanne depuis 2009.", sources: [], crm: true, date: null },
      { text: "Ouvre un showroom.", sources: ["https://presse.example/roche-ouvre"], crm: false, date: "octobre 2026" },
    ])
    // The news and the market need a page: the fiche alone does not make news.
    expect(settled.content.news.map((n) => n.text)).toEqual(["Showroom ouvert en octobre."])
    expect(settled.content.market).toHaveLength(1)
    expect(settled.dropped).toBe(2)
    expect(settled.content.angles).toEqual([
      { title: "Être cité par les moteurs IA", offer: "geo", offerName: "GEO : visibilité dans les moteurs IA", why: "Absente des sources de Perplexity.", sources: ["https://annuaire.example/plombiers"] },
      { title: "Angle sans offre", offer: null, offerName: null, why: "Montrer le showroom.", sources: [] },
    ])
    expect(settled.content.questions).toEqual(["Comment vos clients vous trouvent-ils ?"])
    expect(settled.cited.map((s) => s.url)).toEqual(["https://presse.example/roche-ouvre", "https://annuaire.example/plombiers"])
    // Without any active offer, an angle names none.
    expect(briefOutputSchema([]).safeParse({ ...out, angles: [{ title: "t", offer: null, why: "w", sources: [] }] }).success).toBe(true)
    expect(briefOutputSchema([]).safeParse(out).success).toBe(false)
  })
})

describe("the Enquêteur in the agency", () => {
  it("is an agent of its own, at its post in the 3D control room", () => {
    expect(AGENTS.researcher).toMatchObject({ label: "Enquêteur", modelRole: "writer", epic: "E30" })
    expect(AGENTS.researcher.skills).toEqual([{ name: "brief-rendez-vous", mode: "always" }])
    expect(CONTROL_ROOM).toContain("researcher")
    expect(postOf("researcher")).toEqual({ zone: "agents", kind: "station", index: CONTROL_ROOM.indexOf("researcher") })
  })

  it("adds three offer signals the V1 offers answer, and merges them into an audit", () => {
    for (const key of ["new_business", "takeover", "geo_absent"]) expect(isOfferSignal(key)).toBe(true)
    expect(OFFER_SIGNALS.geo_absent.group).toBe("geo")
    for (const o of OFFERS_V1) for (const s of o.signals) expect(isOfferSignal(s), `${o.slug}: ${s}`).toBe(true)
    expect(OFFERS_V1.find((o) => o.slug === "geo")?.signals).toContain("geo_absent")
    const report = { evidence: [{ id: "M1", kind: "measure" as const, label: "x", value: null, url: null }], signals: [] }
    const merged = withResearch(report, { evidence: [{ id: "R1", kind: "source", label: "BODACC", value: "Reprise", url: "https://bodacc.example" }], signals: [{ key: "takeover", evidence: ["R1"] }] })
    expect(merged.evidence.map((e) => e.id)).toEqual(["M1", "R1"])
    expect(merged.signals).toEqual([{ key: "takeover", evidence: ["R1"] }])
    expect(withResearch(report, { evidence: [], signals: [] })).toBe(report)
  })
})
