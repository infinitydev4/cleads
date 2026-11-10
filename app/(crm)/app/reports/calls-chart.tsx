import type { CallDay } from "@/features/telephony/stats"
import { spoken } from "@/features/telephony/webphone-state"

const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" })
const DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric" })

/**
 * Calls day by day (maquette « Mes résultats »): a navy bar per day for the calls, its lime part for those picked up.
 * The figures stay readable without the bars: each bar carries its numbers.
 */
export function CallsChart({ days }: { days: CallDay[] }) {
  const top = Math.max(1, ...days.map((d) => d.calls))
  const total = days.reduce((t, d) => t + d.calls, 0)
  const picked = days.reduce((t, d) => t + d.answered, 0)
  const talk = days.reduce((t, d) => t + d.talkSec, 0)
  const label = (key: string) => (days.length > 7 ? DAY.format(new Date(`${key}T12:00:00Z`)) : WEEKDAY.format(new Date(`${key}T12:00:00Z`)).replace(".", ""))
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-1.5 border-b pb-1" style={{ height: 190 }} role="img" aria-label={`${total} appels sur la période, dont ${picked} décrochés`}>
        {days.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.day} : ${d.calls} appels, ${d.answered} décrochés`}>
            {days.length <= 14 && d.calls > 0 && <span className="text-[11px] font-bold tabular-nums text-foreground/80">{d.calls}</span>}
            <span className="flex w-full max-w-[42px] flex-col justify-end overflow-hidden rounded-t-lg rounded-b-sm bg-sidebar" style={{ height: `${Math.max(d.calls ? 4 : 2, (d.calls / top) * 150)}px` }}>
              <span className="block w-full bg-primary" style={{ height: d.calls ? `${(d.answered / d.calls) * 100}%` : 0 }} />
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {days.map((d, i) => <span key={d.day} className="min-w-0 flex-1 text-center text-[11px] text-muted-foreground">{days.length <= 14 || i % 5 === 0 ? label(d.day) : ""}</span>)}
      </div>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-sidebar" />{total} appels</span>
        <span><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-primary" />{picked} décrochés</span>
        {talk > 0 && <span>Temps de parole : <strong className="text-foreground">{spoken(talk)}</strong></span>}
      </p>
    </div>
  )
}
