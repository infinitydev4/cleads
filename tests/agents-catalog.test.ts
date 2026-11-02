// E19 agents, skills and offers catalogue: everything that needs no database.
import { describe, expect, it } from "vitest"
import { AGENTS, AGENT_IDS, defineAgent, usesSkills, type AgentDef } from "@/features/ai/agents"
import { SKILLS_V1 } from "@/features/ai/skills/catalog-v1"
import { SKILL_LIMITS, SkillFormatError, cleanSkillPath, parseSkillMd, serializeSkillMd, skillNameError } from "@/features/ai/skills/skill-md"
import { createSkillSchema, skillFilesSchema } from "@/features/ai/skills/schemas"
import { composeInstructions, COMMON_RULES } from "@/features/ai/runtime"
import { mergeAgent, updateAgentSchema } from "@/features/ai/definitions"
import { taskKindOf } from "@/features/ai/handlers"
import { OFFERS_V1 } from "@/features/offers/catalog-v1"
import { createOfferSchema, updateOfferSchema } from "@/features/offers/schemas"
import { formatOfferPrice } from "@/features/offers/labels"
import { OFFERS_SKILL, renderOffersSkill, type SkillOffer } from "@/features/offers/skill"
import { isOfferSignal } from "@/features/offers/signals"
import { slugify } from "@/features/offers/service"

const SKILL_NAMES = new Set(SKILLS_V1.map((s) => s.name))

describe("agents in the code", () => {
  it("are all defined, each with an expert role and skills that exist in the V1 catalogue", () => {
    expect(Object.keys(AGENTS).sort()).toEqual([...AGENT_IDS].sort())
    for (const id of AGENT_IDS) {
      const a = AGENTS[id]
      expect(a.persona.length).toBeGreaterThan(40)
      expect(a.modelRoles[0]).toBe(a.modelRole)
      for (const s of a.skills) expect(SKILL_NAMES.has(s.name), `${id} → ${s.name}`).toBe(true)
    }
  })

  it("give skills only to agents that write, and read_skill to those with skills on demand", () => {
    expect(usesSkills(AGENTS.replies)).toBe(false)
    expect(usesSkills(AGENTS.qualifier)).toBe(false)
    expect(AGENTS.replies.skills).toEqual([])
    for (const id of AGENT_IDS) {
      const a = AGENTS[id]
      if (a.skills.some((s) => s.mode === "on_demand")) expect(a.tools, id).toContain("read_skill")
    }
    expect(AGENTS.writer.skills).toContainEqual({ name: "cold-email-fr", mode: "always" })
    expect(AGENTS.offers.skills).toContainEqual({ name: "offres-cleads", mode: "always" })
    expect(AGENTS.designer.skills).toContainEqual({ name: "charte-studio", mode: "always" })
  })

  it("refuses definitions that break the rules, at load", () => {
    const base = { ...AGENTS.writer, modelRoles: [...AGENTS.writer.modelRoles], tools: [...AGENTS.writer.tools], skills: [...AGENTS.writer.skills], limits: { ...AGENTS.writer.limits } } as AgentDef
    expect(() => defineAgent({ ...base, persona: "Court." })).toThrow(/persona/)
    expect(() => defineAgent({ ...base, modelRoles: ["fast", "writer"] })).toThrow(/rôles permis/)
    expect(() => defineAgent({ ...base, modelRoles: ["writer", "decision"] })).toThrow(/décision/)
    expect(() => defineAgent({ ...base, tools: ["Send Email"] })).toThrow(/snake_case/)
    expect(() => defineAgent({ ...base, skills: [{ name: "Cold Email", mode: "always" }] })).toThrow(/kebab-case/)
    expect(() => defineAgent({ ...AGENTS.replies, modelRoles: ["decision"], tools: [], skills: [{ name: "cold-email-fr", mode: "always" }], limits: { ...AGENTS.replies.limits } })).toThrow(/décision n'a pas de skills/)
    expect(() => defineAgent({ ...base, limits: { maxSteps: 3, maxCostEur: 9 } })).toThrow(/plafond/)
  })

  it("merge the workspace's layer without ever going above the code", () => {
    const def = AGENTS.auditor
    expect(mergeAgent(def, null)).toMatchObject({ modelRole: "writer", maxSteps: 12, capMicros: 300_000, enabled: true, instructions: null, version: 0 })
    const row = { instructions: "  Ton direct.  ", modelRole: "fast", maxSteps: 6, maxCostMicros: 100_000, enabled: false, version: 3 }
    expect(mergeAgent(def, row)).toMatchObject({ modelRole: "fast", maxSteps: 6, capMicros: 100_000, enabled: false, instructions: "Ton direct.", version: 3 })
    // A tampered row: a role the agent may not use, limits above the code's.
    expect(mergeAgent(def, { ...row, modelRole: "decision", maxSteps: 99, maxCostMicros: 9_000_000 })).toMatchObject({ modelRole: "writer", maxSteps: 12, capMicros: 300_000 })
  })

  it("validate the layer's input", () => {
    expect(updateAgentSchema.safeParse({}).success).toBe(false)
    expect(updateAgentSchema.safeParse({ skills: [{ skillId: "a", mode: "ALWAYS" }, { skillId: "a", mode: "ON_DEMAND" }] }).success).toBe(false)
    expect(updateAgentSchema.safeParse({ maxCostEur: -1 }).success).toBe(false)
    expect(updateAgentSchema.safeParse({ instructions: null, modelRole: "fast" }).success).toBe(true)
  })
})

describe("agent instructions", () => {
  const agent = { def: AGENTS.writer, instructions: "Signer « L'équipe Cleads ». Jamais de tutoiement." }
  const always = [{ name: "cold-email-fr", version: 3, description: "d", content: "# Cold email\nCourt.", files: [{ path: "exemples.md", content: "Exemple A" }] }]
  const onDemand = [{ name: "playbook-restaurants", description: "À utiliser pour un restaurant." }]

  it("always come in the same order: persona, common rules, team, skills, catalogue", () => {
    const text = composeInstructions(agent, always, onDemand)
    const order = [AGENTS.writer.persona.slice(0, 30), "## Règles communes", "## Consignes de l'équipe", "## Skill « cold-email-fr » (version 3)", "### Annexe « exemples.md »", "## Skills à la demande", "`playbook-restaurants`"]
    const positions = order.map((s) => text.indexOf(s))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const rule of COMMON_RULES) expect(text).toContain(rule)
    expect(composeInstructions(agent, always, onDemand)).toBe(text)
  })

  it("leave out what is empty, and say the team cannot lift the rules", () => {
    const bare = composeInstructions({ def: AGENTS.writer, instructions: null }, [], [])
    expect(bare).not.toContain("Consignes de l'équipe")
    expect(bare).not.toContain("read_skill")
    expect(composeInstructions(agent, [], [])).toContain("ne lèvent aucune des règles communes")
  })

  it("point to read_skill for annexes too big to inline", () => {
    const big = [{ ...always[0], files: [{ path: "grille.csv", content: "x".repeat(12_000) }] }]
    const text = composeInstructions(agent, big, [])
    expect(text).toContain("Annexe « grille.csv » : lis-la avec read_skill")
    expect(text).not.toContain("x".repeat(100))
  })
})

describe("SKILL.md", () => {
  const doc = `---\nname: audit-seo-local\ndescription: "À utiliser pour la visibilité locale : fiche Google, avis."\n---\n\n# Audit\n1. Fiche Google\n`

  it("reads a standard file, BOM and Windows line breaks included", () => {
    expect(parseSkillMd(doc)).toEqual({ name: "audit-seo-local", description: "À utiliser pour la visibilité locale : fiche Google, avis.", content: "# Audit\n1. Fiche Google" })
    expect(parseSkillMd(`﻿${doc.replace(/\n/g, "\r\n")}`).name).toBe("audit-seo-local")
  })

  it("explains what is wrong", () => {
    expect(() => parseSkillMd("# Pas d'en-tête")).toThrow(SkillFormatError)
    expect(() => parseSkillMd(doc.replace("audit-seo-local", "Audit SEO"))).toThrow(/minuscules/)
    expect(() => parseSkillMd("---\nname: a\n---\nContenu")).toThrow(/description/)
    expect(() => parseSkillMd("---\nname: a\ndescription: d\n---\n")).toThrow(/contenu/)
    expect(() => parseSkillMd("---\nname: [a\ndescription: d\n---\nx")).toThrow(/YAML/)
    expect(() => parseSkillMd(`---\nname: a\ndescription: ${"d".repeat(1025)}\n---\nx`)).toThrow(/1024/)
    expect(() => parseSkillMd("x".repeat(SKILL_LIMITS.documentMax + 1))).toThrow(/trop long/)
  })

  it("refuses YAML aliases (no expansion of a tiny file into a huge one)", () => {
    expect(() => parseSkillMd("---\nname: a\nx: &v [1, 2]\ndescription: *v\n---\nx")).toThrow(SkillFormatError)
  })

  it("follows the standard's naming rules", () => {
    for (const ok of ["a", "audit-seo-local", "playbook-2"]) expect(skillNameError(ok)).toBeNull()
    for (const bad of ["", "-a", "a-", "a--b", "A", "a_b", "é", "x".repeat(65)]) expect(skillNameError(bad), bad).not.toBeNull()
  })

  it("writes what it reads", () => {
    for (const s of SKILLS_V1) {
      const parsed = parseSkillMd(serializeSkillMd(s))
      expect(parsed).toEqual({ name: s.name, description: s.description, content: s.content.trim() })
    }
  })

  it("keeps annexes inside the skill, as text", () => {
    expect(cleanSkillPath("./references/grille.md")).toEqual({ path: "references/grille.md" })
    expect(cleanSkillPath("exemples\\a.txt")).toEqual({ path: "exemples/a.txt" })
    for (const bad of ["../secret.md", "/etc/passwd.txt", "scripts/run.py", "SKILL.md", ".env", "a//b.md", "image.png"]) expect("error" in cleanSkillPath(bad), bad).toBe(true)
    expect(skillFilesSchema.safeParse([{ path: "a.md", content: "x" }, { path: "./a.md", content: "y" }]).success).toBe(false)
    expect(skillFilesSchema.safeParse([{ path: "../a.md", content: "x" }]).success).toBe(false)
    expect(createSkillSchema.safeParse({ name: "Mon Skill", description: "d", content: "c" }).success).toBe(false)
  })
})

describe("V1 catalogue", () => {
  it("has valid, unique skills, one of them written from the offers", () => {
    expect(SKILL_NAMES.size).toBe(SKILLS_V1.length)
    for (const s of SKILLS_V1) {
      expect(skillNameError(s.name), s.name).toBeNull()
      expect(s.description.length).toBeLessThanOrEqual(SKILL_LIMITS.descriptionMax)
      expect(s.description.startsWith("À utiliser"), s.name).toBe(true)
      expect(s.content.length).toBeGreaterThan(20)
    }
    expect(SKILLS_V1.filter((s) => s.generator)).toEqual([expect.objectContaining({ name: OFFERS_SKILL.name, generator: "offers" })])
  })

  it("has offers that the form itself accepts, with known signals and ordered prices", () => {
    const slugs = new Set<string>()
    for (const o of OFFERS_V1) {
      expect(slugs.has(o.slug), o.slug).toBe(false)
      slugs.add(o.slug)
      expect(o.signals.every(isOfferSignal), o.slug).toBe(true)
      // The identifier is the seed's own; through the form it comes from the name.
      const { slug: _slug, ...form } = o
      const parsed = createOfferSchema.safeParse({ ...form, status: "DRAFT" })
      expect(parsed.success, `${o.slug}: ${parsed.error?.issues[0]?.message}`).toBe(true)
      if (o.billing === "QUOTE") expect([o.priceMinEur, o.priceMaxEur]).toEqual([null, null])
    }
    expect(OFFERS_V1.map((o) => o.slug)).toEqual(expect.arrayContaining(["site-vitrine", "seo-local", "geo", "google-ads", "cleads-essential", "cleads-growth", "cleads-enterprise"]))
  })

  it("rejects incoherent offers", () => {
    const { slug: _slug, ...o } = OFFERS_V1[0]
    expect(createOfferSchema.safeParse({ ...o, slug: "x" }).success).toBe(false)
    expect(createOfferSchema.safeParse({ ...o, priceMinEur: 5000, priceMaxEur: 1000 }).error?.issues[0]?.message).toMatch(/maximum/)
    expect(createOfferSchema.safeParse({ ...o, priceMinEur: null, priceMaxEur: null }).error?.issues[0]?.message).toMatch(/Sur devis/)
    expect(createOfferSchema.safeParse({ ...o, signals: ["pas_un_signal"] }).success).toBe(false)
    expect(updateOfferSchema.safeParse({}).success).toBe(false)
  })
})

describe("offers for agents", () => {
  const offer: SkillOffer = { ...OFFERS_V1[3], priceNote: null }

  it("prices read like a quote", () => {
    expect(formatOfferPrice({ priceMinEur: 1500, priceMaxEur: 4000, billing: "ONE_OFF" })).toMatch(/^1\s500\s€ à 4\s000\s€ HT$/)
    expect(formatOfferPrice({ priceMinEur: 300, priceMaxEur: 800, billing: "MONTHLY" })).toMatch(/HT par mois$/)
    expect(formatOfferPrice({ priceMinEur: 500, priceMaxEur: null, billing: "ONE_OFF" })).toMatch(/^À partir de 500/)
    expect(formatOfferPrice({ priceMinEur: null, priceMaxEur: 900, billing: "ONE_OFF" })).toMatch(/^Jusqu’à 900/)
    expect(formatOfferPrice({ priceMinEur: 100, priceMaxEur: 200, billing: "QUOTE" })).toBe("Sur devis")
  })

  it("the skill offres-cleads lists what it is given, by category, and says when there is nothing", () => {
    const text = renderOffersSkill([offer])
    expect(text).toContain("### SEO local (`seo-local`)")
    expect(text).toContain("Quand la proposer : Fiche Google incomplète")
    expect(text).toContain("Objection « Les avis, ça ne se contrôle pas. »")
    expect(renderOffersSkill([])).toContain("Aucune offre n'est active")
  })

  it("names become stable identifiers", () => {
    expect(slugify("Refonte de site")).toBe("refonte-de-site")
    expect(slugify("GEO : visibilité dans les moteurs IA")).toBe("geo-visibilite-dans-les-moteurs-ia")
    expect(slugify("€€€")).toBe("offre")
  })
})

describe("tasks", () => {
  it("are read from the run's input", () => {
    expect(taskKindOf({ kind: "skill_test", skillId: "x" })).toBe("skill_test")
    expect(taskKindOf({ name: "Martin" })).toBeNull()
    expect(taskKindOf(["skill_test"])).toBeNull()
    expect(taskKindOf(null)).toBeNull()
  })
})
