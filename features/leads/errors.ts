/** Business error with a stable code; the API layer maps it to an HTTP status. */
export class LeadError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "duplicate" | "invalid" | "conflict" | "rate_limited",
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 429 = 400,
    public readonly extra?: Record<string, unknown>
  ) {
    super(message)
  }
}
