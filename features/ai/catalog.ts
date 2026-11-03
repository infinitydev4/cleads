import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { ensureAiSetting } from "@/lib/ai/budget"
import { OFFERS_V1 } from "@/features/offers/catalog-v1"
import { AGENTS, AGENT_IDS } from "./agents"
import { SKILLS_V1 } from "./skills/catalog-v1"

/**
 * What the catalogue gained since V1 (E28), by version: installed once in the workspaces that already had the catalogue,
 * like V1 itself. A skill of the same name the team already has is left as it is.
 */
export const CATALOG_VERSION = 2
const ADDITIONS: Record<number, { skills: readonly string[] }> = { 2: { skills: ["missions-cleads"] } }

/** Creates skills of the catalogue with their first version, and gives them to the agents that list them. */
async function installSkills(tx: Prisma.TransactionClient, workspaceId: string, names: readonly string[] | null): Promise<number> {
  const seeds = SKILLS_V1.filter((s) => !names || names.includes(s.name))
  const skills = await tx.skill.createManyAndReturn({
    data: seeds.map((s) => ({ workspaceId, name: s.name, description: s.description, generator: s.generator ?? null })),
    skipDuplicates: true,
    select: { id: true, name: true },
  })
  const byName = new Map(seeds.map((s) => [s.name, s]))
  await tx.skillVersion.createMany({
    data: skills.map((s) => ({ skillId: s.id, version: 1, description: byName.get(s.name)!.description, content: byName.get(s.name)!.content, note: "Catalogue V1" })),
  })
  const ids = new Map(skills.map((s) => [s.name, s.id]))
  await tx.agentSkill.createMany({
    data: AGENT_IDS.flatMap((agentId) =>
      AGENTS[agentId].skills.flatMap((s) => (ids.has(s.name) ? [{ workspaceId, agentId, skillId: ids.get(s.name)!, mode: s.mode === "always" ? ("ALWAYS" as const) : ("ON_DEMAND" as const) }] : []))
    ),
    skipDuplicates: true,
  })
  return skills.length
}

/** The additions a workspace installed with an older catalogue is missing; once, even when called concurrently. */
async function installAdditions(workspaceId: string, from: number): Promise<void> {
  const installed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.aiSetting.updateMany({ where: { workspaceId, catalogVersion: from }, data: { catalogVersion: CATALOG_VERSION } })
    if (claimed.count !== 1) return null
    const names = Object.entries(ADDITIONS)
      .filter(([version]) => Number(version) > from)
      .flatMap(([, a]) => a.skills)
    return { from, to: CATALOG_VERSION, skills: await installSkills(tx, workspaceId, names) }
  })
  if (installed) await audit({ action: "ai.catalog_updated", workspaceId, entityType: "AiSetting", metadata: installed })
}

/**
 * Installs the V1 catalogue once per workspace (docs/crm-v1/AGENTS-IA.md §8 and §14): the written skills, given to
 * the agents listed in features/ai/agents.ts, and the offers as drafts for the owner to check. Safe when called
 * concurrently: the first caller claims the install, the others return. What the team deletes or archives later is
 * never brought back.
 */
export async function ensureAgentCatalog(workspaceId: string): Promise<boolean> {
  const setting = await prisma.aiSetting.findUnique({ where: { workspaceId }, select: { catalogSeededAt: true, catalogVersion: true } })
  if (setting?.catalogSeededAt) {
    if (setting.catalogVersion < CATALOG_VERSION) await installAdditions(workspaceId, setting.catalogVersion)
    return false
  }
  const installed = await prisma.$transaction(async (tx) => {
    await ensureAiSetting(tx, workspaceId)
    const claimed = await tx.aiSetting.updateMany({ where: { workspaceId, catalogSeededAt: null }, data: { catalogSeededAt: new Date(), catalogVersion: CATALOG_VERSION } })
    if (claimed.count !== 1) return null
    const skills = await installSkills(tx, workspaceId, null)
    const offers = await tx.offer.createMany({
      data: OFFERS_V1.map((o, i) => ({ workspaceId, ...o, priceNote: o.priceNote ?? null, status: "DRAFT" as const, sortOrder: (i + 1) * 10 })),
      skipDuplicates: true,
    })
    return { skills, offers: offers.count }
  })
  if (!installed) return false
  await audit({ action: "ai.catalog_installed", workspaceId, entityType: "AiSetting", metadata: installed })
  return true
}
