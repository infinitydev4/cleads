"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Compass, Loader2, Megaphone, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { useLiveRuns } from "@/components/crm/ai/use-live-runs"
import { ACTIVE_STATUSES, formatEur } from "@/features/ai/labels"
import { BASIS_LABELS, BASIS_TONE, TARGET_STATUS_LABELS, TARGET_STATUS_TONE } from "@/features/strategy/labels"
import type { ProposalView, StrategyState, TargetView } from "@/features/strategy/service"
import { api } from "../leads/api"

/**
 * The Stratège on the Campaigns page (E25): ask it for targets, read them with their arguments, and turn the good ones
 * into a draft campaign and a search. It never launches anything: every campaign and every search is a click here.
 */

const NONE = "__none__"
const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

function AskDialog({ offers, onClose, onDone }: { offers: StrategyState["activeOffers"]; onClose: () => void; onDone: () => void }) {
  const [zone, setZone] = useState("")
  const [focus, setFocus] = useState("")
  const [offer, setOffer] = useState(NONE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api("/api/ai/strategy", { method: "POST", body: JSON.stringify({ zone: zone || undefined, focus: focus || undefined, offerSlug: offer === NONE ? undefined : offer }) })
      toast.success("Le Stratège s’y met : comptez une à deux minutes.")
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Proposer des cibles</DialogTitle>
            <DialogDescription>
              Le Stratège lit les résultats de vos campagnes, vos offres actives et les secteurs de l’Extractor. Tout est facultatif : sans consigne, il part de vos chiffres.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Zone" hint="Une ville, un département, une région.">
            <Input value={zone} onChange={(e) => setZone(e.target.value)} maxLength={120} placeholder="Lyon et alentours" autoFocus />
          </FormField>
          {offers.length > 0 && (
            <FormField label="Offre à pousser">
              {(props) => (
                <Select value={offer} onValueChange={setOffer}>
                  <SelectTrigger {...props}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Aucune en particulier</SelectItem>
                    {offers.map((o) => <SelectItem key={o.slug} value={o.slug}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}
          <FormField label="Précisions" hint="Ce que vous voulez privilégier ou éviter.">
            <Textarea value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={400} rows={3} placeholder="Des métiers où l’on prend rendez-vous par téléphone ; éviter la restauration." />
          </FormField>
          <p className="text-xs text-muted-foreground">Une proposition coûte en général 0,10 à 0,30 € (plafond de l’agent). Elle ne lance rien.</p>
          {error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={busy}>Proposer des cibles</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LaunchDialog({ target, onClose, onDone }: { target: TargetView; onClose: () => void; onDone: () => void }) {
  const [activity, setActivity] = useState(target.search.activity)
  const [location, setLocation] = useState(target.search.location)
  const [results, setResults] = useState(String(target.search.maxResults))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api(`/api/ai/strategy/targets/${target.id}`, { method: "POST", body: JSON.stringify({ action: "search", search: { activity, location, maxResults: Math.round(Number(results) || 0) } }) })
      toast.success("Recherche lancée")
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Lancer la recherche</DialogTitle>
            <DialogDescription>
              {target.campaign ? `Pour la campagne « ${target.campaign.name} ».` : `La campagne « ${target.campaignName} » est créée en brouillon d’abord.`} La recherche part dans l’Extractor ; vous importerez ses résultats depuis Recherche, et Jev triera les fiches importées.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Activité" required>
              <Input value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={100} />
            </FormField>
            <FormField label="Lieu" required>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
            </FormField>
          </div>
          <FormField label="Nombre de résultats" hint="10 à 1 000.">
            <Input type="number" inputMode="numeric" min={10} max={1000} value={results} onChange={(e) => setResults(e.target.value)} />
          </FormField>
          {error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={busy}><Search className="h-4 w-4" aria-hidden="true" /> Lancer la recherche</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TargetCard({ target, canManage, canLaunch, onChanged }: { target: TargetView; canManage: boolean; canLaunch: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<"campaign" | "dismiss" | null>(null)
  const [launching, setLaunching] = useState(false)
  const open = target.status === "PROPOSED" || target.status === "CAMPAIGN"

  async function act(action: "campaign" | "dismiss") {
    setBusy(action)
    try {
      await api(`/api/ai/strategy/targets/${target.id}`, { method: "POST", body: JSON.stringify({ action }) })
      toast.success(action === "campaign" ? "Campagne créée en brouillon" : "Cible écartée")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-label={`Cible ${target.rank} : ${target.sector}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{target.rank}. {target.sector}</h3>
          <p className="text-xs text-muted-foreground">{target.zones.join(" · ")}</p>
        </div>
        <Badge variant={TARGET_STATUS_TONE[target.status]}>{TARGET_STATUS_LABELS[target.status]}</Badge>
      </div>
      <p className="text-sm"><span className="font-medium">Offre phare :</span> {target.offer.name}</p>
      {target.angle && <p className="text-sm text-muted-foreground">{target.angle}</p>}
      {target.pains.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Douleurs du métier</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{target.pains.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pourquoi</p>
        <ul className="mt-1 space-y-1.5 text-sm">
          {target.rationale.map((r, i) => (
            <li key={i} className="flex gap-2">
              <Badge variant={BASIS_TONE[r.basis]} className="mt-0.5 shrink-0 whitespace-nowrap">{BASIS_LABELS[r.basis]}</Badge>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Recherche proposée : « {target.search.activity} », {target.search.location}, {target.search.maxResults} résultats
        {target.knownCount != null && ` · ${target.knownCount} entreprises déjà connues de l’Extractor`}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
        {target.campaign && (
          <Button asChild variant="outline" size="sm"><Link href={`/app/campaigns/${target.campaign.id}`}><Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> {target.campaign.name}</Link></Button>
        )}
        {target.launched && (
          <Button asChild variant="outline" size="sm"><Link href={`/app/search/${target.launched.id}`}><Search className="h-3.5 w-3.5" aria-hidden="true" /> Recherche : {target.launched.status}</Link></Button>
        )}
        {open && canManage && target.status === "PROPOSED" && (
          <Button size="sm" variant="secondary" onClick={() => act("campaign")} loading={busy === "campaign"} disabled={!!busy}>Créer la campagne</Button>
        )}
        {open && canLaunch && (
          <Button size="sm" onClick={() => setLaunching(true)} disabled={!!busy}><Search className="h-3.5 w-3.5" aria-hidden="true" /> Lancer la recherche…</Button>
        )}
        {open && canManage && (
          <Button size="sm" variant="ghost" onClick={() => act("dismiss")} loading={busy === "dismiss"} disabled={!!busy}><X className="h-3.5 w-3.5" aria-hidden="true" /> Écarter</Button>
        )}
        {target.decidedBy && !open && <span className="text-xs text-muted-foreground">par {target.decidedBy}</span>}
      </div>
      {launching && <LaunchDialog target={target} onClose={() => setLaunching(false)} onDone={() => { setLaunching(false); onChanged() }} />}
    </article>
  )
}

function Proposal({ proposal, canManage, canLaunch, onChanged }: { proposal: ProposalView; canManage: boolean; canLaunch: boolean; onChanged: () => void }) {
  const run = proposal.run
  const working = !!run && ACTIVE_STATUSES.includes(run.status)
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {when.format(new Date(proposal.createdAt))}
        {proposal.requestedBy && ` · demandée par ${proposal.requestedBy}`}
        {proposal.brief.zone && ` · zone : ${proposal.brief.zone}`}
        {run && !working && ` · ${formatEur(run.costEur)}`}
        {proposal.sectorsFrom === "crm" && " · secteurs tirés du CRM (l’Extractor n’a pas répondu)"}
      </p>
      {working && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Le Stratège lit vos résultats et les secteurs de l’Extractor… (une à deux minutes)</p>
      )}
      {run && !working && !proposal.targets.length && <p className="text-sm text-destructive-text">{run.error ?? "Le Stratège n’a rien proposé."}</p>}
      {proposal.summary && <p className="text-sm">{proposal.summary}</p>}
      {proposal.targets.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {proposal.targets.map((t) => <TargetCard key={t.id} target={t} canManage={canManage} canLaunch={canLaunch} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  )
}

export function StrategyPanel({ state, userId, canManage }: { state: StrategyState; userId: string; canManage: boolean }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [latest, ...older] = state.proposals
  const working = state.proposals.some((p) => p.run && ACTIVE_STATUSES.includes(p.run.status))
  useLiveRuns(userId, working)
  const refresh = () => router.refresh()

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Compass className="h-4 w-4" aria-hidden="true" /> Stratège</h2>
          <p className="text-sm text-muted-foreground">
            Il croise vos offres actives, les résultats de vos campagnes et les secteurs de l’Extractor, puis propose quelques cibles argumentées. Il ne lance rien : vous créez chaque campagne et lancez chaque recherche.
          </p>
        </div>
        {state.canAsk && (
          <Button onClick={() => setAsking(true)} disabled={working || !!state.blocked?.startsWith("Aucune offre") || !!state.blocked?.startsWith("L’IA")}>
            <Compass className="h-4 w-4" aria-hidden="true" /> Proposer des cibles
          </Button>
        )}
      </div>
      {state.blocked && <p className="text-sm text-warning">{state.blocked}</p>}
      {latest ? <Proposal proposal={latest} canManage={canManage} canLaunch={state.canLaunch} onChanged={refresh} /> : <p className="text-sm text-muted-foreground">Aucune proposition pour l’instant.</p>}
      {older.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Propositions précédentes ({older.length})</summary>
          <div className="mt-3 space-y-6">{older.map((p) => <Proposal key={p.id} proposal={p} canManage={canManage} canLaunch={state.canLaunch} onChanged={refresh} />)}</div>
        </details>
      )}
      {asking && <AskDialog offers={state.activeOffers} onClose={() => setAsking(false)} onDone={() => { setAsking(false); refresh() }} />}
    </Card>
  )
}
