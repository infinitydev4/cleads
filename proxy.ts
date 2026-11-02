import { withAuth, type NextRequestWithAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextFetchEvent, NextRequest } from "next/server"
import { isStaffRole, toCrmRole } from "@/lib/crm/roles"
import { onPreviewHost } from "@/features/studio/host"

// Opt-in for local work on the component catalogue; ignored in production builds.
const designPreviewEnabled = process.env.NODE_ENV !== "production" && process.env.CRM_DESIGN_PREVIEW === "1"

const crm = withAuth(
  async function proxy(request: NextRequest) {
    const token = await getToken({ req: request })
    const isChangePasswordPage = request.nextUrl.pathname === "/auth/change-password"

    // Si l'utilisateur a un mot de passe temporaire et n'est pas sur la page de changement de mot de passe
    if (token?.isTemporaryPassword && !isChangePasswordPage) {
      return NextResponse.redirect(new URL("/auth/change-password", request.url))
    }

    // Si l'utilisateur est sur la page de changement de mot de passe mais n'a pas de mot de passe temporaire
    if (isChangePasswordPage && !token?.isTemporaryPassword) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }

    // Première barrière, sur le seul contenu du jeton : les gardes serveur (lib/auth/guard) restent
    // l'autorité (compte actif, rôle lu en base, permission précise).
    // L'aperçu du catalogue de composants est ouvert en développement uniquement.
    const path = request.nextUrl.pathname
    const isCrm = path === "/app" || path.startsWith("/app/")
    const isDesignPreview = designPreviewEnabled && path === "/app/design"
    if (isCrm && !isDesignPreview && !isStaffRole(toCrmRole(token?.role))) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    // Ancien back-office : propriétaire uniquement (permission legacy:access).
    if (path.startsWith("/dashboard") && toCrmRole(token?.role) !== "OWNER") {
      return NextResponse.redirect(new URL(isCrm || token ? "/app" : "/auth/login", request.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // The sign-in, invitation and password pages are reachable without a session.
      authorized: ({ token, req }) =>
        !!token ||
        req.nextUrl.pathname.startsWith("/auth/") ||
        (designPreviewEnabled && req.nextUrl.pathname === "/app/design"),
    },
    pages: {
      signIn: "/auth/login",
    },
  }
)

/**
 * E23: the Studio's preview host serves previews only. Its other addresses are rewritten to /apercu by next.config;
 * the CRM's own paths, which this proxy sees first, are rewritten here, so the CRM never answers on that host.
 */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (process.env.NODE_ENV === "production" || process.env.STUDIO_PREVIEW_HOST) {
    if (onPreviewHost(request.headers.get("host"))) return NextResponse.rewrite(new URL(`/apercu${request.nextUrl.pathname}`, request.url))
  }
  return crm(request as NextRequestWithAuth, event)
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/app/:path*",
    "/api/availability/:path*",
    "/api/break-time/:path*",
    "/api/exceptions/:path*",
    "/auth/:path*",
    "/api/auth/change-password"
  ],
}