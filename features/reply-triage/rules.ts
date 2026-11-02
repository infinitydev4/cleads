import type { ReplyClass, ReplyUrgency, TriageOutcome } from "@prisma/client"
import type { Experimental_DecisionQuestion } from "ai"
import { untrusted } from "@/lib/ai/untrusted"
import type { DecisionView } from "@/features/ai/calls"

/**
 * What the Analyste réponses asks Jev about a reply (E22, docs/crm-v1/AGENTS-IA.md §15): its class, its urgency and
 * whether we must act, each with a probability. Above the threshold the class is offered for a one-click confirmation;
 * below, the reply stays « À classer ». Nothing is filed without a person.
 */
export const REPLY_CRITERIA: Record<ReplyClass, string> = {
  INTERESTED: "Intéressé : veut en savoir plus, demande un appel, un rendez-vous, un devis ou des informations précises.",
  NOT_NOW: "Pas maintenant : l'intérêt existe mais plus tard ; demande de recontacter à une date ou une période.",
  NOT_INTERESTED: "Pas intéressé : décline, poliment ou non, sans demander qu'on cesse d'écrire.",
  OUT_OF_OFFICE: "Absent : réponse automatique, congés, absence, changement d'adresse sans autre message.",
  WRONG_PERSON: "Mauvais interlocuteur : n'est pas la bonne personne, renvoie vers quelqu'un d'autre ou a quitté l'entreprise.",
  STOP: "Ne plus écrire : demande de ne plus être contacté, de retirer son adresse, se désinscrire, menace de signaler. L'emporte sur toutes les autres classes.",
  OTHER: "Autre : question sans rapport, remarque, message incompréhensible.",
}

export const URGENCY_CRITERIA: Record<ReplyUrgency, string> = {
  HIGH: "À traiter aujourd'hui : demande de rappel, de rendez-vous, question précise, délai mentionné.",
  NORMAL: "À traiter dans la semaine.",
  LOW: "Aucune urgence : refus, absence, information sans suite attendue.",
}

export const TRIAGE_QUESTIONS = {
  reply: { type: "choice", instructions: "Quelle est la nature de cette réponse à un email de prospection ?", criteria: REPLY_CRITERIA },
  urgency: { type: "choice", instructions: "Avec quelle urgence faut-il la traiter ?", criteria: URGENCY_CRITERIA },
  action: { type: "boolean", instructions: "La réponse attend-elle une action de notre part : répondre, rappeler, envoyer un document ou transférer à quelqu'un ?" },
} as const satisfies Record<string, Experimental_DecisionQuestion>

const REPLY_KEYS = Object.keys(REPLY_CRITERIA) as ReplyClass[]
const URGENCY_KEYS = Object.keys(URGENCY_CRITERIA) as ReplyUrgency[]
const OUTCOMES: Record<DecisionView["outcome"], TriageOutcome> = { auto: "AUTO", review: "REVIEW", human: "HUMAN" }

/** The reply as Jev reads it: our subject, then its text fenced as outside content, cut to a reasonable length. */
export function triageState(reply: { subject: string; bodyText: string; fromEmail: string }, sentSubject: string | null): string {
  return [
    "Réponse reçue à un email de prospection B2B.",
    sentSubject ? `Objet de notre email : « ${sentSubject.slice(0, 200)} »` : null,
    `Objet de la réponse : « ${reply.subject.slice(0, 200)} »`,
    untrusted(reply.bodyText || "(message vide)", { source: "réponse reçue", maxChars: 4_000 }),
  ]
    .filter(Boolean)
    .join("\n")
}

export interface TriageFields {
  replyClass: ReplyClass | null
  classConfidence: number | null
  outcome: TriageOutcome
  urgency: ReplyUrgency | null
  urgencyConfidence: number | null
  needsAction: boolean | null
  actionConfidence: number | null
}

/** Jev's answers as stored. An answer outside the options (a refusal) leaves the reply to a person. */
export function triageFields(answers: Record<keyof typeof TRIAGE_QUESTIONS, DecisionView>): TriageFields {
  const { reply, urgency, action } = answers
  const replyClass = typeof reply.value === "string" && (REPLY_KEYS as string[]).includes(reply.value) ? (reply.value as ReplyClass) : null
  const level = typeof urgency.value === "string" && (URGENCY_KEYS as string[]).includes(urgency.value) ? (urgency.value as ReplyUrgency) : null
  return {
    replyClass,
    classConfidence: replyClass ? reply.confidence : null,
    outcome: replyClass ? OUTCOMES[reply.outcome] : "HUMAN",
    urgency: level,
    urgencyConfidence: level ? urgency.confidence : null,
    needsAction: typeof action.value === "boolean" ? action.value : null,
    actionConfidence: typeof action.value === "boolean" ? action.confidence : null,
  }
}
