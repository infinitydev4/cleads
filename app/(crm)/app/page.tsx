import Link from "next/link"
import { CalendarClock, Users } from "lucide-react"
import { PageHeader } from "@/components/crm/page-header"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { getToday } from "@/features/activity/today"
import { deskStats } from "@/features/leads/desk"
import { focusCounts, listLeads } from "@/features/leads/service"
import { parseLeadFilters } from "@/features/leads/schemas"
import { TodayQueue } from "./today-queue"
import { CloserDesk } from "./closer-desk"

export const metadata = { title: "Aujourd’hui" }
export const dynamic = "force-dynamic"

function greeting(name?: string | null) {
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()))
  const first = name?.split(" ")[0]
  return `${hour < 18 ? "Bonjour" : "Bonsoir"}${first ? ` ${first}` : ""}`
}

export default async function TodayPage() {
  const user = await getCurrentUser()
  const legacy = !!user && can(user.role, "legacy:access")
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date())
  // The closer's day is his call file (9 November 2026): the cockpit instead of the task queue.
  if (user?.role === "CLOSER") {
    const [list, counts, stats] = await Promise.all([listLeads(user, parseLeadFilters({ pageSize: "100" })), focusCounts(user), deskStats(user)])
    return <CloserDesk firstName={user.name?.split(" ")[0] ?? null} today={date} initial={list} counts={counts} stats={stats} currentUserId={user.id} />
  }
  // Layout guarantees a member; a missing user would already have been redirected.
  const today = user ? await getToday(user) : null

  return (
    <>
      <PageHeader
        title={greeting(user?.name)}
        description={<span className="capitalize">{date}</span>}
        actions={
          legacy ? (
            <>
              <Button asChild variant="outline" size="sm"><Link href="/dashboard/appointments"><CalendarClock className="h-4 w-4" aria-hidden="true" /> Rendez-vous actuels</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/dashboard/clients"><Users className="h-4 w-4" aria-hidden="true" /> Clients actuels</Link></Button>
            </>
          ) : undefined
        }
      />
      {today && <TodayQueue initial={today} />}
    </>
  )
}
