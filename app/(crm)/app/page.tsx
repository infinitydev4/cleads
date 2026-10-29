import Link from "next/link"
import { CalendarClock, Search, Users } from "lucide-react"
import { PageHeader } from "@/components/crm/page-header"
import { EmptyState } from "@/components/crm/empty-state"
import { StatCard } from "@/components/crm/stat-card"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"

export const metadata = { title: "Aujourd’hui" }

function greeting(name?: string | null) {
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()))
  const first = name?.split(" ")[0]
  return `${hour < 18 ? "Bonjour" : "Bonsoir"}${first ? ` ${first}` : ""}`
}

export default async function TodayPage() {
  const user = await getCurrentUser()
  const legacy = !!user && can(user.role, "legacy:access")
  const search = !!user && can(user.role, "search:run")
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date())

  return (
    <>
      <PageHeader title={greeting(user?.name)} description={<span className="capitalize">{date}</span>} />

      <section aria-label="Indicateurs du jour" className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Relances dues" hint="Branché avec les séquences" />
        <StatCard label="Réponses à traiter" hint="Branché avec la boîte d’envoi" />
        <StatCard label="Rendez-vous du jour" hint="Branché avec les rendez-vous" />
        <StatCard label="Prospects à contacter" hint="Branché avec la recherche" />
      </section>

      <EmptyState
        art="target"
        title="Votre file du jour apparaîtra ici"
        description={`Dès que des prospects seront importés, vous retrouverez ici les relances dues, les réponses à traiter et vos rendez-vous.${legacy ? " En attendant, les rendez-vous et clients actuels restent dans l’ancien back-office." : ""}`}
        action={
          <>
            {legacy && (
              <>
                <Button asChild variant="ink">
                  <Link href="/dashboard/appointments">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" /> Rendez-vous actuels
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/dashboard/clients">
                    <Users className="h-4 w-4" aria-hidden="true" /> Clients actuels
                  </Link>
                </Button>
              </>
            )}
            {search && (
              <Button variant="outline" disabled>
                <Search className="h-4 w-4" aria-hidden="true" /> Lancer une recherche (bientôt)
              </Button>
            )}
          </>
        }
      />
    </>
  )
}
