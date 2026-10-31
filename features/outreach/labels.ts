import type { ReplyClass } from "@prisma/client"

// Pure labels shared by the server (history lines) and the browser.

export const REPLY_LABELS: Record<ReplyClass, string> = {
  INTERESTED: "Intéressé",
  NOT_NOW: "Pas maintenant",
  NOT_INTERESTED: "Pas intéressé",
  OUT_OF_OFFICE: "Absent (réponse automatique)",
  WRONG_PERSON: "Mauvais interlocuteur",
  STOP: "Ne plus écrire",
  OTHER: "Autre",
}

/** Title of an email line in a fiche's history, by the `event` stored with it. */
export const EMAIL_EVENT_HEADS: Record<string, string> = {
  sent: "Email envoyé",
  replied: "Réponse reçue",
  auto_reply: "Réponse automatique",
  bounced: "Rebond définitif",
  bounce_soft: "Rebond temporaire",
  unsubscribed: "Désinscription",
  reply_classified: "Réponse classée",
  sequence_enrolled: "Séquence",
  sequence_stopped: "Séquence",
}
