"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "../leads/api"

const PRESETS = [30, 40, 60, 80]

/** The closers' daily call goal, the ring of « Ma journée » (owners and managers). Indicative: nothing is blocked. */
export function CallGoal({ goal }: { goal: number }) {
  const router = useRouter()
  const [value, setValue] = useState(String(goal))
  const [busy, setBusy] = useState(false)
  const n = Number(value)
  const valid = Number.isInteger(n) && n >= 1 && n <= 500

  async function save(next = n) {
    setBusy(true)
    try {
      const r = await api<{ goal: number }>("/api/team/call-goal", { method: "PATCH", body: JSON.stringify({ goal: next }) })
      setValue(String(r.goal))
      toast.success(`Objectif enregistré : ${r.goal} appels par jour et par closer.`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="goal-title" className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-3xl border bg-card p-5 shadow-card">
      <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sidebar text-primary"><Target className="h-5 w-5" /></span>
      <div className="min-w-[220px] flex-1 space-y-1">
        <h2 id="goal-title" className="text-base font-extrabold">Objectif d’appels du jour</h2>
        <p className="text-sm text-muted-foreground">Le cercle de « Ma journée » de chaque closer. Indicatif : rien n’est bloqué au-delà.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Valeurs courantes" className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button key={p} type="button" aria-pressed={n === p} onClick={() => setValue(String(p))} className={`min-h-10 rounded-full border px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${n === p ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-background hover:bg-accent"}`}>{p}</button>
          ))}
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-semibold focus-within:ring-2 focus-within:ring-ring">
          <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))} onKeyDown={(e) => e.key === "Enter" && valid && save()} inputMode="numeric" aria-label="Appels par jour" className="w-12 bg-transparent text-right tabular-nums outline-none" />
          appels / jour
        </label>
        <Button onClick={() => save()} disabled={!valid || n === goal} loading={busy} className="min-h-10 rounded-xl bg-sidebar px-4 font-bold text-sidebar-foreground hover:bg-sidebar/90">Enregistrer</Button>
      </div>
    </section>
  )
}
