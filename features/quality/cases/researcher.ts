import { RESEARCH_CASES, researchCaseById, type FrozenResult, type ResearchCaseDef } from "@/evals/research"
import { quotes, urlKey, type WebSource } from "@/lib/ai/search"
import { generateForRun } from "@/features/ai/calls"
import { JUDGE_SYSTEM, companyProfile, judgePrompt, judgeSchema, keepJudgment, missingNetworks, peopleTargets, personProfile, type Judgment } from "@/features/research/people"
import { pinned, spent, type CaseRunner } from "./env"

/**
 * The Enquêteur on a fictional company (E30 lot 2, E27): its searches' results are frozen (evals/research.ts), the
 * contender compares them with the company through the real prompt, and the real code keeps what it may. Right when
 * every good profile and account is kept, no homonym is proposed as probable, and no other account is filed as the
 * company's own.
 */
export const RESEARCHER_CASES = RESEARCH_CASES.map((c) => c.id)

export const frozenSource = (r: FrozenResult): WebSource => ({ tool: "exa_search", url: r.url, title: r.title, text: `${r.title} … ${r.text}`, date: r.date ?? null })

/** What the job would give the judge for this case: its targets, and the results of the right kind. */
export function caseInputs(ref: ResearchCaseDef) {
  const company = { name: ref.company.name, city: ref.company.city, headcountBand: ref.company.headcountBand, data: { identity: { officers: ref.officers } }, contacts: [] }
  const targets = peopleTargets(company)
  const wanted = missingNetworks(null)
  const people = ref.people.map(frozenSource).filter((s) => personProfile(s.url))
  const accounts = ref.accounts.map(frozenSource).filter((s) => {
    const p = companyProfile(s.url)
    return !!p && wanted.includes(p.network)
  })
  return { company, targets, wanted, people, accounts }
}

/** The grade of one judgment, through the code that keeps what it may. */
export function gradeResearch(ref: ResearchCaseDef, judgment: Judgment) {
  const inputs = caseInputs(ref)
  const kept = keepJudgment(judgment, ref.company, inputs.targets, inputs.people, inputs.accounts, inputs.wanted)
  const status = new Map(kept.people.map((p) => [p.url, p.status]))
  const found = ref.expect.people.filter((u) => status.has(personProfile(u) ?? u))
  const homonyms = ref.expect.wrong.filter((u) => status.get(personProfile(u) ?? u) === "PROBABLE")
  const accounts = Object.entries(ref.expect.accounts).filter(([network, url]) => kept.accounts.some((a) => a.network === network && urlKey(a.url) === urlKey(url)))
  const wrongAccounts = kept.accounts.filter((a) => !ref.expect.accounts[a.network] || urlKey(ref.expect.accounts[a.network]) !== urlKey(a.url)).map((a) => a.url)
  // The model's own quotes for what it called a match: were they really in the result?
  const claimed = [
    ...judgment.people.filter((p) => p.match !== "no").map((p) => ({ source: inputs.people[p.result - 1], evidence: p.evidence })),
    ...judgment.accounts.filter((a) => a.match !== "no").map((a) => ({ source: inputs.accounts[a.result - 1], evidence: a.evidence })),
  ]
  const valid = claimed.filter((c) => c.source && quotes(c.source, c.evidence)).length
  const recall = ref.expect.people.length ? found.length / ref.expect.people.length : 1
  const accountRecall = Object.keys(ref.expect.accounts).length ? accounts.length / Object.keys(ref.expect.accounts).length : 1
  const clean = !homonyms.length && !wrongAccounts.length
  return {
    ok: recall === 1 && accountRecall === 1 && clean,
    score: (recall + accountRecall + (clean ? 1 : 0)) / 3,
    detail: {
      profiles: { kept: found.length, total: ref.expect.people.length },
      homonyms: { right: ref.expect.wrong.length - homonyms.length, total: ref.expect.wrong.length },
      accounts: { kept: accounts.length, total: Object.keys(ref.expect.accounts).length },
      evidence: { valid, total: claimed.length },
      homonymsKept: homonyms,
      wrongAccounts,
      kept: kept.people.map((p) => ({ url: p.url, status: p.status, confidence: p.confidence })),
    },
  }
}

export const researcherCase: CaseRunner = async (env, contender, caseId) => {
  const ref = researchCaseById(caseId)
  if (!ref) throw new Error(`Cas de l'Enquêteur inconnu : ${caseId}`)
  const ctx = pinned(env, contender)
  const before = await spent(ctx.id)
  const inputs = caseInputs(ref)
  const { output } = await generateForRun(
    ctx,
    { role: "fast", name: "concordance", system: JUDGE_SYSTEM, prompt: judgePrompt(ref.company, inputs.targets, inputs.people, inputs.accounts), schema: judgeSchema, maxOutputTokens: 2_000, abortSignal: env.signal },
    env.deps
  )
  if (!output) throw new Error("L'Enquêteur n'a pas rendu de comparaison lisible.")
  const graded = gradeResearch(ref, output)
  return { ...graded, costMicros: (await spent(ctx.id)) - before, judgeMicros: 0 }
}
