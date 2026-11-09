"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CalendarDays, ChevronDown, ClipboardCheck, ExternalLink, Mail, Phone, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDate, formatDateTime } from "@/lib/crm/format"
import { formatPhone } from "@/lib/crm/normalize"
import { leadStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import { CALL_OUTCOMES, type CallOutcome } from "@/features/activity/rules"
import { QUALIFICATION_LABELS } from "@/features/pipeline/rules"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./leads/api"
import { EmailDialog } from "./leads/email-dialog"
import { MeetingDialog } from "./leads/meeting-dialog"
import { PRIORITY_LABELS, PriorityBadge, SiteIndicator } from "./leads/indicators"

type Answers = NonNullable<LeadDetail["qualification"]>

const KIND_LABELS: Record<string, string> = { CALL: "Appel", EMAIL: "Email", NOTE: "Note", MEETING: "Rendez-vous", STATUS_CHANGE: "Statut", SYSTEM: "Cleads", TASK: "Tâche" }

export const initialsOf = (name: string) =>
  name.replace(/\(.*?\)/g, "").split(/[\s—-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"

/**
 * The closer's fiche in its drawer (9 November 2026, maquette « Ma journée v2 »): one column of full-width blocks, the
 * call first. Why now, the script, qualifying while on the phone, who to ask for, the company, the history; the
 * result of a call in one click at the bottom.
 */
export function CloserFiche({ lead, currentUserId, onChange, onClose }: { lead: LeadDetail; currentUserId: string; onChange: (lead: LeadDetail) => void; onClose: () => void }) {
  const c = lead.company
  const k = lead.contact
  const name = c?.name ?? k?.name ?? "Sans nom"
  const phone = k?.phone ?? c?.phone ?? null
  const { brief } = lead
  const pitch = brief.pitch
  const [inCall, setInCall] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [answers, setAnswers] = useState<Answers>(lead.qualification ?? {})
  const [open, setOpen] = useState<Record<string, boolean>>({ hook: true })
  const canWork = lead.can.log && lead.status !== "DO_NOT_CONTACT"

  async function reload() {
    onChange(await api<LeadDetail>(`/api/leads/${lead.id}`))
  }

  async function logCall(outcome: CallOutcome) {
    setBusy(outcome)
    try {
      onChange(await api<LeadDetail>(`/api/leads/${lead.id}/activities`, { method: "POST", body: JSON.stringify({ kind: "CALL", outcome }) }))
      setInCall(false)
      toast.success(`Appel noté : ${CALL_OUTCOMES[outcome].toLowerCase()}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function qualify(decision: "save" | "qualify") {
    setBusy(decision)
    try {
      const qualification = Object.fromEntries(Object.entries(answers).filter(([key, v]) => v !== undefined && v !== "" && ["need", "budget", "authority", "timing"].includes(key)))
      const body = decision === "qualify" ? { decision, qualification, closerId: currentUserId } : { decision, qualification }
      const r = await api<{ lead: LeadDetail }>(`/api/leads/${lead.id}/qualify`, { method: "POST", body: JSON.stringify(body) })
      onChange(r.lead)
      toast.success(decision === "qualify" ? "Prospect qualifié : l’opportunité est dans ton pipeline." : "Qualification enregistrée")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function prepare() {
    setBusy("prepare")
    try {
      await api(`/api/leads/${lead.id}/${brief.audited ? "offers" : "audit"}`, { method: "POST", body: "{}" })
      toast.success(brief.audited ? "Script en préparation : il s’affiche ici dans une minute environ." : "Audit lancé : le constat arrive dans une à deux minutes, puis le script.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const steps = pitch?.script
    ? [
        { id: "hook", label: "Constat", body: pitch.script.hook.text },
        ...(pitch.script.questions.length ? [{ id: "discovery", label: "Découverte", body: pitch.script.questions.map((q) => `• ${q}`).join("\n") }] : []),
        { id: "offer", label: "Proposition", body: pitch.script.proposal },
        ...(pitch.objections.length ? [{ id: "objections", label: "Objections probables", body: pitch.objections.map((o) => `« ${o.objection} »\n→ ${o.answer}`).join("\n\n") }] : []),
        { id: "close", label: "Closing", body: pitch.script.close },
      ].filter((s) => s.body)
    : []
  const answered = (["need", "budget", "authority", "timing"] as const).filter((key) => answers[key] && answers[key] !== "unknown").length
  const qualified = lead.status === "QUALIFIED"

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-4 border-b px-6 pb-5 pt-6 sm:px-7">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-2xl bg-sidebar text-lg font-extrabold text-primary" style={{ width: 52, height: 52 }}>{initialsOf(name)}</span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-[22px] font-extrabold leading-tight tracking-[-0.025em]">{name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{[c?.city, c?.sector].filter(Boolean).join(" · ") || "Sans localisation"}</span>
              <span className="inline-flex items-center gap-1.5"><PriorityBadge priority={brief.priority} silent /><span className="text-xs font-semibold text-foreground">{PRIORITY_LABELS[brief.priority].label}</span></span>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">{leadStatus[lead.status].label}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer la fiche" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        {phone && canWork && (
          <a href={`tel:${phone}`} onClick={() => setInCall(true)} className="flex min-h-[52px] w-full items-center whitespace-nowrap justify-center gap-2.5 rounded-2xl bg-primary px-5 text-base font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Phone className="h-5 w-5" aria-hidden="true" /> Appeler {formatPhone(phone)}
          </a>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
          {lead.can.write && lead.status !== "QUALIFIED" && (
            <Button className="min-h-12 rounded-2xl bg-sidebar px-4 text-sidebar-foreground hover:bg-sidebar/90" onClick={() => document.getElementById(`qualification-${lead.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Qualifier
            </Button>
          )}
          {lead.can.meet && <Button variant="outline" className="min-h-12 rounded-2xl px-4" onClick={() => setPlanning(true)}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Rendez-vous</Button>}
          {lead.can.email && <Button variant="outline" className="min-h-12 rounded-2xl px-4" onClick={() => setEmailing(true)}><Mail className="h-4 w-4" aria-hidden="true" /> Email</Button>}
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto bg-muted/30 px-6 py-6 sm:px-7">
        <section aria-label="Pourquoi appeler maintenant" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.07em] text-muted-foreground">Pourquoi appeler maintenant</h3>
            <SiteIndicator state={brief.site} score={brief.siteScore} />
          </div>
          {brief.reasons.length > 0 ? (
            brief.reasons.map((r, i) => (
              <div key={i} className="flex gap-3.5 rounded-2xl border bg-card p-4">
                <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-warning-subtle text-sm font-extrabold text-warning">{i + 1}</span>
                <div className="space-y-1 text-[15px] leading-relaxed">
                  <p>{r.text}</p>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-info underline-offset-4 hover:underline">{r.source}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">(nouvel onglet)</span></a>
                  ) : (
                    <p className="text-xs font-semibold text-muted-foreground">{r.source}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">Aucun signal ni audit encore : appuie-toi sur la découverte (comment trouvent-ils leurs clients aujourd’hui ?).</p>
          )}
        </section>

        <section aria-label="Script d’appel" className="space-y-3 rounded-2xl bg-sidebar p-5 text-sidebar-foreground">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.07em] text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Ton script d’appel{pitch ? ` · ${formatDate(pitch.createdAt)}` : ""}</p>
          {pitch?.script ? (
            <>
              <p className="text-base font-semibold leading-relaxed text-white">« {pitch.script.opening} »</p>
              <div>
                {steps.map((s) => (
                  <div key={s.id} className="border-t border-white/10">
                    <button onClick={() => setOpen({ ...open, [s.id]: !open[s.id] })} aria-expanded={!!open[s.id]} className="flex min-h-12 w-full items-center justify-between text-left text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {s.label}
                      <ChevronDown className={cn("h-4 w-4 transition-transform", open[s.id] && "rotate-180")} aria-hidden="true" />
                    </button>
                    {open[s.id] && <p className="whitespace-pre-line pb-3 text-sm leading-relaxed text-sidebar-foreground/90">{s.body}</p>}
                  </div>
                ))}
              </div>
              {pitch.offers.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                  {pitch.offers.map((o) => <span key={o.name} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">{o.name} · {o.price}</span>)}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-sidebar-foreground/90">{brief.audited ? "L’audit est prêt : le script et les offres à proposer s’en déduisent." : "Pas encore d’audit du site : il donne le constat qui ouvre l’appel, puis le script."}</p>
              {(brief.audited ? lead.can.offers : lead.can.audit) && (
                <Button size="sm" onClick={prepare} loading={busy === "prepare"}><Sparkles className="h-4 w-4" aria-hidden="true" /> {brief.audited ? "Préparer le script" : "Préparer l’appel"}</Button>
              )}
            </div>
          )}
        </section>

        {lead.can.write && (
          <section id={`qualification-${lead.id}`} aria-label="Qualification" className="scroll-mt-4 space-y-4 rounded-2xl border bg-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-extrabold">Qualification</h3>
              <span className="text-xs font-medium text-muted-foreground">{qualified ? "Qualifié" : `${answered} sur 4 · pendant l’appel`}</span>
            </div>
            <label className="block space-y-1.5 text-sm font-bold text-foreground/80">Besoin
              <input value={answers.need ?? ""} onChange={(e) => setAnswers({ ...answers, need: e.target.value })} placeholder="Quel problème veut-il résoudre ?" className="block min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            {(["budget", "authority", "timing"] as const).map((key) => (
              <fieldset key={key} className="space-y-2">
                <legend className="text-sm font-bold text-foreground/80">{key === "budget" ? "Budget" : key === "authority" ? "Interlocuteur" : "Échéance"}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(QUALIFICATION_LABELS[key]).filter(([v]) => v !== "unknown").map(([value, label]) => {
                    const on = answers[key] === value
                    return (
                      <button key={value} type="button" aria-pressed={on} onClick={() => setAnswers({ ...answers, [key]: on ? undefined : value })} className={cn("min-h-10 rounded-xl border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-background hover:bg-accent")}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {!qualified && lead.can.qualify && <Button onClick={() => qualify("qualify")} loading={busy === "qualify"} className="rounded-xl">Qualifier et ouvrir l’opportunité</Button>}
              <Button variant="outline" onClick={() => qualify("save")} loading={busy === "save"} className="rounded-xl">Enregistrer</Button>
            </div>
          </section>
        )}

        <section aria-label="Interlocuteur" className="space-y-4 rounded-2xl border bg-card p-5">
          <h3 className="text-base font-extrabold">Interlocuteur</h3>
          {k ? (
            <>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-secondary font-bold">{initialsOf(k.name ?? k.email ?? "?")}</span>
                <div className="min-w-0">
                  <p className="font-bold">{k.name ?? "Nom inconnu"}</p>
                  <p className="text-sm text-muted-foreground">{k.jobTitle ?? "Fonction inconnue"}</p>
                </div>
              </div>
              <Rows rows={[
                ["Téléphone", k.phone ? <a href={`tel:${k.phone}`} className="font-semibold hover:underline">{formatPhone(k.phone)}</a> : null],
                ["Email", k.email ? <span className="inline-flex flex-wrap items-center gap-2"><a href={`mailto:${k.email}`} className="break-all font-semibold hover:underline">{k.email}</a><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", k.emailKind === "NOMINATIVE" ? "bg-success-subtle text-success" : "bg-secondary text-secondary-foreground")}>{k.emailKind === "NOMINATIVE" ? "nominatif" : k.emailKind === "GENERIC" ? "générique" : "à vérifier"}</span></span> : null],
              ]} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Personne d’identifié : demande le gérant, puis note son nom.</p>
          )}
        </section>

        {c && (
          <section aria-label="Entreprise" className="space-y-4 rounded-2xl border bg-card p-5">
            <h3 className="text-base font-extrabold">Entreprise</h3>
            <Rows rows={[
              ["Site web", c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="break-all font-semibold text-info hover:underline">{c.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : null],
              ["Téléphone", c.phone ? <a href={`tel:${c.phone}`} className="font-semibold hover:underline">{formatPhone(c.phone)}</a> : null],
              ["Email", c.email ? <a href={`mailto:${c.email}`} className="break-all font-semibold hover:underline">{c.email}</a> : null],
              ["Adresse", [c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null],
              ["Avis Google", c.rating != null ? `${String(c.rating).replace(".", ",")} ★ · ${c.reviewCount ?? 0} avis` : null],
            ]} />
          </section>
        )}

        <section aria-label="Historique" className="space-y-3 rounded-2xl border bg-card p-5">
          <h3 className="text-base font-extrabold">Historique</h3>
          {lead.activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun échange encore.</p>
          ) : (
            <ol className="space-y-3">
              {lead.activities.slice(0, 6).map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold">{KIND_LABELS[a.kind] ?? a.kind}</span>
                      {a.outcome && a.outcome in CALL_OUTCOMES ? ` · ${CALL_OUTCOMES[a.outcome as CallOutcome]}` : ""}
                      {a.body ? <span className="text-muted-foreground"> · {a.body.length > 120 ? `${a.body.slice(0, 120)}…` : a.body}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.occurredAt)}{a.actorName ? ` · ${a.actorName}` : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link href={`/app/leads/${lead.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-info underline-offset-4 hover:underline">Fiche complète : tâches, registre, audit <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </section>
      </div>

      {inCall && (
        <footer className="space-y-2.5 border-t bg-card px-6 py-4 sm:px-7">
          <p className="text-sm font-bold">Comment s’est passé l’appel ?</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(CALL_OUTCOMES) as [CallOutcome, string][]).map(([value, label]) => (
              <Button key={value} variant="outline" size="sm" className="rounded-full" loading={busy === value} disabled={!!busy} onClick={() => logCall(value)}>{label}</Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setInCall(false)}>Plus tard</Button>
          </div>
        </footer>
      )}

      {planning && <MeetingDialog open={planning} onOpenChange={setPlanning} leadId={lead.id} leadName={name} currentUserId={currentUserId} canOverride={lead.can.meetAnywhere} onDone={reload} />}
      {emailing && <EmailDialog open={emailing} onOpenChange={setEmailing} leadId={lead.id} leadName={name} onDone={reload} />}
    </div>
  )
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v != null && v !== "")
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Rien de renseigné.</p>
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
