import { isOfferSignal, type OfferSignal } from "@/features/offers/signals"
import type { SkillOffer } from "@/features/offers/skill"
import type { AuditReport, SignalHit } from "@/features/prospect-audit/schemas"

/**
 * From the audit to candidate offers (E21, docs/crm-v1/AGENTS-IA.md §14), without any model: an active offer is a
 * candidate when the audit raised one of its signals with existing evidence. The advisor then ranks and argues them; it
 * can name no other offer.
 */
export interface Candidate {
  offer: SkillOffer
  /** The audit signals the offer answers, with their evidence. */
  signals: SignalHit[]
  /** Their evidence, without duplicates: at least one by construction. */
  evidence: string[]
}

export const NO_AUDIT = "La fiche n’a pas encore d’audit : les offres partent de ses constats. Lancez d’abord l’audit."
export const NO_ACTIVE_OFFER = "Aucune offre n’est active : le propriétaire ou un manager doit valider le catalogue dans Agents IA › Offres."
export const NO_CANDIDATE = "Aucune offre active ne répond aux signaux de cet audit."

/** Offers given to the advisor at most: enough for a pack, an entry offer and ideas for later. */
export const MAX_CANDIDATES = 8

function unique<T>(list: readonly T[]): T[] {
  return [...new Set(list)]
}

/**
 * The audit's signals whose evidence exists, plus one E21 derives. "Prospect à accompagner dans la durée" holds when the
 * audit found three weak areas, or recurring needs in two fields at least (SEO and advertising, for instance): its
 * evidence is theirs.
 */
export function pitchSignals(report: Pick<AuditReport, "signals" | "evidence">, offers: readonly SkillOffer[]): Map<OfferSignal, string[]> {
  const known = new Set(report.evidence.map((e) => e.id))
  const hits = new Map<OfferSignal, string[]>()
  for (const s of report.signals) {
    const evidence = s.evidence.filter((id) => known.has(id))
    if (evidence.length) hits.set(s.key, unique([...(hits.get(s.key) ?? []), ...evidence]))
  }
  if (!hits.has("long_term_fit")) {
    const low = hits.get("three_low_scores")
    const recurring = offers.filter((o) => o.billing === "MONTHLY" && o.category !== "RETAINER" && o.category !== "PACK").map((o) => ({ category: o.category, evidence: matched(o, hits).flatMap((m) => m.evidence) })).filter((o) => o.evidence.length)
    if (low) hits.set("long_term_fit", low)
    else if (new Set(recurring.map((o) => o.category)).size >= 2) hits.set("long_term_fit", unique(recurring.flatMap((o) => o.evidence)).slice(0, 6))
  }
  return hits
}

function matched(offer: SkillOffer, hits: ReadonlyMap<OfferSignal, string[]>): SignalHit[] {
  return offer.signals.filter(isOfferSignal).flatMap((key) => {
    const evidence = hits.get(key)
    return evidence?.length ? [{ key, evidence }] : []
  })
}

/** Active offers the audit calls for, the most supported first, then in the catalogue's order. */
export function candidatesFor(report: Pick<AuditReport, "signals" | "evidence">, offers: readonly SkillOffer[]): Candidate[] {
  const hits = pitchSignals(report, offers)
  return offers
    .map((offer, index) => ({ offer, index, signals: matched(offer, hits) }))
    .filter((c) => c.signals.length)
    .sort((a, b) => b.signals.length - a.signals.length || a.index - b.index)
    .slice(0, MAX_CANDIDATES)
    .map(({ offer, signals }) => ({ offer, signals, evidence: unique(signals.flatMap((s) => s.evidence)).slice(0, 8) }))
}
