import type { RecommendationRole } from "@prisma/client"
import { untrusted } from "@/lib/ai/untrusted"
import { generateForRun, type ModelDeps } from "@/features/ai/calls"
import type { AgentRuntime } from "@/features/ai/runtime"
import type { RunContext } from "@/features/ai/runs"
import { CATEGORY_LABELS, formatOfferPrice, withPriceNote } from "@/features/offers/labels"
import { signalLabel } from "@/features/offers/signals"
import { AREA_LABELS, SEVERITY_LABELS } from "@/features/prospect-audit/labels"
import { AREAS, type AuditReport, type Evidence, type Point, type Scores } from "@/features/prospect-audit/schemas"
import type { Candidate } from "./rules"
import { pitchOutputSchema, type CallScript, type EmailAngle, type Objection, type PitchOutput, type PitchRole } from "./schemas"

/**
 * The Conseiller offres' step (E21, docs/crm-v1/AGENTS-IA.md §14): one model call, without tools, by the agent's role
 * (Sonnet by default). It reads the audit (fenced: its texts may quote the prospect's site) and the candidate offers,
 * ranks them, argues each one with evidence, composes a realistic pack and prepares the closer. The code then keeps
 * only what cites existing evidence, and fixes the roles so that the pack always has one main offer.
 */
export interface PitchFacts {
  company: { name: string; sector: string | null; city: string | null }
  audit: { createdAt: Date; domain: string | null; score: number | null; scores: Scores; summary: string[]; report: AuditReport }
}

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })

const INSTRUCTIONS = [
  "Prépare le pitch du closer :",
  "- headline : une phrase qui dit pourquoi ce prospect a besoin de nous, avec le fait le plus fort de l'audit ;",
  "- recommendations : une à quatre offres candidates, de la plus utile à la moins utile. Une seule « main », l'offre principale ; au plus deux « complement » pour un pack réaliste, à la mesure de la taille et du budget probable de l'entreprise ; au plus une « entry », une première étape moins chère si le pack est trop lourd ; « later » pour une seconde étape. Pour chacune : fit de 0 à 100, why en deux phrases avec les faits de l'audit, gain (ce que le prospect y gagne, sans chiffre inventé), evidence, et l'objection la plus probable avec sa réponse ;",
  "- script : l'appel de 15 minutes, selon le skill script-appel-15min s'il t'est donné : opening, hook (un constat précis posé comme une question, avec sa preuve), questions (trois au plus, adaptées au métier), proposal (l'offre principale reliée au besoin, puis l'offre d'entrée s'il y en a une), close (une prochaine étape datée : rendez-vous, maquette à montrer ou proposition écrite) ;",
  "- objections : les deux ou trois objections les plus probables pendant l'appel, avec leur réponse ;",
  "- email : l'angle du premier email, un objet de moins de 50 caractères et deux phrases, appuyés sur une preuve.",
  "Vouvoiement, phrases courtes, sans jargon. Les prix sont ceux du catalogue : n'en donne pas d'autres, et ne promets aucun résultat chiffré. Un élément qui ne cite aucune preuve existante sera supprimé.",
].join("\n")

const cites = (ids: readonly string[]) => (ids.length ? ` (${ids.join(", ")})` : "")

function points(title: string, list: readonly Point[]): string | null {
  return list.length ? `${title} :\n${list.map((p) => `- ${p.text}${cites(p.evidence)}`).join("\n")}` : null
}

/**
 * The audit as the advisor reads it. Officers' names stay out: the pitch is about the company. Everything quoted from
 * the audit is fenced, since its labels and texts may repeat the prospect's own site.
 */
export function pitchPrompt(facts: PitchFacts, candidates: readonly Candidate[]): string {
  const { report } = facts.audit
  const r = report.registry
  const registry = r ? [r.legalForm, r.employees ? `effectif : ${r.employees}` : null, r.createdOn ? `créée le ${r.createdOn}` : null, r.labels.length ? `labels : ${r.labels.join(", ")}` : null].filter(Boolean).join(" · ") : null
  const digest = [
    `Entreprise : ${[facts.company.name, facts.company.sector, facts.company.city].filter(Boolean).join(" — ")}`,
    registry ? `Registre : ${registry}` : null,
    `Preuves :\n${report.evidence.map((e) => `- ${e.id} : ${e.label}${e.value ? ` — ${e.value}` : ""}`).join("\n") || "- aucune"}`,
    `Constats :\n${report.findings.slice(0, 15).map((f) => `- [${SEVERITY_LABELS[f.severity]}] ${AREA_LABELS[f.area]} — ${f.title} : ${f.detail}${cites(f.evidence)}`).join("\n") || "- aucun"}`,
    points("Forces", report.strengths),
    points("Freins", report.frictions),
    points("Opportunités", report.opportunities),
    facts.audit.summary.length ? `Résumé de l'auditeur :\n${facts.audit.summary.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
  const scores = AREAS.map((a) => `${AREA_LABELS[a]} ${facts.audit.scores[a] == null ? "non mesuré" : `${facts.audit.scores[a]}/100`}`).join(", ")
  const offers = candidates
    .map((c) =>
      [
        `- \`${c.offer.slug}\` — ${c.offer.name} (${CATEGORY_LABELS[c.offer.category]}) — ${withPriceNote(formatOfferPrice(c.offer), c.offer.priceNote)}`,
        `  ${c.offer.summary}`,
        `  Signaux de l'audit : ${c.signals.map((s) => `${signalLabel(s.key)}${cites(s.evidence)}`).join(" ; ")}`,
      ].join("\n")
    )
    .join("\n")
  return [
    `Audit du ${day.format(facts.audit.createdAt)}${facts.audit.domain ? ` (${facts.audit.domain})` : ""} : score ${facts.audit.score ?? "—"}/100. Sous-scores : ${scores}.`,
    `Relevé de l'audit. Cite les preuves par leur identifiant (P page, M mesure, C capture, S source).\n${untrusted(digest, { source: `audit de ${facts.audit.domain ?? facts.company.name}`, maxChars: 14_000 })}`,
    `Offres candidates : celles du catalogue actif dont l'audit a levé un signal. Tu ne recommandes qu'elles, par leur identifiant exact.\n${offers}`,
    INSTRUCTIONS,
  ].join("\n\n")
}

/**
 * Room for the answer. Sonnet 5.5 reasons before it writes, and its reasoning counts against this limit: on 2 November
 * 2026 a real pitch took about 1 000 tokens of reasoning and 3 500 of text. At 3 000, it was cut and could not be read.
 */
export const PITCH_OUTPUT_TOKENS = 6_000

export async function composePitch(
  ctx: RunContext,
  runtime: Pick<AgentRuntime, "agent" | "system">,
  facts: PitchFacts,
  candidates: readonly Candidate[],
  deps: ModelDeps = {},
  signal?: AbortSignal
): Promise<{ output: PitchOutput | null; model: string }> {
  const role = runtime.agent.modelRole === "decision" ? "writer" : runtime.agent.modelRole
  const slugs = candidates.map((c) => c.offer.slug) as [string, ...string[]]
  const { output, model } = await generateForRun(
    ctx,
    { role, name: "compose_pitch", system: runtime.system, prompt: pitchPrompt(facts, candidates), schema: pitchOutputSchema(slugs), maxOutputTokens: PITCH_OUTPUT_TOKENS, abortSignal: signal },
    deps
  )
  return { output: output ?? null, model }
}

// ── What is kept ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface BuiltRecommendation {
  slug: string
  role: RecommendationRole
  fit: number
  why: string
  gain: string
  evidence: string[]
  signals: string[]
  objection: Objection | null
}

export interface BuiltPitch {
  headline: string
  recommendations: BuiltRecommendation[]
  script: CallScript
  objections: Objection[]
  email: EmailAngle | null
  /** The audit evidence the pitch cites, copied with it. */
  evidence: Evidence[]
  notes: string[]
}

export const ROLE_ORDER: readonly RecommendationRole[] = ["MAIN", "COMPLEMENT", "ENTRY", "LATER"]
/** A realistic pack: the main offer and two more at most. */
export const PACK_COMPLEMENTS = 2

const squash = (s: string) => s.replace(/\s+/g, " ").trim()

function objectionOf(o: Objection | null): Objection | null {
  const objection = o ? squash(o.objection) : ""
  const answer = o ? squash(o.answer) : ""
  return objection && answer ? { objection, answer } : null
}

/**
 * One main offer (the first the advisor named so, or the first kept), two complements at most, one entry offer at most;
 * the rest is for later. Ranked by role, then in the advisor's order.
 */
export function settleRoles<T extends { role: PitchRole | RecommendationRole }>(list: readonly T[]): (Omit<T, "role"> & { role: RecommendationRole })[] {
  const named = list.findIndex((x) => x.role === "main" || x.role === "MAIN")
  const main = named < 0 ? 0 : named
  let complements = 0
  let entry = false
  const settled = list.map((x, i) => {
    const wanted = x.role.toUpperCase()
    let role: RecommendationRole = "LATER"
    if (i === main) role = "MAIN"
    else if ((wanted === "MAIN" || wanted === "COMPLEMENT") && complements < PACK_COMPLEMENTS) {
      complements++
      role = "COMPLEMENT"
    } else if (wanted === "ENTRY" && !entry) {
      entry = true
      role = "ENTRY"
    }
    return { ...x, role }
  })
  return settled.map((x, i) => ({ x, i })).sort((a, b) => ROLE_ORDER.indexOf(a.x.role) - ROLE_ORDER.indexOf(b.x.role) || a.i - b.i).map(({ x }) => x)
}

/** Keeps what cites existing evidence; says in `notes` what was left out. */
export function buildPitch(output: PitchOutput, candidates: readonly Candidate[], report: Pick<AuditReport, "evidence" | "findings">): BuiltPitch {
  const known = new Set(report.evidence.map((e) => e.id))
  const valid = (ids: readonly string[]) => [...new Set(ids.filter((id) => known.has(id)))]
  const bySlug = new Map(candidates.map((c) => [c.offer.slug, c]))
  const notes: string[] = []
  const seen = new Set<string>()
  const kept: (Omit<BuiltRecommendation, "role"> & { role: PitchRole })[] = []
  for (const r of output.recommendations) {
    const candidate = bySlug.get(r.offer)
    if (!candidate || seen.has(r.offer)) continue
    seen.add(r.offer)
    const evidence = valid(r.evidence)
    const why = squash(r.why)
    if (!evidence.length || !why) {
      notes.push(`« ${candidate.offer.name} » retirée : son argument ne cite aucune preuve de l'audit.`)
      continue
    }
    kept.push({ slug: r.offer, role: r.role, fit: r.fit, why, gain: squash(r.gain), evidence, signals: candidate.signals.map((s) => s.key), objection: objectionOf(r.objection) })
  }
  const recommendations = settleRoles(kept)

  let hook = { text: squash(output.script.hook.text), evidence: valid(output.script.hook.evidence) }
  if (!hook.evidence.length || !hook.text) {
    const top = report.findings.find((f) => valid(f.evidence).length)
    hook = top ? { text: `${top.title} : ${top.detail}`, evidence: valid(top.evidence) } : { text: "", evidence: [] }
    notes.push("L'accroche proposée ne citait aucune preuve de l'audit : elle est remplacée par le premier constat.")
  }
  const emailEvidence = valid(output.email.evidence)
  const email = emailEvidence.length && squash(output.email.subject) && squash(output.email.angle) ? { subject: squash(output.email.subject), angle: squash(output.email.angle), evidence: emailEvidence } : null
  if (!email) notes.push("L'angle d'email ne citait aucune preuve de l'audit : il est retiré.")

  const cited = new Set([...recommendations.flatMap((r) => r.evidence), ...hook.evidence, ...(email?.evidence ?? [])])
  return {
    headline: squash(output.headline) || recommendations[0]?.why || "",
    recommendations,
    script: {
      opening: squash(output.script.opening),
      hook,
      questions: output.script.questions.map(squash).filter(Boolean).slice(0, 3),
      proposal: squash(output.script.proposal),
      close: squash(output.script.close),
    },
    objections: output.objections.map(objectionOf).filter((o): o is Objection => !!o).slice(0, 3),
    email,
    evidence: report.evidence.filter((e) => cited.has(e.id)),
    notes,
  }
}
