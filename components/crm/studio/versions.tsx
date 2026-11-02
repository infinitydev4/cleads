"use client"

import { useState } from "react"
import { Columns2, History, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatEur } from "@/features/ai/labels"
import { modelLabel } from "@/lib/ai/models"
import type { SiteView, VersionView } from "@/features/studio/labels"
import { INSTRUCTION_MAX } from "@/features/studio/schemas"
import { api } from "@/app/(crm)/app/leads/api"

const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const EXAMPLES = ["Passe le bouton principal en vert", "Ajoute une section zone d’intervention", "Rends le titre plus direct", "Mets les services en deux colonnes sur mobile"]

/** « Modifier par instruction » (E23): a new version of the current one, changed as the person asks. */
export function ReviseBox({ site, onChanged }: { site: SiteView; onChanged: () => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const ok = text.trim().length >= 3

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    try {
      await api(`/api/studio/sites/${site.id}/revise`, { method: "POST", body: JSON.stringify({ instruction: text.trim() }) })
      toast.success("Demande envoyée au Designer : une nouvelle version arrive dans quelques minutes.")
      setText("")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={`revise-${site.id}`} className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 className="h-4 w-4" aria-hidden="true" /> Modifier par instruction
      </label>
      <Textarea id={`revise-${site.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={INSTRUCTION_MAX} rows={3} placeholder="Décrivez la modification, comme à un graphiste." />
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" onClick={() => setText(x)} className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {x}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={busy} disabled={!ok}>
          Créer une nouvelle version
        </Button>
        <span className="text-xs text-muted-foreground">Le reste de la page ne change pas. Environ 0,50 €.</span>
      </div>
    </form>
  )
}

function VersionLine({ v, current, selected, onSelect }: { v: VersionView; current: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn("flex w-full items-start gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected && "border-foreground bg-accent")}
      >
        {v.renders.thumb ? <img src={v.renders.thumb} alt="" loading="lazy" className="h-14 w-24 shrink-0 rounded border object-cover object-top" /> : <span className="h-14 w-24 shrink-0 rounded border bg-muted" aria-hidden="true" />}
        <span className="min-w-0 flex-1 space-y-0.5 text-sm">
          <span className="flex flex-wrap items-center gap-1.5 font-semibold">
            Version {v.number}
            {current && <Badge variant="success">En ligne</Badge>}
            {v.checks.critique && <span className="text-xs font-normal tabular-nums text-muted-foreground">{v.checks.critique.average.toLocaleString("fr-FR")} / 5</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{v.instruction ? `« ${v.instruction} »` : "Depuis le brief"}</span>
          <span className="block text-xs text-muted-foreground">
            {when.format(new Date(v.createdAt))}
            {v.createdBy && ` · ${v.createdBy}`} · {formatEur(v.costEur)}
            {v.model && ` · ${modelLabel(v.model)}`}
          </span>
        </span>
      </button>
    </li>
  )
}

/** The versions of a site, newest first, and two of them side by side. */
export function VersionsPanel({ site, selected, onSelect }: { site: SiteView; selected: number | null; onSelect: (n: number) => void }) {
  const [compare, setCompare] = useState(false)
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const versions = site.versions
  const a = versions.find((v) => v.number === selected) ?? versions[0]
  const b = versions.find((v) => v.number !== a?.number)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" aria-hidden="true" /> Versions
        </h4>
        {versions.length > 1 && (
          <Button type="button" size="sm" variant={compare ? "secondary" : "ghost"} className="ml-auto" onClick={() => setCompare((c) => !c)} aria-pressed={compare}>
            <Columns2 className="h-3.5 w-3.5" aria-hidden="true" /> Comparer
          </Button>
        )}
      </div>
      {compare && a && b ? (
        <div className="space-y-2">
          <div className="flex gap-1 text-xs">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d} className={cn("rounded-md px-2 py-1 font-semibold", device === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {d === "desktop" ? "Ordinateur" : "Téléphone"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[b, a].map((v) => (
              <figure key={v.number} className="space-y-1">
                <figcaption className="text-xs font-medium">Version {v.number}</figcaption>
                <div className="max-h-[32rem] overflow-y-auto rounded-lg border bg-white">{v.renders[device] && <img src={v.renders[device]!} alt={`Version ${v.number} sur ${device === "desktop" ? "ordinateur" : "téléphone"}`} className="w-full" loading="lazy" />}</div>
              </figure>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => (
            <VersionLine key={v.number} v={v} current={v.number === site.currentVersion} selected={v.number === (selected ?? site.currentVersion)} onSelect={() => onSelect(v.number)} />
          ))}
        </ul>
      )}
    </div>
  )
}
