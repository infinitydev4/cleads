import { Download } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/crm/page-header"
import { FunnelBars } from "@/components/crm/funnel-bars"
import { Definition } from "@/components/crm/definition"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { money } from "@/lib/crm/format"
import { CONVERSION_COLUMNS, INDICATORS, PERSON_INDICATORS, PROSPECTING_COLUMNS, deltaPct, deltaPts, formatCount, formatDeltaPct, formatDeltaPts, formatRate, rate } from "@/features/metrics/definitions"
import { parseReportPeriod, periodQuery } from "@/features/metrics/periods"
import { reportOf } from "@/features/metrics/report"
import { PeriodNav } from "./period-nav"
import { PeopleTable } from "./people-table"
import { WonTable } from "./won-table"

export const metadata = { title: "Rapports" }
export const dynamic = "force-dynamic"

const STEPS = ["leads", "contacted", "replied", "qualified", "meetings", "won"] as const

function Compare({ k, current, previous, delta }: { k: keyof typeof INDICATORS; current: string; previous: string; delta: string | null }) {
  return (
    <tr>
      <th scope="row" className="py-2 text-left font-normal text-muted-foreground"><Definition label={INDICATORS[k].label} definition={INDICATORS[k].definition} /></th>
      <td className="py-2 text-right font-semibold tabular-nums">{current}</td>
      <td className="py-2 text-right tabular-nums text-muted-foreground">{previous}</td>
      <td className="py-2 text-right tabular-nums">{delta ?? <span className="text-muted-foreground">—</span>}</td>
    </tr>
  )
}

/** E10: the period's funnel, what each person did, and the opportunities won (docs/crm-v1/RAPPORTS.md). */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ periode?: string; du?: string }> }) {
  const { user } = await requirePagePermission("report:read")
  const period = parseReportPeriod(await searchParams)
  const report = await reportOf(user, period)
  const { current, previous } = report.funnel
  const own = report.scope === "own"
  const replyRate = [rate(current.replied, current.contacted), rate(previous.replied, previous.contacted)] as const
  const conversion = [rate(current.meetings, current.leads), rate(previous.meetings, previous.leads)] as const
  const prospectingRows = report.people.filter((p) => p.role === "SDR" || p.contacted + p.replied + p.qualified + p.meetingsBooked > 0)
  const conversionRows = report.people.filter((p) => p.role === "CLOSER" || p.meetingsHeld + p.won + p.lost > 0)

  return (
    <>
      <PageHeader
        title="Rapports"
        description={own ? "Vos chiffres de la période : ce que vous avez contacté, qualifié et signé." : "Ce que l’équipe a contacté, qualifié et signé pendant la période. Chaque chiffre a sa définition au survol ou au clavier."}
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Rapports" }]}
        actions={<PeriodNav period={period} />}
      />

      <div className="space-y-8">
        <section aria-labelledby="report-funnel" className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          {/* min-w-0: a grid item may otherwise grow to its widest content and push the page sideways on a phone. */}
          <Card className="min-w-0 space-y-4 p-5">
            <h2 id="report-funnel" className="font-bold">Entonnoir{own ? " de vos fiches" : ""}</h2>
            <FunnelBars steps={STEPS.map((k) => ({ key: k, label: INDICATORS[k].label, count: current[k], definition: INDICATORS[k].definition }))} />
          </Card>
          <Card className="min-w-0 p-5">
            <h2 className="font-bold">Par rapport à la période précédente</h2>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[22rem] text-sm">
                <caption className="sr-only">Chaque indicateur sur {period.label} et sur {report.previous.label}</caption>
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-1.5 text-left font-semibold">Indicateur</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">Période</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">Précédente</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">Évolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {STEPS.map((k) => (
                    <Compare key={k} k={k} current={formatCount(current[k])} previous={formatCount(previous[k])} delta={formatDeltaPct(deltaPct(current[k], previous[k]))} />
                  ))}
                  <Compare k="replyRate" current={formatRate(replyRate[0])} previous={formatRate(replyRate[1])} delta={formatDeltaPts(deltaPts(...replyRate))} />
                  <Compare k="conversion" current={formatRate(conversion[0])} previous={formatRate(conversion[1])} delta={formatDeltaPts(deltaPts(...conversion))} />
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <section aria-labelledby="report-people" className="space-y-3">
          <h2 id="report-people" className="text-lg font-bold">{own ? "Vos résultats" : "Par personne"}</h2>
          {(!own || prospectingRows.length > 0) && <PeopleTable kind="prospecting" rows={prospectingRows} />}
          {(!own || conversionRows.length > 0) && <PeopleTable kind="conversion" rows={conversionRows} />}
          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Comment ces chiffres sont calculés</summary>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
              {[...PROSPECTING_COLUMNS, ...CONVERSION_COLUMNS].map((k) => (
                <div key={k} className="contents">
                  <dt className="font-semibold">{PERSON_INDICATORS[k].label}</dt>
                  <dd className="text-muted-foreground">{PERSON_INDICATORS[k].definition}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>

        <section aria-labelledby="report-won" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 id="report-won" className="text-lg font-bold">Gagnés</h2>
              {report.won.rows.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {`${formatCount(report.won.rows.length)} gagnée${report.won.rows.length > 1 ? "s" : ""}${report.won.totals.length ? ` · ${report.won.totals.map((t) => money(t.cents, t.currency)).join(" + ")} HT` : ""}${report.won.withoutAmount ? ` · ${report.won.withoutAmount} sans montant` : ""}`}
                </p>
              )}
            </div>
            {can(user.role, "data:export") && report.won.rows.length > 0 && (
              <Button asChild variant="outline">
                <a href={`/api/reports/won?${periodQuery(period)}`} download>
                  <Download className="h-4 w-4" aria-hidden="true" /> Exporter (CSV)
                </a>
              </Button>
            )}
          </div>
          <WonTable rows={report.won.rows} />
        </section>
      </div>
    </>
  )
}
