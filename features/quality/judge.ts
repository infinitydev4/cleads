import { z } from "zod"
import { untrusted, UNTRUSTED_RULE } from "@/lib/ai/untrusted"
import { generateForRun, type ModelDeps } from "@/features/ai/calls"
import type { RunContext } from "@/features/ai/runs"
import { AREA_LABELS, SEVERITY_LABELS } from "@/features/prospect-audit/labels"
import type { AuditReport } from "@/features/prospect-audit/schemas"

/**
 * The judge of the Rédacteur's emails (E27, docs/crm-v1/AGENTS-IA.md §20): one model, the same for every contender
 * (labels.ts JUDGE_MODEL), grades a first email against the audit it was written from, on the grid of the skill
 * cold-email-fr. Code checks what code can (length, links, the subject); the judge what needs reading.
 */
export const RUBRIC = {
  personnalisation: "Une observation précise sur cette entreprise, tirée de l'audit ; pas une flatterie qu'on enverrait à n'importe qui.",
  demande_unique: "Une seule demande, simple : un échange de 15 minutes. Pas deux appels à l'action, pas de liste d'offres.",
  faits_exacts: "Tout ce que l'email affirme sur l'entreprise est dans l'audit, sans exagération ni chiffre inventé.",
  ton: "Vouvoiement, direct et respectueux, sans fausse urgence, sans jargon, sans majuscules abusives.",
  orthographe: "Orthographe, grammaire et ponctuation françaises correctes.",
} as const
export type Criterion = keyof typeof RUBRIC
export const CRITERIA = Object.keys(RUBRIC) as Criterion[]

/** Loose on purpose: a grade a little out of range is clipped, never the cause of a lost (paid) answer. */
const gradeSchema = z.object({
  personnalisation: z.number(),
  demande_unique: z.number(),
  faits_exacts: z.number(),
  ton: z.number(),
  orthographe: z.number(),
  commentaire: z.string().describe("Le défaut principal, en une phrase ; vide si aucun"),
})

export const JUDGE_OUTPUT_TOKENS = 1_500

export interface Grade {
  scores: Record<Criterion, number>
  average: number
  comment: string
  costMicros: number
}

const clampGrade = (n: number) => Math.min(5, Math.max(1, Math.round(n)))

export async function gradeEmail(ctx: RunContext, input: { company: string; report: Pick<AuditReport, "evidence" | "findings">; subject: string; body: string }, deps: ModelDeps = {}, signal?: AbortSignal): Promise<Grade> {
  const audit = [
    `Preuves :\n${input.report.evidence.map((e) => `- ${e.id} : ${e.label}${e.value ? ` — ${e.value}` : ""}`).join("\n")}`,
    `Constats :\n${input.report.findings.map((f) => `- [${SEVERITY_LABELS[f.severity]}] ${AREA_LABELS[f.area]} — ${f.title} : ${f.detail}`).join("\n")}`,
  ].join("\n\n")
  const { output, costMicros } = await generateForRun(
    ctx,
    {
      role: "writer",
      name: "judge_email",
      system: [
        "Tu es directeur commercial et tu relis les premiers emails de prospection de ton équipe avant envoi. Tu notes sans complaisance : 5 = irréprochable, 4 = bon, 3 = moyen, 2 = faible, 1 = à refaire.",
        UNTRUSTED_RULE,
      ].join("\n\n"),
      prompt: [
        `Audit de ${input.company}, la seule source des faits :\n${untrusted(audit, { source: "audit de référence", maxChars: 8_000 })}`,
        `Email à noter :\n${untrusted(`Objet : ${input.subject}\n\n${input.body}`, { source: "email rédigé par l'IA", maxChars: 4_000 })}`,
        `Note chaque critère de 1 à 5 :\n${CRITERIA.map((c) => `- ${c} : ${RUBRIC[c]}`).join("\n")}`,
      ].join("\n\n"),
      schema: gradeSchema,
      maxOutputTokens: JUDGE_OUTPUT_TOKENS,
      abortSignal: signal,
    },
    deps
  )
  if (!output) throw new Error("Le juge n’a pas rendu de note lisible.")
  const scores = Object.fromEntries(CRITERIA.map((c) => [c, clampGrade(output[c])])) as Record<Criterion, number>
  const average = Math.round((CRITERIA.reduce((s, c) => s + scores[c], 0) / CRITERIA.length) * 100) / 100
  return { scores, average, comment: output.commentaire.trim().slice(0, 300), costMicros }
}
