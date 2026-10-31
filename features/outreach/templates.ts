import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { templateErrors } from "./template"
import type { TemplateInput } from "./schemas"

export interface TemplateView {
  id: string
  name: string
  subject: string
  body: string
  createdByName: string | null
  updatedAt: string
  /** Messages sent with it. */
  uses: number
}

export async function listTemplates(user: CurrentUser): Promise<TemplateView[]> {
  const rows = await prisma.emailTemplate.findMany({
    where: { workspaceId: user.workspaceId, archivedAt: null },
    include: { createdBy: { select: { name: true, email: true } }, _count: { select: { messages: true } } },
    orderBy: { name: "asc" },
  })
  return rows.map((t) => ({ id: t.id, name: t.name, subject: t.subject, body: t.body, createdByName: t.createdBy?.name ?? t.createdBy?.email ?? null, updatedAt: t.updatedAt.toISOString(), uses: t._count.messages }))
}

function check(input: TemplateInput) {
  const errors = [...templateErrors(input.subject), ...templateErrors(input.body)]
  if (errors.length) throw new LeadError("invalid", errors[0])
}

const duplicate = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"

export async function createTemplate(user: CurrentUser, input: TemplateInput): Promise<{ id: string }> {
  check(input)
  try {
    const t = await prisma.emailTemplate.create({ data: { workspaceId: user.workspaceId, createdById: user.id, ...input } })
    await audit({ action: "email_template.created", actorId: user.id, workspaceId: user.workspaceId, entityType: "EmailTemplate", entityId: t.id, metadata: { name: input.name } })
    return { id: t.id }
  } catch (error) {
    if (duplicate(error)) throw new LeadError("duplicate", "Un modèle porte déjà ce nom.", 409)
    throw error
  }
}

export async function updateTemplate(user: CurrentUser, id: string, input: TemplateInput): Promise<void> {
  check(input)
  const t = await prisma.emailTemplate.findFirst({ where: { id, workspaceId: user.workspaceId, archivedAt: null }, select: { id: true } })
  if (!t) throw new LeadError("not_found", "Modèle introuvable.", 404)
  try {
    // Messages already sent keep their own copy of the text: editing a template never rewrites history.
    await prisma.emailTemplate.update({ where: { id }, data: input })
  } catch (error) {
    if (duplicate(error)) throw new LeadError("duplicate", "Un modèle porte déjà ce nom.", 409)
    throw error
  }
  await audit({ action: "email_template.updated", actorId: user.id, workspaceId: user.workspaceId, entityType: "EmailTemplate", entityId: id, metadata: { name: input.name } })
}

/** Archived, not deleted: messages sent with it still say which template they came from. The name is freed. */
export async function archiveTemplate(user: CurrentUser, id: string): Promise<void> {
  const t = await prisma.emailTemplate.findFirst({ where: { id, workspaceId: user.workspaceId, archivedAt: null } })
  if (!t) throw new LeadError("not_found", "Modèle introuvable.", 404)
  await prisma.emailTemplate.update({ where: { id }, data: { archivedAt: new Date(), name: `${t.name} (archivé ${t.id.slice(-6)})` } })
  await audit({ action: "email_template.archived", actorId: user.id, workspaceId: user.workspaceId, entityType: "EmailTemplate", entityId: id, metadata: { name: t.name } })
}
