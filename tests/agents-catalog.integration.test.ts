// E19 agents, skills and offers. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/agents-catalog.integration.test.ts
// Models are mocks: no call ever leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("Agents, skills and offers (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let skills: typeof import("@/features/ai/skills/service")
  let offers: typeof import("@/features/offers/service")
  let offerTools: typeof import("@/features/offers/tools")
  let definitions: typeof import("@/features/ai/definitions")
  let runtime: typeof import("@/features/ai/runtime")
  let runs: typeof import("@/features/ai/runs")
  let tools: typeof import("@/features/ai/tools")
  let handlers: typeof import("@/features/ai/handlers")
  let queue: typeof import("@/features/ai/queue")
  let skillTest: typeof import("@/features/ai/skill-test")
  let runner: typeof import("@/worker/runner")
  let SKILLS_V1: typeof import("@/features/ai/skills/catalog-v1").SKILLS_V1
  let OFFERS_V1: typeof import("@/features/offers/catalog-v1").OFFERS_V1
  let AGENTS: typeof import("@/features/ai/agents").AGENTS
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    catalog = await import("@/features/ai/catalog")
    skills = await import("@/features/ai/skills/service")
    offers = await import("@/features/offers/service")
    offerTools = await import("@/features/offers/tools")
    definitions = await import("@/features/ai/definitions")
    runtime = await import("@/features/ai/runtime")
    runs = await import("@/features/ai/runs")
    tools = await import("@/features/ai/tools")
    handlers = await import("@/features/ai/handlers")
    queue = await import("@/features/ai/queue")
    skillTest = await import("@/features/ai/skill-test")
    runner = await import("@/worker/runner")
    SKILLS_V1 = (await import("@/features/ai/skills/catalog-v1")).SKILLS_V1
    OFFERS_V1 = (await import("@/features/offers/catalog-v1")).OFFERS_V1
    AGENTS = (await import("@/features/ai/agents")).AGENTS
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    handlers.clearAgentHandlers()
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@catalog.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    const c = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Martin", city: "Lyon", sector: "Plombier", website: "https://plomberie-martin.test", rating: 3.8, reviewCount: 12, phone: "+33 4 00 00 00 00" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId: u.sdr.id } })).id
  })

  const install = () => catalog.ensureAgentCatalog(ws)
  const skillId = async (name: string) => (await prisma.skill.findUniqueOrThrow({ where: { workspaceId_name: { workspaceId: ws, name } } })).id
  const offerId = async (slug: string) => (await prisma.offer.findUniqueOrThrow({ where: { workspaceId_slug: { workspaceId: ws, slug } } })).id
  const ctxOf = (run: { id: string }, agentId: import("@/features/ai/agents").AgentId) => ({ run: { id: run.id, workspaceId: ws, agentId, requester: u.owner, userKey: u.owner.id, leadId: null } })
  const textModel = (text: string, seen?: { system?: string; prompt?: string }) =>
    new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (seen) {
          const messages = options.prompt as { role: string; content: string | { type: string; text?: string }[] }[]
          const flat = (m: (typeof messages)[number]) => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join(""))
          seen.system = messages.filter((m) => m.role === "system").map(flat).join("\n")
          seen.prompt = messages.filter((m) => m.role === "user").map(flat).join("\n")
        }
        return {
          content: [{ type: "text", text }],
          finishReason: { unified: "stop", raw: undefined },
          usage: { inputTokens: { total: 2000, noCache: 2000, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 400, text: 400, reasoning: undefined } },
          warnings: [],
        }
      },
    })

  describe("V1 catalogue", () => {
    it("installs once, whoever asks at the same time, with skills given to their agents and offers to check", async () => {
      const results = await Promise.all(Array.from({ length: 5 }, install))
      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await prisma.skill.count({ where: { workspaceId: ws } })).toBe(SKILLS_V1.length)
      expect(await prisma.skillVersion.count()).toBe(SKILLS_V1.length)
      expect(await prisma.offer.count({ where: { workspaceId: ws, status: "DRAFT" } })).toBe(OFFERS_V1.length)
      const expectedLinks = Object.values(AGENTS).reduce((n, a) => n + a.skills.length, 0)
      expect(await prisma.agentSkill.count({ where: { workspaceId: ws } })).toBe(expectedLinks)
      expect(await prisma.agentSkill.findFirst({ where: { agentId: "writer", skill: { name: "cold-email-fr" } } })).toMatchObject({ mode: "ALWAYS" })
      expect(await prisma.auditLog.count({ where: { action: "ai.catalog_installed" } })).toBe(1)
      expect(await install()).toBe(false)
    })

    it("never brings back what the team archived or removed", async () => {
      await install()
      await skills.updateSkill(u.owner, await skillId("playbook-sante"), { archived: true })
      await prisma.offer.delete({ where: { id: await offerId("meta-ads") } })
      expect(await install()).toBe(false)
      expect(await prisma.skill.count({ where: { workspaceId: ws, archivedAt: null } })).toBe(SKILLS_V1.length - 1)
      expect(await prisma.offer.count({ where: { workspaceId: ws } })).toBe(OFFERS_V1.length - 1)
    })
  })

  describe("skills", () => {
    beforeEach(install)

    it("are written by owners and managers only", async () => {
      const input = { name: "playbook-paysagistes", description: "À utiliser pour un paysagiste.", content: "# Paysagistes\nSaisonnalité forte.", files: [], note: null }
      await expect(skills.createSkill(u.sdr, input)).rejects.toMatchObject({ status: 403 })
      await expect(skills.listSkills(u.viewer)).rejects.toMatchObject({ status: 403 })
      const created = await skills.createSkill(u.manager, input)
      expect(created).toMatchObject({ name: "playbook-paysagistes", version: 1, agents: [] })
      await expect(skills.createSkill(u.owner, input)).rejects.toMatchObject({ status: 409 })
      expect((await skills.listSkills(u.closer)).map((s) => s.name)).toContain("playbook-paysagistes")
    })

    it("keep every version readable, and can go back to one", async () => {
      const id = await skillId("cold-email-fr")
      const v1 = await skills.getSkill(u.owner, id)
      const v2 = await skills.updateSkill(u.manager, id, { content: "# Cold email\nNouvelle règle.", note: "Plus court" })
      expect(v2.version).toBe(2)
      expect((await skills.getSkillVersion(u.sdr, id, 1)).content).toBe(v1.content)
      expect((await skills.updateSkill(u.manager, id, { content: "# Cold email\nNouvelle règle." })).version).toBe(2)
      const v3 = await skills.updateSkill(u.owner, id, { restoreVersion: 1 })
      expect(v3).toMatchObject({ version: 3, content: v1.content })
      expect(v3.versions.map((v) => [v.version, v.note])).toEqual([
        [3, "Retour à la version 1"],
        [2, "Plus court"],
        [1, "Catalogue V1"],
      ])
      expect(await prisma.auditLog.count({ where: { action: "skill.updated", entityId: id } })).toBe(2)
    })

    it("written from the offers only take a new description", async () => {
      const id = await skillId("offres-cleads")
      await expect(skills.updateSkill(u.owner, id, { content: "Texte libre" })).rejects.toMatchObject({ status: 409 })
      expect((await skills.updateSkill(u.owner, id, { description: "À utiliser pour citer une offre de Cleads." })).version).toBe(2)
    })

    it("import a SKILL.md as a new skill or a new version, skipping annexes that are not text", async () => {
      const md = `---\nname: script-relance\ndescription: À utiliser pour relancer un prospect sans réponse.\n---\n\n# Relance\nUne seule relance.`
      const first = await skills.importSkill(u.manager, { markdown: md, files: [{ path: "exemples/relance.md", content: "Bonjour…" }, { path: "outil.py", content: "print(1)" }, { path: "../evasion.md", content: "x" }] })
      expect(first.created).toBe(true)
      expect(first.skill.files.map((f) => f.path)).toEqual(["exemples/relance.md"])
      expect(first.skipped).toHaveLength(2)
      const again = await skills.importSkill(u.manager, { markdown: md.replace("Une seule relance.", "Deux relances au plus."), files: [] })
      expect(again).toMatchObject({ created: false, skill: { version: 2, files: [] } })
      await expect(skills.importSkill(u.manager, { markdown: "pas de front matter", files: [] })).rejects.toMatchObject({ status: 400 })
      await expect(skills.importSkill(u.manager, { markdown: md.replace("script-relance", "offres-cleads"), files: [] })).rejects.toMatchObject({ status: 409 })
    })

    it("are read by an agent only when given to it, and never once archived", async () => {
      const run = await runs.startRun(u.owner, { agentId: "auditor", status: "RUNNING" })
      const ctx = ctxOf(run, "auditor")
      const read = await tools.runTool(runtime.readSkillTool, ctx, { name: "audit-seo-local" })
      expect(read).toMatchObject({ status: "done", output: { name: "audit-seo-local", version: 1 } })
      await expect(tools.runTool(runtime.readSkillTool, ctx, { name: "cold-email-fr" })).rejects.toMatchObject({ status: 404 })
      await skills.updateSkill(u.owner, await skillId("audit-seo-local"), { archived: true })
      await expect(tools.runTool(runtime.readSkillTool, ctx, { name: "audit-seo-local" })).rejects.toMatchObject({ status: 404 })
      expect(await prisma.agentStep.count({ where: { runId: run.id, type: "TOOL", name: "read_skill" } })).toBe(3)
    })

    it("hand their annexes to agents on request", async () => {
      const id = await skillId("audit-geo-site")
      await skills.updateSkill(u.owner, id, { files: [{ path: "grilles/geo.csv", content: "critère;poids\nFAQ;2" }] })
      const run = await runs.startRun(u.owner, { agentId: "auditor", status: "RUNNING" })
      expect(await tools.runTool(runtime.readSkillTool, ctxOf(run, "auditor"), { name: "audit-geo-site", file: "grilles/geo.csv" })).toMatchObject({ output: { content: "critère;poids\nFAQ;2", files: ["grilles/geo.csv"] } })
      await expect(tools.runTool(runtime.readSkillTool, ctxOf(run, "auditor"), { name: "audit-geo-site", file: "absent.md" })).rejects.toMatchObject({ status: 404 })
    })
  })

  describe("offers", () => {
    beforeEach(install)

    it("are read by everyone who uses AI and edited by owners and managers", async () => {
      expect(await offers.listOffers(u.closer)).toHaveLength(OFFERS_V1.length)
      await expect(offers.listOffers(u.viewer)).rejects.toMatchObject({ status: 403 })
      const input = { name: "Audit GEO express", category: "GEO" as const, summary: "Un audit GEO en une page.", deliverables: [], signals: [], priceMinEur: 300, priceMaxEur: 300, billing: "ONE_OFF" as const, priceNote: null, angle: null, objections: [] }
      await expect(offers.createOffer(u.sdr, input)).rejects.toMatchObject({ status: 403 })
      const created = await offers.createOffer(u.manager, input)
      expect(created).toMatchObject({ slug: "audit-geo-express", status: "DRAFT", reviewedAt: null })
      await expect(offers.createOffer(u.manager, { ...input, name: "Audit GEO express !" })).rejects.toMatchObject({ status: 409 })
    })

    it("reach agents only once active: list_offers, the skill offres-cleads and every recommendation", async () => {
      const run = await runs.startRun(u.owner, { agentId: "offers", status: "RUNNING" })
      const ctx = ctxOf(run, "offers")
      expect(await tools.runTool(offerTools.listOffersTool, ctx, {})).toMatchObject({ output: [] })
      await expect(offers.assertActiveOffers(ws, ["seo-local"])).rejects.toMatchObject({ status: 409 })

      const active = await offers.updateOffer(u.owner, await offerId("seo-local"), { status: "ACTIVE" })
      expect(active).toMatchObject({ status: "ACTIVE", reviewedBy: "owner" })
      const listed = await tools.runTool(offerTools.listOffersTool, ctx, {})
      expect(listed.status === "done" && listed.output.map((o) => o.slug)).toEqual(["seo-local"])
      expect((await offers.assertActiveOffers(ws, ["seo-local"])).get("seo-local")?.name).toBe("SEO local")
      await expect(offers.assertActiveOffers(ws, ["seo-local", "site-vitrine", "inconnue"])).rejects.toThrow(/site-vitrine, inconnue/)

      const skill = await tools.runTool(runtime.readSkillTool, ctx, { name: "offres-cleads" })
      expect(skill.status === "done" && skill.output.content).toContain("### SEO local (`seo-local`)")
      expect(skill.status === "done" && skill.output.content).not.toContain("Site vitrine")

      await offers.updateOffer(u.manager, active.id, { status: "ARCHIVED" })
      await expect(offers.assertActiveOffers(ws, ["seo-local"])).rejects.toMatchObject({ status: 409 })
      expect(await offers.listOffers(u.owner, { archived: true })).toHaveLength(1)
    })

    it("keep prices coherent once merged, and none on quote", async () => {
      const id = await offerId("site-vitrine")
      await expect(offers.updateOffer(u.owner, id, { priceMinEur: 9000 })).rejects.toMatchObject({ status: 400 })
      await expect(offers.updateOffer(u.owner, id, { priceMinEur: null, priceMaxEur: null })).rejects.toMatchObject({ status: 400 })
      expect(await offers.updateOffer(u.owner, id, { billing: "QUOTE" })).toMatchObject({ billing: "QUOTE", priceMinEur: null, priceMaxEur: null })
      const kept = await offers.updateOffer(u.owner, await offerId("google-ads"), { summary: "Des campagnes Google sur les recherches urgentes, suivies jusqu'à la demande." })
      expect(kept.priceNote).toBe("Hors budget publicitaire")
    })

    it("count as checked again when an active one is edited", async () => {
      const id = await offerId("geo")
      await offers.updateOffer(u.owner, id, { status: "ACTIVE" })
      const edited = await offers.updateOffer(u.manager, id, { priceMaxEur: 1200 })
      expect(edited).toMatchObject({ status: "ACTIVE", reviewedBy: "manager", priceMaxEur: 1200 })
      expect(await prisma.auditLog.findFirst({ where: { action: "offer.updated", entityId: id }, select: { metadata: true } })).toMatchObject({ metadata: { changes: ["priceMaxEur"] } })
    })
  })

  describe("agents' layer", () => {
    beforeEach(install)

    it("takes the team's instructions and skills from managers, the model and limits from the owner only", async () => {
      const sante = await skillId("playbook-sante")
      const after = await definitions.updateAgentDefinition(u.manager, "writer", { instructions: "Signer « L'équipe Cleads ».", skills: [{ skillId: await skillId("cold-email-fr"), mode: "ALWAYS" }, { skillId: sante, mode: "ON_DEMAND" }] })
      expect(after).toMatchObject({ version: 1, instructions: "Signer « L'équipe Cleads ».", history: [{ version: 1, changes: ["instructions", "skills"], createdBy: "manager" }] })
      expect(after.skills.map((s) => [s.name, s.mode])).toEqual([
        ["cold-email-fr", "ALWAYS"],
        ["playbook-sante", "ON_DEMAND"],
      ])
      await expect(definitions.updateAgentDefinition(u.manager, "writer", { modelRole: "fast" })).rejects.toMatchObject({ status: 403 })
      await expect(definitions.updateAgentDefinition(u.sdr, "writer", { instructions: "x" })).rejects.toMatchObject({ status: 403 })
      const same = await definitions.updateAgentDefinition(u.manager, "writer", { instructions: "Signer « L'équipe Cleads »." })
      expect(same.version).toBe(1)
      const snapshot = await prisma.agentDefinitionVersion.findFirstOrThrow({ where: { version: 1, definition: { agentId: "writer" } } })
      expect(snapshot.snapshot).toMatchObject({ instructions: "Signer « L'équipe Cleads ».", skills: [{ name: "cold-email-fr", mode: "ALWAYS" }, { name: "playbook-sante", mode: "ON_DEMAND" }] })
      expect(await prisma.auditLog.count({ where: { action: "ai.agent_updated", entityId: "writer" } })).toBe(1)
    })

    it("refuses values beyond the agent's bounds instead of clipping them", async () => {
      await expect(definitions.updateAgentDefinition(u.owner, "auditor", { maxCostEur: 0.5 })).rejects.toMatchObject({ status: 400 })
      await expect(definitions.updateAgentDefinition(u.owner, "auditor", { maxSteps: 40 })).rejects.toMatchObject({ status: 400 })
      await expect(definitions.updateAgentDefinition(u.owner, "replies", { modelRole: "writer" })).rejects.toMatchObject({ status: 400 })
      await expect(definitions.updateAgentDefinition(u.owner, "replies", { skills: [{ skillId: await skillId("cold-email-fr"), mode: "ALWAYS" }] })).rejects.toMatchObject({ status: 400 })
      await skills.updateSkill(u.owner, await skillId("presence-sociale"), { archived: true })
      await expect(definitions.updateAgentDefinition(u.owner, "auditor", { skills: [{ skillId: await skillId("presence-sociale"), mode: "ON_DEMAND" }] })).rejects.toMatchObject({ status: 400 })
    })

    it("gives every new run the cheaper role and the lower cap, and stops a disabled agent", async () => {
      await definitions.updateAgentDefinition(u.owner, "auditor", { modelRole: "fast", maxCostEur: 0.1 })
      const run = await runs.startRun(u.sdr, { agentId: "auditor", leadId })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ capMicros: 100_000, reservedMicros: 100_000 })
      expect((await definitions.effectiveAgent(ws, "auditor")).modelRole).toBe("fast")
      await definitions.updateAgentDefinition(u.owner, "designer", { enabled: false })
      await expect(runs.startRun(u.owner, { agentId: "designer" })).rejects.toMatchObject({ status: 409 })
      // Back to the code's values: nothing stored.
      await definitions.updateAgentDefinition(u.owner, "auditor", { modelRole: "writer", maxCostEur: 0.3 })
      expect(await prisma.agentDefinition.findFirstOrThrow({ where: { agentId: "auditor" } })).toMatchObject({ modelRole: null, maxCostMicros: null, version: 2 })
    })

    it("builds an agent's instructions from the code, the team and its skills, live", async () => {
      await definitions.updateAgentDefinition(u.manager, "writer", { instructions: "Toujours vouvoyer." })
      await skills.updateSkill(u.manager, await skillId("cold-email-fr"), { content: "# Cold email\nRègle numéro 7." })
      const rt = await runtime.agentRuntime({ workspaceId: ws, agentId: "writer" })
      expect(rt.system).toContain(AGENTS.writer.persona.slice(0, 40))
      expect(rt.system).toContain("Toujours vouvoyer.")
      expect(rt.system).toContain("## Skill « cold-email-fr » (version 2)\n# Cold email\nRègle numéro 7.")
      expect(rt.system).toContain("`playbook-restaurants`")
      expect(rt.skills).toEqual([{ name: "cold-email-fr", version: 2 }])
      expect(rt.tools.map((t) => t.name)).toEqual(["read_skill"])
      const decider = await runtime.agentRuntime({ workspaceId: ws, agentId: "replies" })
      expect(decider.tools).toEqual([])
    })
  })

  describe("testing a skill on a fiche", () => {
    beforeEach(install)

    it("is for owners and managers, with an agent that writes and a skill in service", async () => {
      const id = await skillId("audit-seo-local")
      await expect(skillTest.startSkillTest(u.sdr, id, { leadId, agentId: "auditor", instruction: null })).rejects.toMatchObject({ status: 403 })
      await expect(skillTest.startSkillTest(u.owner, id, { leadId, agentId: "qualifier", instruction: null })).rejects.toMatchObject({ status: 400 })
      await skills.updateSkill(u.owner, id, { archived: true })
      await expect(skillTest.startSkillTest(u.owner, id, { leadId, agentId: "auditor", instruction: null })).rejects.toMatchObject({ status: 409 })
    })

    it("is queued, taken by a worker that has no business behaviour yet, and answers with the skill alone", async () => {
      const id = await skillId("audit-seo-local")
      await skills.updateSkill(u.owner, id, { content: "# Audit SEO local\nRelève la note Google et le nombre d'avis." })
      const { runId } = await skillTest.startSkillTest(u.manager, id, { leadId, agentId: "auditor", instruction: "Sois bref." })
      expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "QUEUED", agentId: "auditor", priority: 1, input: { kind: "skill_test", skillId: id, version: 2 } })
      // Without the task, a worker that has no auditor behaviour leaves it in the queue.
      expect(await queue.claimNextRun("w0", [])).toBeNull()

      const seen: { system?: string; prompt?: string } = {}
      handlers.registerTaskHandler(skillTest.SKILL_TEST, (job) => skillTest.runSkillTest(job, { languageModel: () => textModel("## Constats\n- Note 3,8 sur 12 avis.", seen), prices: PRICES }))
      const w = new runner.AgentWorker({ id: "w1", version: "test", concurrency: 2, perAgent: {}, pollIdleMs: 50, pollBusyMs: 10, maintenanceMs: 60_000, beatMs: 60_000, heartbeatMs: 40 }, { publish: async () => undefined })
      expect(await w.tick()).toBe(1)
      await w.idle()

      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
      expect(run).toMatchObject({ status: "SUCCEEDED", reservedMicros: 0, output: { kind: "skill_test", skill: { name: "audit-seo-local", version: 2 }, agentId: "auditor", text: "## Constats\n- Note 3,8 sur 12 avis." } })
      expect(run.costMicros).toBeGreaterThan(0)
      expect(seen.system).toContain("## Skill « audit-seo-local » (version 2)")
      expect(seen.system).not.toContain("Skills à la demande")
      expect(seen.prompt).toContain("Sois bref.")
      expect(seen.prompt).toContain('<contenu_externe source="fiche du CRM">')
      expect(seen.prompt).toContain("Plomberie Martin")
      // Nothing personal leaves with the fiche: the phone number is only said to be known.
      expect(seen.prompt).not.toContain("+33 4")
      expect(seen.prompt).toContain('"telephoneConnu": true')
      expect(await prisma.agentStep.findFirstOrThrow({ where: { runId, type: "MODEL" } })).toMatchObject({ name: "skill_test:audit-seo-local" })

      const detail = await runs.getRunDetail(u.manager, runId)
      expect(detail).toMatchObject({ status: "SUCCEEDED", output: { kind: "skill_test" }, steps: [{ type: "MODEL", name: "skill_test:audit-seo-local" }] })
      await expect(runs.getRunDetail(u.sdr, runId)).rejects.toMatchObject({ status: 404 })
      expect((await runs.getRunDetail(u.owner, runId)).id).toBe(runId)
    })
  })
})
