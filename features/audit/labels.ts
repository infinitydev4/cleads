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
  // E29: the CRM's MCP server.
  "mcp.enabled": "Accès MCP activé",
  "mcp.disabled": "Accès MCP coupé",
  "mcp.policy_changed": "Droits des clients MCP modifiés",
  "mcp.token_created": "Jeton MCP créé",
  "mcp.token_revoked": "Accès MCP fermé",
  "mcp.oauth_authorized": "Application autorisée (MCP)",
  "mcp.oauth_refresh_reused": "Connexion MCP fermée : jeton réutilisé",
  // E10: the reports.
  "report.exported": "Rapport exporté (CSV)",
  // E14: the rights of the people in the CRM (GDPR).
  "contact.exported": "Données d’une personne exportées (RGPD)",
}

export const AUDIT_FILTERS = [
  { value: "", label: "Tout" },
  { value: "auth.", label: "Connexions" },
  { value: "team.", label: "Équipe" },
  { value: "mcp.", label: "Accès MCP" },
  { value: "report.", label: "Rapports" },
  { value: "contact.", label: "RGPD" },
] as const

export const auditLabel = (action: string) => AUDIT_LABELS[action] ?? action
