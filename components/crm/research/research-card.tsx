"use client"

import { useEffect, useState } from "react"
import { Binoculars, Check, CircleAlert, ExternalLink, FileText, Loader2, Radar, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatDate, formatDateTime } from "@/lib/crm/format"
import { MEETING_TYPE_LABELS } from "@/features/meetings/rules"
import type { BriefClaim } from "@/features/research/brief-schemas"
import { CANDIDATE_ROLE_LABELS, CANDIDATE_STATUS_LABELS, JOB_LABELS, TYPICAL_COST, type ResearchJob } from "@/features/research/labels"
import type { CandidateView, ResearchView } from "@/features/research/service"
import { safeLink } from "@/components/crm/ai/evidence"
import { api } from "@/app/(crm)/app/leads/api"

const RUNNING_TEXT: Record<ResearchJob, string> = {
  people: "L’Enquêteur cherche les décideurs et les réseaux…",
  geo: "L’Enquêteur sonde les moteurs de réponse…",
  brief: "L’Enquêteur prépare le brief…",
}

function External({ href, children, label }: { href: string | null; children: React.ReactNode; label?: string }) {
  const url = safeLink(href)
  if (!url) return <>{children}</>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={label} className="inline-flex items-center gap-1 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * The Enquêteur on the fiche (E30 lot 2): the decision makers it proposes (a click turns one into a contact), the
 * company's social accounts, its GEO probe, and the brief of the next meeting. Every fact keeps its source; searches
 * cost a few cents, said on each button.
 */
export function ResearchCard({ leadId, onChanged }: { leadId: string; onChanged?: () => void }) {
  const [view, setView] = useState<{ leadId: string; data: ResearchView } | null>(null)
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const data = view?.leadId === leadId ? view.data : null
  const running = new Set(data?.running.map((r) => r.job) ?? [])

  useEffect(() => {
    let cancelled = false
    api<ResearchView>(`/api/leads/${leadId}/research`)
      .then((next) => !cancelled && setView({ leadId, data: next }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [leadId, reloads])

  // While a job runs, look again every few seconds; once it ends, the fiche reloads (a contact may have been linked).
  const busyJobs = data?.running.length ?? 0
  useEffect(() => {
    if (!busyJobs) return
    const timer = setTimeout(() => setReloads((n) => n + 1), 4_000)
    return () => clearTimeout(timer)
  }, [busyJobs, reloads])

  if (!data) return null

  async function post(body: Record<string, unknown>, key: string, success: string) {
    setBusy(key)
    try {
      setView({ leadId, data: await api<ResearchView>(`/api/leads/${leadId}/research`, { method: "POST", body: JSON.stringify(body) }) })
      toast.success(success)
      if (body.action === "confirm") onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const start = (job: ResearchJob) =>
    post(job === "brief" && data.nextMeeting ? { action: job, meetingId: data.nextMeeting.id } : { action: job }, job, `${JOB_LABELS[job]} : c’est parti, comptez une à deux minutes.`)
  const unavailable = !data.configured ? "L’IA n’est pas configurée sur ce serveur." : null
  const startButton = (job: ResearchJob, label: string, blocked?: string | null) =>
    data.can.run && (
      <Button size="sm" variant="outline" disabled={!!busy || running.has(job) || !!unavailable || !!blocked} title={unavailable ?? blocked ?? `${TYPICAL_COST[job]}, recherches web comprises`} onClick={() => start(job)}>
        {busy === job || running.has(job) ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {label} <span className="text-muted-foreground">{TYPICAL_COST[job]}</span>
      </Button>
    )
  const pending = data.candidates.filter((k) => k.status !== "CONFIRMED")
  const confirmed = data.candidates.filter((k) => k.status === "CONFIRMED")

  return (
    <>
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Binoculars className="h-4 w-4" aria-hidden="true" /> Enquêteur
          </h3>
          {!data.worker.online && data.configured && <span className="text-xs text-muted-foreground">Le worker IA ne répond pas : les recherches partiront à son retour.</span>}
        </div>
        {data.lastFailure && (
          <p className="flex items-start gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive-text">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {JOB_LABELS[data.lastFailure.job]} : {data.lastFailure.error}
          </p>
        )}

        <Section title="Décideurs" action={startButton("people", "Trouver les décideurs")}>
          {running.has("people") && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {RUNNING_TEXT.people}</p>}
          {pending.length > 0 ? (
            <ul className="divide-y">
              {pending.map((k) => (
                <Candidate key={k.id} k={k} canWrite={data.can.write} busy={busy} onDecide={(decision) => post({ action: decision, candidateId: k.id }, `${decision}:${k.id}`, decision === "confirm" ? `${k.name} ajouté aux contacts` : "Profil écarté")} />
              ))}
            </ul>
          ) : (
            !running.has("people") && (
              <p className="text-sm text-muted-foreground">
                {data.peopleCheckedAt ? `Aucun profil à vérifier (dernière recherche le ${formatDate(data.peopleCheckedAt)}).` : "Pas encore cherché : l’Enquêteur cherche les dirigeants du registre et, à partir de dix salariés, le responsable marketing ou commercial."}
              </p>
            )
          )}
          {confirmed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Confirmés : {confirmed.map((k, i) => <span key={k.id}>{i > 0 && ", "}<External href={k.url} label={`Profil de ${k.name}`}>{k.name}</External></span>)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Profils professionnels publics (Exa), jamais d’email deviné. Un profil devient un contact d’un clic, avec sa source.</p>
        </Section>

        <Section title="Réseaux sociaux">
          {data.socials.length ? (
            <ul className="flex flex-wrap gap-2">
              {data.socials.map((s) => (
                <li key={s.network} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  <External href={s.url} label={`${s.label} de l’entreprise`}>{s.label}</External>
                  {s.found && <span className="ml-1 text-muted-foreground" title={`Trouvé le ${formatDate(s.found.at)}, confiance ${Math.round(s.found.confidence * 100)} %`}>· Enquêteur</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun compte connu. La recherche des décideurs cherche aussi Instagram, Facebook, LinkedIn et TikTok.</p>
          )}
        </Section>

        <Section title="Moteurs de réponse (sonde GEO)" action={startButton("geo", "Sonder", data.geoBlocked)}>
          {running.has("geo") && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {RUNNING_TEXT.geo}</p>}
          {data.geo ? (
            <div className="space-y-1.5 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <Radar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Badge variant={data.geo.present ? "success" : data.geo.sources ? "warning" : "neutral"}>{data.geo.present ? "Citée" : data.geo.sources ? "Absente" : "Rien lu"}</Badge>
                <span className="text-muted-foreground">le {formatDate(data.geo.checkedAt)}, pour {data.geo.questions.map((q) => `« ${q} »`).join(", ")}</span>
              </p>
              {data.geo.cited.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sources que Perplexity donne : {data.geo.cited.slice(0, 6).map((c, i) => <span key={c.host}>{i > 0 && ", "}<External href={c.url}>{c.host}</External></span>)}
                </p>
              )}
              {data.geo.error && <p className="text-xs text-muted-foreground">{data.geo.error}</p>}
            </div>
          ) : (
            !running.has("geo") && <p className="text-sm text-muted-foreground">{data.geoBlocked ?? "Pas encore sondée : chaque mois, les bonnes cibles le sont d’elles-mêmes."}</p>
          )}
        </Section>
      </Card>

      <BriefCard data={data} running={running.has("brief")} action={startButton("brief", data.brief ? "Refaire le brief" : "Préparer le brief")} />
    </>
  )
}

function Candidate({ k, canWrite, busy, onDecide }: { k: CandidateView; canWrite: boolean; busy: string | null; onDecide: (decision: "confirm" | "dismiss") => void }) {
  return (
    <li className="space-y-1.5 py-2.5 first:pt-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <External href={k.url} label={`Profil public de ${k.name}`}>
          <span className="font-medium">{k.name}</span>
        </External>
        {k.title && <span className="text-muted-foreground">{k.title}</span>}
        <Badge variant="neutral">{CANDIDATE_ROLE_LABELS[k.role]}</Badge>
        <Badge variant={k.status === "PROBABLE" ? "success" : "warning"} title="Confiance du modèle qui a comparé le profil à l’entreprise">
          {CANDIDATE_STATUS_LABELS[k.status]} · {Math.round(k.confidence * 100)} %
        </Badge>
      </div>
      <blockquote className="border-l-2 pl-2 text-xs italic text-muted-foreground">« {k.evidence} »</blockquote>
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => onDecide("confirm")}>
            {busy === `confirm:${k.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Confirmer
          </Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => onDecide("dismiss")}>
            <X className="h-4 w-4" aria-hidden="true" /> Écarter
          </Button>
        </div>
      )}
    </li>
  )
}

function Claims({ title, claims, number }: { title: string; claims: BriefClaim[]; number: (url: string) => number }) {
  if (!claims.length) return null
  return (
    <Section title={title}>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {claims.map((c, i) => (
          <li key={i}>
            {c.date && <span className="text-muted-foreground">{c.date} · </span>}
            {c.text}
            <span className="ml-1 inline-flex gap-1 align-middle">
              {c.sources.map((url) => (
                <a key={url} href={safeLink(url) ?? undefined} target="_blank" rel="noopener noreferrer nofollow" className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground" aria-label={`Source ${number(url)}`}>
                  {number(url)}
                </a>
              ))}
              {c.crm && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground" title="Fait de la fiche">CRM</span>}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** The latest brief (D51): sourced facts, three angles tied to the active offers, questions, and its sources. */
function BriefCard({ data, running, action }: { data: ResearchView; running: boolean; action: React.ReactNode }) {
  const brief = data.brief
  const numbers = new Map((brief?.sources ?? []).map((s, i) => [s.url, i + 1]))
  const number = (url: string) => numbers.get(url) ?? 0
  const c = brief?.content
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
          <FileText className="h-4 w-4" aria-hidden="true" /> Brief de rendez-vous
          {brief && <span className="text-xs font-normal text-muted-foreground">du {formatDate(brief.createdAt)}{c?.meeting ? ` · ${MEETING_TYPE_LABELS[c.meeting.type as keyof typeof MEETING_TYPE_LABELS]?.toLowerCase() ?? "rendez-vous"} le ${formatDateTime(c.meeting.startsAt)}` : ""}</span>}
        </h3>
        {action}
      </div>
      {running && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {RUNNING_TEXT.brief}</p>}
      {!brief || !c ? (
        !running && (
          <p className="text-sm text-muted-foreground">
            {data.nextMeeting ? `Il sera préparé la veille du rendez-vous du ${formatDateTime(data.nextMeeting.startsAt)}, ou maintenant d’un clic.` : "Préparé la veille de chaque rendez-vous, ou à la demande : qui ils sont, leur actualité, leur marché, trois angles et les questions à poser."}
          </p>
        )
      ) : (
        <div className="space-y-4">
          <Claims title="Qui ils sont" claims={c.who} number={number} />
          <Claims title="Actualité" claims={c.news} number={number} />
          <Claims title="Marché local" claims={c.market} number={number} />
          {c.signals.length > 0 && (
            <Section title="Signaux du registre">
              <ul className="space-y-1 text-sm">
                {c.signals.map((s, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">{formatDate(s.occurredAt)} · {s.label} :</span> <External href={s.sourceUrl}>{s.summary}</External>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {c.angles.length > 0 && (
            <Section title="Angles d’approche">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {c.angles.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.title}</span>
                    {a.offerName && <Badge variant="info" className="ml-2">{a.offerName}</Badge>}
                    <p className="text-muted-foreground">{a.why}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {c.questions.length > 0 && (
            <Section title="Questions à poser">
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {c.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ol>
            </Section>
          )}
          {brief.sources.length > 0 && (
            <Section title="Sources">
              <ol className="space-y-1 text-xs text-muted-foreground">
                {brief.sources.map((s, i) => (
                  <li key={s.url} className="flex gap-2">
                    <span className="font-mono">{i + 1}</span>
                    <span className="min-w-0 break-words">
                      <External href={s.url}>{s.title}</External>
                      {s.date && ` · ${s.date}`}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          <p className="text-xs text-muted-foreground">
            Écrit par l’Enquêteur à partir de pages lues sur le web ({brief.costEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}).
            {brief.dropped > 0 && ` ${brief.dropped} fait${brief.dropped > 1 ? "s" : ""} retiré${brief.dropped > 1 ? "s" : ""} faute de source lue.`} Vérifiez avant de citer un chiffre.
          </p>
        </div>
      )}
    </Card>
  )
}
