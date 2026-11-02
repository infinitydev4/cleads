import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { ensureAiSetting } from "@/lib/ai/budget"
import { OFFERS_V1 } from "@/features/offers/catalog-v1"
import { AGENTS, AGENT_IDS } from "./agents"
import { SKILLS_V1 } from "./skills/catalog-v1"

/**
 * Installs the V1 catalogue once per workspace (docs/crm-v1/AGENTS-IA.md §8 and §14): the written skills, given to
 * the agents listed in features/ai/agents.ts, and the offers as drafts for the owner to check. Safe when called
 * concurrently: the first caller claims the install, the others return. What the team deletes or archives later is
 * never brought back.
 */
export async function ensureAgentCatalog(workspaceId: string): Promise<boolean> {
  const setting = await prisma.aiSetting.findUnique({ where: { workspaceId }, select: { catalogSeededAt: true } })
  if (setting?.catalogSeededAt) return false
  const installed = await prisma.$transaction(async (tx) => {
    await ensureAiSetting(tx, workspaceId)
    const claimed = await tx.aiSetting.updateMany({ where: { workspaceId, catalogSeededAt: null }, data: { catalogSeededAt: new Date() } })
    if (claimed.count !== 1) return null
    const skills = await tx.skill.createManyAndReturn({
      data: SKILLS_V1.map((s) => ({ workspaceId, name: s.name, description: s.description, generator: s.generator ?? null })),
      skipDuplicates: true,
      select: { id: true, name: true },
    })
    const seeds = new Map(SKILLS_V1.map((s) => [s.name, s]))
    await tx.skillVersion.createMany({
      data: skills.map((s) => ({ skillId: s.id, version: 1, description: seeds.get(s.name)!.description, content: seeds.get(s.name)!.content, note: "Catalogue V1" })),
    })
    const ids = new Map(skills.map((s) => [s.name, s.id]))
    await tx.agentSkill.createMany({
      data: AGENT_IDS.flatMap((agentId) =>
        AGENTS[agentId].skills.flatMap((s) => (ids.has(s.name) ? [{ workspaceId, agentId, skillId: ids.get(s.name)!, mode: s.mode === "always" ? ("ALWAYS" as const) : ("ON_DEMAND" as const) }] : []))
      ),
      skipDuplicates: true,
    })
    const offers = await tx.offer.createMany({
      data: OFFERS_V1.map((o, i) => ({ workspaceId, ...o, priceNote: o.priceNote ?? null, status: "DRAFT" as const, sortOrder: (i + 1) * 10 })),
      skipDuplicates: true,
    })
    return { skills: skills.length, offers: offers.count }
  })
  if (!installed) return false
  await audit({ action: "ai.catalog_installed", workspaceId, entityType: "AiSetting", metadata: installed })
  return true
}
