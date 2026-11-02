import type { RelevanceVerdict, TriageOutcome } from "@prisma/client"
import type { Experimental_DecisionQuestion } from "ai"
import { untrusted } from "@/lib/ai/untrusted"
import type { DecisionView } from "@/features/ai/calls"
import { signalLabel } from "@/features/offers/signals"

/**
 * What the Analyste qualification asks Jev about an imported fiche (E25, docs/crm-v1/AGENTS-IA.md §17): is it a good
 * target for its campaign and the campaign's offer? Jev answers with a probability. Above the high threshold the answer
 * orders the campaign's fiches; between the thresholds it is offered for a one-click confirmation; below, a person
 * decides. Jev reads the business, never the contact person: no name, no email, no phone number.
 */
export const VERDICTS = ["RELEVANT", "MAYBE", "NOT_RELEVANT"] as const satisfies readonly RelevanceVerdict[]

export const RELEVANCE_CRITERIA: Record<RelevanceVerdict, string> = {
  RELEVANT:
    "Bonne cible : l'entreprise exerce le métier visé, dans la zone visée, et un signe montre que l'offre l'aiderait (pas de site ou site daté, peu d'avis, aucun moyen de prendre rendez-vous en ligne…).",
  MAYBE: "Cible possible : le métier ou la zone ne correspondent qu'en partie, ou il manque des informations pour juger.",
  NOT_RELEVANT: "Mauvaise cible : autre métier, hors de la zone, entreprise fermée, enseigne nationale ou entreprise visiblement trop grande pour l'offre.",
}

export const RELEVANCE_QUESTIONS = {
  relevance: { type: "choice", instructions: "Cette entreprise est-elle une bonne cible pour cette campagne et son offre ?", criteria: RELEVANCE_CRITERIA },
} as const satisfies Record<string, Experimental_DecisionQuestion>

export interface CampaignTarget {
  name: string
  sector: string | null
  area: string | null
  offer: { name: string; summary: string; signals: string[] } | null
}

export interface FicheFacts {
  company: {
    name: string
    sector: string | null
    city: string | null
    postalCode: string | null
    website: string | null
    rating: number | null
    reviewCount: number | null
    hasPhone: boolean
    hasEmail: boolean
  } | null
}

const host = (url: string | null) => {
  if (!url) return null
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** The campaign and the business as Jev reads them. The business's name comes from outside: it is fenced. */
export function relevanceState(campaign: CampaignTarget, fiche: FicheFacts): string {
  const c = fiche.company
  const offer = campaign.offer
  return [
    `Campagne : ${campaign.name}.`,
    `Cible visée : ${campaign.sector ?? "secteur non précisé"}${campaign.area ? `, zone ${campaign.area}` : ""}.`,
    offer ? `Offre proposée : ${offer.name}. ${offer.summary.slice(0, 300)}` : "Aucune offre n'est attachée à la campagne : juge sur le métier et la zone.",
    offer?.signals.length ? `Signes qu'un prospect a besoin de l'offre : ${offer.signals.map(signalLabel).join(" ; ")}.` : null,
    c
      ? [
          "Entreprise importée :",
          untrusted(c.name, { source: "nom de l'entreprise", maxChars: 200 }),
          `Secteur indiqué : ${c.sector ?? "inconnu"}. Ville : ${[c.postalCode, c.city].filter(Boolean).join(" ") || "inconnue"}.`,
          `Site : ${host(c.website) ?? "aucun"}. Fiche Google : ${c.rating != null ? `${c.rating}/5` : "pas de note"}${c.reviewCount != null ? `, ${c.reviewCount} avis` : ""}.`,
          `Téléphone de l'entreprise : ${c.hasPhone ? "oui" : "non"}. Email de l'entreprise : ${c.hasEmail ? "oui" : "non"}.`,
        ].join("\n")
      : "La fiche n'a pas d'entreprise : seulement un contact.",
  ]
    .filter(Boolean)
    .join("\n")
}

export interface RelevanceFields {
  verdict: RelevanceVerdict | null
  confidence: number | null
  outcome: TriageOutcome
}

const OUTCOMES: Record<DecisionView["outcome"], TriageOutcome> = { auto: "AUTO", review: "REVIEW", human: "HUMAN" }

/** Jev's answer as stored. An answer outside the options leaves the fiche to a person. */
export function relevanceFields(answer: DecisionView): RelevanceFields {
  const verdict = typeof answer.value === "string" && (VERDICTS as readonly string[]).includes(answer.value) ? (answer.value as RelevanceVerdict) : null
  return { verdict, confidence: verdict ? answer.confidence : null, outcome: verdict ? OUTCOMES[answer.outcome] : "HUMAN" }
}

/** What counts for the fiche: the person's decision, else Jev's answer when it was sure enough. */
export const effectiveVerdict = (r: { verdict: RelevanceVerdict | null; outcome: TriageOutcome; decision: RelevanceVerdict | null }): RelevanceVerdict | null =>
  r.decision ?? (r.outcome === "AUTO" ? r.verdict : null)
