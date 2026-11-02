"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Archive, ArchiveRestore, Check, CircleAlert, Pencil, Plus, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/crm/empty-state"
import { CATEGORY_LABELS, OFFER_CATEGORIES, OFFER_STATUS_LABELS, OFFER_STATUS_TONE, formatOfferPrice, withPriceNote } from "@/features/offers/labels"
import { signalLabel } from "@/features/offers/signals"
import type { OfferView } from "@/features/offers/service"
import { api } from "../leads/api"
import { OfferDialog } from "./offer-dialog"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`

/** What closers made of the advisor's suggestions of this offer; relevance once three decisions are in. */
function SuggestionStats({ stats }: { stats: OfferView["stats"] }) {
  const decided = stats.accepted + stats.rejected
  return (
    <span title="Suggestions du Conseiller offres sur les fiches, et décisions des commerciaux">
      Suggérée {stats.suggested} fois · {plural(stats.accepted, "retenue")} · {plural(stats.rejected, "écartée")}
      {decided >= 3 && ` · pertinence ${Math.round((stats.accepted / decided) * 100)} %`}
    </span>
  )
}

function OfferCard({ offer, canManage, busy, onEdit, onStatus }: { offer: OfferView; canManage: boolean; busy: boolean; onEdit: () => void; onStatus: (status: OfferView["status"]) => void }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {offer.name}
            <Badge variant={OFFER_STATUS_TONE[offer.status]}>{OFFER_STATUS_LABELS[offer.status]}</Badge>
          </p>
          <p className="text-sm font-medium tabular-nums">{withPriceNote(formatOfferPrice(offer), offer.priceNote)}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-1.5">
            {offer.status === "DRAFT" && (
              <Button size="sm" onClick={() => onStatus("ACTIVE")} disabled={busy}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Valider et activer
              </Button>
            )}
            {offer.status !== "ARCHIVED" && (
              <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Modifier
              </Button>
            )}
            {offer.status === "ACTIVE" && (
              <Button size="sm" variant="ghost" onClick={() => onStatus("DRAFT")} disabled={busy} title="Les agents ne la recommandent plus ; elle reste à revalider.">
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                Retirer des agents
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onStatus(offer.status === "ARCHIVED" ? "DRAFT" : "ARCHIVED")} disabled={busy}>
              {offer.status === "ARCHIVED" ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
              {offer.status === "ARCHIVED" ? "Restaurer" : "Archiver"}
            </Button>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{offer.summary}</p>
      {offer.signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Signaux qui la justifient">
          {offer.signals.map((s) => (
            <Badge key={s} variant="outline" className="font-normal">
              {signalLabel(s)}
            </Badge>
          ))}
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Livrables, angle et objections ({offer.deliverables.length} livrable{offer.deliverables.length > 1 ? "s" : ""}, {offer.objections.length} objection{offer.objections.length > 1 ? "s" : ""})
        </summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {offer.deliverables.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        {offer.angle && (
          <p className="mt-3">
            <span className="font-medium">Angle : </span>
            {offer.angle}
          </p>
        )}
        {offer.objections.length > 0 && (
          <dl className="mt-3 space-y-2">
            {offer.objections.map((o) => (
              <div key={o.objection}>
                <dt className="font-medium">« {o.objection} »</dt>
                <dd className="text-muted-foreground">{o.answer}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
      {(offer.reviewedAt || offer.stats.suggested > 0) && (
        <p className="text-xs text-muted-foreground">
          {offer.reviewedAt && `Validée par ${offer.reviewedBy ?? "?"} le ${day.format(new Date(offer.reviewedAt))}`}
          {offer.reviewedAt && offer.stats.suggested > 0 && " · "}
          {offer.stats.suggested > 0 && <SuggestionStats stats={offer.stats} />}
        </p>
      )}
    </Card>
  )
}

export function OffersTab({ offers, archived, canManage }: { offers: OfferView[]; archived: OfferView[]; canManage: boolean }) {
  const router = useRouter()
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<OfferView | "new" | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const list = showArchived ? archived : offers
  const drafts = offers.filter((o) => o.status === "DRAFT").length

  async function setStatus(offer: OfferView, status: OfferView["status"]) {
    setBusy(offer.id)
    try {
      await api(`/api/ai/offers/${offer.id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      toast.success(status === "ACTIVE" ? `« ${offer.name} » est active : les agents peuvent la recommander` : status === "ARCHIVED" ? "Offre archivée" : offer.status === "ARCHIVED" ? "Offre restaurée, à valider" : "Offre retirée des agents")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">Le catalogue que les agents recommandent, avec les signaux de l’audit qui justifient chaque offre. Un agent ne propose jamais une offre à valider ou archivée.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {showArchived ? "Catalogue" : `Archives${archived.length ? ` (${archived.length})` : ""}`}
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle offre
            </Button>
          )}
        </div>
      </div>
      {!showArchived && drafts > 0 && (
        <Card className="flex items-start gap-3 border-warning/40 p-4 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {drafts} offre{drafts > 1 ? "s" : ""} {drafts > 1 ? "attendent" : "attend"} une validation.{" "}
            {canManage ? "Vérifiez prix, livrables et objections (les prix du catalogue V1 sont indicatifs), puis activez-les : les agents ne recommandent que les offres actives." : "Le propriétaire ou un manager doit les valider avant que les agents les recommandent."}
          </span>
        </Card>
      )}
      {list.length === 0 ? (
        <EmptyState art="target" title={showArchived ? "Aucune offre archivée" : "Aucune offre"} description={showArchived ? undefined : "Ajoutez les offres que vos closers vendent : les agents s’appuieront dessus pour leurs recommandations."} />
      ) : (
        OFFER_CATEGORIES.filter((c) => list.some((o) => o.category === c)).map((c) => (
          <section key={c} aria-labelledby={`offers-${c}`} className="space-y-3">
            <h3 id={`offers-${c}`} className="text-sm font-bold">
              {CATEGORY_LABELS[c]}
            </h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {list
                .filter((o) => o.category === c)
                .map((o) => (
                  <OfferCard key={o.id} offer={o} canManage={canManage} busy={busy === o.id} onEdit={() => setEditing(o)} onStatus={(s) => setStatus(o, s)} />
                ))}
            </div>
          </section>
        ))
      )}
      {editing && (
        <OfferDialog
          offer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
