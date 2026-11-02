"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, CircleAlert, FileText, Link2, PanelsTopLeft, RefreshCw, Upload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLiveRuns } from "@/components/crm/ai/use-live-runs"
import { BriefEditor } from "@/components/crm/studio/brief-editor"
import { PreviewFrame } from "@/components/crm/studio/preview-frame"
import { RunProgress } from "@/components/crm/studio/run-progress"
import { SharePanel } from "@/components/crm/studio/share-panel"
import { VersionReport } from "@/components/crm/studio/version-report"
import { ReviseBox, VersionsPanel } from "@/components/crm/studio/versions"
import { SECTION_LABELS, STATE_LABELS, STATE_TONE, type SiteView } from "@/features/studio/labels"
import { api } from "@/app/(crm)/app/leads/api"

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

/** What the Designer found on the site, beside the brief: where its points come from. */
function Collected({ site }: { site: SiteView }) {
  const c = site.collected
  if (!c) return null
  return (
    <Card className="space-y-4 p-4 text-sm">
      <h3 className="font-bold">Ce que le Designer a lu</h3>
      {c.pages.length > 0 ? (
        <ul className="space-y-1">
          {c.pages.map((p) => (
            <li key={p.id} className="flex gap-2">
              <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline-offset-2 hover:underline">
                {p.title ?? p.url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{c.failure ?? "Aucune page lue."}</p>
      )}
      <dl className="space-y-1">
        {c.facts.map((f) => (
          <div key={f.id} className="flex gap-2">
            <dt className="shrink-0 font-mono text-xs text-muted-foreground">{f.id}</dt>
            <dd className="min-w-0 break-words">
              <span className="text-muted-foreground">{f.label} :</span> {f.value}
            </dd>
          </div>
        ))}
      </dl>
      {c.fonts.length > 0 && <p className="text-muted-foreground">Polices du site : {c.fonts.join(", ")}</p>}
      {c.notes.length > 0 && (
        <ul className="space-y-1">
          {c.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-warning">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {n}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * One site of the Studio Web (E23): its brief to review, the page and its versions, the checks and scores, the link
 * and its visits. Runs are followed live; the page reloads when one moves.
 */
export function StudioSiteView({ site, userId }: { site: SiteView; userId: string }) {
  const router = useRouter()
  const running = site.state === "briefing" || site.state === "building"
  useLiveRuns(userId, running)
  const [selected, setSelected] = useState<number | null>(null)
  const [tab, setTab] = useState(site.currentVersion ? "page" : "brief")
  const [busy, setBusy] = useState(false)
  const refresh = () => router.refresh()
  const shown = site.versions.find((v) => v.number === (selected ?? site.currentVersion)) ?? null

  async function retry() {
    setBusy(true)
    try {
      await api(`/api/studio/sites/${site.id}/${site.state === "brief_failed" ? "brief" : "build"}`, { method: "POST" })
      toast.success("Relancé")
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function publish(n: number) {
    try {
      await api(`/api/studio/sites/${site.id}/versions/${n}`, { method: "POST" })
      toast.success(`Version ${n} remise en ligne`)
      setSelected(null)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  const failed = (site.state === "brief_failed" || site.state === "build_failed" || (site.state === "ready" && site.run && ["FAILED", "BUDGET_EXCEEDED", "EXPIRED"].includes(site.run.status))) && site.run?.error
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={STATE_TONE[site.state]}>{STATE_LABELS[site.state]}</Badge>
        {site.currentVersion && <span className="text-muted-foreground">Version {site.currentVersion} en ligne</span>}
        <span className="text-muted-foreground">
          · créée le {day.format(new Date(site.createdAt))}
          {site.createdBy && ` par ${site.createdBy}`}
        </span>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href={`/app/leads/${site.lead.id}`}>
            Voir la fiche <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {running && site.run && <RunProgress run={site.run} />}
      {failed && (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-subtle p-4 text-sm text-destructive-text">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            {site.state === "brief_failed" ? "Le brief n’a pas abouti" : site.run?.kind === "revise" ? "La modification n’a pas abouti" : "La génération n’a pas abouti"} : {site.run?.error}
            {site.state === "ready" && " La version précédente reste en ligne."}
          </p>
          {site.can.edit && site.state !== "ready" && (
            <Button size="sm" variant="outline" onClick={retry} loading={busy}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Relancer
            </Button>
          )}
        </div>
      )}
      {site.state === "purged" && <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">Le contenu de cette maquette a été supprimé le {day.format(new Date(site.purgeAfter))}, 90 jours après sa dernière version. Générez-en une nouvelle depuis la fiche.</p>}

      {site.brief && site.state !== "purged" && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Maquette" className="w-full justify-start overflow-x-auto sm:w-auto">
            {site.currentVersion && (
              <TabsTrigger value="page" className="gap-1.5">
                <PanelsTopLeft className="h-4 w-4" aria-hidden="true" /> Maquette
              </TabsTrigger>
            )}
            <TabsTrigger value="brief" className="gap-1.5">
              <FileText className="h-4 w-4" aria-hidden="true" /> Brief
              {site.state === "brief_ready" && <span className="h-2 w-2 rounded-full bg-warning" aria-label="à relire" />}
            </TabsTrigger>
            {site.currentVersion && (
              <TabsTrigger value="share" className="gap-1.5">
                <Link2 className="h-4 w-4" aria-hidden="true" /> Partage
                {site.visits.count > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground tabular-nums">{site.visits.count}</span>}
              </TabsTrigger>
            )}
          </TabsList>

          {site.currentVersion && shown && (
            <TabsContent value="page" className="mt-4">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
                <div className="min-w-0 space-y-3">
                  <PreviewFrame src={`/api/studio/sites/${site.id}/preview?v=${shown.number}`} title={site.companyName} publicUrl={shown.number === site.currentVersion && site.link && !site.link.expired ? site.link.url : null} />
                  {shown.number !== site.currentVersion && site.can.edit && (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      Vous regardez la version {shown.number} ; le lien montre la version {site.currentVersion}.
                      <Button size="sm" variant="outline" onClick={() => publish(shown.number)}>
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Remettre en ligne
                      </Button>
                    </p>
                  )}
                </div>
                <div className="space-y-6">
                  <Card className="p-4">
                    <VersionReport version={shown} />
                  </Card>
                  {site.can.edit && !running && (
                    <Card className="p-4">
                      <ReviseBox site={site} onChanged={refresh} />
                    </Card>
                  )}
                  <Card className="p-4">
                    <VersionsPanel site={site} selected={selected} onSelect={setSelected} />
                  </Card>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="brief" className="mt-4">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0">
                {site.state === "brief_ready" && (
                  <p className="mb-4 rounded-xl bg-info-subtle p-4 text-sm text-info">
                    Relisez le brief : c’est ce que la page dira. Chaque point repris du site ou de la fiche garde sa source ; corrigez ce qui ne va pas, puis lancez la génération.
                  </p>
                )}
                <BriefEditor key={`${site.id}:${site.briefEditedAt ?? site.createdAt}`} site={site} onChanged={refresh} />
              </div>
              <div className="space-y-4">
                <Collected site={site} />
                <Card className="space-y-2 p-4 text-sm">
                  <h3 className="font-bold">Le plan de la page</h3>
                  <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                    {site.brief.sections.map((s, i) => (
                      <li key={i}>
                        <span className="text-foreground">{s.title}</span> · {SECTION_LABELS[s.kind]}
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
            </div>
          </TabsContent>

          {site.currentVersion && (
            <TabsContent value="share" className="mt-4">
              <Card className="max-w-2xl p-5">
                <SharePanel site={site} onChanged={refresh} />
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  )
}
