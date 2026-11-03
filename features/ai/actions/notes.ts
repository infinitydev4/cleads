import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { addActivity, bulkUpdate } from "@/features/leads/service"
import { createTask, deleteTask, updateTask } from "@/features/activity/tasks"
import { CALL_OUTCOME_CODES, CALL_OUTCOMES } from "@/features/activity/rules"
import { LeadError } from "@/features/leads/errors"
import { defineTool } from "@/features/ai/tools"
import { clip, dayKey, formatDay, idOf, leadId, leadIds, personOf, targetsOf, visibleName } from "./shared"

/**
 * Notes, tasks and tags (E28, family "notes"): small internal writes the person asked for in words. They run without
 * a click (D28) unless the owner made the family wait for one, and their card offers to put things back when possible.
 */

export const addNoteTool = defineTool({
  name: "add_note",
  description: "Ajoute une note à l'historique d'une fiche (compte rendu, information à retenir), avec le texte exact que la personne a donné ou validé.",
  permission: "lead:write",
  approval: "auto",
  costClass: "free",
  family: "notes",
  input: z.object({ leadId, text: z.string().trim().min(1).max(2_000) }),
  summarize: async (input, ctx) => `Ajouter à la fiche ${await visibleName(personOf(ctx), input.leadId)} la note : « ${clip(input.text, 300)} ».`,
  execute: async (ctx, input) => {
    await addActivity(personOf(ctx), input.leadId, { kind: "NOTE", body: input.text })
    return { done: true, leadId: input.leadId, name: await visibleName(personOf(ctx), input.leadId) }
  },
})

export const logCallTool = defineTool({
  name: "log_call",
  description:
    "Enregistre un appel que la personne a passé, avec son résultat (reached : joint, no_answer, voicemail, wrong_number, callback…) et un compte rendu ; une relance peut être planifiée. Un appel fait passer la fiche « Nouveau » en « Contacté ».",
  permission: "lead:write",
  approval: "auto",
  costClass: "free",
  family: "notes",
  input: z.object({
    leadId,
    outcome: z.enum(CALL_OUTCOME_CODES),
    text: z.string().trim().max(2_000).optional().describe("Compte rendu"),
    durationMin: z.number().int().min(0).max(480).optional(),
    followUpDay: dayKey.optional().describe("Jour de la relance à planifier"),
  }),
  summarize: async (input, ctx) => `Enregistrer l'appel à ${await visibleName(personOf(ctx), input.leadId)} : ${CALL_OUTCOMES[input.outcome]}${input.followUpDay ? `, relance le ${formatDay(input.followUpDay)}` : ""}.`,
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    await addActivity(user, input.leadId, { kind: "CALL", outcome: input.outcome, body: input.text, durationMin: input.durationMin, followUp: input.followUpDay ? { dueDay: input.followUpDay } : undefined })
    return { done: true, leadId: input.leadId, name: await visibleName(user, input.leadId), outcome: CALL_OUTCOMES[input.outcome] }
  },
})

export const createTaskTool = defineTool({
  name: "create_task",
  description: "Crée une tâche sur une fiche (rappeler, relancer, envoyer un devis…), pour la personne elle-même, avec un jour d'échéance si elle en donne un.",
  permission: "task:write",
  approval: "auto",
  costClass: "free",
  family: "notes",
  input: z.object({ leadId, title: z.string().trim().min(1).max(200), dueDay: dayKey.optional() }),
  summarize: async (input, ctx) => {
    const name = await visibleName(personOf(ctx), input.leadId)
    return `Créer la tâche « ${input.title} » sur la fiche ${name}${input.dueDay ? `, pour le ${formatDay(input.dueDay)}` : ", sans échéance"}.`
  },
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const { id } = await createTask(user, input.leadId, { title: input.title, dueDay: input.dueDay ?? null })
    return { done: true, taskId: id, leadId: input.leadId, name: await visibleName(user, input.leadId) }
  },
  undo: async (ctx, output) => deleteTask(personOf(ctx), output.taskId),
})

async function taskOf(ctx: Parameters<typeof personOf>[0], taskId: string) {
  const user = personOf(ctx)
  const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId: user.workspaceId }, select: { title: true, dueAt: true, doneAt: true, leadId: true } })
  if (!task?.leadId) throw new LeadError("not_found", "Tâche introuvable : retrouve son taskId avec get_lead ou get_today.", 404)
  // A task on a fiche the person does not see stays unknown.
  await visibleName(user, task.leadId)
  return { ...task, leadId: task.leadId }
}

export const completeTaskTool = defineTool({
  name: "complete_task",
  description: "Marque une tâche comme faite (taskId lu avec get_lead ou get_today).",
  permission: "task:write",
  approval: "auto",
  costClass: "free",
  family: "notes",
  input: z.object({ taskId: idOf("de la tâche (taskId)") }),
  summarize: async (input, ctx) => `Marquer comme faite la tâche « ${(await taskOf(ctx, input.taskId)).title} ».`,
  execute: async (ctx, input) => {
    const task = await taskOf(ctx, input.taskId)
    await updateTask(personOf(ctx), input.taskId, { done: true })
    return { done: true, taskId: input.taskId, task: task.title, leadId: task.leadId }
  },
  undo: async (ctx, output) => updateTask(personOf(ctx), output.taskId, { done: false }),
})

export const rescheduleTaskTool = defineTool({
  name: "reschedule_task",
  description: "Change le jour d'échéance d'une tâche (taskId lu avec get_lead ou get_today), ou le retire.",
  permission: "task:write",
  approval: "auto",
  costClass: "free",
  family: "notes",
  input: z.object({ taskId: idOf("de la tâche (taskId)"), dueDay: dayKey.nullable().describe("Nouveau jour, ou null pour retirer l'échéance") }),
  summarize: async (input, ctx) => `Replanifier la tâche « ${(await taskOf(ctx, input.taskId)).title} » ${input.dueDay ? `au ${formatDay(input.dueDay)}` : "sans échéance"}.`,
  execute: async (ctx, input) => {
    const task = await taskOf(ctx, input.taskId)
    await updateTask(personOf(ctx), input.taskId, { dueDay: input.dueDay })
    return { done: true, taskId: input.taskId, task: task.title, leadId: task.leadId, previousDueDay: task.dueAt ? task.dueAt.toISOString().slice(0, 10) : null }
  },
  undo: async (ctx, output) => updateTask(personOf(ctx), output.taskId, { dueDay: output.previousDueDay }),
})

const tagInput = z.object({ leadIds: leadIds(), tag: z.string().trim().min(1).max(40).describe("L'étiquette, en minuscules") })

/** Tags change only on the fiches that did not have them (or did): the undo puts back exactly those. */
async function retag(ctx: Parameters<typeof personOf>[0], input: z.infer<typeof tagInput>, type: "tag" | "untag") {
  const user = personOf(ctx)
  const { writable } = await targetsOf(user, input.leadIds)
  const tag = input.tag.trim().toLowerCase()
  const rows = await prisma.lead.findMany({ where: { id: { in: writable } }, select: { id: true, tags: true } })
  const changing = rows.filter((r) => (type === "tag" ? !r.tags.includes(tag) : r.tags.includes(tag))).map((r) => r.id)
  const result = changing.length ? await bulkUpdate(user, { ids: changing, action: { type, tag } }) : { updated: 0, notAllowed: 0, failures: [] }
  return { done: true, tag, updated: result.updated, unchanged: writable.length - changing.length, notAllowed: input.leadIds.length - writable.length, changedIds: changing }
}

const tagForModel = (o: Awaited<ReturnType<typeof retag>>) => ({ done: o.done, tag: o.tag, updated: o.updated, unchanged: o.unchanged, notAllowed: o.notAllowed })

export const tagLeadsTool = defineTool({
  name: "tag_leads",
  description: "Ajoute une étiquette à des fiches (500 au plus), par exemple pour marquer une sélection à retrouver ensuite dans la liste.",
  permission: "lead:write",
  approval: "auto",
  costClass: "free",
  family: "notes",
  input: tagInput,
  summarize: async (input, ctx) => `Étiqueter « ${input.tag.toLowerCase()} » ${(await targetsOf(personOf(ctx), input.leadIds)).text}.`,
  execute: (ctx, input) => retag(ctx, input, "tag"),
  undo: async (ctx, output) => {
    if (output.changedIds.length) await bulkUpdate(personOf(ctx), { ids: output.changedIds, action: { type: "untag", tag: output.tag } })
  },
  forModel: tagForModel,
})

export const untagLeadsTool = defineTool({
  name: "untag_leads",
  description: "Retire une étiquette de fiches (500 au plus).",
  permission: "lead:write",
  approval: "auto",
  costClass: "free",
  family: "notes",
  input: tagInput,
  summarize: async (input, ctx) => `Retirer l'étiquette « ${input.tag.toLowerCase()} » de ${(await targetsOf(personOf(ctx), input.leadIds)).text}.`,
  execute: (ctx, input) => retag(ctx, input, "untag"),
  undo: async (ctx, output) => {
    if (output.changedIds.length) await bulkUpdate(personOf(ctx), { ids: output.changedIds, action: { type: "tag", tag: output.tag } })
  },
  forModel: tagForModel,
})

export const NOTE_ACTIONS = [addNoteTool, logCallTool, createTaskTool, completeTaskTool, rescheduleTaskTool, tagLeadsTool, untagLeadsTool] as const
