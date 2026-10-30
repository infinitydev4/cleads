import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { OPEN_STAGES } from "@/features/pipeline/rules"
import { canWorkLead, dueAtOf, formatDay, insertTask, logTask } from "./core"
import { TASK_ASSIGNEE_ROLES, canAssignTaskTo, canChangeTask, canDeleteTask, type CreateTaskInput, type UpdateTaskInput } from "./rules"

const leadSelect = { id: true, ownerId: true, status: true, deals: { select: { ownerId: true, stage: true } } } satisfies Prisma.LeadSelect

/** Tasks the person may reach: theirs, or on a fiche they may read. (An empty `lead: {}` inside an OR matches nothing useful, so the workspace is always spelled out.) */
export const reachableTask = (user: CurrentUser): Prisma.TaskWhereInput => ({
  workspaceId: user.workspaceId,
  leadId: { not: null },
  OR: [{ assigneeId: user.id }, { lead: { is: { workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") } } }],
})

async function readableLead(user: CurrentUser, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") }, select: leadSelect })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  return lead
}

async function assigneeOf(tx: Prisma.TransactionClient, user: CurrentUser, assigneeId: string, holders: (string | null)[]) {
  const person = await tx.user.findFirst({ where: { id: assigneeId, workspaceId: user.workspaceId, active: true, role: { in: [...TASK_ASSIGNEE_ROLES] } }, select: { id: true, name: true, email: true } })
  if (!person) throw new LeadError("invalid", "Cette personne ne peut pas recevoir de tâches.")
  if (!canAssignTaskTo(user, assigneeId, holders)) throw new LeadError("forbidden", "Vous ne pouvez confier une tâche qu’à vous-même ou à la personne qui détient la fiche.", 403)
  return person
}

const holdersOf = (lead: { ownerId: string | null; deals: { ownerId: string | null; stage: string }[] }) => [lead.ownerId, ...lead.deals.filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage)).map((d) => d.ownerId)]

export async function createTask(user: CurrentUser, leadId: string, input: CreateTaskInput): Promise<{ id: string }> {
  const lead = await readableLead(user, leadId)
  if (!canWorkLead(user, lead)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  if (lead.status === "DO_NOT_CONTACT") throw new LeadError("conflict", "Cette fiche est marquée « ne pas contacter » : aucune relance ne peut être planifiée.", 409)
  return prisma.$transaction(async (tx) => {
    const assigneeId = input.assigneeId ?? user.id
    await assigneeOf(tx, user, assigneeId, holdersOf(lead))
    const task = await insertTask(tx, user, { leadId, title: input.title, dueDay: input.dueDay, assigneeId })
    return { id: task.id }
  })
}

export async function updateTask(user: CurrentUser, id: string, patch: UpdateTaskInput): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id, ...reachableTask(user) },
    include: { lead: { select: leadSelect } },
  })
  if (!task?.lead) throw new LeadError("not_found", "Tâche introuvable.", 404)
  const leadId = task.lead.id
  if (!canChangeTask(user, task, canWorkLead(user, task.lead))) throw new LeadError("forbidden", "Cette tâche ne vous est pas confiée.", 403)

  await prisma.$transaction(async (tx) => {
    const data: Prisma.TaskUncheckedUpdateInput = {}
    const trace = async (body: string, event: string) => logTask(tx, user, leadId, body, { event, taskId: id })

    if (patch.title !== undefined && patch.title !== task.title) {
      data.title = patch.title
      await trace(`Tâche renommée : ${task.title} → ${patch.title}`, "renamed")
    }
    const title = patch.title ?? task.title
    if (patch.dueDay !== undefined) {
      const dueAt = dueAtOf(patch.dueDay)
      if ((dueAt?.getTime() ?? null) !== (task.dueAt?.getTime() ?? null)) {
        data.dueAt = dueAt
        await trace(dueAt ? `Tâche reportée : ${title} (pour ${formatDay(dueAt)})` : `Échéance retirée : ${title}`, "postponed")
      }
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
      if (patch.assigneeId === null) throw new LeadError("invalid", "Une tâche doit être confiée à quelqu’un.")
      const person = await assigneeOf(tx, user, patch.assigneeId, holdersOf(task.lead!))
      data.assigneeId = person.id
      await trace(`Tâche confiée à ${person.name ?? person.email} : ${title}`, "reassigned")
    }
    if (Object.keys(data).length) await tx.task.update({ where: { id }, data })

    if (patch.done === true && !task.doneAt) {
      // Two people ticking the same task at once: only the first leaves a line.
      const { count } = await tx.task.updateMany({ where: { id, doneAt: null }, data: { doneAt: new Date() } })
      if (count) await trace(`Tâche terminée : ${title}`, "done")
    } else if (patch.done === false && task.doneAt) {
      if (task.lead!.status === "DO_NOT_CONTACT" || task.lead!.status === "DISQUALIFIED") throw new LeadError("conflict", "Cette fiche est fermée : la tâche ne peut pas être rouverte.", 409)
      const { count } = await tx.task.updateMany({ where: { id, doneAt: { not: null } }, data: { doneAt: null } })
      if (count) await trace(`Tâche rouverte : ${title}`, "reopened")
    }
  })
}

export async function deleteTask(user: CurrentUser, id: string): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id, ...reachableTask(user) },
    include: { lead: { select: leadSelect } },
  })
  if (!task?.lead) throw new LeadError("not_found", "Tâche introuvable.", 404)
  if (!canChangeTask(user, task, canWorkLead(user, task.lead)) || !canDeleteTask(user, task)) throw new LeadError("forbidden", "Seuls l’auteur de la tâche et les managers peuvent la supprimer.", 403)
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.task.deleteMany({ where: { id } })
    if (count) await logTask(tx, user, task.lead!.id, `Tâche supprimée : ${task.title}`, { event: "deleted", taskId: id })
  })
}
