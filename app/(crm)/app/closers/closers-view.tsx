"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/crm/empty-state"
import { ago } from "@/lib/crm/format"
import { leadStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import type { LeadListRow } from "@/features/leads/types"
import type { CloserSummary } from "@/features/lots/service"
import { api } from "../leads/api"
import { SiteIndicator } from "../leads/indicators"
import { initialsOf } from "../closer-fiche"

/**
 * The managers' view of their closers (9 November 2026, maquette « Manager »): a tab per closer, his week in the dark
 * band, his fiches; take some back to the pool, one or many, with their preparation kept; delete for good is the
 * owner's, after a confirmation that says what goes.
 */
export function ClosersView({ closers, initial, canDelete }: { closers: CloserSummary[]; initial: { closerId: string; rows: LeadListRow[] } | null; canDelete: boolean }) {
  const router = useRouter()
  const [closerId, setCloserId] = useState(initial?.closerId ?? null)
  const [rows, setRows] = useState<LeadListRow[]>(initial?.rows ?? [])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const current = closers.find((c) => c.id === closerId) ?? null
  const ids = useMemo(() => rows.filter((r) => selected.has(r.id)).map((r) => r.id), [rows, selected])

  async function pick(id: string) {
    setCloserId(id)
    setSelected(new Set())
    setLoading(true)
    try {
      setRows((await api<{ rows: LeadListRow[] }>(`/api/closers/${id}/leads`)).rows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setLoading(false)
    }
  }

  async function release(target: string[]) {
    setBusy(true)
    try {
      await api("/api/leads/bulk", { method: "POST", body: JSON.stringify({ ids: target, action: { type: "assign", ownerId: null } }) })
      setRows((r) => r.filter((x) => !target.includes(x.id)))
      setSelected(new Set())
      toast.success(target.length > 1 ? `${target.length} fiches sont retournées au pool, avec leur préparation.` : "La fiche est retournée au pool, avec sa préparation.")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const r = await api<{ deleted: number }>("/api/leads/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) })
      setRows((all) => all.filter((x) => !ids.includes(x.id)))
      setSelected(new Set())
      setConfirming(false)
      toast.success(`${r.deleted} fiche${r.deleted > 1 ? "s supprimées" : " supprimée"} définitivement.`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  if (closers.length === 0) {
    return <EmptyState art="target" title="Aucun closer actif" description="Invite un closer depuis Équipe : ses fiches et sa semaine apparaîtront ici." action={<Button asChild><Link href="/app/settings/team">Inviter un closer</Link></Button>} />
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Closers" className="flex flex-wrap gap-2.5">
        {closers.map((c) => {
          const on = c.id === closerId
          return (
            <button key={c.id} role="tab" aria-selected={on} onClick={() => pick(c.id)} className={cn("flex min-h-[60px] items-center gap-3 rounded-2xl border py-2 pl-2.5 pr-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent")}>
              <span aria-hidden="true" className={cn("grid h-10 w-10 place-items-center rounded-xl font-extrabold", on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{initialsOf(c.name)}</span>
              <span><span className="block text-[15px] font-bold">{c.name}</span><span className="block text-xs opacity-75">{c.leads} fiche{c.leads > 1 ? "s" : ""} dans sa file</span></span>
            </button>
          )
        })}
        <Button asChild variant="outline" className="ml-auto min-h-[60px] rounded-2xl px-5 font-bold"><Link href="/app/lots">Préparer un lot</Link></Button>
      </div>

      {current && (
        <dl aria-label={`La semaine de ${current.name}`} className="grid grid-cols-2 gap-3 rounded-3xl bg-sidebar p-6 text-sidebar-foreground shadow-card lg:grid-cols-4">
          <Stat label="Dans sa file" value={current.leads} />
          <Stat label="Appelées cette semaine" value={current.calledThisWeek} />
          <Stat label="Qualifiées" value={current.qualified} />
          <Stat label="Rendez-vous pris cette semaine" value={current.meetings} accent />
        </dl>
      )}

      <section aria-label="Ses fiches" aria-busy={loading} className={cn("overflow-hidden rounded-3xl border bg-card shadow-card transition-opacity", loading && "opacity-60")}>
        <div className="flex min-h-[68px] flex-wrap items-center gap-3 border-b px-6 py-3">
          <strong className="text-base">Fiches de {current?.name}</strong>
          <span className="text-sm text-muted-foreground">{ids.length ? `${ids.length} sélectionnée${ids.length > 1 ? "s" : ""}` : "Coche des fiches pour les retirer en lot"}</span>
          {ids.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button onClick={() => release(ids)} loading={busy && !confirming} className="min-h-11 rounded-xl bg-sidebar font-bold text-sidebar-foreground hover:bg-sidebar/90">Retirer au closer · retour au pool</Button>
              {canDelete && <Button variant="outline" onClick={() => setConfirming(true)} className="min-h-11 rounded-xl border-destructive/40 font-bold text-destructive-text hover:bg-destructive-subtle">Supprimer définitivement</Button>}
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{loading ? "Chargement…" : "Sa file est vide : prépare-lui un lot."}</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className="grid grid-cols-[44px_minmax(0,2.4fr)_160px_minmax(0,1.3fr)_140px_110px] gap-4 border-b px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                <span><Checkbox checked={ids.length === rows.length} onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Tout sélectionner" /></span>
                <span>Prospect</span><span>Site web</span><span>Où il en est</span><span>Dernier contact</span><span className="sr-only">Retirer</span>
              </div>
              <ul>
                {rows.map((r) => {
                  const on = selected.has(r.id)
                  return (
                    <li key={r.id} className={cn("grid min-h-[68px] grid-cols-[44px_minmax(0,2.4fr)_160px_minmax(0,1.3fr)_140px_110px] items-center gap-4 border-b px-6 py-3.5 last:border-b-0", on && "bg-info-subtle/50")}>
                      <span><Checkbox checked={on} onCheckedChange={(v) => { const next = new Set(selected); if (v) next.add(r.id); else next.delete(r.id); setSelected(next) }} aria-label={`Sélectionner ${r.name}`} /></span>
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-[13px] font-extrabold text-secondary-foreground">{initialsOf(r.name)}</span>
                        <span className="min-w-0"><Link href={`/app/leads/${r.id}`} className="block truncate text-[15px] font-bold hover:underline">{r.name}</Link><span className="block truncate text-sm text-muted-foreground">{[r.city, r.sector].filter(Boolean).join(" · ") || "—"}</span></span>
                      </span>
                      <span><SiteIndicator state={r.site} className="rounded-full bg-secondary/70 px-3 py-1" /></span>
                      <span className="min-w-0 text-sm font-semibold">{leadStatus[r.status].label}{r.next ? <span className="block truncate text-xs font-normal text-muted-foreground">{r.next.title}</span> : null}</span>
                      <span className="text-sm text-muted-foreground">{ago(r.lastContactedAt)}</span>
                      <span className="flex justify-end"><Button variant="outline" size="sm" className="min-h-10 rounded-xl font-bold" disabled={busy} onClick={() => release([r.id])} aria-label={`Retirer ${r.name} au closer`}>Retirer</Button></span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {ids.length} fiche{ids.length > 1 ? "s" : ""} pour de bon ?</DialogTitle>
            <DialogDescription>Les fiches, leurs appels, notes et préparations sont effacés de Cleads. On ne peut pas revenir en arrière. Pour simplement les reprendre à {current?.name}, préfère « Retirer au closer ». Chaque suppression est consignée au journal d’audit.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Annuler</Button>
            <Button variant="destructive" onClick={remove} loading={busy}>Supprimer définitivement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3.5">
      <dt className="text-xs font-semibold text-sidebar-foreground/70">{label}</dt>
      <dd className={cn("mt-1 text-[26px] font-extrabold tabular-nums", accent ? "text-primary" : "text-white")}>{value}</dd>
    </div>
  )
}
