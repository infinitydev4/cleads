"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ListFilter, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useLiveRuns } from "@/components/crm/ai/use-live-runs"
import { formatCount } from "@/features/metrics/definitions"
import { VERDICT_LABELS } from "@/features/relevance/labels"
import type { RelevanceItem, RelevanceView } from "@/features/relevance/service"
import { api } from "../../leads/api"

/**
 * Jev's sorting of the campaign's fiches (E25): how many are good targets, the ones it left to a person, and where to
 * start. Imports into the campaign are sorted on their own; « Trier les fiches » takes the ones left.
 */
const pct = (n: number | null) => (n == null ? "" : ` (${Math.round(n * 100)} %)`)

function Decide({ item, campaignId, onDone }: { item: RelevanceItem; campaignId: string; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  async function decide(decision: "RELEVANT" | "MAYBE" | "NOT_RELEVANT") {
    setBusy(decision)
    try {
      await api(`/api/campaigns/${campaignId}/relevance/${item.id}`, { method: "PATCH", body: JSON.stringify({ decision }) })
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(null)
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <Link href={`/app/leads/${item.lead.id}`} prefetch={false} className="font-medium underline-offset-2 hover:underline">{item.lead.name}</Link>
        <p className="text-xs text-muted-foreground">
          {item.lead.city ? `${item.lead.city} · ` : ""}
          {item.verdict ? `Jev penche pour « ${VERDICT_LABELS[item.verdict]} »${pct(item.confidence)}` : "Jev n’a pas tranché"}
        </p>
      </div>
      <div className="flex gap-1">
        {(["RELEVANT", "MAYBE", "NOT_RELEVANT"] as const).map((v) => (
          <Button key={v} size="sm" variant={v === item.verdict ? "secondary" : "ghost"} onClick={() => decide(v)} loading={busy === v} disabled={!!busy}>
            {VERDICT_LABELS[v]}
          </Button>
        ))}
      </div>
    </li>
  )
}

export function RelevanceCard({ view, campaignId, userId }: { view: RelevanceView; campaignId: string; userId: string }) {
  const router = useRouter()
  const [sorting, setSorting] = useState(false)
  const working = !!view.run
  useLiveRuns(userId, working)
  const refresh = () => router.refresh()
  const link = (relevance: string) => `/app/leads?campaign=${campaignId}&relevance=${relevance}`
  const figures = [
    { key: "relevant", label: "Pertinentes", value: view.counts.relevant },
    { key: "maybe", label: "Possibles", value: view.counts.maybe },
    { key: "not", label: "Non pertinentes", value: view.counts.notRelevant },
    { key: "pending", label: "À trancher", value: view.counts.toDecide },
    { key: "unsorted", label: "Pas encore triées", value: view.counts.unsorted },
  ]
  const total = figures.reduce((s, f) => s + f.value, 0)

  async function sort() {
    setSorting(true)
    try {
      const r = await api<{ queued: number }>(`/api/campaigns/${campaignId}/relevance`, { method: "POST" })
      toast.success(`Jev trie ${formatCount(r.queued)} fiche${r.queued > 1 ? "s" : ""}.`)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec")
    } finally {
      setSorting(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" aria-hidden="true" /> Pertinence des fiches (Jev)</h2>
          <p className="text-sm text-muted-foreground">
            Jev juge chaque fiche importée pour la cible de la campagne{view.offer ? ` et l’offre « ${view.offer} »` : ""}. Quand il est sûr de lui, il range la fiche ; sinon, il vous laisse trancher. Il ne change rien d’autre à la fiche.
          </p>
          {!view.offer && <p className="text-xs text-muted-foreground">Sans offre phare, il juge sur le métier et la zone : choisissez-en une dans « Modifier ».</p>}
        </div>
        {view.canSort && view.counts.unsorted > 0 && !working && (
          <Button variant="outline" onClick={sort} loading={sorting} disabled={!view.configured}>
            <ListFilter className="h-4 w-4" aria-hidden="true" /> Trier les fiches
          </Button>
        )}
      </div>
      {working && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Jev trie les fiches de la campagne…</p>}
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune fiche dans la campagne pour l’instant.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {figures.map((f) => (
            <div key={f.key} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">
                {f.value > 0 ? <Link href={link(f.key)} className="underline-offset-2 hover:underline">{formatCount(f.value)}</Link> : "0"}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {view.best.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Par où commencer</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {view.best.map((b) => (
              <li key={b.id}>
                <Link href={`/app/leads/${b.lead.id}`} prefetch={false} className="inline-flex rounded-full border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent">{b.lead.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.toDecide.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">À trancher</p>
          <ul className="mt-1 divide-y">
            {view.toDecide.map((item) => (view.canDecide ? <Decide key={item.id} item={item} campaignId={campaignId} onDone={refresh} /> : <li key={item.id} className="py-2 text-sm">{item.lead.name}</li>))}
          </ul>
          {view.counts.toDecide > view.toDecide.length && <Link href={link("pending")} className="text-sm underline-offset-2 hover:underline">Voir les {formatCount(view.counts.toDecide)} fiches à trancher</Link>}
        </div>
      )}
    </Card>
  )
}
