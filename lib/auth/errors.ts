/**
 * The access error of the CRM, apart from the session helpers of ./guard.ts (which load Next): business services throw
 * it, and the AI worker loads those services without Next. The guard re-exports it for the route handlers.
 */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message = status === 401 ? "Non authentifié" : "Accès refusé"
  ) {
    super(message)
  }
}
