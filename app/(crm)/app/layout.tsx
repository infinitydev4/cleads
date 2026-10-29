import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"
import { AppShell } from "@/components/crm/shell/app-shell"
import { toCrmRole } from "@/lib/crm/roles"

export const metadata: Metadata = {
  title: { default: "CRM", template: "%s · Cleads CRM" },
  robots: { index: false, follow: false },
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already requires a session; the preview of the design catalogue is the only exception (development).
  const session = await getServerSession(authOptions)
  const user = {
    name: session?.user?.name ?? "Aperçu",
    email: session?.user?.email ?? "apercu@cleads.local",
    image: session?.user?.image ?? null,
    role: toCrmRole(session?.user?.role ?? (session ? undefined : "ADMIN")),
  }
  return <AppShell user={user}>{children}</AppShell>
}
