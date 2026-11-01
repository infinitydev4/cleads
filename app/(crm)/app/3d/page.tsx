import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/guard"
import { getOverview } from "@/features/hq/service"
import { HqView } from "@/components/crm/hq/hq-view"

export const metadata = { title: "Vue 3D" }
export const dynamic = "force-dynamic"

/** E16: the isometric view of the CRM. Every figure comes from the same services as the 2D pages, with the same rights. */
export default async function HqPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")
  return <HqView initial={await getOverview(user)} />
}
