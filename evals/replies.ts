import type { ReplyClass, ReplyUrgency } from "@prisma/client"

/**
 * The Analyste réponses' reference set (docs/crm-v1/AGENTS-IA.md §20): answers to a first prospecting email, labelled
 * the way an SDR files them in the mailbox (class), with the urgency and whether we must act. Written for the set, signed
 * with invented first names; the traps are the cases a filing must not get wrong — a request to stop writing wins over
 * everything, an out-of-office is not a wrong person. The team's own labels add to it (features/quality/cases/replies.ts).
 */
export interface LabelledReply {
  id: string
  /** The subject of the email we had sent. */
  sentSubject: string
  subject: string
  body: string
  label: {
    reply: ReplyClass
    urgency: ReplyUrgency
    /** Whether we must answer, call back, send something or forward; null when a reasonable SDR could go either way. */
    action: boolean | null
  }
  /** What makes it hard, when it is. */
  trap?: string
}

const SENT = ["Votre site sur téléphone", "Une idée pour vos réservations", "Vos avis Google", "15 minutes pour votre visibilité", "Votre fiche Google"] as const

let n = 0
const r = (reply: ReplyClass, urgency: ReplyUrgency, action: boolean | null, subject: string, body: string, trap?: string): LabelledReply => {
  n++
  return { id: `r${String(n).padStart(2, "0")}`, sentSubject: SENT[n % SENT.length], subject, body, label: { reply, urgency, action }, ...(trap ? { trap } : {}) }
}

export const REPLIES: readonly LabelledReply[] = [
  // ── Intéressé ──
  r("INTERESTED", "HIGH", true, "Re: Votre site sur téléphone", "Bonjour,\nEffectivement je l'ai remarqué aussi. Vous pouvez m'appeler demain matin entre 9h et 10h au cabinet ?\nCordialement,\nMarc"),
  r("INTERESTED", "HIGH", true, "Re: Une idée pour vos réservations", "Oui ça m'intéresse. C'est combien ?\nJulie"),
  r("INTERESTED", "NORMAL", true, "Re: Vos avis Google", "Bonjour, pourquoi pas. Envoyez-moi une proposition par mail avec vos tarifs, je regarderai ça la semaine prochaine.\nBonne journée"),
  r("INTERESTED", "HIGH", true, "Re: 15 minutes pour votre visibilité", "Bonjour Monsieur,\nJe suis disponible jeudi à 14h pour en parler. Est-ce que ça vous va ?\nSophie Lambert"),
  r("INTERESTED", "HIGH", true, "RE: Votre fiche Google", "Bonjour, on a justement un souci avec notre fiche Google depuis le déménagement, elle affiche encore l'ancienne adresse. Vous pouvez régler ça rapidement ? Merci de me rappeler au plus vite.", "demande précise et pressée"),
  r("INTERESTED", "NORMAL", true, "Re: Votre site sur téléphone", "Bonjour,\nMon neveu nous avait fait le site il y a longtemps, c'est vrai qu'il commence à dater. Je veux bien un devis pour le refaire.\nCordialement, Henri"),
  r("INTERESTED", "HIGH", true, "Re: Une idée pour vos réservations", "Bonsoir, les réservations par téléphone nous prennent un temps fou le soir. Vous avez un exemple de restaurant équipé ? On peut s'appeler lundi ?"),
  r("INTERESTED", "NORMAL", true, "Re: Vos avis Google", "Intéressant. Comment vous faites concrètement pour avoir plus d'avis, sans faux avis bien sûr ?"),
  r("INTERESTED", "HIGH", true, "Re: 15 minutes pour votre visibilité", "ok pour un appel. 06 non communiqué ici, rappelez le standard et demandez Karim.", "accord bref, numéro à retrouver"),
  r("INTERESTED", "NORMAL", true, "Re: Votre fiche Google", "Bonjour, je ne suis pas contre, mais je voudrais d'abord voir ce que vous avez fait pour d'autres dentistes. Vous avez des références ?"),
  r("INTERESTED", "HIGH", true, "Re: Votre site sur téléphone", "Bonjour,\nNous lançons une nouvelle activité en janvier et il nous faut un site avant. Pouvez-vous me faire une proposition avant vendredi ?\nMerci", "délai court"),
  r("INTERESTED", "NORMAL", true, "Re: Une idée pour vos réservations", "Pourquoi pas, mais ça coûte combien par mois ? On est une petite structure."),
  r("INTERESTED", "HIGH", true, "Re: Vos avis Google", "Rappelez-moi.\n\nEnvoyé de mon iPhone", "réponse très courte"),
  r("INTERESTED", "NORMAL", true, "Re: 15 minutes pour votre visibilité", "Bonjour, mon associé et moi en parlions justement. Envoyez-nous deux ou trois créneaux la semaine prochaine.\nBien à vous,\nÉlodie"),
  r("INTERESTED", "NORMAL", true, "Re: Votre fiche Google", "Hello, yes we'd be interested, but could we do the call in English? My French is not great.\nThanks, Tom", "réponse en anglais"),
  r("INTERESTED", "HIGH", true, "Re: Votre site sur téléphone", "Bonjour, je n'aime pas trop le démarchage mais là vous avez raison, le site est illisible sur téléphone. Appelez-moi cet après-midi.", "commence comme un refus"),

  // ── Pas maintenant ──
  r("NOT_NOW", "LOW", null, "Re: Une idée pour vos réservations", "Bonjour, c'est la pleine saison, je n'ai pas une minute. Recontactez-moi en novembre.\nPierre"),
  r("NOT_NOW", "LOW", null, "Re: Vos avis Google", "Pas pour le moment, on refait la boutique. Peut-être au printemps prochain."),
  r("NOT_NOW", "LOW", null, "Re: 15 minutes pour votre visibilité", "Bonjour,\nLe sujet est intéressant mais notre budget communication est bouclé pour cette année. Revenez vers nous en janvier pour le budget suivant.\nCordialement"),
  r("NOT_NOW", "LOW", null, "Re: Votre fiche Google", "Je suis en arrêt jusqu'à fin du mois, on verra à mon retour."),
  r("NOT_NOW", "LOW", null, "Re: Votre site sur téléphone", "Merci, un prestataire travaille déjà sur notre site jusqu'en juin. Si ça ne donne rien, je vous recontacterai.", "prestataire en place mais porte ouverte"),
  r("NOT_NOW", "NORMAL", true, "Re: Une idée pour vos réservations", "Bonjour, ce n'est pas le moment mais gardez mon contact. Vous pouvez m'écrire de nouveau après les fêtes ? Merci de me confirmer que vous le notez."),
  r("NOT_NOW", "LOW", null, "Re: Vos avis Google", "On en reparle à la rentrée de septembre."),
  r("NOT_NOW", "LOW", null, "Re: 15 minutes pour votre visibilité", "Bonjour, je viens de reprendre l'entreprise il y a deux semaines, j'ai d'autres priorités. Dans quelques mois peut-être.\nNadia"),
  r("NOT_NOW", "LOW", null, "Re: Votre fiche Google", "Trop tôt pour nous, on ouvre le second local en mars. Écrivez-moi en février."),
  r("NOT_NOW", "LOW", null, "Re: Votre site sur téléphone", "Bonjour, pas maintenant merci, mais l'idée n'est pas mauvaise. Plus tard dans l'année.", "« pas maintenant merci » n'est pas un refus"),
  r("NOT_NOW", "LOW", null, "Re: Une idée pour vos réservations", "On est fermés pour travaux jusqu'au 15. Recontactez-nous après la réouverture."),
  r("NOT_NOW", "LOW", null, "Re: Vos avis Google", "Bonjour, j'attends d'avoir le nouveau logo avant de toucher à quoi que ce soit. Je reviendrai vers vous."),

  // ── Pas intéressé ──
  r("NOT_INTERESTED", "LOW", false, "Re: 15 minutes pour votre visibilité", "Non merci."),
  r("NOT_INTERESTED", "LOW", false, "Re: Votre fiche Google", "Bonjour, nous avons déjà une agence qui s'occupe de tout cela et nous en sommes satisfaits. Bonne continuation."),
  r("NOT_INTERESTED", "LOW", false, "Re: Votre site sur téléphone", "Le bouche-à-oreille nous suffit largement, nous avons trois mois d'attente. Merci quand même."),
  r("NOT_INTERESTED", "LOW", false, "Re: Une idée pour vos réservations", "Nous ne prenons pas de réservations, c'est voulu. Pas intéressés."),
  r("NOT_INTERESTED", "LOW", false, "Re: Vos avis Google", "Bonjour,\nJe pars à la retraite l'an prochain et je ne vais pas investir maintenant. Merci de votre message.\nGérard", "raison personnelle, pas une demande d'arrêt"),
  r("NOT_INTERESTED", "LOW", false, "Re: 15 minutes pour votre visibilité", "Ça ne nous intéresse pas, nous travaillons uniquement avec des clients professionnels qui nous connaissent."),
  r("NOT_INTERESTED", "LOW", false, "Re: Votre fiche Google", "Non, je gère ma fiche moi-même, merci."),
  r("NOT_INTERESTED", "LOW", false, "Re: Votre site sur téléphone", "Bonjour, notre site convient très bien à nos clients. Nous ne donnerons pas suite."),
  r("NOT_INTERESTED", "LOW", false, "Re: Une idée pour vos réservations", "Pas de budget pour ça, désolé."),
  r("NOT_INTERESTED", "LOW", false, "Re: Vos avis Google", "Bonjour, je préfère ne pas, je n'aime pas les avis en ligne. Cordialement.", "refus poli sans demande d'arrêt"),
  r("NOT_INTERESTED", "LOW", false, "Re: 15 minutes pour votre visibilité", "Merci mais non merci, nous sommes un réseau et tout est géré par le siège."),
  r("NOT_INTERESTED", "LOW", false, "Re: Votre fiche Google", "nan"),
  r("NOT_INTERESTED", "LOW", false, "Re: Votre site sur téléphone", "Bonjour,\nNous avons refait notre site il y a trois mois, il est très bien sur téléphone. Votre analyse doit être ancienne.\nCordialement", "conteste le constat, sans demander d'arrêt"),
  r("NOT_INTERESTED", "LOW", false, "Re: Une idée pour vos réservations", "Je ne suis pas convaincu, on a essayé une plateforme et les clients ne venaient pas. Merci, mais non."),

  // ── Absent ──
  r("OUT_OF_OFFICE", "LOW", false, "Réponse automatique : Votre site sur téléphone", "Bonjour,\nJe suis absent du cabinet jusqu'au 4 novembre inclus. Pour toute urgence, contactez le secrétariat.\nCordialement"),
  r("OUT_OF_OFFICE", "LOW", false, "Absence du bureau", "Je suis en congés jusqu'au lundi 12. Je traiterai votre message à mon retour."),
  r("OUT_OF_OFFICE", "LOW", false, "Automatic reply: Vos avis Google", "Thank you for your message. I am out of the office until Monday with limited access to email."),
  r("OUT_OF_OFFICE", "LOW", false, "Réponse automatique", "Bonjour, nous sommes fermés pour les vacances d'été du 1er au 21 août. Le restaurant rouvre le 22 août.", "fermeture annuelle"),
  r("OUT_OF_OFFICE", "LOW", false, "Message d'absence : 15 minutes pour votre visibilité", "Je suis en déplacement toute la semaine. En cas d'urgence, vous pouvez joindre ma collègue Anne à l'adresse anne@exemple.test.", "renvoie vers une collègue, mais c'est une absence"),
  r("OUT_OF_OFFICE", "LOW", false, "Absent", "Absente jusqu'au 30. Merci."),
  r("OUT_OF_OFFICE", "LOW", false, "Réponse automatique : Votre fiche Google", "Nouvelle adresse : notre cabinet a déménagé. Merci d'écrire désormais à contact@nouveau-cabinet.test. Ce message est automatique.", "changement d'adresse automatique"),
  r("OUT_OF_OFFICE", "LOW", false, "Accusé de réception", "Nous avons bien reçu votre message et y répondrons dans les meilleurs délais. Ceci est une réponse automatique.", "accusé automatique"),
  r("OUT_OF_OFFICE", "LOW", false, "Congé maternité", "Je suis en congé maternité jusqu'en avril. Vos messages ne sont pas transférés."),
  r("OUT_OF_OFFICE", "LOW", false, "Réponse automatique : Une idée pour vos réservations", "Bonjour, je suis en formation jusqu'à jeudi. Je reviens vers vous dès que possible."),

  // ── Mauvais interlocuteur ──
  r("WRONG_PERSON", "NORMAL", true, "Re: Votre site sur téléphone", "Bonjour, ce n'est pas moi qui m'occupe du site, c'est ma fille. Je vous mets en copie : camille@exemple.test", "renvoie vers une autre personne"),
  r("WRONG_PERSON", "LOW", false, "Re: Vos avis Google", "Je ne travaille plus dans cette entreprise depuis un an."),
  r("WRONG_PERSON", "NORMAL", true, "Re: 15 minutes pour votre visibilité", "Bonjour, je suis la secrétaire. Le docteur ne lit pas ces mails, écrivez plutôt à la direction du centre médical."),
  r("WRONG_PERSON", "NORMAL", true, "Re: Votre fiche Google", "Il faut voir avec notre siège à Paris, c'est eux qui gèrent la communication. Je transmets votre message.", "transfert au siège"),
  r("WRONG_PERSON", "LOW", false, "Re: Une idée pour vos réservations", "Vous vous trompez de personne, je ne suis pas restaurateur."),
  r("WRONG_PERSON", "NORMAL", true, "Re: Votre site sur téléphone", "Bonjour, c'est mon associé Laurent qui gère tout ce qui est internet. Appelez-le plutôt, il est là le matin."),
  r("WRONG_PERSON", "LOW", false, "Re: Vos avis Google", "Cette adresse est celle de la comptabilité. Votre message ne nous concerne pas."),
  r("WRONG_PERSON", "NORMAL", true, "Re: 15 minutes pour votre visibilité", "Bonjour, l'ancien gérant est parti à la retraite, c'est moi qui ai repris en septembre. Que proposez-vous exactement ?", "nouveau gérant qui pose une question"),
  r("WRONG_PERSON", "LOW", false, "Re: Votre fiche Google", "Erreur de destinataire."),

  // ── Ne plus écrire ──
  r("STOP", "LOW", false, "Re: Votre site sur téléphone", "Merci de me retirer de votre liste."),
  r("STOP", "LOW", false, "Re: Une idée pour vos réservations", "STOP"),
  r("STOP", "HIGH", false, "Re: Vos avis Google", "Je ne vous ai jamais donné mon adresse. Supprimez mes données immédiatement ou je saisis la CNIL.", "menace de signalement"),
  r("STOP", "LOW", false, "Re: 15 minutes pour votre visibilité", "Bonjour, ne m'écrivez plus s'il vous plaît. Cordialement."),
  r("STOP", "LOW", false, "Re: Votre fiche Google", "Désinscription"),
  r("STOP", "LOW", false, "Re: Votre site sur téléphone", "Votre offre pourrait m'intéresser un jour, mais je ne veux plus recevoir ce genre d'emails. Merci de ne plus me contacter.", "intérêt mêlé à une demande d'arrêt : l'arrêt l'emporte"),
  r("STOP", "LOW", false, "Re: Une idée pour vos réservations", "Non merci, et merci d'arrêter de nous relancer, c'est le troisième message.", "refus + arrêt"),
  r("STOP", "LOW", false, "Re: Vos avis Google", "Unsubscribe me please."),
  r("STOP", "LOW", false, "Re: 15 minutes pour votre visibilité", "Bonjour,\nJe vous prie de bien vouloir supprimer notre adresse de vos fichiers de prospection.\nSalutations", "formulation polie et administrative"),
  r("STOP", "LOW", false, "Re: Votre fiche Google", "Arrêtez de spammer."),
  r("STOP", "LOW", false, "Re: Votre site sur téléphone", "Je suis intéressée par le sujet mais pas par le démarchage par email : retirez-moi de vos envois, je vous contacterai moi-même si besoin.", "intérêt + demande d'arrêt"),
  r("STOP", "LOW", false, "Re: Une idée pour vos réservations", "Opposition au démarchage. Merci d'en prendre note."),

  // ── Autre ──
  r("OTHER", "NORMAL", true, "Re: Vos avis Google", "Bonjour, vous êtes qui exactement ? Comment avez-vous eu mon adresse ?", "question sur la source de l'adresse"),
  r("OTHER", "LOW", false, "Re: 15 minutes pour votre visibilité", "👍"),
  r("OTHER", "NORMAL", true, "Re: Votre fiche Google", "Bonjour, vous faites aussi les cartes de visite ? J'en aurais besoin de 500."),
  r("OTHER", "LOW", false, "Re: Votre site sur téléphone", "Merci pour l'info."),
  r("OTHER", "NORMAL", true, "Re: Une idée pour vos réservations", "Bonjour, je cherche un emploi dans le marketing digital, recrutez-vous ? Je vous joins mon CV.", "candidature"),
  r("OTHER", "LOW", false, "Re: Vos avis Google", "test"),
  r("OTHER", "LOW", false, "Re: 15 minutes pour votre visibilité", "Votre email s'affiche mal dans ma messagerie, il manque des caractères."),
]
