import Link from "next/link"
import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { prisma } from "@/lib/prisma"
import { AUDIT_FILTERS } from "@/features/audit/labels"
import { cn } from "@/lib/utils"
import { AuditTable } from "./audit-table"

export const metadata = { title: "Journal d’audit" }
export const dynamic = "force-dynamic"

export default async function AuditPage(props: { searchParams: Promise<{ filter?: string }> }) {
  await requirePagePermission("audit:read")
  const { filter = "" } = await props.searchParams
  const prefix = AUDIT_FILTERS.some((f) => f.value === filter) ? filter : ""

  const logs = await prisma.auditLog.findMany({
    where: prefix ? { action: { startsWith: prefix } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, action: true, subject: true, entityType: true, ip: true, createdAt: true, metadata: true, actorKind: true, actor: { select: { name: true, email: true } } },
  })

  return (
    <>
      <PageHeader
        title="Journal d’audit"
        description="Les 200 derniers événements : connexions, refus, invitations, changements de rôle. Le journal ne se modifie pas."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Journal d’audit" }]}
      />
      <nav aria-label="Filtrer le journal" className="mb-4 flex gap-2">
        {AUDIT_FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/app/settings/audit?filter=${encodeURIComponent(f.value)}` : "/app/settings/audit"}
            aria-current={f.value === prefix ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", f.value === prefix ? "bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <AuditTable
        rows={logs.map((l) => ({
          id: l.id,
          at: l.createdAt.toISOString(),
          action: l.action,
          actor: l.actorKind === "SYSTEM" && !l.actor ? "Système" : (l.actor?.name ?? l.actor?.email ?? "—"),
          subject: l.subject ?? "",
          ip: l.ip ?? "",
          detail: l.metadata ? JSON.stringify(l.metadata) : "",
        }))}
      />
    </>
  )
}
