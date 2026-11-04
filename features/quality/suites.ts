import { createHash } from "node:crypto"
import { AUDITS } from "@/evals/audits"
import { BRIEFS } from "@/evals/briefs"
import { COPILOT_SET } from "@/evals/copilot"
import { FICHES } from "@/evals/fiches"
import { REPLIES } from "@/evals/replies"
import { RESEARCH_CASES } from "@/evals/research"
import { SITES } from "@/evals/sites"
import { ROLES, type AiRole } from "@/lib/ai/models"
import { AGENTS } from "@/features/ai/agents"
import { RULES, SUITES_INFO, type SuiteId, type SuiteInfo } from "./labels"
import { AUDITOR_CASES, auditorCase } from "./cases/auditor"
import { COPILOT_CASES, copilotCase } from "./cases/copilot"
import { FICHES_CASES, REPLIES_CASES, isDecisionModel, qualifierCase, repliesCase } from "./cases/decisions"
import { DESIGNER_CASES, designerCase } from "./cases/designer"
import type { CaseRunner } from "./cases/env"
import { OFFERS_CASES, offersCase } from "./cases/offers"
import { RESEARCHER_CASES, researcherCase } from "./cases/researcher"
import { WRITER_CASES, writerCase } from "./cases/writer"
import { SUITE_ROLES } from "./roles"

/**
 * The evaluation suites (E27, docs/crm-v1/AGENTS-IA.md §20), one per agent that has a reference set in evals/: its
 * cases, its quick sample, the version of its set, the roles whose model it can compare and what one case costs.
 * Server only: the sets are large.
 */
export interface CallProfile {
  /** Tokens of one call, on average: measured on the mock-ups and audits of November 2026, then rounded up. */
  input: number
  output: number
}

export interface SuiteDef {
  info: SuiteInfo
  cases: readonly string[]
  /** A few cases chosen to cover the set's traps: an evaluation in a few minutes, for a few cents. */
  quick: readonly string[]
  /** Hash of the set: two evaluations compare only on the same version. */
  version: string
  /** Roles whose model this suite can compare, given the role the agent works with. */
  roles: (agentRole: AiRole) => AiRole[]
  /** What one case costs: the contender's own calls, the calls of the other steps, and the judge's. */
  profile: (role: AiRole, contender: string) => { own: CallProfile[]; others: { role: AiRole | "judge"; call: CallProfile }[] }
  run: CaseRunner
  /** Cases run at once: decisions are short calls, the rest runs one case after the other (its cost is measured on the run). */
  parallel: number
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12)

/** Every other case, plus every trap, up to `size`: the quick sample keeps the hard cases. */
function sample<T extends { id: string; trap?: string }>(list: readonly T[], size: number): string[] {
  const traps = list.filter((x) => x.trap)
  const rest = list.filter((x, i) => !x.trap && i % 2 === 0)
  return [...traps, ...rest].slice(0, size).map((x) => x.id)
}

const own = (input: number, output: number): CallProfile[] => [{ input, output }]
const IMAGE_TOKENS = 1_800

export const SUITES: Record<SuiteId, SuiteDef> = {
  auditor: {
    info: SUITES_INFO.auditor,
    cases: AUDITOR_CASES,
    quick: ["s01-plomberie-roche", "s02-atelier-volt", "s03-comptoir-chartrons", "s07-solutions-habitat", "s11-garage-pont-neuf", "s17-osteo-garnier", "s18-saveurs-partage", "s21-nova-climatech", "s25-charpente-lemoine", "s28-taxi-gregoire"],
    version: hash(SITES),
    roles: SUITE_ROLES.auditor,
    profile: (role) => {
      const extraction = { input: 9_000, output: 2_000 }
      const analysis = { input: 12_000 + 2 * IMAGE_TOKENS, output: 3_500 }
      return role === "fast" ? { own: [extraction], others: [{ role: "writer", call: analysis }] } : { own: [analysis], others: [{ role: "fast", call: extraction }] }
    },
    run: auditorCase,
    parallel: 1,
  },
  offers: {
    info: SUITES_INFO.offers,
    cases: OFFERS_CASES,
    quick: ["a01-plomberie-roche", "a02-comptoir-chartrons", "a03-solutions-habitat", "a06-atelier-lumen", "a09-taxi-gregoire"],
    version: hash(AUDITS.map((a) => ({ audit: a.audit, expect: a.expect }))),
    roles: SUITE_ROLES.offers,
    profile: () => ({ own: own(10_000, 4_500), others: [] }),
    run: offersCase,
    parallel: 1,
  },
  writer: {
    info: SUITES_INFO.writer,
    cases: WRITER_CASES,
    quick: ["a01-plomberie-roche", "a03-solutions-habitat", "a05-saveurs-partage", "a07-toitures-marchand", "a08-kine-saint-michel"],
    version: hash(AUDITS.map((a) => ({ company: a.company, contact: a.contactFirstName, audit: a.audit }))),
    roles: SUITE_ROLES.writer,
    profile: () => ({ own: own(5_000, 1_800), others: [{ role: "judge", call: { input: 4_500, output: 1_000 } }] }),
    run: writerCase,
    parallel: 1,
  },
  replies: {
    info: SUITES_INFO.replies,
    cases: REPLIES_CASES,
    quick: sample(REPLIES, 40),
    version: hash(REPLIES),
    roles: SUITE_ROLES.replies,
    profile: (_role, contender) => ({ own: contender === RULES ? [] : isDecisionModel(contender) ? own(900, 0) : own(1_300, 500), others: [] }),
    run: repliesCase,
    parallel: 4,
  },
  qualifier: {
    info: SUITES_INFO.qualifier,
    cases: FICHES_CASES,
    quick: sample(FICHES, 24),
    version: hash(FICHES),
    roles: SUITE_ROLES.qualifier,
    profile: (_role, contender) => ({ own: contender === RULES ? [] : isDecisionModel(contender) ? own(600, 0) : own(1_000, 400), others: [] }),
    run: qualifierCase,
    parallel: 4,
  },
  designer: {
    info: SUITES_INFO.designer,
    cases: DESIGNER_CASES,
    quick: [DESIGNER_CASES[0]],
    version: hash(BRIEFS),
    roles: SUITE_ROLES.designer,
    profile: () => ({ own: own(7_000, 15_000), others: [{ role: "judge", call: { input: 5_000 + 8 * IMAGE_TOKENS, output: 2_000 } }] }),
    run: designerCase,
    parallel: 1,
  },
  copilot: {
    info: SUITES_INFO.copilot,
    cases: COPILOT_CASES,
    quick: ["c01-journee", "c11-appel", "c20-qualifier", "c21-attribuer", "c27-sequence", "c40-architectes", "c41-cent-entreprises", "c50-closer-recherche", "c52-supprimer", "c60-injection-reponses", "c70-quel-martin", "c81-total-nantes"],
    version: hash(COPILOT_SET),
    roles: SUITE_ROLES.copilot,
    // A request takes about three steps, each reading the instructions, the tools loaded and what was read so far.
    profile: () => ({ own: [{ input: 5_000, output: 400 }, { input: 7_500, output: 400 }, { input: 10_000, output: 700 }], others: [{ role: "judge", call: { input: 6_000, output: 700 } }] }),
    run: copilotCase,
    // Its cost is measured step by step, not on the run: a few requests at once.
    parallel: 3,
  },
  researcher: {
    info: SUITES_INFO.researcher,
    cases: RESEARCHER_CASES,
    quick: sample(RESEARCH_CASES, 6),
    version: hash(RESEARCH_CASES),
    roles: SUITE_ROLES.researcher,
    // One comparison of the profiles and accounts found with the company, by the fast model.
    profile: () => ({ own: own(3_500, 1_000), others: [] }),
    run: researcherCase,
    parallel: 3,
  },
}

/**
 * Who may stand in for a role in a suite. For the agent's own role, the models of every role the agent may be moved to
 * (the Auditeur measured with Haiku is the proof it may work in the « fast » role); for another step, that role's
 * models. The decision suites add the fast role's models, reading the question in words, and the rules.
 */
export function contenderChoices(suite: SuiteId, role: AiRole, agentRole: AiRole): string[] {
  if (SUITES[suite].info.decision) return [...ROLES.decision.choices, ...ROLES.fast.choices, RULES]
  const roles = role === agentRole ? AGENTS[suite].modelRoles : [role]
  return [...new Set(roles.flatMap((r) => ROLES[r].choices))]
}
