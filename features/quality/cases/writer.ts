import { AUDITS, auditById } from "@/evals/audits"
import { generateForRun } from "@/features/ai/calls"
import { workflowInstructions } from "@/features/ai/runtime"
import { DRAFT_OUTPUT_TOKENS } from "@/features/email-draft/handler"
import { hasBracketPlaceholder } from "@/features/email-draft/edits"
import { firstEmailPrompt } from "@/features/email-draft/prompts"
import { firstEmailSchema } from "@/features/email-draft/schemas"
import { keepEvidenced } from "@/features/prospect-audit/analysis"
import { playbookFor } from "@/features/prospect-audit/sectors"
import { gradeEmail } from "../judge"
import { judged, pinned, type CaseRunner } from "./env"

/**
 * The Rédacteur outreach on a reference audit (E27): the real first-email prompt of features/email-draft, then the code
 * checks of the skill cold-email-fr and the judge's grid. The grade weighs the judge (60 %) and the rules (40 %).
 */
export const WRITER_CASES = AUDITS.map((a) => a.id)

const clean = (text: string) => text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/** What code can check in a first email: the skill's rules, each named for the results. */
export function emailChecks(subject: string, body: string, factsKept: number): { name: string; ok: boolean }[] {
  const n = words(body)
  return [
    { name: "60 à 120 mots", ok: n >= 55 && n <= 130 },
    { name: "Objet de moins de 50 caractères", ok: subject.length > 0 && subject.length < 50 },
    { name: "Commence par « Bonjour »", ok: /^bonjour\b/i.test(body) },
    { name: "Une seule question", ok: (body.match(/\?/g) ?? []).length <= 1 },
    { name: "Aucun lien", ok: !/https?:\/\/|www\./i.test(body) },
    { name: "Ni prix ni promesse chiffrée", ok: !/\d\s?(€|euros?|%)|\bx\s?\d|\bfois plus\b/i.test(body) },
    { name: "Rien à compléter entre crochets", ok: !hasBracketPlaceholder(`${subject}\n${body}`) },
    { name: "Ni signature ni désinscription", ok: !/d[ée]sinscri|unsubscribe|^--\s*$/im.test(body) },
    { name: "Au moins un fait sourcé", ok: factsKept > 0 },
  ]
}

export const writerCase: CaseRunner = async (env, contender, caseId) => {
  const ref = auditById(caseId)
  if (!ref) throw new Error(`Audit de référence inconnu : ${caseId}`)
  const ctx = pinned(env, contender)
  const runtime = await workflowInstructions(ctx, [playbookFor(ref.company.sector)].filter((s): s is string => !!s))
  const role = runtime.agent.modelRole === "decision" ? "writer" : runtime.agent.modelRole
  const { output, costMicros } = await generateForRun(
    ctx,
    {
      role,
      name: "draft_email",
      system: runtime.system,
      prompt: firstEmailPrompt({
        company: ref.company,
        contactFirstName: ref.contactFirstName,
        audit: { domain: ref.audit.domain, summary: ref.audit.summary, findings: ref.audit.report.findings, evidence: ref.audit.report.evidence },
        pitch: null,
      }),
      schema: firstEmailSchema,
      maxOutputTokens: DRAFT_OUTPUT_TOKENS,
      abortSignal: env.signal,
    },
    env.deps
  )
  if (!output) throw new Error("Le Rédacteur n’a pas rendu de brouillon lisible.")
  const subject = clean(output.subject)
  const body = clean(output.body)
  const kept = keepEvidenced(output.facts, new Set(ref.audit.report.evidence.map((e) => e.id)))
  const checks = emailChecks(subject, body, kept.length)
  const grade = await gradeEmail(judged(env), { company: ref.company.name, report: ref.audit.report, subject, body }, env.deps, env.signal)
  const passed = checks.filter((c) => c.ok).length
  const score = 0.6 * ((grade.average - 1) / 4) + 0.4 * (passed / checks.length)
  return {
    ok: passed === checks.length && grade.average >= 4,
    score,
    detail: {
      subject,
      body,
      words: words(body),
      checks,
      checksPassed: { ok: passed, total: checks.length },
      facts: { kept: kept.length, total: output.facts.length },
      rubric: grade.scores,
      rubricAverage: grade.average,
      comment: grade.comment,
    },
    costMicros,
    judgeMicros: grade.costMicros,
  }
}
