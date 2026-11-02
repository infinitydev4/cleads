import type { Prisma, SkillMode } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { activeOffers } from "@/features/offers/service"
import { renderOffersSkill } from "@/features/offers/skill"
import { AGENTS, isAgentId, type AgentId } from "../agents"
import { SKILL_LIMITS, SkillFormatError, cleanSkillPath, parseSkillMd, serializeSkillMd, type SkillFile } from "./skill-md"
import type { CreateSkillInput, ImportSkillInput, UpdateSkillInput } from "./schemas"

/**
 * Skills (docs/crm-v1/AGENTS-IA.md §8): know-how the team gives agents without touching the code. Every change of
 * description, content or files creates a version and the earlier ones stay readable. Everyone who uses AI reads them;
 * owners and managers write them (skill:manage). Agents only read the skills given to them, never write any.
 */
type Db = Prisma.TransactionClient | typeof prisma

export interface SkillAgentLink {
  agentId: AgentId
  label: string
  mode: SkillMode
}

export interface SkillView {
  id: string
  name: string
  description: string
  version: number
  /** "offers": written from the active offers each time it is used. */
  generator: string | null
  archived: boolean
  agents: SkillAgentLink[]
  updatedAt: string
  updatedBy: string | null
}

export interface SkillVersionMeta {
  version: number
  note: string | null
  createdAt: string
  createdBy: string | null
}

export interface SkillDetail extends SkillView {
  content: string
  files: SkillFile[]
  versions: SkillVersionMeta[]
  /** The SKILL.md to copy or export, content generated included. */
  markdown: string
}

export interface SkillVersionView extends SkillVersionMeta {
  description: string
  content: string
  files: SkillFile[]
}

const requireRead = (actor: CurrentUser) => {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Accès refusé", 403)
}
const requireManage = (actor: CurrentUser) => {
  if (!can(actor.role, "skill:manage")) throw new LeadError("forbidden", "Seuls le propriétaire et les managers modifient les skills.", 403)
}

export const filesOf = (value: unknown): SkillFile[] =>
  Array.isArray(value) ? value.filter((f): f is SkillFile => !!f && typeof f.path === "string" && typeof f.content === "string").map((f) => ({ path: f.path, content: f.content })) : []

async function names(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } })
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Membre"]))
}

const linkOf = (l: { agentId: string; mode: SkillMode }): SkillAgentLink[] => (isAgentId(l.agentId) ? [{ agentId: l.agentId, label: AGENTS[l.agentId].label, mode: l.mode }] : [])

const include = { agents: { select: { agentId: true, mode: true }, orderBy: { agentId: "asc" } } } satisfies Prisma.SkillInclude
type Row = Prisma.SkillGetPayload<{ include: typeof include }>

const toView = (s: Row, people: Map<string, string>): SkillView => ({
  id: s.id,
  name: s.name,
  description: s.description,
  version: s.version,
  generator: s.generator,
  archived: !!s.archivedAt,
  agents: s.agents.flatMap(linkOf),
  updatedAt: s.updatedAt.toISOString(),
  updatedBy: s.updatedById ? (people.get(s.updatedById) ?? "Ancien membre") : null,
})

/** The text a generated skill has right now. */
async function contentOf(workspaceId: string, skill: { generator: string | null }, stored: string, db: Db = prisma): Promise<string> {
  return skill.generator === "offers" ? renderOffersSkill(await activeOffers(workspaceId, db)) : stored
}

export async function listSkills(actor: CurrentUser, opts: { archived?: boolean } = {}): Promise<SkillView[]> {
  requireRead(actor)
  const rows = await prisma.skill.findMany({ where: { workspaceId: actor.workspaceId, archivedAt: opts.archived ? { not: null } : null }, include, orderBy: { name: "asc" } })
  const people = await names(rows.map((r) => r.updatedById))
  return rows.map((r) => toView(r, people))
}

async function findSkill(actor: CurrentUser, skillId: string) {
  const skill = await prisma.skill.findFirst({ where: { id: skillId, workspaceId: actor.workspaceId }, include })
  if (!skill) throw new LeadError("not_found", "Skill introuvable", 404)
  return skill
}

export async function getSkill(actor: CurrentUser, skillId: string): Promise<SkillDetail> {
  requireRead(actor)
  const skill = await findSkill(actor, skillId)
  const versions = await prisma.skillVersion.findMany({ where: { skillId }, orderBy: { version: "desc" }, select: { version: true, note: true, createdAt: true, createdById: true, content: true, files: true } })
  const current = versions.find((v) => v.version === skill.version)
  const people = await names([skill.updatedById, ...versions.map((v) => v.createdById)])
  const content = await contentOf(actor.workspaceId, skill, current?.content ?? "")
  return {
    ...toView(skill, people),
    content,
    files: filesOf(current?.files),
    versions: versions.map((v) => ({ version: v.version, note: v.note, createdAt: v.createdAt.toISOString(), createdBy: v.createdById ? (people.get(v.createdById) ?? "Ancien membre") : null })),
    markdown: serializeSkillMd({ name: skill.name, description: skill.description, content }),
  }
}

export async function getSkillVersion(actor: CurrentUser, skillId: string, version: number): Promise<SkillVersionView> {
  requireRead(actor)
  await findSkill(actor, skillId)
  const v = await prisma.skillVersion.findUnique({ where: { skillId_version: { skillId, version } } })
  if (!v) throw new LeadError("not_found", "Version introuvable", 404)
  const people = await names([v.createdById])
  return { version: v.version, note: v.note, createdAt: v.createdAt.toISOString(), createdBy: v.createdById ? (people.get(v.createdById) ?? "Ancien membre") : null, description: v.description, content: v.content, files: filesOf(v.files) }
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002"

export async function createSkill(actor: CurrentUser, input: CreateSkillInput, ip?: string | null): Promise<SkillDetail> {
  requireManage(actor)
  const skill = await prisma.skill
    .create({
      data: {
        workspaceId: actor.workspaceId,
        name: input.name,
        description: input.description,
        createdById: actor.id,
        updatedById: actor.id,
        versions: { create: { version: 1, description: input.description, content: input.content, files: filesJson(input.files), note: input.note ?? "Création", createdById: actor.id } },
      },
      select: { id: true },
    })
    .catch((error: unknown) => {
      if (isUniqueViolation(error)) throw new LeadError("conflict", `Un skill s'appelle déjà « ${input.name} » (archivé compris).`, 409)
      throw error
    })
  await audit({ action: "skill.created", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Skill", entityId: skill.id, metadata: { name: input.name }, ip })
  return getSkill(actor, skill.id)
}

/** Files as stored: nothing when there are none. */
const filesJson = (files: SkillFile[]) => (files.length ? (files.map((f) => ({ path: f.path, content: f.content })) as Prisma.InputJsonArray) : undefined)

const sameFiles = (a: SkillFile[], b: SkillFile[]) => a.length === b.length && a.every((f, i) => f.path === b[i].path && f.content === b[i].content)

/**
 * Saves a new version when the description, the content or the files change; the version number is raised under the
 * skill's row lock, so two editors never write the same version. A generated skill only takes a new description.
 */
export async function updateSkill(actor: CurrentUser, skillId: string, input: UpdateSkillInput, ip?: string | null): Promise<SkillDetail> {
  requireManage(actor)
  const skill = await findSkill(actor, skillId)
  const current = await prisma.skillVersion.findUnique({ where: { skillId_version: { skillId, version: skill.version } } })
  let next = { description: skill.description, content: current?.content ?? "", files: filesOf(current?.files) }
  let note = input.note ?? null
  if (input.restoreVersion !== undefined) {
    const old = await prisma.skillVersion.findUnique({ where: { skillId_version: { skillId, version: input.restoreVersion } } })
    if (!old) throw new LeadError("not_found", "Version introuvable", 404)
    next = { description: old.description, content: old.content, files: filesOf(old.files) }
    note = note ?? `Retour à la version ${old.version}`
  }
  if (input.description !== undefined) next.description = input.description
  if (input.content !== undefined) next.content = input.content
  if (input.files !== undefined) next.files = input.files
  if (skill.generator && (next.content !== (current?.content ?? "") || !sameFiles(next.files, filesOf(current?.files)))) {
    throw new LeadError("conflict", "Ce skill est écrit à partir du catalogue d'offres : modifiez les offres, pas son texte.", 409)
  }
  const changed = next.description !== skill.description || next.content !== (current?.content ?? "") || !sameFiles(next.files, filesOf(current?.files))
  const archive = input.archived === undefined || input.archived === !!skill.archivedAt ? undefined : input.archived

  if (changed || archive !== undefined) {
    await prisma.$transaction(async (tx) => {
      const row = await tx.skill.update({
        where: { id: skillId },
        data: {
          updatedById: actor.id,
          ...(changed ? { version: { increment: 1 }, description: next.description } : {}),
          ...(archive !== undefined ? { archivedAt: archive ? new Date() : null } : {}),
        },
        select: { version: true },
      })
      if (changed) {
        await tx.skillVersion.create({
          data: { skillId, version: row.version, description: next.description, content: next.content, files: filesJson(next.files), note, createdById: actor.id },
        })
      }
    })
    await audit({
      action: archive === true ? "skill.archived" : archive === false ? "skill.restored" : "skill.updated",
      actorId: actor.id,
      workspaceId: actor.workspaceId,
      entityType: "Skill",
      entityId: skillId,
      metadata: { name: skill.name, newVersion: changed, restoredFrom: input.restoreVersion ?? null },
      ip,
    })
  }
  return getSkill(actor, skillId)
}

/**
 * Imports a SKILL.md and the text files of its folder: a new skill, or a new version of the one with the same name
 * (restored if it was archived). Annexes that are not text, or too big, are skipped and listed.
 */
export async function importSkill(actor: CurrentUser, input: ImportSkillInput, ip?: string | null): Promise<{ skill: SkillDetail; created: boolean; skipped: string[] }> {
  requireManage(actor)
  let doc
  try {
    doc = parseSkillMd(input.markdown)
  } catch (error) {
    if (error instanceof SkillFormatError) throw new LeadError("invalid", error.message, 400)
    throw error
  }
  const skipped: string[] = []
  const files: SkillFile[] = []
  let total = 0
  for (const f of input.files) {
    const cleaned = cleanSkillPath(f.path)
    if ("error" in cleaned) skipped.push(cleaned.error)
    else if (f.content.length > SKILL_LIMITS.fileMax) skipped.push(`« ${cleaned.path} » ignoré : plus de ${SKILL_LIMITS.fileMax.toLocaleString("fr-FR")} caractères.`)
    else if (files.length >= SKILL_LIMITS.filesMax || total + f.content.length > SKILL_LIMITS.filesTotalMax) skipped.push(`« ${cleaned.path} » ignoré : trop de fichiers annexes.`)
    else if (!files.some((x) => x.path === cleaned.path)) {
      files.push({ path: cleaned.path, content: f.content })
      total += f.content.length
    }
  }
  const existing = await prisma.skill.findUnique({ where: { workspaceId_name: { workspaceId: actor.workspaceId, name: doc.name } }, select: { id: true, generator: true } })
  if (existing?.generator) throw new LeadError("conflict", `« ${doc.name} » est écrit à partir du catalogue d'offres : il ne s'importe pas.`, 409)
  if (existing) {
    const skill = await updateSkill(actor, existing.id, { description: doc.description, content: doc.content, files, note: "Import d'un fichier SKILL.md", archived: false }, ip)
    return { skill, created: false, skipped }
  }
  const skill = await createSkill(actor, { name: doc.name, description: doc.description, content: doc.content, files, note: "Import d'un fichier SKILL.md" }, ip)
  return { skill, created: true, skipped }
}

export interface LoadedSkill {
  name: string
  version: number
  description: string
  content: string
  files: SkillFile[]
}

/** The skills an agent has, live: archived ones are left out, generated ones are written now. */
export async function loadAgentSkills(workspaceId: string, agentId: AgentId, db: Db = prisma): Promise<{ always: LoadedSkill[]; onDemand: { name: string; description: string }[] }> {
  const links = await db.agentSkill.findMany({
    where: { workspaceId, agentId, skill: { archivedAt: null } },
    select: { mode: true, skill: { select: { id: true, name: true, description: true, version: true, generator: true } } },
    orderBy: { skill: { name: "asc" } },
  })
  const always = links.filter((l) => l.mode === "ALWAYS")
  const versions = always.length
    ? await db.skillVersion.findMany({ where: { OR: always.map((l) => ({ skillId: l.skill.id, version: l.skill.version })) }, select: { skillId: true, content: true, files: true } })
    : []
  const byId = new Map(versions.map((v) => [v.skillId, v]))
  return {
    always: await Promise.all(
      always.map(async (l) => ({
        name: l.skill.name,
        version: l.skill.version,
        description: l.skill.description,
        content: await contentOf(workspaceId, l.skill, byId.get(l.skill.id)?.content ?? "", db),
        files: filesOf(byId.get(l.skill.id)?.files),
      }))
    ),
    onDemand: links.filter((l) => l.mode === "ON_DEMAND").map((l) => ({ name: l.skill.name, description: l.skill.description })),
  }
}

/** read_skill: a skill given to this agent (or one of its annexes), never another one. */
export async function readSkillForAgent(workspaceId: string, agentId: AgentId, name: string, file?: string): Promise<{ name: string; version: number; content: string; files: string[] }> {
  const link = await prisma.agentSkill.findFirst({
    where: { workspaceId, agentId, skill: { name, archivedAt: null } },
    select: { skill: { select: { id: true, name: true, version: true, generator: true } } },
  })
  if (!link) throw new LeadError("not_found", `Skill « ${name.slice(0, 64)} » inconnu de cet agent : utilise un nom de ton catalogue.`, 404)
  const v = await prisma.skillVersion.findUnique({ where: { skillId_version: { skillId: link.skill.id, version: link.skill.version } }, select: { content: true, files: true } })
  const files = filesOf(v?.files)
  if (file) {
    const wanted = files.find((f) => f.path === file.replace(/^(\.\/)+/, ""))
    if (!wanted) throw new LeadError("not_found", `Fichier « ${file.slice(0, 120)} » absent du skill « ${name} ».`, 404)
    return { name: link.skill.name, version: link.skill.version, content: wanted.content, files: files.map((f) => f.path) }
  }
  return { name: link.skill.name, version: link.skill.version, content: await contentOf(workspaceId, link.skill, v?.content ?? ""), files: files.map((f) => f.path) }
}
