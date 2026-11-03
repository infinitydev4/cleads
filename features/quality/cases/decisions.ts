import type { RelevanceVerdict, ReplyClass, ReplyUrgency } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { outcomeOf } from "@/lib/ai/decide"
import { ROLES } from "@/lib/ai/models"
import { UNTRUSTED_RULE } from "@/lib/ai/untrusted"
import { CAMPAIGNS, FICHES } from "@/evals/fiches"
import { REPLIES } from "@/evals/replies"
import { decideForRun, generateForRun } from "@/features/ai/calls"
import type { RunContext } from "@/features/ai/runs"
import { LeadError } from "@/features/leads/errors"
import { RELEVANCE_CRITERIA, RELEVANCE_QUESTIONS, VERDICTS, relevanceFields, relevanceState, type CampaignTarget, type FicheFacts } from "@/features/relevance/rules"
import { REPLY_CRITERIA, TRIAGE_QUESTIONS, URGENCY_CRITERIA, triageFields, triageState } from "@/features/reply-triage/rules"
import { RULES } from "../labels"
import { relevanceRules, replyRules } from "../baselines"
import { TEAM_PREFIX } from "../team"
import type { CaseResult, CaseRunner, SuiteEnv } from "./env"

/**
 * The two decision suites (E27): the Analyste réponses and the Analyste qualification, on the reference set or on the
 * cases the team labelled in the CRM (`team:<id>`). Three kinds of contenders answer the same question:
 * - a decision model (Jev and its peers), through the real call of the agent, with its probabilities;
 * - a language model asked the same question in words, which states its own confidence;
 * - the coded rules (« règles »), without any model.
 * Every answer goes through the same thresholds (lib/ai/decide.ts): « traité au-dessus du seuil » means offered in one click.
 */
export const REPLIES_CASES = REPLIES.map((r) => r.id)
export const FICHES_CASES = FICHES.map((f) => f.id)

const REPLY_KEYS = Object.keys(REPLY_CRITERIA) as ReplyClass[]
const URGENCY_KEYS = Object.keys(URGENCY_CRITERIA) as ReplyUrgency[]
const OUTCOME = { AUTO: "auto", REVIEW: "review", HUMAN: "human" } as const

/** How a contender answers: decision models are those the decision role may use; any other model reads the question. */
export const isDecisionModel = (id: string) => ROLES.decision.choices.includes(id)

function contenderCtx(env: SuiteEnv, contender: string): RunContext {
  return { ...env.ctx, evaluation: { models: isDecisionModel(contender) ? { decision: contender } : { fast: contender } } }
}

/** A language model asked the same question has room to think first: its reasoning counts against this limit. */
const READ_OUTPUT_TOKENS = 1_500
const criteria = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `- ${k} : ${v}`).join("\n")
const confidenceField = z.number().describe("Ta certitude sur cette réponse, de 0 (au hasard) à 1 (certain)")

interface Answer<T extends string> {
  value: T | null
  confidence: number | null
  outcome: "auto" | "review" | "human"
  costMicros: number
}

// ── Analyste réponses ──────────────────────────────────────────────────────────────────────────────────────────────

interface ReplyCase {
  reply: { subject: string; bodyText: string; fromEmail: string }
  sentSubject: string | null
  expected: { value: ReplyClass; urgency: ReplyUrgency | null; action: boolean | null }
  trap?: string
}

async function replyCase(env: SuiteEnv, caseId: string): Promise<ReplyCase> {
  if (!caseId.startsWith(TEAM_PREFIX)) {
    const r = REPLIES.find((x) => x.id === caseId)
    if (!r) throw new Error(`Réponse de référence inconnue : ${caseId}`)
    return { reply: { subject: r.subject, bodyText: r.body, fromEmail: "contact@exemple.test" }, sentSubject: r.sentSubject, expected: { value: r.label.reply, urgency: r.label.urgency, action: r.label.action }, trap: r.trap }
  }
  const m = await prisma.emailMessage.findFirst({
    where: { id: caseId.slice(TEAM_PREFIX.length), workspaceId: env.ctx.workspaceId, direction: "INBOUND", isTest: false },
    select: { subject: true, bodyText: true, fromEmail: true, replyClass: true, repliesToId: true },
  })
  if (!m?.replyClass) throw new LeadError("not_found", "Cette réponse a été supprimée ou déclassée depuis le lancement.", 404)
  const sent = m.repliesToId ? await prisma.emailMessage.findUnique({ where: { id: m.repliesToId }, select: { subject: true } }) : null
  return { reply: m, sentSubject: sent?.subject ?? null, expected: { value: m.replyClass, urgency: null, action: null } }
}

const replyReadSchema = z.object({ reply: z.enum(REPLY_KEYS as [ReplyClass, ...ReplyClass[]]), confidence: confidenceField, urgency: z.enum(URGENCY_KEYS as [ReplyUrgency, ...ReplyUrgency[]]), action: z.boolean() })

export const repliesCase: CaseRunner = async (env, contender, caseId) => {
  const c = await replyCase(env, caseId)
  const state = triageState(c.reply, c.sentSubject)
  let answer: Answer<ReplyClass> & { urgency: ReplyUrgency | null; action: boolean | null }
  if (contender === RULES) {
    const r = replyRules({ subject: c.reply.subject, body: c.reply.bodyText })
    answer = { value: r.reply, confidence: r.confidence, outcome: outcomeOf(r.confidence), urgency: r.urgency, action: r.action, costMicros: 0 }
  } else if (isDecisionModel(contender)) {
    try {
      // The reply's text stays in the mailbox: the run's history keeps only which case was read.
      const { answers, costMicros } = await decideForRun(contenderCtx(env, contender), { name: "classify_reply", state, stateForLog: `Cas ${caseId}`, questions: TRIAGE_QUESTIONS, abortSignal: env.signal }, env.deps)
      const f = triageFields(answers)
      answer = { value: f.replyClass, confidence: f.classConfidence, outcome: OUTCOME[f.outcome], urgency: f.urgency, action: f.needsAction, costMicros }
    } catch (error) {
      if (!(error instanceof LeadError && error.extra?.refusal)) throw error
      answer = { value: null, confidence: null, outcome: "human", urgency: null, action: null, costMicros: 0 }
    }
  } else {
    const { output, costMicros } = await generateForRun(
      contenderCtx(env, contender),
      {
        role: "fast",
        name: "classify_reply",
        system: ["Tu classes les réponses reçues après un email de prospection B2B. Une demande de ne plus être contacté l'emporte toujours sur le reste.", UNTRUSTED_RULE].join("\n\n"),
        prompt: [state, `Classes :\n${criteria(REPLY_CRITERIA)}`, `Urgences :\n${criteria(URGENCY_CRITERIA)}`, `action : ${TRIAGE_QUESTIONS.action.instructions}`, "Donne la classe, ta certitude sur cette classe, l'urgence et l'action."].join("\n\n"),
        schema: replyReadSchema,
        maxOutputTokens: READ_OUTPUT_TOKENS,
        abortSignal: env.signal,
      },
      env.deps
    )
    if (!output) throw new Error("Pas de réponse lisible.")
    const confidence = Math.max(0, Math.min(1, output.confidence))
    answer = { value: output.reply, confidence, outcome: outcomeOf(confidence), urgency: output.urgency, action: output.action, costMicros }
  }
  return decided(c.expected.value, answer, { expected: c.expected, predicted: { value: answer.value, urgency: answer.urgency, action: answer.action }, ...(c.trap ? { trap: c.trap } : {}) })
}

// ── Analyste qualification ─────────────────────────────────────────────────────────────────────────────────────────

interface FicheCase {
  target: CampaignTarget
  fiche: FicheFacts
  expected: RelevanceVerdict
  campaign: string
  trap?: string
}

async function ficheCase(env: SuiteEnv, caseId: string): Promise<FicheCase> {
  if (!caseId.startsWith(TEAM_PREFIX)) {
    const f = FICHES.find((x) => x.id === caseId)
    if (!f) throw new Error(`Fiche de référence inconnue : ${caseId}`)
    return { target: CAMPAIGNS[f.campaign], fiche: { company: f.company }, expected: f.label, campaign: CAMPAIGNS[f.campaign].name, trap: f.trap }
  }
  const r = await prisma.leadRelevance.findFirst({
    where: { id: caseId.slice(TEAM_PREFIX.length), workspaceId: env.ctx.workspaceId, decision: { not: null } },
    select: {
      decision: true,
      campaign: { select: { name: true, sector: true, area: true, offer: { select: { name: true, summary: true, signals: true } } } },
      lead: { select: { company: { select: { name: true, sector: true, city: true, postalCode: true, website: true, rating: true, reviewCount: true, phone: true, email: true } } } },
    },
  })
  if (!r?.decision) throw new LeadError("not_found", "Cette fiche a été supprimée ou son jugement retiré depuis le lancement.", 404)
  const c = r.lead.company
  return {
    target: { name: r.campaign.name, sector: r.campaign.sector, area: r.campaign.area, offer: r.campaign.offer },
    fiche: { company: c && { name: c.name, sector: c.sector, city: c.city, postalCode: c.postalCode, website: c.website, rating: c.rating, reviewCount: c.reviewCount, hasPhone: !!c.phone, hasEmail: !!c.email } },
    expected: r.decision,
    campaign: r.campaign.name,
  }
}

const ficheReadSchema = z.object({ verdict: z.enum(VERDICTS), confidence: confidenceField })

export const qualifierCase: CaseRunner = async (env, contender, caseId) => {
  const c = await ficheCase(env, caseId)
  const state = relevanceState(c.target, c.fiche)
  let answer: Answer<RelevanceVerdict>
  if (contender === RULES) {
    const r = relevanceRules(c.target, c.fiche)
    answer = { value: r.verdict, confidence: r.confidence, outcome: outcomeOf(r.confidence), costMicros: 0 }
  } else if (isDecisionModel(contender)) {
    try {
      const { answers, costMicros } = await decideForRun(contenderCtx(env, contender), { name: "score_import", state, stateForLog: `Cas ${caseId}`, questions: RELEVANCE_QUESTIONS, abortSignal: env.signal }, env.deps)
      const f = relevanceFields(answers.relevance)
      answer = { value: f.verdict, confidence: f.confidence, outcome: OUTCOME[f.outcome], costMicros }
    } catch (error) {
      if (!(error instanceof LeadError && error.extra?.refusal)) throw error
      answer = { value: null, confidence: null, outcome: "human", costMicros: 0 }
    }
  } else {
    const { output, costMicros } = await generateForRun(
      contenderCtx(env, contender),
      {
        role: "fast",
        name: "score_import",
        system: ["Tu juges si une entreprise importée est une bonne cible pour une campagne de prospection et son offre.", UNTRUSTED_RULE].join("\n\n"),
        // The state already fences what comes from outside (the business's name).
        prompt: [state, `${RELEVANCE_QUESTIONS.relevance.instructions}\n${criteria(RELEVANCE_CRITERIA)}`, "Donne ton verdict et ta certitude."].join("\n\n"),
        schema: ficheReadSchema,
        maxOutputTokens: READ_OUTPUT_TOKENS,
        abortSignal: env.signal,
      },
      env.deps
    )
    if (!output) throw new Error("Pas de réponse lisible.")
    const confidence = Math.max(0, Math.min(1, output.confidence))
    answer = { value: output.verdict, confidence, outcome: outcomeOf(confidence), costMicros }
  }
  return decided(c.expected, answer, { expected: { value: c.expected }, predicted: { value: answer.value }, campaign: c.campaign, ...(c.trap ? { trap: c.trap } : {}) })
}

function decided<T extends string>(expected: T, answer: Answer<T>, detail: Record<string, unknown>): CaseResult {
  const right = answer.value === expected
  return { ok: right, score: right ? 1 : 0, detail: { ...detail, confidence: answer.confidence, outcome: answer.outcome }, costMicros: answer.costMicros, judgeMicros: 0 }
}
