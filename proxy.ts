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
      return NextResponse.redirect(new URL("/client", request.url))
    }

    // Protection des routes admin (dashboard)
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/client", request.url))
      }
    }

    // Protection des routes client
    if (request.nextUrl.pathname.startsWith("/client")) {
      if (token?.role !== "USER") {
        return NextResponse.redirect(new URL("/dashboard", request.url))
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
    "/client/:path*",
    "/api/availability/:path*",
    "/api/break-time/:path*",
    "/api/exceptions/:path*",
    "/auth/:path*",
    "/api/auth/change-password"
  ],
}