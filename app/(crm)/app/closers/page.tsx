import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { closerLeads, closersOverview } from "@/features/lots/service"
import { callBoard } from "@/features/telephony/stats"
import { ClosersView } from "./closers-view"
import { CallsBoard } from "./calls-board"
import { CallGoal } from "./call-goal"
import { dailyCallGoal } from "@/features/leads/desk"

export const metadata = { title: "Mes closers" }
export const dynamic = "force-dynamic"

/** The managers' view of their closers (9 November 2026): each file, its week, and taking fiches back; their calls (E32). */
export default async function ClosersPage() {
  const { user } = await requirePagePermission("team:dispatch")
  const [closers, board, goal] = await Promise.all([closersOverview(user), callBoard(user), dailyCallGoal(user.workspaceId)])
  const first = closers[0]
  return (
    <div className="space-y-10">
      <CallGoal goal={goal} />
      <ClosersView closers={closers} initial={first ? { closerId: first.id, rows: await closerLeads(user, first.id) } : null} canDelete={can(user.role, "data:delete")} />
      <CallsBoard board={board} />
    </div>
  )
}
