import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/crm/shell/app-shell"
import { getCurrentUser } from "@/lib/auth/guard"

export const metadata: Metadata = {
  title: { default: "CRM", template: "%s · Cleads CRM" },
  robots: { index: false, follow: false },
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts is the first barrier; this is the authoritative one (account still active, role from the database).
  const user = await getCurrentUser()
  // A page requested by a frame is, in the CRM, a window of the 3D view: no shell around it (lib/crm/hq-window.ts).
  const embedded = (await headers()).get("sec-fetch-dest") === "iframe"
  if (!user) {
    // Explicit opt-in (CRM_DESIGN_PREVIEW=1, never in production) to browse the component catalogue without an account.
    if (process.env.NODE_ENV !== "production" && process.env.CRM_DESIGN_PREVIEW === "1") {
      return <AppShell user={{ name: "Aperçu", email: "apercu@cleads.local", image: null, role: "OWNER" }}>{children}</AppShell>
    }
    redirect("/auth/login")
  }
  return <AppShell user={user} embedded={embedded}>{children}</AppShell>
}
