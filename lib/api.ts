import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { AuthError } from "@/lib/auth/guard"
import { TeamError } from "@/features/team/service"
import { LeadError } from "@/features/leads/errors"
import { ExtractorError } from "@/lib/extractor/client"

/** One mapping from domain errors to HTTP, shared by every CRM route handler. */
export function handleError(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof TeamError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  if (error instanceof LeadError) return NextResponse.json({ error: error.message, code: error.code, ...error.extra }, { status: error.status })
  if (error instanceof ExtractorError) {
    const status = { not_configured: 503, unreachable: 502, unauthorized: 502, not_found: 404, invalid: 422, unavailable: 503, bad_response: 502 }[error.kind]
    return NextResponse.json({ error: error.message, code: error.kind }, { status })
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Requête invalide", code: "invalid_request" }, { status: 400 })
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Corps JSON invalide", code: "invalid_request" }, { status: 400 })
  console.error("[API_ERROR]", error)
  return NextResponse.json({ error: "Erreur interne" }, { status: 500 })
}
