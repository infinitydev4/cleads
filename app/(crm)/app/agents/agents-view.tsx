"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { CheckCircle2, CircleAlert } from "lucide-react"
import { toast } from "sonner"
import { ApprovalCard } from "@/components/crm/ai/approval-card"
import { RunSheet } from "@/components/crm/ai/run-sheet"
import { SpendList } from "@/components/crm/ai/spend-list"
import { useLiveRuns } from "@/components/crm/ai/use-live-runs"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ACTIVE_STATUSES, formatEur } from "@/features/ai/labels"
import type { ApprovalView } from "@/features/ai/approvals"
import type { AgentsPage } from "@/features/ai/definitions"
import type { RunView } from "@/features/ai/runs"
import type { AiSettingsView } from "@/features/ai/settings"
import type { SkillView } from "@/features/ai/skills/service"
import type { OfferView } from "@/features/offers/service"
import type { QualityDashboard } from "@/features/quality/dashboard"
import type { QualityPage } from "@/features/quality/service"
import { api } from "../leads/api"
import { AgentsTab } from "./agents-tab"
import type { EvaluationPreset } from "./evaluation-dialog"
import { OffersTab } from "./offers-tab"
import { QualityTab } from "./quality-tab"
import { RunsTab } from "./runs-tab"
import { SkillsTab } from "./skills-tab"
import type { Tab } from "./tabs"

export interface Rights {
  manageSkills: boolean
  manageOffers: boolean
  manageAi: boolean
}

const monthName = (key: string) => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`))
const seen = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export function AgentsView(props: {
  userId: string
  initialTab: Tab
  agents: AgentsPage
  skills: SkillView[]
  archivedSkills: SkillView[]
  offers: OfferView[]
  archivedOffers: OfferView[]
  runs: RunView[]
  approvals: ApprovalView[]
  settings: AiSettingsView
  /** Owners and managers (E27). */
  quality: { dashboard: QualityDashboard; page: QualityPage; evaluate: EvaluationPreset & { suite?: string } } | null
  can: Rights
}) {
  const { settings, approvals, runs } = props
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = useState<Tab>(props.initialTab)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  useLiveRuns(props.userId, runs.some((r) => ACTIVE_STATUSES.includes(r.status)) || approvals.length > 0)

  const drafts = props.offers.filter((o) => o.status === "DRAFT").length
  const worker = settings.worker

  function changeTab(next: string) {
    setTab(next as Tab)
    router.replace(next === "agents" ? pathname : `${pathname}?tab=${next}`, { scroll: false })
  }

  async function decide(id: string, approve: boolean, note?: string) {
    setActing(id)
    try {
      await api(`/api/ai/approvals/${id}`, { method: "POST", body: JSON.stringify({ decision: approve ? "approve" : "reject", note }) })
      toast.success(approve ? "Action approuvée : l’agent reprend" : "Action refusée")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setActing(null)
    }
  }

  async function cancel(id: string) {
    setActing(id)
    try {
      await api(`/api/ai/runs/${id}/cancel`, { method: "POST" })
      toast.success("Exécution arrêtée")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <p className="flex items-center gap-2">
          {settings.configured ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
          {settings.configured ? "Passerelle IA connectée" : "Passerelle IA pas encore branchée (clé AI_GATEWAY_API_KEY)"}
        </p>
        <p className="flex items-center gap-2">
          {worker.online ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
          {worker.online
            ? `Worker IA en ligne · ${worker.running} en cours`
            : worker.lastSeen
              ? `Worker IA hors ligne depuis le ${seen.format(new Date(worker.lastSeen))}`
              : "Worker IA pas encore démarré : les exécutions attendent en file"}
          {worker.queued > 0 && <Badge variant="outline">{worker.queued} en file</Badge>}
        </p>
        <Link href="/app/settings/ai" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Modèles et plafonds
        </Link>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="offers" className="gap-1.5">
              Offres
              {drafts > 0 && (
                <Badge variant="warning" className="px-1.5 py-0">
                  {drafts}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="runs">Exécutions</TabsTrigger>
            <TabsTrigger value="approvals" className="gap-1.5">
              À valider
              {approvals.length > 0 && (
                <Badge variant="warning" className="px-1.5 py-0">
                  {approvals.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="usage">Consommation</TabsTrigger>
            {props.quality && <TabsTrigger value="quality">Qualité</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="agents" className="mt-4">
          <AgentsTab page={props.agents} skills={props.skills} />
        </TabsContent>
        <TabsContent value="skills" className="mt-4">
          <SkillsTab skills={props.skills} archived={props.archivedSkills} agents={props.agents.agents} canManage={props.can.manageSkills} workerOnline={worker.online} onOpenRun={setOpenRun} />
        </TabsContent>
        <TabsContent value="offers" className="mt-4">
          <OffersTab offers={props.offers} archived={props.archivedOffers} canManage={props.can.manageOffers} />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <RunsTab runs={runs} onOpen={setOpenRun} onCancel={cancel} acting={acting} />
        </TabsContent>
        <TabsContent value="approvals" className="mt-4 space-y-3">
          {approvals.length ? (
            approvals.map((a) => <ApprovalCard key={a.id} approval={a} onDecide={decide} busy={acting === a.id} />)
          ) : (
            <p className="text-sm text-muted-foreground">Rien à valider. Un email, une recherche ou un lien envoyé au prospect par un agent attendra ici votre accord.</p>
          )}
        </TabsContent>
        <TabsContent value="usage" className="mt-4 space-y-4">
          <Card className="space-y-5 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p>
                <span className="text-3xl font-extrabold tabular-nums">{formatEur(settings.month.spentEur)}</span>
                <span className="ml-2 text-muted-foreground">
                  sur {formatEur(settings.month.capEur)} en {monthName(settings.month.key)}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Vous aujourd’hui : <span className="font-medium tabular-nums text-foreground">{formatEur(settings.me.todayEur)}</span> sur {formatEur(settings.me.quotaEur)}
              </p>
            </div>
            {settings.month.heldEur > 0 && <p className="text-sm text-muted-foreground">{formatEur(settings.month.heldEur)} réservés par des exécutions en cours.</p>}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <SpendList title="Par agent" lines={settings.month.byAgent} />
              <SpendList title="Par modèle" lines={settings.month.byModel} />
              {settings.month.byUser && <SpendList title="Par personne" lines={settings.month.byUser} />}
            </div>
          </Card>
          <p className="text-sm text-muted-foreground">
            Les plafonds et les modèles se règlent dans{" "}
            <Link href="/app/settings/ai" className="font-medium text-foreground underline-offset-4 hover:underline">
              Réglages › Intelligence artificielle
            </Link>
            .
          </p>
        </TabsContent>
        {props.quality && (
          <TabsContent value="quality" className="mt-4">
            <QualityTab initialDashboard={props.quality.dashboard} initialPage={props.quality.page} evaluate={props.quality.evaluate} onOpenRun={setOpenRun} />
          </TabsContent>
        )}
      </Tabs>

      <RunSheet runId={openRun} onClose={() => setOpenRun(null)} />
    </div>
  )
}
