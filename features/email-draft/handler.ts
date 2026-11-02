import type { DraftKind } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { generateForRun, type ModelDeps } from "@/features/ai/calls"
import { RetryableError, type HandlerContext } from "@/features/ai/handlers"
import { recordStep, type RunContext } from "@/features/ai/runs"
import { workflowInstructions } from "@/features/ai/runtime"
import { bookingLink } from "@/features/meetings/emails"
import { emailAngleSchema } from "@/features/offer-pitch/schemas"
import { BODY_MAX, SUBJECT_MAX } from "@/features/outreach/footer"
import { templateErrors, templateValues } from "@/features/outreach/template"
import { keepEvidenced } from "@/features/prospect-audit/analysis"
import { latestFor } from "@/features/prospect-audit/latest"
import { auditReportSchema, type Evidence } from "@/features/prospect-audit/schemas"
import { playbookFor } from "@/features/prospect-audit/sectors"
import { answerSubject, hasBracketPlaceholder, withBookingLine } from "./edits"
import { firstEmailPrompt, replyPrompt, stepPrompt } from "./prompts"
import { firstEmailSchema, replyDraftSchema, stepDraftRequestSchema, stepDraftSchema } from "./schemas"

/**
 * The Rédacteur outreach in the worker (E22, docs/crm-v1/AGENTS-IA.md §15): a first email from the audit, an answer to
 * a reply, or a sequence step. One model call without tools, then the code keeps what is sourced and says what the
 * person must check. A draft is never sent by itself. Safe to run again: a draft saved for the run is returned.
 */
export const DRAFT_KINDS = ["first_email", "reply", "sequence_step"] as const
export type DraftRequestKind = (typeof DRAFT_KINDS)[number]

/** Room for the answer: Sonnet reasons first (about 1 000 tokens), then writes a short email. */
export const DRAFT_OUTPUT_TOKENS = 3_000

const field = (input: unknown, name: string) => (input && typeof input === "object" ? (input as Record<string, unknown>)[name] : undefined)
const kindOf = (input: unknown): DraftRequestKind | null => {
  const kind = field(input, "kind")
  return typeof kind === "string" && (DRAFT_KINDS as readonly string[]).includes(kind) ? (kind as DraftRequestKind) : null
}
const idOf = (input: unknown, name: string) => {
  const id = field(input, name)
  return typeof id === "string" && id.length <= 40 ? id : null
}

const clean = (text: string) => text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

/** What the person must check in any draft: a passage left in brackets, a link, a length far from the skill's. */
function checks(body: string, words: [number, number]): string[] {
  const notes: string[] = []
  if (hasBracketPlaceholder(body)) notes.push("Un passage entre crochets reste à compléter.")
  if (/https?:\/\/|www\./i.test(body.replace(/Choisissez le créneau qui vous convient : \S+$/, ""))) notes.push("Le brouillon contient un lien : vérifiez-le ou retirez-le.")
  // A few words either side are fine: only a message clearly too short or too long is worth a word.
  const n = wordCount(body)
  if (n < words[0] * 0.8 || n > words[1] * 1.3) notes.push(`Le message fait ${n} mots : visez ${words[0]} à ${words[1]}.`)
  return notes
}

async function roleOf(runtime: Awaited<ReturnType<typeof workflowInstructions>>) {
  return runtime.agent.modelRole === "decision" ? ("writer" as const) : runtime.agent.modelRole
}

async function save(ctx: RunContext, kind: DraftKind, data: { leadId?: string | null; replyToId?: string | null; auditId?: string | null; subject: string; body: string; facts?: unknown; notes: string[]; model: string }) {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id }, select: { costMicros: true } })
  const draft = await prisma.emailDraft.create({
    data: {
      workspaceId: ctx.workspaceId,
      kind,
      leadId: data.leadId ?? null,
      replyToId: data.replyToId ?? null,
      auditId: data.auditId ?? null,
      runId: ctx.id,
      subject: data.subject.slice(0, SUBJECT_MAX),
      body: data.body.slice(0, BODY_MAX),
      facts: (data.facts ?? []) as object,
      notes: data.notes,
      model: data.model,
      costMicros: run.costMicros,
      createdById: ctx.requester?.id ?? null,
    },
    select: { id: true },
  })
  await recordStep(ctx, { type: "TOOL", name: "save_draft", input: { kind }, output: { draftId: draft.id, notes: data.notes } })
  return draft.id
}

async function firstEmail(job: HandlerContext, deps: ModelDeps): Promise<string> {
  const ctx = job.run
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.leadId ?? "", workspaceId: ctx.workspaceId },
    select: { id: true, company: { select: { name: true, sector: true, city: true, domain: true, website: true } }, contact: { select: { name: true } } },
  })
  if (!lead?.company) throw new LeadError("not_found", "Fiche introuvable", 404)
  const wanted = idOf(job.input, "auditId")
  const audit = (wanted ? await prisma.prospectAudit.findFirst({ where: { id: wanted, workspaceId: ctx.workspaceId } }) : null) ?? (await latestFor(ctx.workspaceId, lead))
  if (!audit) throw new LeadError("conflict", "La fiche n’a plus d’audit : relancez l’audit avant le brouillon.", 409)
  const parsed = auditReportSchema.safeParse(audit.report)
  if (!parsed.success) throw new LeadError("conflict", "Le rapport de l’audit est illisible : relancez l’audit.", 409)
  const report = parsed.data
  const pitch = await prisma.offerPitch.findFirst({
    where: { leadId: lead.id, auditId: audit.id },
    orderBy: { createdAt: "desc" },
    select: { headline: true, emailAngle: true, recommendations: { where: { role: "MAIN" }, select: { offerName: true }, take: 1 } },
  })
  const angle = pitch ? emailAngleSchema.safeParse(pitch.emailAngle) : null
  await recordStep(ctx, { type: "TOOL", name: "get_audit", input: { auditId: audit.id }, output: { findings: report.findings.length, evidence: report.evidence.length, pitch: !!pitch } })

  const contactFirstName = templateValues({ contactName: lead.contact?.name }).prenom ?? null
  const runtime = await workflowInstructions(ctx, [playbookFor(lead.company.sector)].filter((s): s is string => !!s))
  const { output, model } = await generateForRun(
    ctx,
    {
      role: await roleOf(runtime),
      name: "draft_email",
      system: runtime.system,
      prompt: firstEmailPrompt({
        company: { name: lead.company.name, sector: lead.company.sector, city: lead.company.city },
        contactFirstName,
        audit: { domain: audit.domain, summary: audit.summary, findings: report.findings, evidence: report.evidence },
        pitch: pitch && { headline: pitch.headline, mainOffer: pitch.recommendations[0]?.offerName ?? null, subject: angle?.success ? angle.data.subject : null, angle: angle?.success ? angle.data.angle : null },
      }),
      schema: firstEmailSchema,
      maxOutputTokens: DRAFT_OUTPUT_TOKENS,
      abortSignal: job.signal,
    },
    deps
  )
  if (!output) throw new RetryableError("Le Rédacteur n’a pas rendu de brouillon lisible.")
  const known = new Map(report.evidence.map((e) => [e.id, e]))
  const facts = keepEvidenced(output.facts, new Set(known.keys())).map((f) => ({ text: clean(f.text), evidence: f.evidence.map((id) => known.get(id)!) satisfies Evidence[] }))
  const body = clean(output.body)
  const notes = checks(body, [60, 120])
  if (!facts.length) notes.unshift("Aucun fait du brouillon ne cite une preuve de l’audit : vérifiez chaque affirmation avant d’envoyer.")
  return save(ctx, "FIRST_EMAIL", { leadId: lead.id, auditId: audit.id, subject: clean(output.subject), body, facts, notes, model })
}

/** The booking page of the person answering, else the fiche's owner's: a link only when the page is open. */
async function bookingFor(workspaceId: string, people: (string | null | undefined)[]): Promise<string | null> {
  for (const hostId of people) {
    if (!hostId) continue
    const profile = await prisma.bookingProfile.findFirst({ where: { workspaceId, hostId, enabled: true }, select: { slug: true } })
    if (profile) return bookingLink(profile.slug)
  }
  return null
}

async function reply(job: HandlerContext, deps: ModelDeps): Promise<string> {
  const ctx = job.run
  const replyId = idOf(job.input, "replyId")
  const received = replyId ? await prisma.emailMessage.findFirst({ where: { id: replyId, workspaceId: ctx.workspaceId, direction: "INBOUND" }, select: { id: true, subject: true, bodyText: true, fromEmail: true, repliesToId: true, leadId: true } }) : null
  if (!received) throw new LeadError("not_found", "Réponse introuvable", 404)
  const [sent, lead] = await Promise.all([
    received.repliesToId ? prisma.emailMessage.findUnique({ where: { id: received.repliesToId }, select: { subject: true, bodyText: true } }) : null,
    received.leadId ? prisma.lead.findFirst({ where: { id: received.leadId, workspaceId: ctx.workspaceId }, select: { id: true, ownerId: true, company: { select: { name: true, sector: true, city: true, domain: true, website: true } }, contact: { select: { name: true } } } }) : null,
  ])
  const audit = lead ? await latestFor(ctx.workspaceId, lead) : null
  const link = await bookingFor(ctx.workspaceId, [ctx.requester?.id, lead?.ownerId])
  await recordStep(ctx, { type: "TOOL", name: "get_thread", input: { replyId: received.id }, output: { sent: !!sent, audit: !!audit, booking: !!link } })

  const runtime = await workflowInstructions(ctx, [playbookFor(lead?.company?.sector)].filter((s): s is string => !!s))
  const { output, model } = await generateForRun(
    ctx,
    {
      role: await roleOf(runtime),
      name: "draft_reply",
      system: runtime.system,
      prompt: replyPrompt({
        company: { name: lead?.company?.name ?? "l’entreprise", sector: lead?.company?.sector ?? null, city: lead?.company?.city ?? null },
        contactFirstName: templateValues({ contactName: lead?.contact?.name }).prenom ?? null,
        sent: sent && { subject: sent.subject, body: sent.bodyText },
        reply: { subject: received.subject, body: received.bodyText, from: received.fromEmail },
        auditSummary: audit?.summary ?? [],
        booking: !!link,
      }),
      schema: replyDraftSchema,
      maxOutputTokens: DRAFT_OUTPUT_TOKENS,
      abortSignal: job.signal,
    },
    deps
  )
  if (!output) throw new RetryableError("Le Rédacteur n’a pas rendu de réponse lisible.")
  const body = withBookingLine(clean(output.body), link)
  const notes = checks(body, [40, 100])
  if (!link) notes.push("Aucune page de réservation active : la réponse demande le créneau qui convient. Activez la vôtre dans Disponibilités pour y joindre le lien.")
  return save(ctx, "REPLY", { leadId: received.leadId, replyToId: received.id, subject: answerSubject(received.subject), body, notes, model })
}

async function step(job: HandlerContext, deps: ModelDeps): Promise<string> {
  const ctx = job.run
  const { kind: _kind, ...rest } = (job.input ?? {}) as Record<string, unknown>
  const request = stepDraftRequestSchema.safeParse(rest)
  if (!request.success) throw new LeadError("invalid", "Étape de séquence illisible.", 400)
  const runtime = await workflowInstructions(ctx, ["offres-cleads"])
  const { output, model } = await generateForRun(
    ctx,
    { role: await roleOf(runtime), name: "draft_step", system: runtime.system, prompt: stepPrompt(request.data), schema: stepDraftSchema, maxOutputTokens: DRAFT_OUTPUT_TOKENS, abortSignal: job.signal },
    deps
  )
  if (!output) throw new RetryableError("Le Rédacteur n’a pas rendu d’étape lisible.")
  const subject = clean(output.subject)
  const body = clean(output.body)
  const notes = [...checks(body, request.data.position === 1 ? [60, 120] : [40, 80]), ...templateErrors(`${subject}\n${body}`)]
  if (request.data.position === 1 && subject.length < 2) notes.push("Le premier message a besoin d’un objet.")
  return save(ctx, "SEQUENCE_STEP", { subject, body, notes, model })
}

export async function runWriter(job: HandlerContext, deps: ModelDeps = {}): Promise<{ output: { draftId: string } }> {
  const saved = await prisma.emailDraft.findUnique({ where: { runId: job.run.id }, select: { id: true } })
  if (saved) return { output: { draftId: saved.id } }
  const kind = kindOf(job.input)
  if (kind === "first_email") return { output: { draftId: await firstEmail(job, deps) } }
  if (kind === "reply") return { output: { draftId: await reply(job, deps) } }
  if (kind === "sequence_step") return { output: { draftId: await step(job, deps) } }
  throw new LeadError("invalid", "Brouillon inconnu : premier email, réponse ou étape de séquence.", 400)
}
