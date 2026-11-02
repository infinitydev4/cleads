"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { BILLING_LABELS, CATEGORY_LABELS, OFFER_BILLINGS, OFFER_CATEGORIES } from "@/features/offers/labels"
import { OFFER_SIGNALS, SIGNAL_GROUPS, SIGNAL_KEYS, type SignalGroup } from "@/features/offers/signals"
import type { OfferView } from "@/features/offers/service"
import { api } from "../leads/api"

const GROUPS = Object.keys(SIGNAL_GROUPS) as SignalGroup[]
const int = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)))

/** Creates an offer or edits its content; activation and archiving are separate, explicit actions. */
export function OfferDialog({ offer, onClose, onSaved }: { offer: OfferView | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: offer?.name ?? "",
    category: offer?.category ?? "WEBSITE",
    summary: offer?.summary ?? "",
    billing: offer?.billing ?? "ONE_OFF",
    priceMinEur: offer?.priceMinEur != null ? String(offer.priceMinEur) : "",
    priceMaxEur: offer?.priceMaxEur != null ? String(offer.priceMaxEur) : "",
    priceNote: offer?.priceNote ?? "",
    deliverables: (offer?.deliverables ?? []).join("\n"),
    angle: offer?.angle ?? "",
  })
  const [signals, setSignals] = useState<string[]>(offer?.signals ?? [])
  const [objections, setObjections] = useState(offer?.objections ?? [])
  const [activate, setActivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const quote = form.billing === "QUOTE"

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    const body = {
      name: form.name,
      category: form.category,
      summary: form.summary,
      billing: form.billing,
      priceMinEur: quote ? null : int(form.priceMinEur),
      priceMaxEur: quote ? null : int(form.priceMaxEur),
      priceNote: form.priceNote || null,
      deliverables: form.deliverables
        .split("\n")
        .map((d) => d.trim())
        .filter(Boolean),
      signals,
      angle: form.angle || null,
      objections: objections.filter((o) => o.objection.trim() || o.answer.trim()),
      ...(offer ? {} : { status: activate ? "ACTIVE" : "DRAFT" }),
    }
    try {
      if (offer) await api(`/api/ai/offers/${offer.id}`, { method: "PATCH", body: JSON.stringify(body) })
      else await api("/api/ai/offers", { method: "POST", body: JSON.stringify(body) })
      toast.success(offer ? "Offre enregistrée" : activate ? "Offre créée et activée" : "Offre créée, à valider")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{offer ? `Modifier « ${offer.name} »` : "Nouvelle offre"}</DialogTitle>
            <DialogDescription>
              {offer?.status === "ACTIVE" ? "Cette offre est active : vos changements valent nouvelle validation et s’appliquent dès la prochaine recommandation." : "Les agents ne recommandent une offre qu’une fois activée."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <FormField label="Nom" required>
              <Input value={form.name} onChange={set("name")} maxLength={80} autoFocus={!offer} />
            </FormField>
            <FormField label="Catégorie">
              {(props) => (
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as typeof f.category }))}>
                  <SelectTrigger {...props}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFER_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>
          <FormField label="Description" required hint="Ce que c’est et pour qui, en une ou deux phrases.">
            <Textarea value={form.summary} onChange={set("summary")} maxLength={500} rows={2} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-4">
            <FormField label="Facturation">
              {(props) => (
                <Select value={form.billing} onValueChange={(v) => setForm((f) => ({ ...f, billing: v as typeof f.billing }))}>
                  <SelectTrigger {...props}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFER_BILLINGS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {BILLING_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Prix minimum (€ HT)">
              <Input type="number" inputMode="numeric" min={0} step={50} value={quote ? "" : form.priceMinEur} onChange={set("priceMinEur")} disabled={quote} />
            </FormField>
            <FormField label="Prix maximum (€ HT)">
              <Input type="number" inputMode="numeric" min={0} step={50} value={quote ? "" : form.priceMaxEur} onChange={set("priceMaxEur")} disabled={quote} />
            </FormField>
            <FormField label="Précision" hint="Hors budget média…">
              <Input value={form.priceNote} onChange={set("priceNote")} maxLength={120} />
            </FormField>
          </div>
          <FormField label="Livrables" hint="Un par ligne.">
            <Textarea value={form.deliverables} onChange={set("deliverables")} rows={4} />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Signaux de l’audit qui la justifient</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <div key={g} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">{SIGNAL_GROUPS[g]}</p>
                  {SIGNAL_KEYS.filter((k) => OFFER_SIGNALS[k].group === g).map((k) => (
                    <label key={k} className="flex items-start gap-2 text-sm">
                      <Checkbox checked={signals.includes(k)} onCheckedChange={(v) => setSignals((list) => (v === true ? [...list, k] : list.filter((x) => x !== k)))} className="mt-0.5" />
                      {OFFER_SIGNALS[k].label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
          <FormField label="Angle" hint="L’argument d’ouverture, à adapter à chaque prospect.">
            <Textarea value={form.angle} onChange={set("angle")} maxLength={600} rows={2} />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Objections et réponses</legend>
            {objections.map((o, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1.5fr_auto]">
                <Input value={o.objection} onChange={(e) => setObjections((l) => l.map((x, j) => (j === i ? { ...x, objection: e.target.value } : x)))} placeholder="« C’est trop cher »" aria-label="Objection" maxLength={300} />
                <Textarea value={o.answer} onChange={(e) => setObjections((l) => l.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} placeholder="Réponse" aria-label="Réponse" rows={2} maxLength={600} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setObjections((l) => l.filter((_, j) => j !== i))} aria-label="Retirer cette objection">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {objections.length < 8 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setObjections((l) => [...l, { objection: "", answer: "" }])}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter une objection
              </Button>
            )}
          </fieldset>
          {!offer && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={activate} onCheckedChange={(v) => setActivate(v === true)} className="mt-0.5" />
              Activer tout de suite : les agents pourront la recommander
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={busy}>
              {offer ? "Enregistrer" : "Créer l’offre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
