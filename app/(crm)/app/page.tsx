import Link from "next/link"
import { CalendarClock, Users } from "lucide-react"
import { PageHeader } from "@/components/crm/page-header"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { getToday } from "@/features/activity/today"
import { TodayQueue } from "./today-queue"

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
