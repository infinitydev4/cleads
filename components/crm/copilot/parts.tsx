"use client"

import Link from "next/link"
import { isToolUIPart, getToolName, type UIMessage } from "ai"
import { useState } from "react"
import { AlertTriangle, Ban, Check, ClipboardCheck, ExternalLink, Loader2, Mail, Sparkles, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RUN_STATUS_LABELS, RUN_STATUS_TONE, ACTIVE_STATUSES } from "@/features/ai/labels"
import { ACTION_TITLES, ACTION_TOOLS, CONTACT_TOOLS, UNDOABLE_TOOLS, leadRefsIn, toolLabel, type LeadRef } from "@/features/copilot/labels"
import { cn } from "@/lib/utils"
import { MissionCard } from "@/components/crm/ai/mission-card"
import { useRunStatus } from "./use-run-status"

/**
 * The tool calls of a copilot answer (E24, E28), as the person sees them: a short line for what it read or did on its
 * own (with « Annuler » when it can be put back), a card to approve or refuse for what it proposes, a live card for the
 * work handed to a specialist, and a mission's plan, launched from its own card.
 */

type Part = UIMessage["parts"][number]
type ToolPart = Extract<Part, { toolCallId: string }>

export type Approve = (approvalId: string, approved: boolean) => void
/** Puts back an action done without a click; resolves to an error message, or null once done. */
export type Undo = (toolCallId: string) => Promise<string | null>

const leadLink = (id: string) => `/app/leads/${id}`

/** What a finished delegation opens, once its work is there. */
const OPEN_LABELS: Record<string, string> = { auditor: "Voir l’audit", offers: "Voir les offres", writer: "Ouvrir le brouillon", designer: "Ouvrir la maquette", qualifier: "Voir le tri", strategist: "Voir les cibles" }

function Line({ icon, children, tone = "muted" }: { icon: React.ReactNode; children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs", tone === "error" ? "text-destructive-text" : "text-muted-foreground")}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}

interface Delegation {
  agentId: string
  runId: string
  leadId?: string
  open?: string
}

function DelegationCard({ output, userId }: { output: Delegation; userId: string | null }) {
  const run = useRunStatus(output.runId, userId)
  const status = run?.status ?? "QUEUED"
  const active = ACTIVE_STATUSES.includes(status)
  const href = output.open ?? (output.leadId ? leadLink(output.leadId) : null)
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        {active ? <Loader2 className="h-4 w-4 animate-spin text-info" aria-hidden="true" /> : <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 flex-1 font-medium">{run?.agentLabel ?? "Agent"}</span>
        <Badge variant={RUN_STATUS_TONE[status]}>{RUN_STATUS_LABELS[status]}</Badge>
      </div>
      {run?.error && !active && <p className="mt-2 text-xs text-destructive-text">{run.error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {href && (status === "SUCCEEDED" || output.agentId === "designer") ? (
          <Button asChild size="sm" variant="outline">
            <Link href={href} prefetch={false}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {OPEN_LABELS[output.agentId] ?? "Ouvrir"}
            </Link>
          </Button>
        ) : (
          active && <span className="text-xs text-muted-foreground">Vous pouvez continuer : la carte se met à jour seule.</span>
        )}
      </div>
    </div>
  )
}

function ActionCard({ part, onApprove, busy }: { part: ToolPart; onApprove: Approve; busy: boolean }) {
  const name = getToolName(part)
  const approval = "approval" in part ? part.approval : undefined
  if (!approval) return null
  const contact = CONTACT_TOOLS.has(name)
  return (
    <div role="group" aria-label={ACTION_TITLES[name] ?? "Action proposée"} className={cn("rounded-lg border p-3 text-sm", contact ? "border-warning/50 bg-warning-subtle" : "border-primary/40 bg-primary/5")}>
      <p className="flex items-center gap-2 font-semibold">
        {contact ? <Mail className="h-4 w-4" aria-hidden="true" /> : <ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
        {ACTION_TITLES[name] ?? "Action proposée"}
      </p>
      <p className="mt-1 text-muted-foreground">{approval.requestReason ?? "Le copilote propose une action."}</p>
      {contact && <p className="mt-1 text-xs font-medium text-warning">Cette action contacte un prospect : relisez avant de valider.</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => onApprove(approval.id, true)} disabled={busy}>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Valider
        </Button>
        <Button size="sm" variant="outline" onClick={() => onApprove(approval.id, false)} disabled={busy}>
          Refuser
        </Button>
      </div>
    </div>
  )
}

const str = (v: unknown) => (typeof v === "string" ? v : null)

/** « Annuler » under an action done without a click; « Annulée » once put back, here or before. */
function UndoButton({ toolCallId, done, onUndo }: { toolCallId: string; done: boolean; onUndo: Undo }) {
  const [state, setState] = useState<"idle" | "busy" | "done">(done ? "done" : "idle")
  const [error, setError] = useState<string | null>(null)
  if (state === "done") return <span className="text-muted-foreground"> · annulée</span>
  return (
    <>
      {" · "}
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy")
          const failure = await onUndo(toolCallId)
          setError(failure)
          setState(failure ? "idle" : "done")
        }}
        className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        <Undo2 className="h-3 w-3" aria-hidden="true" />
        Annuler
      </button>
      {error && <span className="text-destructive-text"> · {error}</span>}
    </>
  )
}

function ToolResult({ part, userId, onUndo }: { part: ToolPart; userId: string | null; onUndo?: Undo }) {
  const name = getToolName(part)
  const output = (part as { output?: unknown }).output as Record<string, unknown> | undefined
  if (name === "open_page" && str(output?.open)) {
    return (
      <Line icon={<ExternalLink className="h-3.5 w-3.5" />}>
        {"Page ouverte · "}
        <Link href={str(output!.open)!} prefetch={false} className="underline underline-offset-4 hover:text-foreground">
          {str(output!.label) ?? "ouvrir"}
        </Link>
      </Line>
    )
  }
  if (name === "propose_mission" && str(output?.missionId)) return <MissionCard missionId={str(output!.missionId)!} userId={userId} compact />
  if (!ACTION_TOOLS.has(name)) {
    const refs = leadRefsIn(output)
    const one = refs.length === 1 ? ` · ${refs[0].name}` : refs.length > 1 ? ` · ${refs.length} fiches` : ""
    return <Line icon={<Check className="h-3.5 w-3.5" />}>{`${toolLabel(name, "done")}${one}`}</Line>
  }
  if (output?.started === true && str(output.runId) && str(output.agentId)) {
    return <DelegationCard output={output as unknown as Delegation} userId={userId} />
  }
  const leadId = str(output?.leadId)
  const open = str(output?.open)
  const url = str(output?.url)
  const label = output?.reused ? "Audit récent réutilisé : rien n’a été dépensé" : output?.done === false && str(output?.note) ? str(output!.note)! : toolLabel(name, "done")
  return (
    <Line icon={<Check className="h-3.5 w-3.5 text-success" />}>
      <span className="font-medium text-foreground">{label}</span>
      {open ? (
        <>
          {" · "}
          <Link href={open} prefetch={false} className="underline underline-offset-4 hover:text-foreground">
            ouvrir
          </Link>
        </>
      ) : (
        leadId && (
          <>
            {" · "}
            <Link href={leadLink(leadId)} prefetch={false} className="underline underline-offset-4 hover:text-foreground">
              voir la fiche
            </Link>
          </>
        )
      )}
      {url && <span className="block break-all font-mono text-[11px]">{url}</span>}
      {onUndo && UNDOABLE_TOOLS.has(name) && output?.done === true && <UndoButton toolCallId={part.toolCallId} done={output.undone === true} onUndo={onUndo} />}
    </Line>
  )
}

/** One tool call, in the state it is in. */
export function ToolPartView({ part, onApprove, onUndo, busy, userId }: { part: ToolPart; onApprove: Approve; onUndo?: Undo; busy: boolean; userId: string | null }) {
  const name = getToolName(part)
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <Line icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>{toolLabel(name, "running")}</Line>
    case "approval-requested":
      return part.approval.isAutomatic ? <Line icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>Vérification…</Line> : <ActionCard part={part} onApprove={onApprove} busy={busy} />
    case "approval-responded":
      return part.approval.approved ? (
        <Line icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>{`${ACTION_TITLES[name] ?? "Action"} : validée, en cours…`}</Line>
      ) : (
        <Line icon={<Ban className="h-3.5 w-3.5" />}>{`${ACTION_TITLES[name] ?? "Action"} : refusée`}</Line>
      )
    case "output-available":
      return <ToolResult part={part} userId={userId} onUndo={onUndo} />
    case "output-denied":
      return (
        <Line icon={<Ban className="h-3.5 w-3.5" />}>
          {`${ACTION_TITLES[name] ?? "Action"} : ${part.approval.isAutomatic ? "non proposée" : "refusée"}`}
          {part.approval.isAutomatic && part.approval.reason ? ` (${part.approval.reason})` : ""}
        </Line>
      )
    case "output-error":
      return (
        <Line icon={<AlertTriangle className="h-3.5 w-3.5" />} tone="error">
          {part.errorText}
        </Line>
      )
    default:
      return null
  }
}

/** Fiches an answer talks about: those its tools read, when the text names them. */
export function citedLeads(message: UIMessage): LeadRef[] {
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .toLowerCase()
  if (!text) return []
  const seen = new Map<string, LeadRef>()
  for (const p of message.parts) {
    if (!isToolUIPart(p) || p.state !== "output-available") continue
    for (const ref of leadRefsIn(p.output)) if (ref.name.length > 2 && text.includes(ref.name.toLowerCase()) && !seen.has(ref.id)) seen.set(ref.id, ref)
  }
  return [...seen.values()].slice(0, 8)
}

export function LeadChips({ leads }: { leads: LeadRef[] }) {
  if (!leads.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Fiches citées">
      {leads.map((l) => (
        <li key={l.id}>
          <Link href={leadLink(l.id)} prefetch={false} className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent">
            {l.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}
