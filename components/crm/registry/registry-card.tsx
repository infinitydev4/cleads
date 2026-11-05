"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Landmark, Loader2, Megaphone, RefreshCw, ShieldAlert, UserPlus } from "lucide-react"
import { toast } from "sonner"
import type { SignalKind } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/crm/format"
import type { RegistryView } from "@/features/signals/service"
import { safeLink } from "@/components/crm/ai/evidence"
import { api } from "@/app/(crm)/app/leads/api"

const TONE: Record<SignalKind, "success" | "info" | "neutral" | "destructive"> = {
  CREATED: "success",
  TAKEOVER: "info",
  NEW_LEADER: "info",
  MOVED: "neutral",
  NEW_SITE: "neutral",
  INSOLVENCY: "destructive",
  CLOSED: "destructive",
  GEO_ABSENT: "neutral",
  ADS_RUNNING: "info",
}

/** What a signal's link opens. */
const SOURCE_LINK: Partial<Record<SignalKind, string>> = { GEO_ABSENT: "Source citée", ADS_RUNNING: "Bibliothèque publicitaire" }

/** Months since a calendar day, for « créée il y a 3 mois ». */
function age(iso: string, now = new Date()) {
  const d = new Date(`${iso}T00:00:00Z`)
  const months = (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + now.getUTCMonth() - d.getUTCMonth()
  if (months < 1) return "ce mois-ci"
  if (months < 24) return `il y a ${months} mois`
  return `il y a ${Math.floor(months / 12)} ans`
}

/**
 * The fiche's registry (E30): who the company is according to the annuaire des entreprises, its officers to add as
 * contacts, and what the BODACC published about it. A company in collective proceedings or closed is not prospected
 * until an owner or a manager says otherwise.
 */
export function RegistryCard({ leadId, onChanged }: { leadId: string; onChanged?: () => void }) {
  const [state, setState] = useState<{ leadId: string; data?: RegistryView; error?: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const current = state?.leadId === leadId ? state : null
  const data = current?.data

  useEffect(() => {
    let cancelled = false
    api<RegistryView>(`/api/leads/${leadId}/registry`)
      .then((next) => !cancelled && setState({ leadId, data: next }))
      .catch((e) => !cancelled && setState({ leadId, error: e instanceof Error ? e.message : "Chargement impossible" }))
    return () => {
      cancelled = true
    }
  }, [leadId])

  async function act(key: string, body: object, done: string) {
    setBusy(key)
    try {
      const next = await api<RegistryView>(`/api/leads/${leadId}/registry`, { method: "POST", body: JSON.stringify(body) })
      setState({ leadId, data: next })
      toast.success(done)
      if (key === "override" || key.startsWith("officer")) onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
      setConfirming(false)
    }
  }

  if (!data) {
    return (
      <Card className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Landmark className="h-4 w-4" aria-hidden="true" /> Registre et signaux</h3>
        {current?.error ? <p className="mt-2 text-sm text-muted-foreground">{current.error}</p> : <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…</p>}
      </Card>
    )
  }

  const { identity: id, legal } = data
  const annuaire = safeLink(id.url)
  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Landmark className="h-4 w-4" aria-hidden="true" /> Registre et signaux</h3>
        {data.can.write && (
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => act("refresh", { action: "refresh" }, "Identité relue dans l’annuaire")}>
            {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Actualiser
          </Button>
        )}
      </div>

      {legal.state !== "ACTIVE" && (
        <div role="status" className={cn("space-y-2 rounded-lg p-3 text-sm", legal.blocked ? "bg-destructive-subtle text-destructive-text" : "bg-muted text-muted-foreground")}>
          <p className="flex items-start gap-2 font-medium">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {legal.label}{legal.since ? ` depuis le ${formatDate(legal.since)}` : ""} :{" "}
            {legal.blocked ? "prospection suspendue, aucun email ni séquence ne part." : `prospection reprise le ${formatDate(legal.overriddenAt)} par un responsable.`}
          </p>
          {legal.blocked && data.can.override && (
            confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Reprendre la prospection malgré cet état ? C’est consigné au journal.</span>
                <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => act("override", { action: "override" }, "Prospection reprise pour cette entreprise")}>Confirmer</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Annuler</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>Prospecter quand même</Button>
            )
          )}
        </div>
      )}

      {id.checkedAt === null ? (
        <p className="text-sm text-muted-foreground">Recherche dans le registre en attente : elle se fait seule dans les minutes qui suivent l’ajout de la fiche.</p>
      ) : id.found === false ? (
        <p className="text-sm text-muted-foreground">
          Introuvable dans l’annuaire des entreprises{id.error ? ` (${id.error})` : ""}. Un SIRET exact, ou le code postal du siège, permet de la retrouver.
        </p>
      ) : (
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="SIREN">{annuaire && id.siren ? <a href={annuaire} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">{id.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a> : (id.siren ?? "—")}</Row>
          <Row label="Activité (NAF)">{id.nafCode ?? "—"}</Row>
          <Row label="Création">{id.foundedOn ? `${formatDate(id.foundedOn)} · ${age(id.foundedOn)}` : "—"}</Row>
          <Row label="Effectif">{[id.headcount, id.category].filter(Boolean).join(" · ") || "—"}</Row>
          {id.labels.length > 0 && <Row label="Labels"><span className="flex flex-wrap gap-1">{id.labels.map((l) => <Badge key={l} variant="neutral">{l}</Badge>)}</span></Row>}
        </dl>
      )}

      {data.officers.length > 0 && (
        <section aria-label="Dirigeants" className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dirigeants (registre)</h4>
          <ul className="space-y-1.5">
            {data.officers.map((o) => (
              <li key={o.index} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{o.name}{o.role ? <span className="text-muted-foreground"> · {o.role}</span> : null}</span>
                {o.added ? (
                  <Badge variant="success">Contact</Badge>
                ) : data.can.write ? (
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act(`officer-${o.index}`, { action: "add_officer", index: o.index }, "Dirigeant ajouté comme contact")}>
                    {busy === `officer-${o.index}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />} Ajouter comme contact
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Signaux" className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signaux</h4>
        {data.signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune annonce publiée pour cette entreprise depuis qu’elle est suivie.</p>
        ) : (
          <ol className="space-y-2">
            {data.signals.map((s) => {
              const href = safeLink(s.sourceUrl)
              return (
                <li key={s.id} className={cn("space-y-1 text-sm", !s.recent && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{formatDate(s.occurredAt)}</span>
                    <Badge variant={TONE[s.kind]}>{s.label}</Badge>
                    {s.dismissed && <span className="text-xs text-muted-foreground">ignoré</span>}
                  </div>
                  <p>{s.summary}</p>
                  <div className="flex items-center gap-3 text-xs">
                    {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline">{SOURCE_LINK[s.kind] ?? "Annonce BODACC"} <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
                    {data.can.write && s.recent && (
                      <button type="button" className="text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => act(`dismiss-${s.id}`, { action: "dismiss", signalId: s.id }, "Signal ignoré")}>Ignorer</button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <AdsSection ads={data.ads} canCheck={data.can.write && legal.state === "ACTIVE"} busy={busy === "ads"} disabled={!!busy} onCheck={() => act("ads", { action: "ads" }, "Relecture demandée : le worker la fait dans la minute.")} />

      <p className="text-xs text-muted-foreground">
        Données publiques : annuaire des entreprises (INSEE, RNE), BODACC et bibliothèque publicitaire Meta{id.checkedAt ? `, registre lu le ${formatDate(id.checkedAt)}` : "."}
      </p>
    </Card>
  )
}

const META_OFF: Partial<Record<NonNullable<RegistryView["ads"]["meta"]> | "none", string>> = {
  none: "Non branchée : aucun worker n’a encore relu de jeton Meta.",
  off: "Non branchée : le jeton Meta n’est pas posé sur le worker.",
  renew: "Jeton Meta expiré ou refusé : les publicités ne sont plus relues tant que le propriétaire ne l’a pas renouvelé.",
  identity: "En attente de Meta : l’identité du titulaire du jeton doit être confirmée sur facebook.com/ID.",
}

/** E30 lot 3: the ads the company runs now, as the worker read them in Meta's Ad Library (the proof of a budget). */
function AdsSection({ ads, canCheck, busy, disabled, onCheck }: { ads: RegistryView["ads"]; canCheck: boolean; busy: boolean; disabled: boolean; onCheck: () => void }) {
  const off = META_OFF[ads.meta ?? "none"]
  const page = ads.page ? safeLink(ads.page.url) : null
  return (
    <section aria-label="Publicités Meta" className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Publicités Meta</h4>
        {!off && canCheck && !ads.requested && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onCheck}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Vérifier
          </Button>
        )}
      </div>
      {off ? (
        <p className="text-sm text-muted-foreground">{off}</p>
      ) : ads.requested ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Relecture demandée : le worker la fait dans la minute.</p>
      ) : !ads.checkedAt ? (
        <p className="text-sm text-muted-foreground">Pas encore relues : elles le sont chaque semaine pour les campagnes actives, ou à la demande.</p>
      ) : ads.active > 0 ? (
        <div className="space-y-1.5 text-sm">
          <p>
            <Badge variant="info">{ads.more ? `Plus de ${ads.active}` : ads.active} en cours</Badge>{" "}
            {ads.platforms.length ? `sur ${ads.platforms.length > 1 ? `${ads.platforms.slice(0, -1).join(", ")} et ${ads.platforms.at(-1)}` : ads.platforms[0]}` : null}
            {ads.since ? `, depuis le ${formatDate(ads.since)}` : null}
          </p>
          <ul className="space-y-1">
            {ads.ads.map((a) => {
              const href = safeLink(a.url)
              return (
                <li key={a.url} className="flex flex-wrap items-center gap-2">
                  {a.start && <span className="text-xs tabular-nums text-muted-foreground">{formatDate(a.start)}</span>}
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">{a.title ?? "Publicité"} <ExternalLink className="h-3 w-3" aria-hidden="true" /></a> : <span>{a.title ?? "Publicité"}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune publicité en cours au {formatDate(ads.checkedAt)}.</p>
      )}
      {!off && ads.checkedAt && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {page && ads.page && <a href={page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">Page « {ads.page.name ?? "Facebook"} » dans la bibliothèque <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
          {ads.page?.how === "name" && <span>reconnue à son nom : à vérifier</span>}
          <span>Relues le {formatDate(ads.checkedAt)}</span>
          {ads.meta === "expiring" && ads.tokenExpiresAt && <span>Jeton Meta à renouveler avant le {formatDate(ads.tokenExpiresAt)}</span>}
        </p>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
