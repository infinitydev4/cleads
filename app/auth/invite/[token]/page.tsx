import Image from "next/image"
import Link from "next/link"
import { inspectInvitation } from "@/features/team/service"
import { InviteForm } from "./invite-form"

export const metadata = { title: "Créer mon accès", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const problems = {
  expired: "Ce lien a expiré.",
  accepted: "Ce lien a déjà été utilisé.",
  revoked: "Cette invitation a été annulée.",
  unknown: "Ce lien n’est pas valide.",
} as const

export default async function InvitePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params
  const invitation = await inspectInvitation(token)
  const problem = !invitation ? problems.unknown : invitation.status === "valid" ? null : problems[invitation.status]

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-card-foreground">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo-white.svg" alt="Cleads" width={150} height={40} className="mb-6" />
          <h1 className="text-2xl font-extrabold tracking-[-0.03em]">{problem ? "Invitation indisponible" : "Créer mon accès"}</h1>
          {invitation && !problem && (
            <p className="mt-2 text-sm text-muted-foreground">
              {invitation.invitedBy.name ?? "Un membre de l’équipe"} vous invite avec le rôle <strong>{invitation.roleLabel}</strong>.
            </p>
          )}
        </div>
        {problem || !invitation ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{problem} Demandez un nouveau lien à la personne qui vous a invité.</p>
            <Link href="/auth/login" className="text-sm underline">Retour à la connexion</Link>
          </div>
        ) : (
          <InviteForm token={token} email={invitation.email} />
        )}
      </div>
    </main>
  )
}
