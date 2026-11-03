"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACTION_FAMILIES, FAMILY_INFO, MODE_LABELS, type ActionFamily, type FamilyMode } from "@/features/ai/actions/families"
import type { AgentFamilyView, AgentView } from "@/features/ai/definitions"
import { api } from "../leads/api"

/**
 * The agents' rights matrix (E28, Agents IA › Agents): for each agent, the families of actions it works with and how.
 * The owner changes a cell; everyone else reads it. It only ever narrows what the person an agent works for may do,
 * and the rights no agent may use stay closed whatever it says.
 */

/** A specialist's workflow has a family on or off; an agent that picks its tools can also make it wait for a click. */
const modeLabel = (mode: FamilyMode, picksTools: boolean) => (picksTools ? MODE_LABELS[mode] : mode === "off" ? "Coupé" : "Autorisé")
/** What fits in a cell; the list says it in full. */
const cellLabel = (mode: FamilyMode, picksTools: boolean) => (picksTools && mode === "confirm" ? "Un clic" : modeLabel(mode, picksTools))
const TONE: Record<FamilyMode, "success" | "info" | "destructive"> = { auto: "success", confirm: "info", off: "destructive" }

function Cell({ agent, family, canEdit }: { agent: AgentView; family: AgentFamilyView; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const label = `${agent.label} · ${family.label}`
  if (!canEdit) return <Badge variant={TONE[family.mode]}>{cellLabel(family.mode, agent.picksTools)}</Badge>
  return (
    <Select
      value={family.mode}
      disabled={busy}
      onValueChange={async (mode) => {
        setBusy(true)
        try {
          await api(`/api/ai/agents/${agent.id}`, { method: "PUT", body: JSON.stringify({ actionPolicy: { [family.id]: mode } }) })
          toast.success(`${label} : ${modeLabel(mode as FamilyMode, agent.picksTools).toLowerCase()}`)
          router.refresh()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Enregistrement impossible")
        } finally {
          setBusy(false)
        }
      }}
    >
      <SelectTrigger className="h-8 w-[6.25rem] gap-1 px-2 text-xs" aria-label={label}>
        {/* The level alone: « (par défaut) » is for the list. */}
        <SelectValue>{cellLabel(family.mode, agent.picksTools)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {family.modes.map((m) => (
          <SelectItem key={m} value={m}>
            {modeLabel(m, agent.picksTools)}
            {m === family.codeMode ? " (par défaut)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function RightsMatrix({ agents, canEdit }: { agents: AgentView[]; canEdit: boolean }) {
  const columns = ACTION_FAMILIES.filter((f) => agents.some((a) => a.families.some((x) => x.id === f)))
  const stopped = agents.filter((a) => !a.picksTools && a.families.some((f) => f.mode === "off"))
  const cell = (a: AgentView, f: ActionFamily) => a.families.find((x) => x.id === f)
  return (
    <Card className="mt-6 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Droits des agents
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Ce que chaque agent peut faire, famille par famille. Un agent ne fait jamais plus que la personne pour qui il travaille ; ce qui contacte un prospect attend toujours son propre clic. {canEdit ? "Vous pouvez couper une famille ou la faire attendre un clic." : "Seul le propriétaire les modifie."}
      </p>
      <div className="relative mt-4 overflow-x-auto">
        <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Droits des agents, par famille d’actions</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card py-2 pr-2 text-left font-medium text-muted-foreground">
                Agent
              </th>
              {columns.map((f) => (
                <th key={f} scope="col" title={FAMILY_INFO[f].hint} className="px-1 py-2 text-left text-xs font-medium text-muted-foreground">
                  {FAMILY_INFO[f].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-t">
                <th scope="row" className="sticky left-0 z-10 min-w-[7rem] max-w-[9rem] border-t bg-card py-2 pr-2 text-left font-medium leading-tight">
                  {a.label}
                </th>
                {columns.map((f) => {
                  const c = cell(a, f)
                  return (
                    <td key={f} className="border-t px-1 py-2">
                      {c ? <Cell agent={a} family={c} canEdit={canEdit} /> : <span className="text-muted-foreground" aria-label="Sans objet">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stopped.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-destructive-text">
          {stopped.map((a) => (
            <li key={a.id}>
              {a.label} ne s’exécute plus : {a.families.filter((f) => f.mode === "off").map((f) => `« ${f.label} »`).join(", ")} {a.families.filter((f) => f.mode === "off").length > 1 ? "sont coupées" : "est coupée"}.
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Jamais, pour aucun agent : supprimer ou fusionner des fiches, exporter des données, gérer les boîtes mail, l’équipe, les réglages de l’IA, les skills et le catalogue d’offres.
      </p>
    </Card>
  )
}
