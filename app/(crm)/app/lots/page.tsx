import { requirePagePermission } from "@/lib/auth/guard"
import { closersOverview } from "@/features/lots/service"
import { LotView } from "./lot-view"

export const metadata = { title: "Préparer un lot" }
export const dynamic = "force-dynamic"

/** Batches for the closers (9 November 2026): one sentence, a free search, a campaign, a closer. */
export default async function LotsPage() {
  const { user } = await requirePagePermission("team:dispatch")
  const closers = await closersOverview(user)
  return <LotView closers={closers.map((c) => ({ id: c.id, name: c.name, leads: c.leads }))} />
}
