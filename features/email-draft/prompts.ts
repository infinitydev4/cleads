import { untrusted } from "@/lib/ai/untrusted"
import { VARIABLES } from "@/features/outreach/template"
import { AREA_LABELS, SEVERITY_LABELS } from "@/features/prospect-audit/labels"
import type { Evidence, Finding } from "@/features/prospect-audit/schemas"
import type { StepDraftRequest } from "./schemas"

/**
 * What the Rédacteur reads (E22). Everything that comes from the prospect, its site or its mail is fenced as outside
 * content; the instructions come after it. The footer, the unsubscribe link, the signature and the booking link are
 * the CRM's: the model never writes them.
 */
const NOT_OURS = "Ni signature, ni nom d'expéditeur, ni formule avec ton nom, ni pied de page, ni lien de désinscription : le CRM les ajoute."

export interface FirstEmailFacts {
  company: { name: string; sector: string | null; city: string | null }
  contactFirstName: string | null
  audit: { domain: string | null; summary: string[]; findings: Finding[]; evidence: Evidence[] }
  pitch: { headline: string; mainOffer: string | null; subject: string | null; angle: string | null } | null
}

const cites = (ids: readonly string[]) => (ids.length ? ` (${ids.join(", ")})` : "")

export function firstEmailPrompt(f: FirstEmailFacts): string {
  const findings = f.audit.findings.filter((x) => x.severity !== "low").slice(0, 8)
  const audit = [
    `Entreprise : ${[f.company.name, f.company.sector, f.company.city].filter(Boolean).join(" — ")}`,
    `Prénom du contact : ${f.contactFirstName ?? "inconnu"}`,
    `Preuves :\n${f.audit.evidence.map((e) => `- ${e.id} : ${e.label}${e.value ? ` — ${e.value}` : ""}`).join("\n") || "- aucune"}`,
    `Constats :\n${findings.map((x) => `- [${SEVERITY_LABELS[x.severity]}] ${AREA_LABELS[x.area]} — ${x.title} : ${x.detail}${cites(x.evidence)}`).join("\n") || "- aucun"}`,
    f.audit.summary.length ? `Résumé de l'auditeur :\n${f.audit.summary.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : null,
    f.pitch
      ? `Pitch du Conseiller offres : ${f.pitch.headline}${f.pitch.mainOffer ? `\nOffre principale : ${f.pitch.mainOffer}` : ""}${f.pitch.subject ? `\nObjet proposé : ${f.pitch.subject}` : ""}${f.pitch.angle ? `\nAngle d'email : ${f.pitch.angle}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n")
  return [
    `Fiche, audit et pitch. Cite les preuves par leur identifiant.\n${untrusted(audit, { source: `fiche et audit de ${f.audit.domain ?? f.company.name}`, maxChars: 12_000 })}`,
    [
      "Rédige le premier email de prospection, selon le skill cold-email-fr :",
      "- subject : moins de 50 caractères, concret, sans « Re: » ni majuscules abusives ;",
      `- body : 60 à 120 mots, vouvoiement. Commence par « Bonjour${f.contactFirstName ? ` ${f.contactFirstName}` : ""}, ». Une observation précise tirée de l'audit, ce qu'elle fait perdre, ce que nous proposons en une phrase, puis une seule demande : un échange de 15 minutes, avec une question simple. ${NOT_OURS} Aucun lien, aucun prix, aucune promesse chiffrée ;`,
      "- facts : les faits de l'audit que cite le message, trois au plus, chacun avec ses preuves.",
      "Un fait qui ne cite aucune preuve existante sera retiré ; n'écris rien que l'audit ne dise pas.",
    ].join("\n"),
  ].join("\n\n")
}

export interface ReplyFacts {
  company: { name: string; sector: string | null; city: string | null }
  contactFirstName: string | null
  sent: { subject: string; body: string } | null
  reply: { subject: string; body: string; from: string }
  auditSummary: string[]
  booking: boolean
}

/** Our message without the footer the CRM added (everything after the « -- » line). */
export const withoutFooter = (text: string) => text.split(/\n--\n/)[0].trim()

export function replyPrompt(f: ReplyFacts): string {
  const context = [
    `Entreprise : ${[f.company.name, f.company.sector, f.company.city].filter(Boolean).join(" — ")}`,
    `Prénom de l'interlocuteur : ${f.contactFirstName ?? "inconnu"}`,
    f.auditSummary.length ? `Ce que l'audit a relevé :\n${f.auditSummary.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n")
  return [
    `Notre email :\n${untrusted(f.sent ? `Objet : ${f.sent.subject}\n\n${withoutFooter(f.sent.body)}` : "(introuvable)", { source: "notre email", maxChars: 3_000 })}`,
    `Sa réponse :\n${untrusted(`Objet : ${f.reply.subject}\n\n${f.reply.body}`, { source: `réponse de ${f.reply.from}`, maxChars: 4_000 })}`,
    `Contexte :\n${untrusted(context, { source: "fiche", maxChars: 3_000 })}`,
    [
      "Rédige la réponse à ce message :",
      "- body : 40 à 100 mots, vouvoiement. Remercie en une phrase, réponds simplement à ce que la personne demande si la réponse est sûre, sinon dis que vous en parlerez de vive voix, puis propose un échange de 15 minutes.",
      f.booking
        ? "- Le CRM ajoute à la fin un lien pour choisir un créneau : annonce-le en une phrase, sans écrire de lien ni de date."
        : "- Demande quel jour et quel moment lui conviennent, sans proposer de date : tu ne connais pas l'agenda.",
      `- ${NOT_OURS} N'invente ni prix, ni délai, ni disponibilité, ni référence client.`,
    ].join("\n"),
  ].join("\n\n")
}

/** Variables a sequence step may use: the fiche's own, filled at each send (features/outreach/template.ts). */
export const STEP_VARIABLES = ["prenom", "entreprise", "ville", "secteur", "site"] as const satisfies readonly (keyof typeof VARIABLES)[]

export function stepPrompt(r: StepDraftRequest): string {
  const first = r.position === 1
  const previous = r.previous.map((p, i) => `Étape ${i + 1}\nObjet : ${p.subject || "(suite du fil)"}\n${p.body}`).join("\n\n")
  return [
    `Séquence de prospection : étape ${r.position}${first ? ", le premier message" : `, envoyée ${r.delayDays} jour${r.delayDays > 1 ? "s" : ""} après la précédente`}.`,
    r.brief ? `Consigne de l'équipe : ${r.brief}` : "Aucune consigne : un message général sur l'acquisition de clients en ligne.",
    previous ? `Étapes précédentes :\n${previous}` : null,
    [
      `Rédige le message de l'étape ${r.position}, selon le skill cold-email-fr. C'est un modèle envoyé à plusieurs entreprises :`,
      `- seulement ces variables, écrites exactement ainsi : ${STEP_VARIABLES.map((v) => `{{${v}}}`).join(", ")} ; commence par « Bonjour {{prenom|Madame, Monsieur}}, » ;`,
      "- aucun fait propre à une entreprise, aucun chiffre, aucune référence client ;",
      first
        ? "- subject : moins de 50 caractères ; body : 60 à 120 mots ;"
        : "- subject : vide pour continuer le fil du premier message ; body : 40 à 80 mots, une relance courte qui apporte un élément nouveau sans répéter les messages précédents ;",
      `- une seule demande : un échange de 15 minutes. ${NOT_OURS}`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
}
