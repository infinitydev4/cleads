import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { enrollLeads, listEnrollments, setSequenceStatus, stopEnrollment } from "@/features/outreach/sequences"
import { usableMailboxes } from "@/features/outreach/mailboxes"
import { actOnMeeting, bookMeeting } from "@/features/meetings/service"
import { LOST_REASONS } from "@/features/pipeline/rules"
import { MEETING_TYPES, MEETING_TYPE_LABELS, OUTCOMES, OUTCOME_LABELS } from "@/features/meetings/rules"
import type { CurrentUser } from "@/lib/auth/guard"
import { defineTool } from "@/features/ai/tools"
import { clip, dayKey, formatMoment, idOf, leadId, leadIds, personOf, plural, targetsOf, visibleName } from "./shared"

/**
 * Sequences and meetings (E28, family "outreach"). What contacts a prospect (an enrolment, a meeting invitation, its
 * change) always waits for its own click, with the recipients in words (D28, D29); stopping or recording an outcome
 * waits for a click like any internal change.
 */

/** The sending mailbox: the one asked for, or the person's first active one. */
async function mailboxFor(user: CurrentUser, id?: string) {
  const boxes = (await usableMailboxes(user)).filter((b) => b.status === "ACTIVE")
  const box = id ? boxes.find((b) => b.id === id) : boxes[0]
  if (!box) throw new LeadError("conflict", id ? "Cette boîte d'envoi n'est pas utilisable par cette personne." : "Aucune boîte d'envoi active pour cette personne : elle se règle dans Réglages › Emails.", 409)
  return box
}

async function sequenceOf(user: CurrentUser, id: string) {
  const seq = await prisma.sequence.findFirst({ where: { id, workspaceId: user.workspaceId, archivedAt: null }, select: { name: true, status: true, _count: { select: { steps: true } } } })
  if (!seq) throw new LeadError("not_found", "Séquence introuvable : retrouve son sequenceId avec list_sequences.", 404)
  return seq
}

export const enrollInSequenceTool = defineTool({
  name: "enroll_in_sequence",
  description:
    "Inscrit des fiches (100 au plus, statut Nouveau ou Contacté) dans une séquence active (sequenceId) : ses emails partiront automatiquement depuis la boîte d'envoi de la personne. Les fiches sans email, exclues ou déjà en séquence sont écartées et listées.",
  permission: "sequence:manage",
  approval: "user",
  costClass: "external",
  family: "outreach",
  input: z.object({ sequenceId: idOf("de la séquence"), leadIds: leadIds(100), mailboxId: z.string().min(1).max(64).optional().describe("Boîte d'envoi ; la première boîte active de la personne par défaut") }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const seq = await sequenceOf(user, input.sequenceId)
    if (seq.status !== "ACTIVE") throw new LeadError("conflict", "Cette séquence est en pause : il faut la reprendre avant d'y inscrire des fiches.", 409)
    const box = await mailboxFor(user, input.mailboxId)
    return `Inscrire dans la séquence « ${seq.name} » (${plural(seq._count.steps, "email", "emails")}) ${(await targetsOf(user, input.leadIds)).text}. Les emails partiront depuis ${box.address}, sans autre validation.`
  },
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const box = await mailboxFor(user, input.mailboxId)
    const r = await enrollLeads(user, input.sequenceId, { leadIds: input.leadIds, mailboxId: box.id })
    return { done: true, enrolled: r.enrolled, skipped: r.skipped.slice(0, 10).map((s) => ({ leadId: s.leadId, name: s.name, reason: s.reason })), skippedCount: r.skipped.length }
  },
})

export const stopEnrollmentTool = defineTool({
  name: "stop_enrollment",
  description: "Arrête la séquence en cours d'une fiche : plus aucun email de cette séquence ne part vers elle.",
  permission: "sequence:manage",
  approval: "user",
  costClass: "free",
  family: "outreach",
  input: z.object({ leadId }),
  summarize: async (input, ctx) => `Arrêter la séquence en cours de ${await visibleName(personOf(ctx), input.leadId)}.`,
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const active = (await listEnrollments(user, { leadId: input.leadId })).find((e) => e.status === "ACTIVE")
    if (!active) return { done: false, note: "Cette fiche n'est dans aucune séquence en cours." }
    await stopEnrollment(user, active.id)
    return { done: true, leadId: input.leadId, step: `${active.currentStep}/${active.totalSteps}` }
  },
})

export const pauseSequenceTool = defineTool({
  name: "pause_sequence",
  description: "Met une séquence en pause (sequenceId) : plus aucun email n'en part tant qu'elle n'est pas reprise.",
  permission: "sequence:manage",
  approval: "user",
  costClass: "free",
  family: "outreach",
  input: z.object({ sequenceId: idOf("de la séquence") }),
  summarize: async (input, ctx) => `Mettre en pause la séquence « ${(await sequenceOf(personOf(ctx), input.sequenceId)).name} » : plus aucun email n'en part.`,
  execute: async (ctx, input) => {
    await setSequenceStatus(personOf(ctx), input.sequenceId, "PAUSED")
    return { done: true, sequenceId: input.sequenceId, status: "en pause" }
  },
})

export const resumeSequenceTool = defineTool({
  name: "resume_sequence",
  description: "Reprend une séquence en pause (sequenceId) : ses envois reprennent vers les fiches inscrites.",
  permission: "sequence:manage",
  approval: "user",
  costClass: "external",
  family: "outreach",
  input: z.object({ sequenceId: idOf("de la séquence") }),
  summarize: async (input, ctx) => `Reprendre la séquence « ${(await sequenceOf(personOf(ctx), input.sequenceId)).name} » : ses envois reprennent vers les fiches inscrites.`,
  execute: async (ctx, input) => {
    await setSequenceStatus(personOf(ctx), input.sequenceId, "ACTIVE")
    return { done: true, sequenceId: input.sequenceId, status: "active" }
  },
})

async function hostName(user: CurrentUser, hostId: string) {
  const u = await prisma.user.findFirst({ where: { id: hostId, workspaceId: user.workspaceId, active: true }, select: { name: true, email: true } })
  if (!u) throw new LeadError("not_found", "Hôte introuvable : retrouve son hostId avec list_slots.", 404)
  return u.name ?? u.email ?? "l'hôte"
}

export const bookMeetingTool = defineTool({
  name: "book_meeting",
  description:
    "Planifie un rendez-vous avec le prospect d'une fiche, sur un créneau libre de l'hôte (lu avec list_slots), et lui envoie l'invitation (notifyGuest, vrai par défaut). Type : DISCOVERY (découverte), DEMO, FOLLOW_UP.",
  permission: "meeting:book",
  approval: "user",
  costClass: "external",
  family: "outreach",
  input: z.object({ leadId, hostId: z.string().min(1).max(64), startsAt: z.iso.datetime().describe("Début, en ISO 8601 (un créneau rendu par list_slots)"), type: z.enum(MEETING_TYPES).optional(), notes: z.string().trim().max(2_000).optional(), notifyGuest: z.boolean().optional() }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const [name, host] = await Promise.all([visibleName(user, input.leadId), hostName(user, input.hostId)])
    return `Planifier un rendez-vous ${MEETING_TYPE_LABELS[input.type ?? "DISCOVERY"].toLowerCase()} avec ${name}, ${formatMoment(input.startsAt)}, avec ${host}${input.notifyGuest === false ? " (sans invitation au prospect)" : " ; l'invitation part au prospect"}.`
  },
  execute: async (ctx, input) => {
    const m = await bookMeeting(personOf(ctx), { leadId: input.leadId, hostId: input.hostId, startsAt: input.startsAt, type: input.type ?? "DISCOVERY", notes: input.notes, notifyGuest: input.notifyGuest ?? true })
    return { done: true, meetingId: m.id, leadId: input.leadId, startsAt: m.startsAt, open: "/app/meetings" }
  },
})

async function meetingOf(user: CurrentUser, id: string) {
  const m = await prisma.meeting.findFirst({ where: { id, workspaceId: user.workspaceId }, select: { leadId: true, startsAt: true } })
  if (!m?.leadId) throw new LeadError("not_found", "Rendez-vous introuvable : retrouve son meetingId avec list_meetings.", 404)
  return { name: await visibleName(user, m.leadId), startsAt: m.startsAt.toISOString(), leadId: m.leadId }
}

export const changeMeetingTool = defineTool({
  name: "change_meeting",
  description: "Confirme, reporte (nouvelle heure) ou annule un rendez-vous (meetingId) ; le prospect en est prévenu par email.",
  permission: "meeting:book",
  approval: "user",
  costClass: "external",
  family: "outreach",
  input: z.object({ meetingId: idOf("du rendez-vous"), action: z.enum(["confirm", "reschedule", "cancel"]), startsAt: z.iso.datetime().optional().describe("Nouvelle heure, pour un report"), reason: z.string().trim().max(300).optional() }),
  summarize: async (input, ctx) => {
    const m = await meetingOf(personOf(ctx), input.meetingId)
    if (input.action === "reschedule" && !input.startsAt) throw new LeadError("invalid", "Un report demande la nouvelle heure (startsAt).", 400)
    const what = input.action === "confirm" ? "Confirmer" : input.action === "cancel" ? "Annuler" : `Reporter au ${formatMoment(input.startsAt!)}`
    return `${what} le rendez-vous avec ${m.name} du ${formatMoment(m.startsAt)}${input.reason ? ` (${clip(input.reason, 120)})` : ""} ; le prospect en est prévenu.`
  },
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const action = input.action === "reschedule" ? { action: "reschedule" as const, startsAt: input.startsAt! } : input.action === "cancel" ? { action: "cancel" as const, reason: input.reason } : { action: "confirm" as const }
    const m = await actOnMeeting(user, input.meetingId, action)
    return { done: true, meetingId: m.id, status: m.status, startsAt: m.startsAt }
  },
})

export const recordMeetingOutcomeTool = defineTool({
  name: "record_meeting_outcome",
  description:
    "Clôture un rendez-vous passé (meetingId) : son résultat (QUALIFIED : on avance, FOLLOW_UP : à relancer, avec un jour de relance, LOST : perdu, avec une raison) et un compte rendu, ou « no_show » si le prospect n'est pas venu.",
  permission: "meeting:outcome",
  approval: "user",
  costClass: "free",
  family: "outreach",
  input: z.object({
    meetingId: idOf("du rendez-vous"),
    outcome: z.enum([...OUTCOMES, "NO_SHOW"]),
    notes: z.string().trim().max(2_000).optional(),
    lostReason: z.enum(LOST_REASONS).optional(),
    followUpDay: dayKey.optional(),
  }),
  summarize: async (input, ctx) => {
    const m = await meetingOf(personOf(ctx), input.meetingId)
    const outcome = input.outcome === "NO_SHOW" ? "le prospect n'est pas venu" : OUTCOME_LABELS[input.outcome]
    return `Clôturer le rendez-vous avec ${m.name} du ${formatMoment(m.startsAt)} : ${outcome}${input.lostReason ? ` (${input.lostReason})` : ""}.`
  },
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const m =
      input.outcome === "NO_SHOW"
        ? await actOnMeeting(user, input.meetingId, { action: "no_show" })
        : await actOnMeeting(user, input.meetingId, { action: "complete", outcome: input.outcome, notes: input.notes, lostReason: input.lostReason, followUpDay: input.followUpDay })
    return { done: true, meetingId: m.id, status: m.status }
  },
})

export const OUTREACH_ACTIONS = [enrollInSequenceTool, stopEnrollmentTool, pauseSequenceTool, resumeSequenceTool, bookMeetingTool, changeMeetingTool, recordMeetingOutcomeTool] as const
