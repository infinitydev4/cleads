"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { api } from "../api"

const empty = { name: "", website: "", phone: "", email: "", address: "", postalCode: "", city: "", sector: "", siret: "", contactName: "", jobTitle: "", contactEmail: "", contactPhone: "", tags: "", note: "" }

export function NewLeadForm() {
  const router = useRouter()
  const [v, setV] = useState(empty)
  const [error, setError] = useState<{ message: string; leadId?: string }>()
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [key]: e.target.value })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const { id } = await api<{ id: string }>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          company: { name: v.name, website: v.website, phone: v.phone, email: v.email, address: v.address, postalCode: v.postalCode, city: v.city, sector: v.sector, siret: v.siret },
          contact: v.contactName || v.contactEmail || v.contactPhone ? { name: v.contactName, jobTitle: v.jobTitle, email: v.contactEmail, phone: v.contactPhone } : undefined,
          tags: v.tags ? v.tags.split(/[,;]/) : undefined,
          note: v.note,
        }),
      })
      router.push(`/app/leads/${id}`)
    } catch (e) {
      const err = e as Error & { leadId?: string }
      setError({ message: err.message, leadId: err.leadId })
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="font-bold">Entreprise</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nom" required className="sm:col-span-2"><Input value={v.name} onChange={set("name")} autoFocus /></FormField>
          <FormField label="Site web"><Input value={v.website} onChange={set("website")} placeholder="https://" /></FormField>
          <FormField label="Téléphone" hint="Numéro étranger : commencer par +"><Input value={v.phone} onChange={set("phone")} /></FormField>
          <FormField label="Email"><Input type="email" value={v.email} onChange={set("email")} /></FormField>
          <FormField label="Secteur"><Input value={v.sector} onChange={set("sector")} /></FormField>
          <FormField label="Adresse" className="sm:col-span-2"><Input value={v.address} onChange={set("address")} /></FormField>
          <FormField label="Code postal"><Input value={v.postalCode} onChange={set("postalCode")} /></FormField>
          <FormField label="Ville"><Input value={v.city} onChange={set("city")} /></FormField>
          <FormField label="SIRET"><Input value={v.siret} onChange={set("siret")} inputMode="numeric" /></FormField>
          <FormField label="Étiquettes" hint="Séparées par des virgules"><Input value={v.tags} onChange={set("tags")} /></FormField>
        </div>
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="font-bold">Contact <span className="text-sm font-normal text-muted-foreground">(facultatif)</span></h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nom"><Input value={v.contactName} onChange={set("contactName")} /></FormField>
          <FormField label="Fonction"><Input value={v.jobTitle} onChange={set("jobTitle")} /></FormField>
          <FormField label="Email"><Input type="email" value={v.contactEmail} onChange={set("contactEmail")} /></FormField>
          <FormField label="Téléphone"><Input value={v.contactPhone} onChange={set("contactPhone")} /></FormField>
          <FormField label="Note" className="sm:col-span-2"><Textarea value={v.note} onChange={set("note")} placeholder="Contexte, d’où vient ce prospect…" /></FormField>
        </div>
      </Card>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
          {error.message} {error.leadId && <Link href={`/app/leads/${error.leadId}`} className="underline">Ouvrir la fiche existante</Link>}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Annuler</Button>
        <Button type="submit" loading={busy} disabled={v.name.trim().length < 2}>Créer la fiche</Button>
      </div>
    </form>
  )
}
