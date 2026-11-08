"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ExternalLink, MessageSquareQuote, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatDate } from "@/lib/crm/format"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"
import { PRIORITY_LABELS, PriorityBadge, SiteIndicator } from "./indicators"

/**
 * The closer's desk (9 November 2026): what the fiche puts first to prepare a phone sale. Why call now, each reason
 * with its source; then the latest call script of the Conseiller offres (E21) with its offers and objections. Without
 * a script yet, one click prepares it: the audit first, then the script.
 */
export function CallBrief({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const { brief } = lead
  const pitch = brief.pitch
  const [busy, setBusy] = useState(false)

  async function prepare() {
    setBusy(true)
    try {
      if (!brief.audited) {
        await api(`/api/leads/${lead.id}/audit`, { method: "POST", body: "{}" })
        toast.success("Audit lancé : le constat arrive dans une à deux minutes, puis « Préparer le script ».")
      } else {
        await api(`/api/leads/${lead.id}/offers`, { method: "POST", body: "{}" })
        toast.success("Script en préparation : il s’affiche ici dans une minute environ.")
      }
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }
  const canPrepare = brief.audited ? lead.can.offers : lead.can.audit

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <PriorityBadge priority={brief.priority} silent />
          {PRIORITY_LABELS[brief.priority].label}
        </span>
        <SiteIndicator state={brief.site} score={brief.siteScore} />
      </div>

      <section aria-label="Pourquoi appeler maintenant" className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pourquoi appeler maintenant</h3>
        {brief.reasons.length > 0 ? (
          <ol className="space-y-2">
            {brief.reasons.map((r, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-warning-subtle text-xs font-extrabold text-warning">{i + 1}</span>
                <span>
                  {r.text}{" "}
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs font-medium text-info underline-offset-4 hover:underline">
                      {r.source}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">(nouvel onglet)</span>
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">{r.source}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun signal ni audit encore : appuie-toi sur la découverte (comment trouvent-ils leurs clients aujourd’hui ?).</p>
        )}
      </section>

      {pitch ? (
        <section aria-label="Script d’appel" className="space-y-3 rounded-xl bg-sidebar p-4 text-sidebar-foreground">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Script d’appel · préparé le {formatDate(pitch.createdAt)}
          </p>
          <p className="text-sm font-semibold leading-relaxed">{pitch.headline}</p>
          {pitch.script && (
            <>
              <ScriptLine label="Ouverture" text={pitch.script.opening} />
              <ScriptLine label="Constat" text={pitch.script.hook.text} />
              <details className="group">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                  Questions, proposition et closing
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="space-y-3 pt-2">
                  {pitch.script.questions.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide opacity-80">Découverte</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{pitch.script.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                    </div>
                  )}
                  <ScriptLine label="Proposition" text={pitch.script.proposal} />
                  <ScriptLine label="Closing" text={pitch.script.close} />
                </div>
              </details>
            </>
          )}
        </section>
      ) : (
        <section aria-label="Script d’appel" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {brief.audited ? "L’audit est prêt : le script d’appel et les offres à proposer s’en déduisent." : "Pas encore d’audit du site : il donne le constat qui ouvre l’appel, puis le script."}
          </p>
          {canPrepare && (
            <Button size="sm" onClick={prepare} disabled={busy}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {brief.audited ? "Préparer le script" : "Préparer l’appel"}
            </Button>
          )}
        </section>
      )}

      {pitch && pitch.offers.length > 0 && (
        <section aria-label="À proposer" className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">À proposer</h3>
          {pitch.offers.map((o) => (
            <div key={o.name} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{o.name}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{o.gain || o.why}</p>
              </div>
              <span className="whitespace-nowrap text-sm font-bold">{o.price}</span>
            </div>
          ))}
        </section>
      )}

      {pitch && pitch.objections.length > 0 && (
        <section aria-label="Objections probables" className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Objections probables</h3>
          {pitch.objections.map((o, i) => (
            <details key={i} className="group rounded-lg border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <MessageSquareQuote className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">« {o.objection} »</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="border-t px-3 py-2 text-sm leading-relaxed">{o.answer}</p>
            </details>
          ))}
        </section>
      )}
    </Card>
  )
}

function ScriptLine({ label, text }: { label: string; text: string }) {
  if (!text) return null
  return (
    <div className="space-y-1 border-l-2 border-primary pl-3">
      <p className="text-xs font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  )
}
