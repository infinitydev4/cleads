"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowRight, Bot, CheckCircle2, CircleAlert, Eye, ListTree, PanelsTopLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApprovalCard } from "@/components/crm/ai/approval-card"
import { RunSheet } from "@/components/crm/ai/run-sheet"
import { useCopilot } from "@/components/crm/copilot/copilot"
import { cn } from "@/lib/utils"
import { AGENTS, type AgentId } from "@/features/ai/agents"
import { RUN_STATUS_LABELS, RUN_STATUS_TONE, formatEur } from "@/features/ai/labels"
import type { RunView } from "@/features/ai/runs"
import { AGENCY_ORDER, AGENT_STATE_LABELS, postOf, type AgentState } from "@/features/hq/agency"
import type { AgentPulse, ZoneDetail } from "@/features/hq/types"
import { formatCount } from "@/features/metrics/definitions"
import { STATE_LABELS, STATE_TONE } from "@/features/studio/labels"
import { api } from "@/app/(crm)/app/leads/api"
import { AGENT_ICONS } from "../zone-icons"
import { selectAgent, selectZone, useHq, useHqStore } from "../store"
import { Glass } from "./parts"
import { Empty, OpenModule, PanelHeader, Section, Stat, useZoneDetail } from "./panel-kit"

/**
 * The panels of the AI wing (E26): the agency at work, what waits for a decision, the Studio's latest mock-ups, and
 * one agent. Live states come from the pulse the view refreshes (features/hq/agency.ts); the rest from the 2D pages'
 * own services, with their rules (Agents IA, Studio Web).
 */

const DOT: Record<AgentState, string> = {
  working: "bg-success animate-pulse motion-reduce:animate-none",
  queued: "bg-primary ring-1 ring-sidebar/30",
  waiting: "bg-[#f0b44a] animate-pulse motion-reduce:animate-none",
  idle: "bg-border",
  off: "bg-muted-foreground/30",
}

const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n > 1 ? many : one}`

/** What an agent does now, in words: its state, and the fiche it works on. */
function doing(pulse: AgentPulse | null) {
  if (!pulse) return AGENT_STATE_LABELS.idle
  const lead = pulse.current?.lead?.name
  return lead && pulse.state !== "idle" && pulse.state !== "off" ? `${AGENT_STATE_LABELS[pulse.state]} · ${lead}` : AGENT_STATE_LABELS[pulse.state]
}

function AgentGlyph({ id, state, size = "md" }: { id: AgentId; state: AgentState; size?: "md" | "lg" }) {
  const Icon = AGENT_ICONS[id]
  return (
    <span className={cn("relative grid shrink-0 place-items-center rounded-xl bg-sidebar text-primary", size === "lg" ? "h-11 w-11" : "h-8 w-8", state === "off" && "text-sidebar-muted")}>
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
      <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card", DOT[state])} aria-hidden="true" />
    </span>
  )
}

/** The worker and the gateway: without them, agents only queue (the CRM keeps working without AI). */
function Readiness({ worker, configured }: { worker: { online: boolean; queued: number }; configured: boolean }) {
  const ok = worker.online && configured
  return (
    <p className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium", ok ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning")}>
      {ok ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {!configured
        ? "Passerelle IA pas encore branchée : les agents ne peuvent pas travailler."
        : worker.online
          ? `Worker IA en ligne${worker.queued ? ` · ${plural(worker.queued, "exécution en file", "exécutions en file")}` : ""}`
          : `Worker IA hors ligne : les exécutions attendent en file${worker.queued ? ` (${formatCount(worker.queued)})` : ""}.`}
    </p>
  )
}

/** A run in a list: agent, fiche, status, cost; a click shows its steps. */
function RunRow({ run, onOpen, showAgent = true }: { run: RunView; onOpen: (id: string) => void; showAgent?: boolean }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(run.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{showAgent ? run.agentLabel : (run.lead?.name ?? "Sans fiche")}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {showAgent && `${run.lead?.name ?? "Sans fiche"} · `}
            {when.format(new Date(run.createdAt))} · {formatEur(run.costEur)}
          </span>
        </span>
        <Badge variant={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
        <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Voir les étapes</span>
      </button>
    </li>
  )
}

/** Approve or refuse from the 3D view, through the route Agents IA uses (its rights and checks). */
function useDecide(onChanged: () => void) {
  const [acting, setActing] = useState<string | null>(null)
  async function decide(id: string, approve: boolean, note?: string) {
    setActing(id)
    try {
      await api(`/api/ai/approvals/${id}`, { method: "POST", body: JSON.stringify({ decision: approve ? "approve" : "reject", note }) })
      toast.success(approve ? "Action approuvée : l’agent reprend" : "Action refusée")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setActing(null)
    }
  }
  return { acting, decide }
}

// ---------------------------------------------------------------------------------------------------------------
// The "Agents IA" space
// ---------------------------------------------------------------------------------------------------------------

export function AgentsZoneBody({ data, onChanged }: { data: Extract<ZoneDetail, { zone: "agents" }>; onChanged: () => void }) {
  const store = useHqStore()
  const pulse = useHq((s) => s.overview.agency)
  const [run, setRun] = useState<string | null>(null)
  const { acting, decide } = useDecide(onChanged)
  const agents = pulse?.agents ?? []
  const working = agents.filter((a) => a.running > 0).length
  const queued = agents.reduce((n, a) => n + a.queued, 0)
  const waiting = pulse?.approvals ?? data.approvals.length
  return (
    <>
      <Readiness worker={pulse?.worker ?? data.worker} configured={pulse?.configured ?? data.configured} />
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Agents au travail" value={formatCount(working)} />
        <Stat label="En file" value={formatCount(queued)} />
        <Stat label="À valider" value={formatCount(waiting)} tone={waiting ? "attention" : undefined} />
        <Stat label="Dépense du mois" value={formatEur(data.month.spentEur)} definition={`Coût des appels de modèles ce mois-ci, sur un plafond de ${formatEur(data.month.capEur)} pour toute l’équipe (Réglages › IA).`} />
      </div>
      <Section title="Les agents">
        <ul className="space-y-0.5">
          {AGENCY_ORDER.map((id) => {
            const def = data.agents.find((a) => a.id === id)
            const p = agents.find((a) => a.id === id) ?? null
            const state = p?.state ?? (def && !def.enabled ? "off" : "idle")
            return (
              <li key={id}>
                <button type="button" onClick={() => selectAgent(store, id, postOf(id).zone)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <AgentGlyph id={id} state={state} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{def?.label ?? AGENTS[id].label}</span>
                    <span className={cn("block truncate text-xs", state === "waiting" ? "font-semibold text-warning" : state === "working" ? "text-foreground" : "text-muted-foreground")}>{doing(p)}</span>
                  </span>
                  {p && p.today.runs > 0 && <span className="text-[11px] tabular-nums text-muted-foreground" title="Exécutions aujourd’hui">{formatCount(p.today.runs)} auj.</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </Section>
      <Section title="À valider">
        {data.approvals.length === 0 ? (
          <Empty>Rien à valider. Une action d’un agent hors du CRM (email, recherche, lien envoyé au prospect) attendra ici votre accord.</Empty>
        ) : (
          <div className="space-y-2">
            {data.approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} onDecide={a.canDecide ? decide : undefined} busy={acting === a.id} />
            ))}
          </div>
        )}
      </Section>
      <Section title="Dernières exécutions">
        {data.runs.length === 0 ? (
          <Empty>Aucune exécution pour l’instant : un audit, une offre ou une maquette lancés depuis une fiche apparaîtront ici.</Empty>
        ) : (
          <ul className="space-y-0.5">
            {data.runs.slice(0, 6).map((r) => (
              <RunRow key={r.id} run={r} onOpen={setRun} />
            ))}
          </ul>
        )}
      </Section>
      <div className="grid gap-2 sm:grid-cols-2">
        <OpenModule zone="agents" />
        <Button asChild variant="outline">
          <Link href="/app/agents?tab=approvals" prefetch={false}>
            À valider{waiting ? ` (${formatCount(waiting)})` : ""}
          </Link>
        </Button>
      </div>
      <RunSheet runId={run} onClose={() => setRun(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The "Studio Web" space
// ---------------------------------------------------------------------------------------------------------------

export function StudioZoneBody({ data }: { data: Extract<ZoneDetail, { zone: "studio" }> }) {
  const { counts, sites } = data
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Maquettes prêtes" value={formatCount(counts.ready)} />
        <Stat label="En cours" value={formatCount(counts.building)} />
        <Stat label="Briefs à relire" value={formatCount(counts.briefs)} tone={counts.briefs ? "attention" : undefined} />
        <Stat label="Visites des liens" value={formatCount(counts.visits)} definition="Ouvertures des liens partagés avec les prospects, toutes maquettes confondues (une par visiteur et par 30 minutes)." />
      </div>
      <Section title="Dernières maquettes">
        {sites.length === 0 ? (
          <Empty>Aucune maquette pour l’instant. Depuis une fiche auditée, onglet « Maquette », « Générer une landing » : le Designer propose un brief, puis construit la page.</Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {sites.map((s) => (
              <li key={s.id}>
                <Link href={`/app/studio/${s.id}`} prefetch={false} className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="relative block aspect-[16/10] overflow-hidden border-b bg-muted">
                    {s.thumb ? (
                      <img src={s.thumb} alt="" loading="lazy" className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
                    ) : (
                      <span className="grid h-full place-items-center text-muted-foreground">
                        <PanelsTopLeft className="h-6 w-6" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="block space-y-1 p-2">
                    <span className="block truncate text-xs font-semibold">{s.companyName}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant={STATE_TONE[s.state]} className="px-1.5 py-0 text-[10px]">
                        {STATE_LABELS[s.state]}
                      </Badge>
                      <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground" title="Visites du lien partagé">
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        {s.visits}
                        <span className="sr-only">visite{s.visits > 1 ? "s" : ""}</span>
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <OpenModule zone="studio" />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// One agent
// ---------------------------------------------------------------------------------------------------------------

export function AgentPanel({ id, onClose, openLead, onChanged }: { id: AgentId; onClose: () => void; openLead: (id: string) => void; onChanged: () => void }) {
  const store = useHqStore()
  const copilot = useCopilot()
  const zone = postOf(id).zone
  const pulse = useHq((s) => s.overview.agency?.agents.find((a) => a.id === id) ?? null)
  // The agents' detail (model, runs) is the control room's: loaded once for any agent, the Studio's designer included.
  const detail = useZoneDetail("agents")
  const [run, setRun] = useState<string | null>(null)
  const loaded = detail?.data
  const data = loaded && loaded.zone === "agents" && !("locked" in loaded) ? loaded : null
  const def = data?.agents.find((a) => a.id === id)
  const runs = data?.runs.filter((r) => r.agentId === id).slice(0, 4) ?? []
  const state = pulse?.state ?? (def && !def.enabled ? "off" : "idle")
  const base = AGENTS[id]
  return (
    <>
      <PanelHeader
        icon={<AgentGlyph id={id} state={state} size="lg" />}
        kicker={`Agent IA · ${zone === "studio" ? "Studio Web" : "Agents IA"}`}
        title={base.label}
        subtitle={`${AGENT_STATE_LABELS[state]}${def ? ` · ${def.model}` : ""}`}
        onClose={onClose}
        onBack={() => selectZone(store, zone)}
      />
      <div className="space-y-4 overflow-y-auto px-4 py-4">
        <p className="text-sm">{base.mission}</p>
        {pulse?.current && (
          <div className={cn("rounded-xl px-3 py-2 text-sm", state === "waiting" ? "bg-warning-subtle" : "bg-primary/20")}>
            <p className="font-semibold">{doing(pulse)}</p>
            {pulse.current.lead && (
              <button type="button" onClick={() => openLead(pulse.current!.lead!.id)} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline">
                Voir la fiche <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Exécutions aujourd’hui" value={formatCount(pulse?.today.runs ?? 0)} />
          <Stat label="Coût aujourd’hui" value={formatEur(pulse?.today.costEur ?? 0)} />
        </div>
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="font-bold uppercase tracking-wider text-muted-foreground">Ce qu’il produit</dt>
            <dd className="mt-0.5 text-sm">{base.output}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-wider text-muted-foreground">Ce qu’une personne valide</dt>
            <dd className="mt-0.5 text-sm">{base.approval}</dd>
          </div>
        </dl>
        <Section title="Ses dernières exécutions">
          {!data ? (
            <Skeleton className="h-16 w-full" />
          ) : runs.length === 0 ? (
            <Empty>Aucune exécution récente{state === "off" ? " : l’agent est désactivé (Agents IA)." : "."}</Empty>
          ) : (
            <ul className="space-y-0.5">
              {runs.map((r) => (
                <RunRow key={r.id} run={r} onOpen={setRun} showAgent={false} />
              ))}
            </ul>
          )}
        </Section>
        <div className="grid gap-2">
          {id === "copilot" && copilot.available && (
            <Button onClick={() => copilot.toggle()}>
              <Bot className="h-4 w-4" aria-hidden="true" /> {copilot.open ? "Fermer le copilote" : "Ouvrir le copilote"} <kbd className="ml-1 text-[11px] opacity-70">⌘J</kbd>
            </Button>
          )}
          {id === "designer" && <OpenModule zone="studio" />}
          <Button asChild variant="outline">
            <Link href="/app/agents" prefetch={false}>
              Voir dans Agents IA <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <RunSheet
        runId={run}
        onClose={() => {
          setRun(null)
          onChanged()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The HUD chip
// ---------------------------------------------------------------------------------------------------------------

/** Near the clock, only when something happens in the agency: who works, what waits. A click goes to the control room. */
export function AgencyChip() {
  const store = useHqStore()
  const pulse = useHq((s) => s.overview.agency)
  const locked = useHq((s) => s.overview.zones.agents.locked)
  if (!pulse || locked) return null
  const working = pulse.agents.filter((a) => a.running > 0).length
  const queued = pulse.agents.reduce((n, a) => n + a.queued, 0)
  const parts = [working ? plural(working, "agent au travail", "agents au travail") : null, pulse.approvals ? `${formatCount(pulse.approvals)} à valider` : null, !working && queued ? plural(queued, "en file", "en file") : null].filter((p): p is string => !!p)
  if (!parts.length) return null
  return (
    <Glass as="div" className="p-0">
      <button
        type="button"
        onClick={() => selectZone(store, "agents")}
        aria-label={`Agence IA : ${parts.join(", ")}. Ouvrir l’espace Agents IA (touche 9).`}
        className="flex items-center gap-2 rounded-2xl py-1.5 pl-3 pr-3 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("h-2 w-2 rounded-full animate-pulse motion-reduce:animate-none", pulse.approvals ? "bg-[#f0b44a]" : "bg-success")} aria-hidden="true" />
        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
        Agence IA
        <span className="font-medium text-muted-foreground">{parts.join(" · ")}</span>
      </button>
    </Glass>
  )
}
