import Link from "next/link"
import { Eye, PanelsTopLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/crm/empty-state"
import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { STATE_LABELS, STATE_TONE } from "@/features/studio/labels"
import { listSites } from "@/features/studio/service"

export const metadata = { title: "Studio Web" }
export const dynamic = "force-dynamic"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })

/** The Studio Web (E23): the demonstration landing pages of the fiches the person sees, the latest first. */
export default async function StudioPage() {
  const { user } = await requirePagePermission("studio:generate")
  const sites = await listSites(user)
  const now = new Date()
  return (
    <>
      <PageHeader
        title="Studio Web"
        description="Des landings de démonstration construites à partir du site, de l’audit et de l’identité de chaque prospect, à montrer pendant le rendez-vous. Lien privé de 30 jours, mention « maquette non contractuelle », visites suivies."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Studio Web" }]}
      />
      {sites.length === 0 ? (
        <EmptyState
          art="rocket"
          title="Aucune maquette pour l’instant"
          description="Ouvrez une fiche auditée, onglet « Maquette », puis « Générer une landing » : le Designer lit le site, propose un brief à relire, puis construit la page."
          action={
            <Button asChild>
              <Link href="/app/leads">Choisir une fiche</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => {
            const linkActive = s.linkExpiresAt && new Date(s.linkExpiresAt) > now
            return (
              <li key={s.id}>
                <Link href={`/app/studio/${s.id}`} className="group block overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="relative aspect-[16/10] overflow-hidden border-b bg-muted">
                    {s.thumb ? (
                      <img src={s.thumb} alt="" loading="lazy" className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground">
                        <PanelsTopLeft className="h-8 w-8" aria-hidden="true" />
                      </div>
                    )}
                    <Badge variant={STATE_TONE[s.state]} className="absolute left-3 top-3 shadow-sm">
                      {STATE_LABELS[s.state]}
                    </Badge>
                  </div>
                  <div className="space-y-1 p-4">
                    <p className="truncate font-semibold">{s.companyName}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {s.version && <span>Version {s.version}</span>}
                      <span>· {day.format(new Date(s.updatedAt))}</span>
                      {s.createdBy && <span>· {s.createdBy}</span>}
                      <span className="ml-auto inline-flex items-center gap-1 tabular-nums" title="Visites du lien partagé">
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {s.visits}
                        <span className="sr-only">visite{s.visits > 1 ? "s" : ""}</span>
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{linkActive ? `Lien actif jusqu’au ${day.format(new Date(s.linkExpiresAt!))}` : s.linkExpiresAt ? "Lien expiré" : "Lien non créé"}</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
