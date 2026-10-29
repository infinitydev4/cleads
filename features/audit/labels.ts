/** Human wording for audit actions. Unknown actions fall back to the raw code. */
export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Connexion",
  "auth.login_failed": "Connexion refusée",
  "team.invited": "Invitation envoyée",
  "team.invite_revoked": "Invitation annulée",
  "team.invite_accepted": "Invitation acceptée",
  "team.role_changed": "Rôle modifié",
  "team.deactivated": "Accès désactivé",
  "team.reactivated": "Accès réactivé",
}

export const AUDIT_FILTERS = [
  { value: "", label: "Tout" },
  { value: "auth.", label: "Connexions" },
  { value: "team.", label: "Équipe" },
] as const

export const auditLabel = (action: string) => AUDIT_LABELS[action] ?? action
