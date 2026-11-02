"use client"

import { useEffect, useState } from "react"
import { CircleAlert, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { cn } from "@/lib/utils"
import { formatEur } from "@/features/ai/labels"
import type { AgentView } from "@/features/ai/definitions"
import type { SkillDetail } from "@/features/ai/skills/service"
import type { LeadList } from "@/features/leads/types"
import { api } from "../leads/api"

/**
 * Tests a skill on a fiche: the chosen agent works with its persona, the team's instructions and this skill alone. It is
 * a real run, queued for the worker and billed to the person's quota (at most the agent's cap).
 */
export function SkillTestDialog({ skill, agents, workerOnline, onClose, onStarted }: { skill: SkillDetail; agents: AgentView[]; workerOnline: boolean; onClose: () => void; onStarted: (runId: string) => void }) {
  const writers = agents.filter((a) => a.usesSkills && a.enabled)
  const attached = new Set(skill.agents.map((a) => a.agentId))
  const ordered = [...writers.filter((a) => attached.has(a.id)), ...writers.filter((a) => !attached.has(a.id))]
  const [agentId, setAgentId] = useState<string>(ordered[0]?.id ?? "")
  const [q, setQ] = useState("")
  const [leads, setLeads] = useState<LeadList["rows"]>([])
  const [lead, setLead] = useState<LeadList["rows"][number] | null>(null)
  const [instruction, setInstruction] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ pageSize: "8", sort: "score" })
        if (q.trim()) params.set("q", q.trim())
        const list = await api<LeadList>(`/api/leads?${params}`)
        if (!cancelled) setLeads(list.rows)
      } catch {
        if (!cancelled) setLeads([])
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q])

  const agent = writers.find((a) => a.id === agentId)

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!lead || !agentId) return
    setBusy(true)
    setError(undefined)
    try {
      const r = await api<{ runId: string }>(`/api/ai/skills/${skill.id}/test`, { method: "POST", body: JSON.stringify({ leadId: lead.id, agentId, instruction: instruction || null }) })
      onStarted(r.runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={start} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Tester « {skill.name} »</DialogTitle>
            <DialogDescription>
              L’agent applique la version {skill.version} de ce skill, seule, à la fiche choisie, avec son rôle et les consignes de l’équipe. Il ne lit ni le site ni le web : seulement les données de la fiche.
            </DialogDescription>
          </DialogHeader>
          {!workerOnline && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Le worker IA est hors ligne : le test attendra en file son démarrage (24 heures au plus).
            </p>
          )}
          <FormField label="Agent">
            {(props) => (
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger {...props}>
                  <SelectValue placeholder="Choisir un agent" />
                </SelectTrigger>
                <SelectContent>
                  {ordered.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                      {attached.has(a.id) ? "" : " (n’a pas ce skill)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <div className="space-y-1.5">
            <label htmlFor="skill-test-search" className="block text-sm font-medium">
              Fiche
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="skill-test-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une entreprise" className="pl-9" autoComplete="off" />
            </div>
            <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border" role="listbox" aria-label="Fiches">
              {leads.length ? (
                leads.map((l) => (
                  <li key={l.id} role="option" aria-selected={lead?.id === l.id}>
                    <button type="button" onClick={() => setLead(l)} className={cn("flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-sm hover:bg-accent", lead?.id === l.id && "bg-accent font-medium")}>
                      <span>{l.name}</span>
                      <span className="text-xs text-muted-foreground">{[l.sector, l.city].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-sm text-muted-foreground">Aucune fiche trouvée.</li>
              )}
            </ul>
          </div>
          <FormField label="Demande particulière" hint="Facultatif : « Concentre-toi sur la fiche Google », « Rédige l’accroche de l’email »…">
            <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={1000} rows={2} />
          </FormField>
          {agent && <p className="text-xs text-muted-foreground">Coût réservé : {formatEur(agent.maxCostEur)} au plus, pris sur votre quota du jour ; le reste est libéré à la fin.</p>}
          {error && (
            <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={busy} disabled={!lead || !agentId}>
              Lancer le test
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
