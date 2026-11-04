"use client"

import { useEffect, useState } from "react"
import { Binoculars, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { PeopleQuote } from "@/features/research/service"
import { api } from "../../leads/api"

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })

/**
 * The decision makers of the campaign's good targets (E30 lot 2): the Enquêteur searches the officers and the
 * marketing or sales lead of each fiche Jev kept, with their social accounts. The quote comes first; each profile then
 * waits for a click on its fiche before becoming a contact.
 */
export function PeopleCard({ campaignId, archived }: { campaignId: string; archived: boolean }) {
  const [quote, setQuote] = useState<PeopleQuote | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let cancelled = false
    api<PeopleQuote>(`/api/campaigns/${campaignId}/research`)
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote(null))
    return () => {
      cancelled = true
    }
  }, [campaignId, reloads])

  // No right to use AI, or nothing Jev kept yet: the card says nothing rather than offer a button that cannot work.
  if (!quote || archived) return null

  async function launch() {
    setBusy(true)
    try {
      const r = await api<{ runs: number; fiches: number; refused: string | null }>(`/api/campaigns/${campaignId}/research`, { method: "POST" })
      toast.success(`L’Enquêteur cherche les décideurs de ${r.fiches} fiche${r.fiches > 1 ? "s" : ""} : vous serez prévenu à la fin.`)
      if (r.refused) toast.warning(r.refused)
      setReloads((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold"><Binoculars className="h-4 w-4" aria-hidden="true" /> Décideurs des bonnes cibles</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        L’Enquêteur cherche les dirigeants du registre et, à partir de dix salariés, le responsable marketing ou commercial des fiches que Jev a jugées bonnes cibles, avec leurs comptes Instagram, Facebook, LinkedIn et TikTok. Chaque profil attend votre confirmation sur sa fiche ; aucun email n’est deviné.
      </p>
      {quote.eligible ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy} onClick={launch}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Chercher les décideurs de {quote.batch} fiche{quote.batch > 1 ? "s" : ""}
          </Button>
          <span className="text-sm text-muted-foreground">
            Environ {eur(quote.typicalEur)}, {eur(quote.maxEur)} au plus, sur le budget IA du mois.
            {quote.eligible > quote.batch && ` ${quote.eligible - quote.batch} autres au clic suivant.`}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune bonne cible à chercher : elles l’ont toutes été ce mois-ci, ou Jev n’a pas encore trié la campagne.</p>
      )}
    </Card>
  )
}
