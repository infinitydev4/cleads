import type { RelevanceVerdict, ReplyClass, ReplyUrgency } from "@prisma/client"
import { normalizeName } from "@/lib/crm/normalize"
import type { CampaignTarget, FicheFacts } from "@/features/relevance/rules"

/**
 * The « règles » contender (E27): what keywords alone decide, without any model. It costs nothing and answers at once;
 * the decision suites compare Jev and a language model with it, on the same cases (the comparison the plan asks for:
 * « comparatif Jev / Haiku / règles sur nos données »). Its confidence is fixed per rule: it says how often such a rule
 * is right, not how sure a model is.
 */
const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")

const RULES: readonly [ReplyClass, number, RegExp][] = [
  ["STOP", 0.9, /desinscri|desabonn|unsubscribe|retirez[- ]moi|(me|nous) retirer|retirer de vos|retirer (mon|notre) adresse|supprime[rz]? (mes|nos|notre)|ne (m'|nous )?ecrivez plus|ne plus (me |nous )?(contacter|ecrire|recevoir)|ne plus etre contacte|arretez|arreter de|\bstop\b|opposition au demarchage|\bcnil\b|spammer|\bspam\b/],
  ["OUT_OF_OFFICE", 0.85, /reponse automatique|automatic reply|message d'absence|absence du bureau|\babsente?\b|en conges|out of the office|accuse de reception|conge maternite|en deplacement|en formation|fermes pour/],
  ["WRONG_PERSON", 0.7, /ne travaille plus|pas moi qui|ce n'est pas moi|mauvais(e)? (personne|interlocuteur|destinataire)|erreur de destinataire|vous vous trompez|c'est (mon|ma|notre) (associe|fille|fils|collegue)|voir avec notre|ne nous concerne pas|transmets votre message|j'ai repris|ai repris|je suis la secretaire/],
  ["NOT_NOW", 0.7, /pas (pour le |pour )?(moment|maintenant)|plus tard|recontacte[rz]|revenez vers|la rentree|en (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)|au printemps|apres les fetes|dans quelques mois|trop tot|on en reparle|a mon retour|reouverture|on verra/],
  ["NOT_INTERESTED", 0.7, /non merci|pas interesse|ne nous interesse pas|pas de budget|deja une agence|ne donnerons pas suite|(^|\n)\s*(non|nan)\b|pas convaincu|je prefere ne pas|nous suffit|ne vais pas investir|gere(r)? (ma fiche|moi-meme)|tout est gere/],
  ["INTERESTED", 0.65, /interess|appeler|appelez|rappeler|rappelez|devis|tarif|combien|disponible|creneau|proposition|rendez-vous|\brdv\b|pourquoi pas|ok pour|\byes\b|on peut s'appeler|references/],
]

const HIGH = /rappelez|appelez|demain|aujourd'hui|au plus vite|avant (vendredi|lundi|mardi|mercredi|jeudi)|cet apres-midi|urgent|cnil/

export function replyRules(reply: { subject: string; body: string }): { reply: ReplyClass; urgency: ReplyUrgency; action: boolean; confidence: number } {
  const text = plain(`${reply.subject}\n${reply.body}`)
  const [cls, confidence] = RULES.find(([, , re]) => re.test(text)) ?? (["OTHER", 0.4] as const)
  const urgency: ReplyUrgency = HIGH.test(text) ? "HIGH" : cls === "INTERESTED" || cls === "WRONG_PERSON" || cls === "OTHER" ? "NORMAL" : "LOW"
  const action = cls === "INTERESTED" || (cls === "WRONG_PERSON" && /transmets|appelez|ecrivez|copie|plutot/.test(text)) || (cls === "OTHER" && text.includes("?"))
  return { reply: cls, urgency, action, confidence }
}

const words = (s: string | null | undefined) => normalizeName(s ?? "").split(" ").filter((w) => w.length > 2)

/** Trade, then zone, then size: a fiche that matches both and is not a national network is a good target. */
export function relevanceRules(target: CampaignTarget, fiche: FicheFacts): { verdict: RelevanceVerdict; confidence: number } {
  const c = fiche.company
  if (!c) return { verdict: "MAYBE", confidence: 0.5 }
  const trade = words(target.sector)
  const sector = words(c.sector)
  const tradeMatch = !sector.length ? null : sector.some((w) => trade.some((t) => w.startsWith(t.slice(0, 6)) || t.startsWith(w.slice(0, 6))))
  const zone = normalizeName(target.area ?? "")
  const zoneMatch = !c.city ? null : zone.includes(normalizeName(c.city))
  if ((c.reviewCount ?? 0) > 1_000) return { verdict: "NOT_RELEVANT", confidence: 0.7 }
  if (tradeMatch === false || zoneMatch === false) return { verdict: "NOT_RELEVANT", confidence: 0.7 }
  if (tradeMatch && zoneMatch) return { verdict: "RELEVANT", confidence: 0.75 }
  return { verdict: "MAYBE", confidence: 0.5 }
}
