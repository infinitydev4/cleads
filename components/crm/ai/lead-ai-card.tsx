"use client"

import { useSyncExternalStore } from "react"
import { Sparkles, Target } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LeadDetail } from "@/features/leads/types"
import { AuditCard } from "./audit-card"
import { OffersCard } from "./offers-card"

/**
 * The fiche's AI, in two tabs (docs/crm-v1/AGENTS-IA.md §18): « Audit IA » (E20) and « Offres suggérées » (E21). Both
 * stay mounted, so switching is instant and a running job keeps being followed. The chosen tab is remembered in the
 * browser, for every fiche: a closer who works from the pitch finds it first.
 */
export type AiTab = "audit" | "offers"

const KEY = "cleads.lead-ai-tab"
const listeners = new Set<() => void>()
// What a browser without storage still remembers until the page reloads.
let memory: AiTab | null = null

function readTab(): AiTab {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === "audit" || stored === "offers") return stored
  } catch {
    // Storage blocked: fall back to what this page remembers.
  }
  return memory ?? "audit"
}

/** Also used to open a fiche on its suggested offers (the 3D panel's « Voir le pitch »). */
export function rememberAiTab(tab: AiTab) {
  try {
    localStorage.setItem(KEY, tab)
  } catch {
    // Private browsing or blocked storage: the tab changes for this view only.
  }
  memory = tab
  listeners.forEach((l) => l())
}


function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key === KEY && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function LeadAiCard({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const tab = useSyncExternalStore(subscribe, readTab, () => "audit" as AiTab)
  if (!lead.can.offers) return <AuditCard leadId={lead.id} canRun={lead.can.audit} onChanged={onChanged} />
  const count = lead.pitch?.offers ?? 0
  return (
    <Card className="p-4">
      <Tabs value={tab} onValueChange={(v) => rememberAiTab(v === "offers" ? "offers" : "audit")}>
        <TabsList aria-label="Intelligence artificielle sur cette fiche" className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="audit" className="gap-1.5">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Audit IA
          </TabsTrigger>
          <TabsTrigger value="offers" className="gap-1.5">
            <Target className="h-4 w-4" aria-hidden="true" /> Offres suggérées
            {count > 0 && (
              <>
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground tabular-nums" aria-hidden="true">
                  {count}
                </span>
                <span className="sr-only">
                  , {count} offre{count > 1 ? "s" : ""}
                </span>
              </>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="audit" forceMount className="mt-4 data-[state=inactive]:hidden">
          <AuditCard embedded leadId={lead.id} canRun={lead.can.audit} onChanged={onChanged} onShowOffers={() => rememberAiTab("offers")} />
        </TabsContent>
        <TabsContent value="offers" forceMount className="mt-4 data-[state=inactive]:hidden">
          <OffersCard embedded leadId={lead.id} onChanged={onChanged} onShowAudit={() => rememberAiTab("audit")} />
        </TabsContent>
      </Tabs>
    </Card>
  )
}
