"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"
import type { Assignee } from "./filter-bar"
import { LeadDetailView } from "./lead-detail-view"

/** The fiche beside the list: process a list without losing your place. */
export function LeadPanel({ id, assignees, currentUserId, onClose }: { id: string | null; assignees: Assignee[]; currentUserId: string; onClose: () => void }) {
  // What was loaded, and for which fiche: switching fiche shows the spinner again without resetting state in an effect.
  const [loaded, setLoaded] = useState<{ id: string; lead?: LeadDetail; error?: string } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api<LeadDetail>(`/api/leads/${id}`).then((lead) => !cancelled && setLoaded({ id, lead })).catch((e) => !cancelled && setLoaded({ id, error: e.message }))
    return () => { cancelled = true }
  }, [id])
  const current = loaded?.id === id ? loaded : null
  const lead = current?.lead ?? null
  const error = current?.error

  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="sr-only">Fiche prospect</SheetTitle>
          <SheetDescription asChild>
            <div>{id && <Link href={`/app/leads/${id}`} className="inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline">Ouvrir en pleine page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>}</div>
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
          {!lead && !error && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement" /></div>}
          {lead && <LeadDetailView lead={lead} assignees={assignees} currentUserId={currentUserId} onChange={(next) => setLoaded({ id: next.id, lead: next })} onDeleted={onClose} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
