"use client"

import { useState } from "react"
import { CircleAlert, Copy, Eye, Link2, Link2Off, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { SiteView } from "@/features/studio/labels"
import { api } from "@/app/(crm)/app/leads/api"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/**
 * The private link to send the prospect (E23): created for 30 days, extended or revoked here; sending it is an email
 * the person writes from the fiche (« Insérer le lien de la maquette »). Visits are counted without cookie or address.
 */
export function SharePanel({ site, onChanged }: { site: SiteView; onChanged: () => void }) {
  const [busy, setBusy] = useState<"create" | "extend" | "revoke" | null>(null)
  const [confirm, setConfirm] = useState(false)
  const link = site.link
  const active = !!link && !link.expired

  async function call(action: "create" | "extend") {
    setBusy(action)
    try {
      await api(`/api/studio/sites/${site.id}/link`, { method: "POST", body: JSON.stringify({ action }) })
      toast.success(action === "create" ? "Lien créé : valable 30 jours." : "Lien prolongé de 30 jours.")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function revoke() {
    setBusy("revoke")
    try {
      await api(`/api/studio/sites/${site.id}/link`, { method: "DELETE" })
      toast.success("Lien désactivé : il ne s’ouvre plus.")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
      setConfirm(false)
    }
  }

  async function copy() {
    if (!link?.url) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success("Lien copié")
    } catch {
      toast.error("Copie impossible : sélectionnez le lien et copiez-le.")
    }
  }

  return (
    <div className="space-y-4">
      {site.hostIssue && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {site.hostIssue}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="h-4 w-4" aria-hidden="true" /> Lien privé
        </h4>
        {link ? link.expired ? <Badge variant="warning">Expiré</Badge> : <Badge variant="success">Actif</Badge> : <Badge>Pas encore créé</Badge>}
        {link && <span className="text-xs text-muted-foreground">{link.expired ? "expiré le" : "valable jusqu’au"} {day.format(new Date(link.expiresAt))}</span>}
      </div>

      {active && link.url ? (
        <div className="flex min-w-0 gap-2">
          <input readOnly value={link.url} aria-label="Lien de la maquette" onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg border bg-muted/50 px-3 font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copy} aria-label="Copier le lien">
            <Copy className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Copier</span>
          </Button>
        </div>
      ) : (
        active && <p className="text-sm text-warning">Le lien ne peut plus être affiché (clé de signature changée) : créez-en un nouveau.</p>
      )}

      {site.can.share && (
        <div className="flex flex-wrap gap-2">
          {!link || link.expired || !link.url ? (
            <Button type="button" size="sm" onClick={() => call("create")} loading={busy === "create"}>
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> {link ? "Créer un nouveau lien" : "Créer le lien (30 jours)"}
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => call("extend")} loading={busy === "extend"}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Prolonger de 30 jours
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                <Link2Off className="h-3.5 w-3.5" aria-hidden="true" /> Désactiver
              </Button>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Pour l’envoyer, écrivez au prospect depuis sa fiche : « Insérer le lien de la maquette » l’ajoute au message. La page porte la mention « maquette non contractuelle », n’est pas indexée et expire après 30 jours.
      </p>

      <section className="space-y-1.5 border-t pt-4" aria-labelledby={`visits-${site.id}`}>
        <h4 id={`visits-${site.id}`} className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" aria-hidden="true" /> Visites
          <span className="font-normal tabular-nums text-muted-foreground">{site.visits.count}</span>
        </h4>
        {site.visits.recent.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {site.visits.recent.map((v) => (
              <li key={v}>
                <Badge variant="outline" className="font-normal tabular-nums">
                  {when.format(new Date(v))}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Pas encore ouverte. Vous serez prévenu dans le CRM dès que le prospect l’ouvrira.</p>
        )}
      </section>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver le lien ?</AlertDialogTitle>
            <AlertDialogDescription>La page ne s’ouvrira plus pour ceux qui ont le lien. Un nouveau lien aura une autre adresse.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={revoke} disabled={busy === "revoke"}>
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
