"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bookmark, Check, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/crm/form-field"
import { viewToQuery, type ViewFilters } from "@/features/leads/view-query"
import type { LeadFilters } from "@/features/leads/schemas"
import { api } from "./api"

export interface SavedViewDto {
  id: string
  name: string
  shared: boolean
  mine: boolean
  ownerName: string | null
  filters: ViewFilters
}

const toView = (f: LeadFilters): ViewFilters => ({
  q: f.q, status: f.status, owner: f.owner === "me" || f.owner === "none" ? f.owner : undefined, source: f.source, sector: f.sector, city: f.city, tag: f.tag,
  hasEmail: f.hasEmail, hasPhone: f.hasPhone, minScore: f.minScore, sort: f.sort, dir: f.dir,
})

export function ViewsMenu({ views, current, canShare }: { views: SavedViewDto[]; current: LeadFilters; canShare: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [shared, setShared] = useState(false)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const currentQuery = viewToQuery(toView(current))
  const active = views.find((v) => viewToQuery(v.filters) === currentQuery)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      await api("/api/lead-views", { method: "POST", body: JSON.stringify({ name, filters: toView(current), shared }) })
      toast.success("Vue enregistrée")
      setOpen(false)
      setName("")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/lead-views/${id}`, { method: "DELETE" })
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Bookmark className="h-4 w-4" aria-hidden="true" /> {active ? active.name : "Vues"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Vues enregistrées</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Aucune vue pour l’instant.</p>}
          {views.map((v) => (
            <DropdownMenuItem key={v.id} onSelect={() => router.push(`/app/leads${viewToQuery(v.filters) ? `?${viewToQuery(v.filters)}` : ""}`)} className="justify-between">
              <span className="flex min-w-0 items-center gap-2">
                {active?.id === v.id ? <Check className="h-4 w-4" aria-hidden="true" /> : v.shared ? <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <span className="w-4" />}
                <span className="truncate">{v.name}</span>
              </span>
              {v.mine && (
                <button aria-label={`Supprimer la vue ${v.name}`} onClick={(e) => { e.stopPropagation(); remove(v.id) }} className="rounded p-1 text-muted-foreground hover:text-destructive-text">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)} disabled={!currentQuery}>Enregistrer les filtres actuels…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={save} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Enregistrer cette vue</DialogTitle>
              <DialogDescription>Les filtres et le tri actuels, pour y revenir en un clic.</DialogDescription>
            </DialogHeader>
            <FormField label="Nom" required error={error}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. À appeler cette semaine" autoFocus />
            </FormField>
            {canShare && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Partager avec l’équipe</label>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" loading={loading} disabled={!name.trim()}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
