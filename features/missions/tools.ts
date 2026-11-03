import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { effectiveAgent } from "@/features/ai/definitions"
import { defineTool, type ToolContext } from "@/features/ai/tools"
import { eur, idOf, personOf } from "@/features/ai/actions/shared"
import { missionSignatures } from "./actions"
import { MISSION_BOUNDS } from "./plan"
import { describeRecurrence } from "./recurrence"
import { LOOP_MAX, MAX_STEPS, planSchema } from "./schemas"
import { actOnMission, actOnSchedule, missionsForModel, proposeMission } from "./service"

/**
 * The copilot's missions (E28, family "missions"): proposing a plan costs nothing and launches nothing, so it needs no
 * click; the person launches it from its card. Following them is reading; pausing, resuming or cancelling one waits for
 * a click.
 */

async function conversationOf(runId: string): Promise<string | null> {
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { input: true } })
  const id = run?.input && typeof run.input === "object" && !Array.isArray(run.input) ? (run.input as { conversationId?: unknown }).conversationId : null
  return typeof id === "string" ? id : null
}

const policyOf = async (ctx: ToolContext) => ctx.policy ?? (await effectiveAgent(ctx.run.workspaceId, "copilot")).policy

export const proposeMissionTool = defineTool({
  name: "propose_mission",
  description: `Propose une mission : un plan de plusieurs actions que la personne lance d'un clic sur sa carte, puis que le worker mène seul, même conversation fermée. À préférer dès qu'une demande enchaîne des actions longues ou en nombre (recherche, import, tri, sélection, audits, brouillons, inscription), plutôt que de les appeler une à une. Rien ne part avant le clic.
Étapes s1, s2… (${MAX_STEPS} au plus), exécutées dans l'ordre, chacune une fois la précédente terminée :
${missionSignatures()}
Références : une entrée peut citer ce qu'une étape précédente a donné, { "$ref": "s2.searchId" }. Boucle (forEach) : une liste écrite (${LOOP_MAX} au plus), "s1.targetIds" (une liste d'une étape) ou "s2" (continuer la boucle de s2) ; dans une boucle, { "$ref": "item" } est l'élément courant, et une référence à une étape de la même boucle donne la valeur de cet élément.
Par mission : ${MISSION_BOUNDS.searches} recherches et ${MISSION_BOUNDS.results.toLocaleString("fr-FR")} entreprises, ${MISSION_BOUNDS.audits} audits, ${MISSION_BOUNDS.drafts} brouillons au plus. Les fiches de la dernière étape qui en donne reçoivent une étiquette « mission … ».
Récurrence facultative : { frequency: "daily" | "weekly", days: [1 = lundi … 7], hour: 6 à 21, minute } ; le premier passage part au lancement.`,
  permission: "ai:use",
  approval: "auto",
  costClass: "free",
  family: "missions",
  input: planSchema,
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const { mission, check } = await proposeMission(user, await policyOf(ctx), input, { conversationId: await conversationOf(ctx.run.id) })
    const over = check.maxMicros > mission.capMicros
    return {
      proposed: true,
      missionId: mission.id,
      title: check.plan.title,
      steps: check.plan.steps.map((s, i) => `${i + 1}. ${s.text}${s.level === "explicit" ? " (attendra son propre clic)" : ""}`),
      cost: `environ ${eur(check.probableMicros)}, ${eur(check.maxMicros)} au plus${over ? ` : au-delà du plafond de ${eur(mission.capMicros)} par mission, la personne devra confirmer une seconde fois` : ""}`,
      ...(check.plan.recurrence ? { recurrence: `${describeRecurrence(check.plan.recurrence)}, premier passage au lancement` } : {}),
      note: "Plan proposé, pas lancé : la personne le lance d'un clic sur sa carte. Ne le présente pas comme lancé ; dis en une ou deux phrases ce qu'il fera et ce qu'il peut coûter.",
    }
  },
})

export const listMissionsTool = defineTool({
  name: "list_missions",
  description: "Les missions de la personne (celles de l'équipe pour un manager) : où en est chacune, étape par étape, ce qu'elle a coûté, son bilan et l'étiquette de ses fiches.",
  permission: "ai:read",
  approval: "auto",
  costClass: "free",
  family: "read_crm",
  input: z.object({ limit: z.number().int().min(1).max(20).optional() }),
  execute: async (ctx, input) => ({ missions: await missionsForModel(personOf(ctx), input.limit ?? 10) }),
})

const MANAGE_WORDS = {
  pause: (t: string) => `Mettre en pause la mission « ${t} » : ce qui tourne déjà continue, rien de nouveau ne part.`,
  resume: (t: string) => `Reprendre la mission « ${t} » : ses étapes en échec ou interrompues repartent.`,
  cancel: (t: string) => `Annuler la mission « ${t} » : ses recherches et travaux en cours s'arrêtent ; ce qui est fait reste.`,
  stop_recurrence: (t: string) => `Arrêter la récurrence de « ${t} » : plus aucun passage ne partira.`,
}

async function missionOf(ctx: ToolContext, id: string) {
  const m = await prisma.agentMission.findFirst({ where: { id, workspaceId: ctx.run.workspaceId }, select: { id: true, title: true, scheduleId: true } })
  if (!m) throw new LeadError("not_found", "Mission introuvable : retrouve son missionId avec list_missions.", 404)
  return m
}

export const manageMissionTool = defineTool({
  name: "manage_mission",
  description: "Met en pause, reprend ou annule une mission (missionId lu avec list_missions), ou arrête sa récurrence. Annuler arrête ses recherches et travaux en cours ; ce qui est fait reste. Relever son plafond se fait sur sa carte.",
  permission: "ai:use",
  approval: "user",
  costClass: "free",
  family: "missions",
  input: z.object({ missionId: idOf("de la mission"), action: z.enum(["pause", "resume", "cancel", "stop_recurrence"]) }),
  summarize: async (input, ctx) => MANAGE_WORDS[input.action]((await missionOf(ctx, input.missionId)).title),
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    if (input.action === "stop_recurrence") {
      const m = await missionOf(ctx, input.missionId)
      if (!m.scheduleId) throw new LeadError("conflict", "Cette mission ne revient pas : elle n'a pas de récurrence.", 409)
      const s = await actOnSchedule(user, m.scheduleId, { action: "stop" })
      return { done: true, missionId: m.id, recurrence: s.status, open: "/app/agents?tab=missions" }
    }
    const view = await actOnMission(user, input.missionId, { action: input.action })
    return { done: true, missionId: view.id, status: view.status, open: "/app/agents?tab=missions" }
  },
})

export const MISSION_TOOLS = [proposeMissionTool, listMissionsTool, manageMissionTool] as const
