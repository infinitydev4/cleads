import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { activeOffers } from "@/features/offers/service"
import { renderOffersSkill } from "@/features/offers/skill"
import { untrusted } from "@/lib/ai/untrusted"
import { AGENTS, isAgentId, usesSkills, type AgentId } from "./agents"
import { generateForRun, type ModelDeps } from "./calls"
import { effectiveAgent } from "./definitions"
import type { HandlerContext } from "./handlers"
import { composeInstructions } from "./runtime"
import { startRun, type RunContext } from "./runs"
import { filesOf } from "./skills/service"

/**
 * Testing a skill on a fiche (docs/crm-v1/AGENTS-IA.md §8): the worker runs the chosen agent with its persona, the
 * team's instructions and this version of the skill alone, on the fiche's data, and keeps the answer in the run. It is
 * a real run, billed to the person's quota, so owners and managers only (skill:manage).
 */
export const SKILL_TEST = "skill_test"

export const skillTestRequestSchema = z
  .object({
    leadId: z.string().min(1, "Choisissez une fiche"),
    agentId: z.string().refine(isAgentId, "Agent inconnu"),
    instruction: z.string().trim().max(1_000, "Demande : 1 000 caractères au plus").nullish().transform((v) => v || null),
  })
  .strict()
export type SkillTestRequest = z.infer<typeof skillTestRequestSchema>

const inputSchema = z.object({ kind: z.literal(SKILL_TEST), skillId: z.string(), version: z.number().int().min(1), instruction: z.string().nullable().optional() })

export interface SkillTestOutput {
  kind: typeof SKILL_TEST
  skill: { id: string; name: string; version: number }
  agentId: AgentId
  model: string
  text: string
}

export async function startSkillTest(actor: CurrentUser, skillId: string, request: SkillTestRequest): Promise<{ runId: string }> {
  if (!can(actor.role, "skill:manage")) throw new LeadError("forbidden", "Seuls le propriétaire et les managers testent les skills.", 403)
  const agentId = request.agentId as AgentId
  if (!usesSkills(AGENTS[agentId])) throw new LeadError("invalid", `${AGENTS[agentId].label} décide sans consignes écrites : choisissez un agent qui rédige.`, 400)
  const skill = await prisma.skill.findFirst({ where: { id: skillId, workspaceId: actor.workspaceId }, select: { version: true, archivedAt: true } })
  if (!skill) throw new LeadError("not_found", "Skill introuvable", 404)
  if (skill.archivedAt) throw new LeadError("conflict", "Ce skill est archivé : restaurez-le pour le tester.", 409)
  const run = await startRun(actor, { agentId, leadId: request.leadId, status: "QUEUED", priority: 1, input: { kind: SKILL_TEST, skillId, version: skill.version, instruction: request.instruction } })
  return { runId: run.id }
}

/** What the fiche says about the company, nothing personal: no contact name, email or phone number is given. */
async function leadFacts(ctx: RunContext): Promise<string> {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.leadId ?? "", workspaceId: ctx.workspaceId },
    select: {
      status: true,
      score: true,
      tags: true,
      campaign: { select: { name: true, sector: true, area: true } },
      company: { select: { name: true, sector: true, city: true, postalCode: true, country: true, website: true, domain: true, rating: true, reviewCount: true, phone: true, email: true, data: true } },
    },
  })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable", 404)
  const c = lead.company
  const facts = {
    entreprise: c?.name ?? null,
    secteur: c?.sector ?? null,
    ville: c?.city ?? null,
    codePostal: c?.postalCode ?? null,
    pays: c?.country ?? null,
    site: c?.website ?? (c?.domain ? `https://${c.domain}` : null),
    noteGoogle: c?.rating ?? null,
    nombreAvis: c?.reviewCount ?? null,
    telephoneConnu: !!c?.phone,
    emailConnu: !!c?.email,
    statutFiche: lead.status,
    score: lead.score,
    etiquettes: lead.tags,
    campagne: lead.campaign,
  }
  const raw = c?.data ? `\n\nDonnées brutes de la source :\n${JSON.stringify(c.data).slice(0, 3_000)}` : ""
  return untrusted(`${JSON.stringify(facts, null, 2)}${raw}`, { source: "fiche du CRM", maxChars: 6_000 })
}

export async function runSkillTest(job: HandlerContext, deps: ModelDeps = {}): Promise<{ output: SkillTestOutput }> {
  const input = inputSchema.parse(job.input)
  const ctx = job.run
  if (!ctx.leadId) throw new LeadError("invalid", "Le test d'un skill porte sur une fiche.", 400)
  const version = await prisma.skillVersion.findFirst({
    where: { skillId: input.skillId, version: input.version, skill: { workspaceId: ctx.workspaceId } },
    select: { content: true, files: true, skill: { select: { id: true, name: true, description: true, generator: true } } },
  })
  if (!version) throw new LeadError("not_found", "Cette version du skill n'existe plus.", 404)
  const agent = await effectiveAgent(ctx.workspaceId, ctx.agentId)
  if (!usesSkills({ modelRole: agent.modelRole })) throw new LeadError("invalid", "Cet agent n'utilise pas de skills.", 400)
  const content = version.skill.generator === "offers" ? renderOffersSkill(await activeOffers(ctx.workspaceId)) : version.content
  const system = composeInstructions(agent, [{ name: version.skill.name, version: input.version, description: version.skill.description, content, files: filesOf(version.files) }], [])
  const prompt = [
    `Tu testes le skill « ${version.skill.name} » sur une fiche du CRM. Applique-le à cette entreprise et rends ce que ce skill doit produire, en Markdown simple.`,
    "Tu n'as ni outil ni accès au web : appuie-toi seulement sur les données de la fiche ci-dessous et dis clairement ce qu'il faudrait vérifier ou collecter pour aller plus loin. N'invente aucun chiffre, avis ou fait.",
    input.instruction ? `Demande de la personne qui teste : ${input.instruction}` : null,
    `Fiche :\n${await leadFacts(ctx)}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const result = await generateForRun(
    ctx,
    { role: agent.modelRole === "decision" ? "writer" : agent.modelRole, name: `skill_test:${version.skill.name}`, system, prompt, maxOutputTokens: 3_000, abortSignal: job.signal },
    deps
  )
  return { output: { kind: SKILL_TEST, skill: { id: version.skill.id, name: version.skill.name, version: input.version }, agentId: ctx.agentId, model: result.model, text: result.text } }
}
