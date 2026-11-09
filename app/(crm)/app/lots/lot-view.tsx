"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { formatPhone } from "@/lib/crm/normalize"
import { cn } from "@/lib/utils"
import { MAX_LOT, lotName, parseLotPrompt, type LotRequest } from "@/features/lots/prompt"
import type { LotPreview } from "@/features/lots/service"
import type { SearchView } from "@/features/search/service"
import { api } from "../leads/api"
import { initialsOf } from "../closer-fiche"

type Step = "ask" | "plan" | "searching" | "preview" | "sent"

const STEPS: { id: Step[]; label: string }[] = [
  { id: ["ask"], label: "Ta demande" },
  { id: ["plan"], label: "Plan" },
  { id: ["searching"], label: "Préparation" },
  { id: ["preview", "sent"], label: "Envoi au closer" },
]

const SITE = {
  none: { label: "Aucun site", tone: "bg-destructive-subtle text-destructive-text", dot: "rounded-full bg-destructive" },
  social: { label: "Réseaux seulement", tone: "bg-warning-subtle text-warning", dot: "rounded-[2px] bg-warning" },
  real: { label: "Site", tone: "bg-success-subtle text-success", dot: "rounded-full bg-success" },
} as const

/**
 * Prepare a batch for a closer (9 November 2026, maquette « Manager »): a sentence read without any model, the plan
 * shown before anything runs, the free Extractor search, the businesses kept (no real site when asked, a phone), then
 * the batch filed in its campaign and given to a closer.
 */
export function LotView({ closers }: { closers: { id: string; name: string; leads: number }[] }) {
  const [prompt, setPrompt] = useState("Trouve 100 électriciens à Nantes sans site web")
  const [req, setReq] = useState<LotRequest>({ activity: "", location: "", count: 100, noSite: true })
  const [step, setStep] = useState<Step>("ask")
  const [busy, setBusy] = useState(false)
  const [lot, setLot] = useState<{ searchId: string; campaignId: string; name: string } | null>(null)
  const [search, setSearch] = useState<SearchView | null>(null)
  const [preview, setPreview] = useState<LotPreview | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [closerId, setCloserId] = useState(closers[0]?.id ?? "")
  const [sent, setSent] = useState<{ sent: number; closer: string } | null>(null)

  function read() {
    const parsed = parseLotPrompt(prompt)
    setReq((r) => ({ ...r, ...parsed }))
    setStep("plan")
  }

  async function launch() {
    setBusy(true)
    try {
      const started = await api<{ searchId: string; campaignId: string; name: string }>("/api/lots", { method: "POST", body: JSON.stringify(req) })
      setLot(started)
      setStep("searching")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  // The Extractor works in the background: ask where it stands until it is done, then read what the batch keeps.
  useEffect(() => {
    if (step !== "searching" || !lot) return
    let stop = false
    const tick = async () => {
      try {
        const s = await api<SearchView>(`/api/searches/${lot.searchId}`)
        if (stop) return
        setSearch(s)
        if (s.status === "COMPLETED") {
          const p = await api<LotPreview>(`/api/lots/${lot.searchId}?count=${req.count}&noSite=${req.noSite ? 1 : 0}`)
          if (!stop) {
            setPreview(p)
            setStep("preview")
          }
          return
        }
        if (s.status === "FAILED" || s.status === "CANCELLED") {
          toast.error(s.error ?? "La recherche s’est arrêtée.")
          return
        }
      } catch (e) {
        if (!stop) toast.error(e instanceof Error ? e.message : "Échec")
      }
      if (!stop) timer = setTimeout(tick, 5000)
    }
    let timer = setTimeout(tick, 1500)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [step, lot, req.count, req.noSite])

  const chosen = useMemo(() => (preview?.kept ?? []).filter((c) => !excluded.has(c.id)), [preview, excluded])

  async function send() {
    if (!lot || !closerId) return
    setBusy(true)
    try {
      const r = await api<{ sent: number }>(`/api/lots/${lot.searchId}`, { method: "POST", body: JSON.stringify({ ids: chosen.map((c) => c.id), closerId }) })
      setSent({ sent: r.sent, closer: closers.find((c) => c.id === closerId)?.name ?? "le closer" })
      setStep("sent")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id.includes(step))
  const ready = req.activity.trim().length >= 2 && req.location.trim().length >= 2 && req.count >= 1
  const progress = search ? Math.round((search.counters.tasksDone / Math.max(1, search.counters.tasksTotal)) * 100) : 0

  return (
    <div className="space-y-6">
      <section aria-label="Préparer un lot" className="space-y-4 rounded-3xl bg-sidebar px-7 py-7 text-sidebar-foreground shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.035em] text-white">Préparer un lot pour un closer</h1>
            <p className="text-sm text-sidebar-foreground/80">Dis ce que tu cherches : Cleads trouve, vérifie les sites et prépare les fiches. Sans IA payante.</p>
          </div>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground">0 € d’IA</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <label htmlFor="lot-prompt" className="sr-only">Ta demande</label>
          <textarea
            id="lot-prompt"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); read() } }}
            className="min-h-16 flex-[1_1_420px] resize-y rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-base leading-relaxed text-white placeholder:text-sidebar-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="Trouve 100 plombiers à Lyon sans site web"
          />
          <Button onClick={read} disabled={step === "searching"} className="min-h-16 rounded-2xl px-6 text-[15px] font-extrabold">Préparer le lot</Button>
        </div>
        <ol aria-label="Étapes" className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s.label} aria-current={i === stepIndex ? "step" : undefined} className={cn("inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-bold", i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-white/5 text-sidebar-foreground/70")}>
              {i + 1} · {s.label}
            </li>
          ))}
        </ol>
      </section>

      {step === "plan" && (
        <section aria-label="Plan du lot" className="space-y-5 rounded-3xl border bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-extrabold">Ce que Cleads va faire</h2>
            <span className="text-sm text-muted-foreground">Rien n’est écrit avant ton clic</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Métier"><input value={req.activity} onChange={(e) => setReq({ ...req, activity: e.target.value })} className={inputCls} placeholder="électricien" /></Field>
            <Field label="Ville ou zone"><input value={req.location} onChange={(e) => setReq({ ...req, location: e.target.value })} className={inputCls} placeholder="Nantes" /></Field>
            <Field label={`Nombre de fiches (${MAX_LOT} au plus)`}><input type="number" min={1} max={MAX_LOT} value={req.count} onChange={(e) => setReq({ ...req, count: Math.min(MAX_LOT, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} /></Field>
            <label className="flex min-h-11 items-center gap-2.5 self-end rounded-xl border bg-background px-3.5 text-sm font-semibold">
              <Checkbox checked={req.noSite} onCheckedChange={(v) => setReq({ ...req, noSite: !!v })} /> Seulement sans vrai site
            </label>
          </div>
          <ol className="divide-y">
            {[
              ["Recherche Extractor", `« ${req.activity || "…"} » à ${req.location || "…"} et autour : environ ${Math.ceil(req.count * 2.5)} entreprises (Google Maps, OpenStreetMap, Sirene)`],
              ["Vérification des sites", "Un lien Facebook, Instagram, Pages Jaunes ou Linktree n’est pas un site"],
              ["Tri", `On garde les ${req.count} ${req.noSite ? "sans vrai site " : ""}qui ont un téléphone, les mieux notées d’abord`],
              ["Campagne", `« ${ready ? lotName(req) : "…"} », avec l’avis Google de chaque fiche`],
              ["Envoi", "Tu choisis le closer et décoches ce que tu veux écarter"],
            ].map(([title, detail], i) => (
              <li key={title} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3.5 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-secondary text-sm font-extrabold text-secondary-foreground">{i + 1}</span>
                <span className="min-w-0"><span className="block text-[15px] font-bold">{title}</span><span className="block text-sm text-muted-foreground">{detail}</span></span>
                <span className="rounded-full bg-success-subtle px-2.5 py-1 text-xs font-extrabold text-success">Gratuit</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={launch} loading={busy} disabled={!ready} className="min-h-12 rounded-2xl bg-sidebar px-5 font-extrabold text-sidebar-foreground hover:bg-sidebar/90">Lancer · 0 € d’IA</Button>
            <span className="text-sm text-muted-foreground">Quelques minutes. Tu peux rester sur la page pendant la recherche.</span>
          </div>
        </section>
      )}

      {step === "searching" && (
        <section aria-label="Préparation" aria-live="polite" className="space-y-4 rounded-3xl border bg-card p-6 shadow-card">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-extrabold">Recherche en cours · {lot?.name}</h2>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sidebar transition-[width]" style={{ width: `${progress}%` }} /></div>
          <p className="text-sm text-muted-foreground">{search ? `${search.counters.unique} entreprises trouvées pour l’instant` : "La recherche démarre…"}</p>
        </section>
      )}

      {(step === "preview" || step === "sent") && preview && (
        <section aria-label="Lot prêt" className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Trouvées" value={preview.found} />
            <Tile label="Avec un vrai site, écartées" value={preview.withSite} />
            <Tile label="Sans téléphone, écartées" value={preview.noPhone} />
            <Tile label="Prêtes à appeler" value={chosen.length} dark />
          </dl>

          <div className="overflow-hidden rounded-3xl border bg-card shadow-card">
            <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
              <strong className="text-base">Campagne « {lot?.name} »</strong>
              <span className="text-sm text-muted-foreground">{chosen.length} fiche{chosen.length > 1 ? "s" : ""} sélectionnée{chosen.length > 1 ? "s" : ""}</span>
              {step === "preview" && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <label htmlFor="lot-closer" className="text-sm font-bold">Envoyer à</label>
                  <select id="lot-closer" value={closerId} onChange={(e) => setCloserId(e.target.value)} className="min-h-11 rounded-xl border bg-background px-3 text-sm font-semibold">
                    {closers.length === 0 && <option value="">Aucun closer actif</option>}
                    {closers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.leads} fiches en cours</option>)}
                  </select>
                  <Button onClick={send} loading={busy} disabled={!closerId || chosen.length === 0} className="min-h-11 rounded-xl font-extrabold">Envoyer {chosen.length} fiche{chosen.length > 1 ? "s" : ""}</Button>
                </div>
              )}
            </div>
            {step === "sent" && sent && (
              <p role="status" className="flex flex-wrap items-center gap-2 border-b bg-success-subtle px-6 py-3 text-sm font-semibold text-success">
                <Check className="h-4 w-4" aria-hidden="true" /> {sent.sent} fiches sont dans la file de {sent.closer}, classées par priorité.
                <Link href="/app/closers" className="underline underline-offset-4">Voir ses fiches</Link>
              </p>
            )}
            {preview.kept.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Aucune entreprise ne correspond : élargis la zone ou enlève « sans site ».</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-[44px_minmax(0,2.4fr)_170px_minmax(0,1fr)_150px] gap-4 border-b px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                    <span><Checkbox checked={excluded.size === 0} onCheckedChange={(v) => setExcluded(v ? new Set() : new Set(preview.kept.map((c) => c.id)))} aria-label="Tout sélectionner" disabled={step === "sent"} /></span>
                    <span>Prospect</span><span>Site web</span><span>Avis Google</span><span>Téléphone</span>
                  </div>
                  <ul>
                    {preview.kept.map((c) => {
                      const on = !excluded.has(c.id)
                      const site = SITE[c.site]
                      return (
                        <li key={c.id} className={cn("grid min-h-[68px] grid-cols-[44px_minmax(0,2.4fr)_170px_minmax(0,1fr)_150px] items-center gap-4 border-b px-6 py-3.5 last:border-b-0", !on && "opacity-50")}>
                          <span><Checkbox checked={on} disabled={step === "sent"} onCheckedChange={(v) => { const next = new Set(excluded); if (v) next.delete(c.id); else next.add(c.id); setExcluded(next) }} aria-label={`Sélectionner ${c.name}`} /></span>
                          <span className="flex min-w-0 items-center gap-3">
                            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-[13px] font-extrabold text-secondary-foreground">{initialsOf(c.name)}</span>
                            <span className="min-w-0"><span className="block truncate text-[15px] font-bold">{c.name}</span><span className="block truncate text-sm text-muted-foreground">{c.city ?? "—"}</span></span>
                          </span>
                          <span><span className={cn("inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-bold", site.tone)} title={c.website ?? undefined}><span aria-hidden="true" className={cn("h-2 w-2", site.dot)} />{site.label}</span></span>
                          <span className="text-sm">{c.rating != null ? `${String(c.rating).replace(".", ",")} ★ · ${c.reviews ?? 0} avis` : "Pas d’avis"}</span>
                          <span className="text-sm font-semibold tabular-nums">{formatPhone(c.phone)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

const inputCls = "block min-h-11 w-full rounded-xl border bg-background px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-bold">{label}{children}</label>
}

function Tile({ label, value, dark = false }: { label: string; value: number; dark?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-5 py-4 shadow-card", dark ? "bg-sidebar text-sidebar-foreground" : "border bg-card")}>
      <dt className={cn("text-xs font-bold", dark ? "text-sidebar-foreground/70" : "text-muted-foreground")}>{label}</dt>
      <dd className={cn("mt-1 text-[26px] font-extrabold tabular-nums", dark && "text-primary")}>{value}</dd>
    </div>
  )
}
