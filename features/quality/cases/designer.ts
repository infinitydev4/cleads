import { BRIEFS } from "@/evals/briefs"
import { generateForRun } from "@/features/ai/calls"
import { workflowInstructions } from "@/features/ai/runtime"
import { PAGE_OUTPUT_TOKENS, buildPage, critiqueOf } from "@/features/studio/handler"
import { pagePrompt } from "@/features/studio/prompts"
import { average } from "@/features/studio/labels"
import { judged, pinned, spent, type CaseRunner } from "./env"

/**
 * The Designer web on a reference brief (E27): the real page prompt and the real build of features/studio — sanitised,
 * styled, rendered and checked by axe-core in the worker's browser — then the real critique, given to the judge's model.
 * One round, without corrections: the model's own page is what is compared. The published page never holds a script
 * whatever the model writes; how often it tried is measured.
 */
export const DESIGNER_CASES = BRIEFS.map((b) => b.id)

export const designerCase: CaseRunner = async (env, contender, caseId) => {
  const ref = BRIEFS.find((b) => b.id === caseId)
  if (!ref) throw new Error(`Brief de référence inconnu : ${caseId}`)
  if (!env.deps.renderer) throw new Error("Le navigateur du worker n’est pas disponible : la page ne peut pas être rendue.")
  const ctx = pinned(env, contender)
  const runtime = await workflowInstructions(ctx, ["charte-studio", "audit-ux-conversion"])
  const role = runtime.agent.modelRole === "decision" ? "designer" : runtime.agent.modelRole
  const brief = ref.brief
  const before = await spent(ctx.id)
  const answer = await generateForRun(
    ctx,
    {
      role,
      name: "build_page",
      system: runtime.system,
      prompt: pagePrompt({ company: ref.company, brief, contact: ref.contact, assets: [], fonts: { heading: brief.fonts.heading, body: brief.fonts.body } }),
      maxOutputTokens: PAGE_OUTPUT_TOKENS,
      abortSignal: env.signal,
      stream: true,
    },
    env.deps
  )
  const costMicros = (await spent(ctx.id)) - before
  const cut = answer.finishReason === "length"
  const page = cut ? null : await buildPage(answer.text, { assets: new Map(), theme: { primary: brief.palette.primary, accent: brief.palette.accent, heading: brief.fonts.heading, body: brief.fonts.body }, fontCss: "", company: ref.company, description: brief.positioning })
  if (!page) return { ok: false, score: 0, detail: { cut, unreadable: !cut }, costMicros, judgeMicros: 0 }

  const session = await env.deps.renderer()
  let rendered
  try {
    rendered = await session.render(page.html, new Map())
  } finally {
    await session.close()
  }
  const judgeBefore = await spent(ctx.id)
  const { critique, note } = await critiqueOf(judged(env), runtime.system, page, rendered, brief, ref.company, env.signal, env.deps)
  const judgeMicros = (await spent(ctx.id)) - judgeBefore

  const axe = rendered.axe ? rendered.axe.critical + rendered.axe.serious : null
  const checks = [page.markup.h1 === 1, !page.markup.placeholders.length, axe === 0]
  const passed = checks.filter(Boolean).length
  const grade = critique ? average(critique.scores) : null
  const removed = page.report.removed
  return {
    ok: passed === checks.length && (grade ?? 0) >= 3.8,
    score: grade == null ? (0.4 * passed) / checks.length : 0.6 * ((grade - 1) / 4) + (0.4 * passed) / checks.length,
    detail: {
      cut: false,
      h1: page.markup.h1,
      placeholders: page.markup.placeholders.length,
      axe,
      checksPassed: { ok: passed, total: checks.length },
      critique: grade,
      scores: critique?.scores ?? null,
      issues: critique?.issues.slice(0, 5).map((i) => i.problem) ?? [],
      note,
      scriptsRemoved: (removed["<script>"] ?? 0) + (removed["gestionnaire d’événement"] ?? 0),
      heights: rendered.heights,
    },
    costMicros,
    judgeMicros,
  }
}
