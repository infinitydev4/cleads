import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, BadgeCheck, CircleAlert } from "lucide-react"
import { getCurrentUser } from "@/lib/auth/guard"
import { getSession } from "@/lib/auth/session"
import { ROLE_LABELS } from "@/lib/crm/roles"
import { can } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { checkAuthorizationRequest, connectRefusal, denyAuthorization, readParams } from "@/features/mcp/oauth/authorize"
import { connectionToClose } from "@/features/mcp/oauth/grants"
import { ConsentForm } from "./consent-form"

export const metadata = { title: "Autoriser une application", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

/**
 * E29 lot 2: Cleads' consent screen (the OAuth authorization endpoint). Claude, ChatGPT or Claude Code send the member
 * here; once signed in, they see which application asks, where the access goes, and choose what it may do (D42). Nothing
 * is given without their click; an application or a callback Cleads cannot trust gets nothing at all (D41).
 */
export default async function AuthorizePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = readParams(await props.searchParams)
  const here = `/auth/authorize?${new URLSearchParams(params as Record<string, string>)}`
  const session = await getSession()
  if (!session) redirect(`/auth/login?callbackUrl=${encodeURIComponent(here)}`)
  if (session.user.isTemporaryPassword) redirect("/auth/change-password")
  const actor = await getCurrentUser()
  if (!actor) return <Notice title="Compte sans accès au CRM" message="Ce compte ne peut pas ouvrir le CRM : aucune application ne peut s’y connecter en son nom." />

  const check = await checkAuthorizationRequest(params, actor)
  if (check.kind === "redirect") redirect(check.url)
  if (check.kind === "problem") return <Notice title={check.title} message={check.message} />
  const { request } = check

  const refusal = await connectRefusal(actor)
  if (refusal) {
    return (
      <Notice title="Connexion impossible pour l’instant" message={refusal}>
        <a href={denyAuthorization(request)} className="text-sm font-semibold underline underline-offset-4">
          Revenir à {request.app.name}
        </a>
        {can(actor.role, "ai:manage") && (
          <Link href="/app/settings/mcp" className="text-sm underline underline-offset-4">
            Ouvrir Réglages › Accès MCP
          </Link>
        )}
      </Notice>
    )
  }

  const [workspace, closing] = await Promise.all([prisma.workspace.findUnique({ where: { id: actor.workspaceId }, select: { name: true } }), connectionToClose(actor.id)])
  const local = request.app.kind !== "service"
  return (
    <Shell>
      <header className="mb-6 flex flex-col items-center text-center">
        <Image src="/logo-white.svg" alt="Cleads" width={120} height={32} className="mb-6" />
        <h1 className="text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">
          {request.app.name} demande l’accès à votre CRM Cleads
        </h1>
        {request.app.verified ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-success">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            Application reconnue par Cleads
          </p>
        ) : (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            Nom donné par l’application elle-même
          </p>
        )}
      </header>
      <ConsentForm
        params={request.params}
        here={here}
        app={request.app}
        canWrite={request.canWrite}
        account={{ name: actor.name, email: actor.email, role: ROLE_LABELS[actor.role], workspace: workspace?.name ?? "" }}
        closing={closing ? `« ${closing.name} », ${closing.lastUsedAt ? `utilisée pour la dernière fois le ${day.format(closing.lastUsedAt)}` : "jamais utilisée"}` : null}
        local={local}
      />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 text-card-foreground sm:p-8">{children}</div>
    </main>
  )
}

/** What stops the connection: shown here, never sent to an address Cleads cannot trust. */
function Notice({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <Image src="/logo-white.svg" alt="Cleads" width={120} height={32} className="mb-6" />
        <AlertTriangle className="mb-3 h-6 w-6 text-warning" aria-hidden="true" />
        <h1 className="text-xl font-extrabold tracking-[-0.02em]">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          {children ?? (
            <Link href="/app" className="text-sm underline underline-offset-4">
              Aller au CRM
            </Link>
          )}
        </div>
      </div>
    </Shell>
  )
}
