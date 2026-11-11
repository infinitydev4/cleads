"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, Pause, Play, Settings2, Square, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AiCallerOverview, CallRow } from "@/features/ai-caller/service"
import { CALL_HOURS_LABEL, HOOK_LABELS, HOOK_WHEN, OUTCOME_LABELS, WAVE_SIZES, estimateWave, euros, type HookKey, type HookMode } from "@/features/ai-caller/rules"
import { api } from "../leads/api"
import { CallSheet } from "./call-sheet"

type Filter = "all" | "live" | "MEETING" | "CALLBACK" | "NOT_INTERESTED" | "missed" | "DO_NOT_CALL" | "FAILED"

const FILTERS: [Filter, string][] = [
  ["all", "Tous"],
  ["live", "En cours"],
  ["MEETING", "Rendez-vous"],
  ["CALLBACK", "À rappeler"],
  ["NOT_INTERESTED", "Pas intéressé"],
  ["missed", "Messagerie ou absent"],
  ["DO_NOT_CALL", "Liste rouge"],
  ["FAILED", "Échecs"],
]

function matches(r: CallRow, f: Filter) {
  if (f === "all") return true
  if (f === "live") return r.status === "QUEUED" || r.status === "DIALING"
  if (f === "missed") return r.outcome === "VOICEMAIL" || r.outcome === "NO_ANSWER"
  if (f === "FAILED") return r.outcome === "FAILED" || r.status === "FAILED"
  return r.outcome === f
}

function tag(r: CallRow): { label: string; className: string } {
  if (r.status === "DIALING") return { label: "En cours", className: "bg-primary text-primary-foreground" }
  if (r.status === "QUEUED") return { label: r.attempt > 1 ? "2e essai prévu" : "En attente", className: "bg-secondary text-secondary-foreground" }
  if (r.status === "CANCELED") return { label: "Annulé", className: "bg-secondary text-muted-foreground" }
  switch (r.outcome) {
    case "MEETING":
      return { label: OUTCOME_LABELS.MEETING, className: "bg-sidebar text-white" }
    case "CALLBACK":
      return { label: OUTCOME_LABELS.CALLBACK, className: "bg-warning-subtle text-warning" }
    case "DO_NOT_CALL":
      return { label: OUTCOME_LABELS.DO_NOT_CALL, className: "bg-destructive-subtle text-destructive-text" }
    case "VOICEMAIL":
    case "NO_ANSWER":
      return { label: OUTCOME_LABELS[r.outcome], className: "border border-dashed bg-card text-muted-foreground" }
    case "NOT_INTERESTED":
      return { label: OUTCOME_LABELS.NOT_INTERESTED, className: "bg-secondary text-secondary-foreground" }
    default:
      return { label: OUTCOME_LABELS.FAILED, className: "bg-destructive-subtle text-destructive-text" }
  }
}

const duration = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—")
const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")

interface Host {
  id: string
  name: string
  hasVideoLink: boolean
}

export function AiCallerView({ initial, hosts, canConfigure, openCallId }: { initial: AiCallerOverview; hosts: Host[]; canConfigure: boolean; openCallId: string | null }) {
  const [data, setData] = useState(initial)
  const [filter, setFilter] = useState<Filter>("all")
  const [openId, setOpenId] = useState<string | null>(openCallId)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setData(await api<AiCallerOverview>("/api/ai-caller"))
    } catch {
      // The next tick tries again; the page keeps what it shows.
    }
  }, [])

  const live = data.calls.some((c) => c.status === "DIALING" || c.status === "QUEUED")
  useEffect(() => {
    if (!live) return
    const t = setInterval(refresh, 10_000)
    return () => clearInterval(t)
  }, [live, refresh])

  const wave = data.waves.find((w) => w.status === "RUNNING" || w.status === "PAUSED") ?? null
  const rows = useMemo(() => data.calls.filter((r) => matches(r, filter)), [data.calls, filter])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([f]) => [f, data.calls.filter((r) => matches(r, f)).length])) as Record<Filter, number>, [data.calls])
  const reachRate = data.today.placed ? Math.round((data.today.reached / data.today.placed) * 100) : 0
  const spent = data.capMicros ? Math.min(100, Math.round((data.spentMicros / data.capMicros) * 100)) : 100

  const status = !data.setup.ready
    ? { on: false, text: "Agent pas encore configuré" }
    : data.paused
      ? { on: false, text: "Agent en pause · aucun appel ne part" }
      : data.spentMicros >= data.capMicros
        ? { on: false, text: "Plafond du mois atteint · les appels reprendront le mois prochain" }
        : !data.inHours
          ? { on: false, text: `Hors des heures d’appel · ${CALL_HOURS_LABEL}` }
          : { on: true, text: "Agent en ligne · appelle jusqu’à 19:00" }

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key)
    try {
      await fn()
      toast.success(done)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const togglePause = () => act("pause", () => api("/api/ai-caller/settings", { method: "PATCH", body: JSON.stringify({ paused: !data.paused }) }), data.paused ? "L’agent reprend ses appels." : "L’agent est en pause.")
  const waveStatus = (status: "RUNNING" | "PAUSED" | "CANCELED", done: string) => wave && act(`wave-${status}`, () => api(`/api/ai-caller/waves/${wave.id}`, { method: "PATCH", body: JSON.stringify({ status }) }), done)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.035em]">Agent d’appel IA</h1>
          <p className="max-w-[720px] text-sm text-muted-foreground">L’agent appelle tes prospects, présente leur audit en moins de 90 secondes et réserve un rendez-vous avec un chef de projet. Tout est classé dans la fiche.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="min-h-12 rounded-2xl px-4 font-bold">
            <Link href="/app/ai-caller/settings">
              <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Réglages
            </Link>
          </Button>
          {data.setup.ready && (
            <Button variant="outline" onClick={togglePause} loading={busy === "pause"} className="min-h-12 rounded-2xl px-4 font-bold">
              {data.paused ? <Play className="mr-2 h-4 w-4" aria-hidden="true" /> : <Pause className="mr-2 h-4 w-4" aria-hidden="true" />}
              {data.paused ? "Reprendre les appels" : "Mettre en pause"}
            </Button>
          )}
        </div>
      </div>

      {!data.setup.ready && <SetupNotice setup={data.setup} canConfigure={canConfigure} />}

      <section aria-label="Aujourd’hui" className="flex flex-wrap items-center gap-x-9 gap-y-5 rounded-3xl bg-sidebar px-7 py-6 text-sidebar-foreground shadow-card">
        <div className="min-w-0 flex-[1_1_320px] space-y-2.5">
          <p className="flex items-center gap-2.5 text-sm font-semibold text-sidebar-foreground/75">
            <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 rounded-full", status.on ? "animate-pulse bg-primary" : "bg-sidebar-foreground/40")} />
            {status.text}
          </p>
          {wave ? (
            <>
              <p className="text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-white">
                Vague « {wave.name} » · {wave.done} appel{wave.done > 1 ? "s" : ""} sur {wave.total}
                {wave.status === "PAUSED" && <span className="ml-2 align-middle text-sm font-bold text-warning">en pause</span>}
              </p>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sidebar-foreground/15">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((wave.done / Math.max(1, wave.total)) * 100)}%` }} />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {wave.status === "PAUSED" ? (
                  <WaveButton onClick={() => waveStatus("RUNNING", "La vague reprend.")} busy={busy === "wave-RUNNING"} icon={Play} label="Reprendre la vague" />
                ) : (
                  <WaveButton onClick={() => waveStatus("PAUSED", "La vague est en pause.")} busy={busy === "wave-PAUSED"} icon={Pause} label="Mettre la vague en pause" />
                )}
                <WaveButton onClick={() => waveStatus("CANCELED", "La vague est arrêtée.")} busy={busy === "wave-CANCELED"} icon={Square} label="Arrêter la vague" />
              </div>
            </>
          ) : (
            <p className="text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-white">Aucune vague en cours</p>
          )}
        </div>
        <dl className="grid flex-[1_1_560px] grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Décrochés aujourd’hui" value={String(data.today.reached)} hint={data.today.placed ? `${reachRate} % de ${data.today.placed}` : undefined} />
          <Stat label="Rendez-vous pris" value={String(data.today.meetings)} tone="text-primary" />
          <Stat label="À rappeler" value={String(data.today.callbacks)} tone="text-warning" />
          <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
            <dt className="text-xs font-semibold text-sidebar-foreground/70">Coût du mois</dt>
            <dd className="mt-1 text-[22px] font-extrabold tabular-nums text-white">{euros(data.spentMicros)}</dd>
            <p className="text-xs font-semibold text-sidebar-foreground/70">sur {euros(data.capMicros)}</p>
            <div aria-hidden="true" className="mt-2 h-1.5 rounded-full bg-sidebar-foreground/15">
              <div className="h-full rounded-full bg-white" style={{ width: `${spent}%` }} />
            </div>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Appels" className="min-w-0 flex-[999_1_620px] space-y-3 rounded-3xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">Appels de l’agent</h2>
            <span className="text-sm text-muted-foreground">{live ? "Mis à jour en direct" : `${data.calls.length} derniers appels`}</span>
          </div>
          <div role="group" aria-label="Filtrer par résultat" className="flex flex-wrap gap-2">
            {FILTERS.map(([f, label]) => {
              const on = filter === f
              if (f !== "all" && !counts[f] && !on) return null
              return (
                <button key={f} type="button" aria-pressed={on} onClick={() => setFilter(f)} className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent")}>
                  {label}
                  <span className={cn("rounded-full px-2 text-xs tabular-nums", on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{counts[f]}</span>
                </button>
              )
            })}
          </div>
          {rows.length === 0 ? (
            <p className="rounded-2xl bg-secondary/60 px-5 py-8 text-center text-sm text-muted-foreground">{data.calls.length ? "Aucun appel avec ce résultat." : "Aucun appel pour l’instant. Lance une première vague à droite."}</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => {
                const t = tag(r)
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-[13px] font-extrabold text-secondary-foreground">{initials(r.company)}</span>
                      <span className="min-w-0 flex-[1_1_200px]">
                        <span className="block truncate text-[15px] font-bold">{r.company}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">{r.meta || "—"}</span>
                      </span>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">{HOOK_LABELS[r.hook] ?? r.hook}</span>
                      <span className="w-12 text-right text-[13px] tabular-nums text-muted-foreground">{duration(r.durationSec)}</span>
                      <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-extrabold", t.className)}>{t.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <NewWave data={data} hosts={hosts} onLaunched={refresh} />
      </div>

      <CallSheet callId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
      <dt className="text-xs font-semibold text-sidebar-foreground/70">{label}</dt>
      <dd className={cn("mt-1 text-[22px] font-extrabold tabular-nums text-white", tone)}>
        {value}
        {hint && <span className="ml-1.5 text-xs font-semibold text-sidebar-foreground/70">· {hint}</span>}
      </dd>
    </div>
  )
}

function WaveButton({ onClick, busy, icon: Icon, label }: { onClick: () => void; busy: boolean; icon: typeof Play; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sidebar-foreground/20 px-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}

function SetupNotice({ setup, canConfigure }: { setup: AiCallerOverview["setup"]; canConfigure: boolean }) {
  const missing = [
    !setup.key && "la clé ElevenLabs (ELEVENLABS_API_KEY dans Vercel)",
    !setup.webhookSecret && "le secret du compte rendu d’appel (ELEVENLABS_WEBHOOK_SECRET dans Vercel)",
    !setup.agent && "l’agent, créé en un clic dans Réglages",
    !setup.number && "le numéro Zadarma qui appelle",
    !setup.host && "le chef de projet qui reçoit les rendez-vous",
  ].filter(Boolean) as string[]
  return (
    <section aria-label="Configuration" className="flex flex-wrap items-start gap-4 rounded-3xl border border-warning/40 bg-warning-subtle/60 p-5">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-[240px] flex-1 space-y-1.5">
        <h2 className="text-base font-extrabold">L’agent n’est pas encore prêt à appeler</h2>
        <p className="text-sm text-muted-foreground">Il manque : {missing.join(", ")}.</p>
      </div>
      {canConfigure && (
        <Button asChild className="min-h-11 rounded-xl bg-sidebar px-4 font-bold text-sidebar-foreground hover:bg-sidebar/90">
          <Link href="/app/ai-caller/settings">Terminer la configuration</Link>
        </Button>
      )}
    </section>
  )
}

interface Preview {
  eligible: number
  noPhone: number
  noHook: number
}

function NewWave({ data, hosts, onLaunched }: { data: AiCallerOverview; hosts: Host[]; onLaunched: () => Promise<void> }) {
  const [source, setSource] = useState("pool")
  const [hookMode, setHookMode] = useState<HookMode>("auto")
  const [size, setSize] = useState<number>(50)
  const [hostId, setHostId] = useState(data.hostId ?? hosts[0]?.id ?? "")
  const [format, setFormat] = useState<"meet" | "phone">(data.meetingFormat)
  const [launching, setLaunching] = useState(false)

  const body = useMemo(() => ({ source: source === "pool" ? { kind: "pool" } : { kind: "campaign", campaignId: source }, hookMode }), [source, hookMode])
  const key = JSON.stringify(body)
  // The count for the current choice; while another one is computed, the last one stays, dimmed.
  const [counted, setCounted] = useState<{ key: string; preview: Preview | null } | null>(null)
  const preview = counted?.preview ?? null
  const loading = counted?.key !== key
  useEffect(() => {
    let stale = false
    api<Preview>("/api/ai-caller/waves/preview", { method: "POST", body: key })
      .then((p) => !stale && setCounted({ key, preview: p }))
      .catch(() => !stale && setCounted({ key, preview: null }))
    return () => {
      stale = true
    }
  }, [key])

  const calls = Math.min(size, preview?.eligible ?? 0)
  const est = estimateWave(calls)
  const left = Math.max(0, data.capMicros - data.spentMicros)
  const host = hosts.find((h) => h.id === hostId)

  async function launch() {
    setLaunching(true)
    try {
      const r = await api<{ calls: number }>("/api/ai-caller/waves", { method: "POST", body: JSON.stringify({ ...body, size, hostId, meetingFormat: format }) })
      toast.success(`Vague lancée : ${r.calls} fiche${r.calls > 1 ? "s" : ""} à appeler.`)
      await onLaunched()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setLaunching(false)
    }
  }

  const chip = (on: boolean) => cn("min-h-10 rounded-full border px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent")

  return (
    <aside aria-label="Nouvelle vague" className="flex flex-[1_1_340px] flex-col gap-4 rounded-3xl border bg-card p-5 shadow-card">
      <div className="space-y-1">
        <h2 className="text-lg font-extrabold tracking-[-0.02em]">Nouvelle vague d’appels</h2>
        <p className="text-[13px] text-muted-foreground">Seules les fiches avec un numéro français, et un audit ou pas de site, sont appelées.</p>
      </div>

      <label className="space-y-1.5 text-[13px] font-bold">
        <span>Fiches à appeler</span>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="block min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="pool">Fiches non attribuées</option>
          {data.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              Campagne « {c.name} »
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-bold">Accroche</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={hookMode === "auto"} onClick={() => setHookMode("auto")} className={chip(hookMode === "auto")}>Choisie par l’audit</button>
          {(Object.keys(HOOK_LABELS) as HookKey[]).map((k) => (
            <button key={k} type="button" aria-pressed={hookMode === k} onClick={() => setHookMode(k)} className={chip(hookMode === k)}>{HOOK_LABELS[k]}</button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{hookMode === "auto" ? "Pour chaque fiche, l’agent prend le problème le plus fort de son audit." : `Quand ${HOOK_WHEN[hookMode]}. Sinon, l’audit choisit.`}</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-bold">Taille de la vague</legend>
        <div className="flex flex-wrap gap-2">
          {WAVE_SIZES.map((n) => (
            <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)} className={chip(size === n)}>{n} fiches</button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label className="block space-y-1.5 text-[13px] font-bold">
          <span>Rendez-vous avec</span>
          <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="block min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Format du rendez-vous" className="flex gap-2">
          {(["meet", "phone"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} className={cn("min-h-10 flex-1 rounded-xl border text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", format === f ? "border-sidebar bg-secondary" : "bg-card hover:bg-accent")}>{f === "meet" ? "Google Meet" : "Téléphone"}</button>
          ))}
        </div>
        {format === "meet" && host && !host.hasVideoLink && <p className="text-xs font-semibold text-warning">{host.name} n’a pas de lien Google Meet dans ses Disponibilités : le prospect ne le recevra pas.</p>}
      </div>

      <div className="flex justify-between gap-3 rounded-2xl bg-secondary/70 px-4 py-3 text-[13px]">
        <span className="font-bold">Heures d’appel</span>
        <span className="text-right">{CALL_HOURS_LABEL}</span>
      </div>

      <div aria-live="polite" className={cn("space-y-1 rounded-2xl border border-info/30 bg-info-subtle/60 px-4 py-3.5 text-sm transition-opacity", loading && "opacity-60")}>
        <p className="text-xs font-extrabold tracking-[0.05em] text-info">ESTIMATION</p>
        {preview && preview.eligible > 0 ? (
          <>
            <p>
              {calls} appel{calls > 1 ? "s" : ""} → environ <strong>{est.reached} décrochés</strong> → <strong>{est.meetingsLow === est.meetingsHigh ? est.meetingsLow : `${est.meetingsLow} à ${est.meetingsHigh}`} rendez-vous</strong>
            </p>
            <p>
              Coût prévu : <strong>≈ {euros(est.costMicros)}</strong> · reste {euros(left)} ce mois
            </p>
            {(preview.noPhone > 0 || preview.noHook > 0) && <p className="text-xs text-muted-foreground">Laissées de côté : {[preview.noPhone && `${preview.noPhone} sans numéro français`, preview.noHook && `${preview.noHook} sans audit ni accroche vraie`].filter(Boolean).join(", ")}.</p>}
          </>
        ) : (
          <p className="text-muted-foreground">{loading ? "Calcul…" : "Aucune fiche à appeler dans cette sélection."}</p>
        )}
      </div>

      <ul aria-label="Règles appliquées" className="space-y-2 text-[13px]">
        {["Appels depuis ton numéro Zadarma", "L’agent dit qu’il est une IA dès la première phrase", "Professionnels uniquement, liste rouge exclue", "Aucun chiffre hors de l’audit de la fiche"].map((c) => (
          <li key={c} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            {c}
          </li>
        ))}
      </ul>

      <Button onClick={launch} loading={launching} disabled={!data.setup.ready || !calls || !hostId} className="min-h-[52px] rounded-2xl text-[15px] font-extrabold">
        {calls ? `Lancer la vague · ${calls} appel${calls > 1 ? "s" : ""}` : "Lancer la vague"}
      </Button>
      {!data.setup.ready && <p className="-mt-2 text-center text-xs text-muted-foreground">Disponible une fois l’agent configuré.</p>}
    </aside>
  )
}
