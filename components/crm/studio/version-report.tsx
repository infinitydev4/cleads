"use client"

import { ArrowRight, CircleAlert, CircleCheck, Gauge, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { CRITERIA_HINTS, CRITERIA_LABELS, type VersionView } from "@/features/studio/labels"
import { CRITERIA, type LabScores } from "@/features/studio/schemas"

const tone = (n: number | null) => (n == null ? "text-muted-foreground" : n >= 90 ? "text-success" : n >= 50 ? "text-warning" : "text-destructive-text")

function Score({ label, before, after }: { label: string; before: number | null; after: number | null }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 tabular-nums">
        {before != null && (
          <>
            <span className={cn("text-lg font-bold", tone(before))}>{before}</span>
            <ArrowRight className="h-3.5 w-3.5 self-center text-muted-foreground" aria-label="devient" />
          </>
        )}
        <span className={cn("text-2xl font-extrabold", tone(after))}>{after ?? "—"}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </p>
    </div>
  )
}

const other = (lab: LabScores | null) =>
  lab
    ? [
        ["Accessibilité", lab.accessibility],
        ["Bonnes pratiques", lab.bestPractices],
        ["SEO", lab.seo],
      ]
    : []

/**
 * What a version is worth (E23): « votre site → maquette » on PageSpeed for the pitch, the critique grid, axe-core and
 * what the person should know. Every figure says where it comes from.
 */
export function VersionReport({ version, compact = false }: { version: VersionView; compact?: boolean }) {
  const { checks, scores } = version
  const critique = checks.critique
  return (
    <div className="space-y-5">
      <section className="space-y-2" aria-labelledby={`psi-${version.number}`}>
        <h4 id={`psi-${version.number}`} className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4" aria-hidden="true" /> Performance PageSpeed : votre site → maquette
        </h4>
        {scores && (scores.mobile || scores.desktop) ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Score label="Sur téléphone" before={scores.before.mobile} after={scores.mobile?.performance ?? null} />
              <Score label="Sur ordinateur" before={scores.before.desktop} after={scores.desktop?.performance ?? null} />
            </div>
            {!compact && (
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                {other(scores.mobile).map(([label, value]) => (
                  <div key={label as string} className="flex gap-1">
                    <dt>{label} (mobile)</dt>
                    <dd className={cn("font-semibold tabular-nums", tone(value as number | null))}>{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-xs text-muted-foreground">
              Mesuré par Google PageSpeed Insights, comme l’audit du site actuel{scores.before.date ? ` (${new Date(scores.before.date).toLocaleDateString("fr-FR")})` : ""}. Le score SEO ne tient pas compte du noindex propre à l’aperçu.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{scores?.error ? `Mesure non faite : ${scores.error}.` : "La mesure PageSpeed se fait après la publication, quand le domaine d’aperçu répond."}</p>
        )}
      </section>

      {critique && (
        <section className="space-y-2" aria-labelledby={`grid-${version.number}`}>
          <h4 id={`grid-${version.number}`} className="flex items-center justify-between gap-2 text-sm font-semibold">
            <span>Critique visuelle</span>
            <span className="tabular-nums text-muted-foreground">{critique.average.toLocaleString("fr-FR")} / 5</span>
          </h4>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {CRITERIA.map((c) => {
              const v = critique.scores[c]
              return (
                <li key={c} title={CRITERIA_HINTS[c]} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{CRITERIA_LABELS[c]}</span>
                    <span className="tabular-nums text-muted-foreground">{v} / 5</span>
                  </div>
                  <div className="flex gap-1" role="img" aria-label={`${CRITERIA_LABELS[c]} : ${v} sur 5`}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= v ? (v >= 4 ? "bg-success" : v === 3 ? "bg-warning" : "bg-destructive") : "bg-muted")} />
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
          {!compact && critique.summary && <p className="text-sm text-muted-foreground">{critique.summary}</p>}
          {!compact && critique.issues.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Défauts relevés ({critique.issues.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {critique.issues.map((i, n) => (
                  <li key={n} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{CRITERIA_LABELS[i.criterion]}</span> : {i.problem}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="space-y-1.5 text-sm" aria-label="Contrôles automatiques">
        <p className="flex items-start gap-2">
          {checks.axe && checks.axe.critical + checks.axe.serious === 0 ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
          {checks.axe
            ? `Accessibilité (axe-core) : ${checks.axe.critical} erreur${checks.axe.critical > 1 ? "s" : ""} critique${checks.axe.critical > 1 ? "s" : ""}, ${checks.axe.serious} sérieuse${checks.axe.serious > 1 ? "s" : ""}, ${checks.axe.moderate} moyenne${checks.axe.moderate > 1 ? "s" : ""}`
            : "Accessibilité : contrôle non exécuté"}
        </p>
        <p className="flex items-start gap-2">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          Aucun script, formulaire ni ressource extérieure : {checks.sanitizer.images} image{checks.sanitizer.images > 1 ? "s" : ""} du site, {checks.sanitizer.links.tel} lien{checks.sanitizer.links.tel > 1 ? "s" : ""} d’appel, {checks.sanitizer.links.mailto} lien{checks.sanitizer.links.mailto > 1 ? "s" : ""} email
        </p>
        {checks.rounds > 0 && <p className="text-muted-foreground">{checks.rounds} correction{checks.rounds > 1 ? "s" : ""} après critique.</p>}
        {checks.notes.map((n, i) => (
          <p key={i} className="flex items-start gap-2 text-warning">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {n}
          </p>
        ))}
      </section>
    </div>
  )
}
