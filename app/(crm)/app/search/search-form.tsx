"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/crm/form-field"
import { api } from "../leads/api"

const SIZES = [50, 100, 250, 500, 1000]

export function SearchForm({ disabled, sectors, canImport }: { disabled: boolean; sectors: string[]; canImport: boolean }) {
  const router = useRouter()
  const list = useId()
  const [activity, setActivity] = useState("")
  const [location, setLocation] = useState("")
  const [enrich, setEnrich] = useState(true)
  const [maxResults, setMaxResults] = useState(100)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const { id } = await api<{ id: string }>("/api/searches", { method: "POST", body: JSON.stringify({ activity, location, enrich, maxResults }) })
      router.push(`/app/search/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <h2 className="font-bold">Nouvelle recherche</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Activité" required hint="Un métier ou un type d’entreprise.">
            <Input list={list} value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="plombier, boulangerie, expert-comptable…" disabled={disabled} />
          </FormField>
          <datalist id={list}>{sectors.map((s) => <option key={s} value={s} />)}</datalist>
          <FormField label="Zone" required hint="Une ville ou une région, pays compris pour l’étranger (Dubaï, Émirats arabes unis).">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lyon, France" disabled={disabled} />
          </FormField>
          <FormField label="Nombre de résultats maximum" hint="La recherche s’arrête quand elle les a trouvés. Plus il est grand, plus elle est longue.">
            {(field) => (
              <Select value={String(maxResults)} onValueChange={(v) => setMaxResults(Number(v))} disabled={disabled}>
                <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                <SelectContent>{SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Emails</p>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} disabled={disabled} />
              <span>Chercher les adresses email sur les sites web des entreprises <span className="block text-muted-foreground">C’est la seule façon d’obtenir des emails, mais la recherche est plus lente.</span></span>
            </label>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{canImport ? "Vous pourrez vérifier les résultats avant de les importer." : "Un manager ou un SDR importe les résultats dans les prospects."} La durée dépend de la zone et de la disponibilité des sources : aucune promesse de délai.</p>
          <Button type="submit" loading={busy} disabled={disabled || activity.trim().length < 2 || location.trim().length < 2}>
            <Search className="h-4 w-4" aria-hidden="true" /> Lancer la recherche
          </Button>
        </div>
      </form>
    </Card>
  )
}
