import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"

export default withAuth(
  async function proxy(request: NextRequest) {
    const token = await getToken({ req: request })
    const isAuthPage = request.nextUrl.pathname.startsWith("/auth")
    const isChangePasswordPage = request.nextUrl.pathname === "/auth/change-password"

    // Si l'utilisateur a un mot de passe temporaire et n'est pas sur la page de changement de mot de passe
    if (token?.isTemporaryPassword && !isChangePasswordPage) {
      return NextResponse.redirect(new URL("/auth/change-password", request.url))
    }

    // Si l'utilisateur est sur la page de changement de mot de passe mais n'a pas de mot de passe temporaire
    if (isChangePasswordPage && !token?.isTemporaryPassword) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }

    // Protection des routes du back-office : seuls les administrateurs entrent.
    // (Les rôles du CRM remplaceront cette règle dans l'epic E2.)
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/auth/login", request.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/auth/login",
    },
  }
)

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/availability/:path*",
    "/api/break-time/:path*",
    "/api/exceptions/:path*",
    "/auth/:path*",
    "/api/auth/change-password"
  ],
}