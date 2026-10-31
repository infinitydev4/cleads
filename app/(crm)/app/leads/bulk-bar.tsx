"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { leadStatus } from "@/lib/crm/status"
import { api } from "./api"
import { EnrollDialog } from "./enroll-dialog"
import { personName, type Assignee } from "./filter-bar"

const NONE = "__none__"

/** Appears when rows are selected. Each action reports what it could not do instead of failing silently. */
export function BulkBar({ ids, assignees, currentUserId, canAssignOthers, canSequence, onDone }: { ids: string[]; assignees: Assignee[]; currentUserId: string; canAssignOthers: boolean; canSequence: boolean; onDone: () => void }) {
  const router = useRouter()
  const [tag, setTag] = useState("")
  const [busy, setBusy] = useState(false)
  const [enrolling, setEnrolling] = useState(false)

  async function run(action: object, label: string) {
    setBusy(true)
    try {
      const r = await api<{ updated: number; notAllowed: number; failures: { message: string }[] }>("/api/leads/bulk", { method: "POST", body: JSON.stringify({ ids, action }) })
      const problems = r.notAllowed + r.failures.length
      if (problems) toast.warning(`${label} : ${r.updated} fiche(s) modifiée(s), ${problems} refusée(s).`, { description: r.failures[0]?.message ?? "Fiches qui ne vous sont pas attribuées." })
      else toast.success(`${label} : ${r.updated} fiche(s).`)
      onDone()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }
  const owners = canAssignOthers ? assignees : assignees.filter((a) => a.id === currentUserId)

  return (
    <div role="region" aria-label="Actions sur la sélection" className="sticky bottom-4 z-10 mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-2xl border bg-sidebar p-3 text-sidebar-foreground shadow-pop">
      <p className="px-2 text-sm font-semibold">{ids.length} sélectionnée{ids.length > 1 ? "s" : ""}</p>
      <Select disabled={busy} onValueChange={(v) => run({ type: "assign", ownerId: v === NONE ? null : v }, "Attribution")}>
        <SelectTrigger className="h-9 w-44 border-sidebar-border bg-sidebar-accent text-sidebar-foreground" aria-label="Attribuer à"><SelectValue placeholder="Attribuer à…" /></SelectTrigger>
        <SelectContent>
          {canAssignOthers && <SelectItem value={NONE}>Pool non attribué</SelectItem>}
          {owners.map((a) => <SelectItem key={a.id} value={a.id}>{a.id === currentUserId ? "Moi" : personName(a)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select disabled={busy} onValueChange={(v) => run({ type: "status", status: v }, "Changement de statut")}>
        <SelectTrigger className="h-9 w-40 border-sidebar-border bg-sidebar-accent text-sidebar-foreground" aria-label="Changer le statut"><SelectValue placeholder="Statut…" /></SelectTrigger>
        <SelectContent>{Object.entries(leadStatus).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
      </Select>
      <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) { run({ type: "tag", tag }, "Étiquette ajoutée"); setTag("") } }}>
        <Tag className="h-4 w-4 text-sidebar-muted" aria-hidden="true" />
        <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Étiquette" aria-label="Ajouter une étiquette" className="h-9 w-32 border-sidebar-border bg-sidebar-accent text-sidebar-foreground placeholder:text-sidebar-muted" />
        <Button type="submit" size="sm" disabled={busy || !tag.trim()}>Ajouter</Button>
      </form>
      {canSequence && <Button variant="secondary" size="sm" disabled={busy} onClick={() => setEnrolling(true)}><Send className="h-4 w-4" aria-hidden="true" /> Inscrire dans une séquence</Button>}
      {enrolling && <EnrollDialog ids={ids} currentUserId={currentUserId} onClose={() => setEnrolling(false)} onDone={() => { onDone(); router.refresh() }} />}
      <Button variant="ghost" size="icon" className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent" onClick={onDone} aria-label="Désélectionner"><X className="h-4 w-4" aria-hidden="true" /></Button>
    </div>
  )
}
