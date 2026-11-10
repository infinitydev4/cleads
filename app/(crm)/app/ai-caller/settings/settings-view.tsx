"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Check, CircleDashed, Copy, Lock, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AiCallerSettings } from "@/features/ai-caller/service"
import type { PhoneNumber, Voice } from "@/lib/telephony/elevenlabs"
import { CALL_HOURS_LABEL, DEFAULT_HOOKS, EUR_PER_MINUTE, HOOK_KEYS, HOOK_LABELS, HOOK_MAX_LENGTH, HOOK_VARIABLES, HOOK_WHEN, euros, type HookKey } from "@/features/ai-caller/rules"
import { api } from "../../leads/api"

type Tab = "setup" | "hooks" | "voice" | "rules" | "budget"

interface Props {
  initial: AiCallerSettings
  account: { numbers: PhoneNumber[]; voices: Voice[]; error: string | null }
  hosts: { id: string; name: string; hasVideoLink: boolean }[]
  spentMicros: number
  canConfigure: boolean
}

const STEPS: [string, string, string][] = [
  ["Présentation", "10 s", "« Bonjour, ici l’assistante IA de Cleads. » Toujours, dès la première phrase."],
  ["Accroche", "15 s", "Un seul problème, tiré de l’audit de la fiche."],
  ["Manque à gagner", "15 s", "Des demandes de devis perdues, jamais un chiffre inventé."],
  ["Deux questions", "20 s", "C’est vous qui décidez ? Plus de demandes, c’est une priorité ?"],
  ["Deux créneaux", "20 s", "Pris dans l’agenda du chef de projet, au téléphone ou en visio."],
  ["Confirmation", "10 s", "Rendez-vous noté, confirmation par email, merci."],
]

const RULES: [string, string][] = [
  ["Annoncer que c’est une IA", "Dès la première phrase de chaque appel (règlement européen sur l’IA, article 50)."],
  ["Appeler des professionnels uniquement", "Pour leur activité : un site pour leur entreprise. Jamais un particulier."],
  ["Respecter la liste rouge", "« Ne m’appelez plus » passe la fiche en « ne pas contacter », pour toujours."],
  ["Aucun chiffre hors de l’audit", "L’agent ne cite que ce que l’audit de la fiche contient, ni prix ni promesse."],
  ["Deux tentatives maximum par fiche", "Sans réponse ou messagerie : un second essai le lendemain, puis la fiche reste à l’équipe."],
  ["Heures d’appel", `${CALL_HOURS_LABEL}, jamais un jour férié.`],
  ["Numéro dédié aux appels automatisés", "Un numéro en 09 48, 09 49 ou un autre préfixe réservé par l’Arcep."],
]

export function AiCallerSettingsView({ initial, account, hosts, spentMicros, canConfigure }: Props) {
  const [s, setS] = useState(initial)
  const [tab, setTab] = useState<Tab>(initial.setup.ready ? "hooks" : "setup")
  const [busy, setBusy] = useState<string | null>(null)

  async function save(key: string, patch: Record<string, unknown>, done = "Enregistré.") {
    setBusy(key)
    try {
      setS(await api<AiCallerSettings>("/api/ai-caller/settings", { method: "PATCH", body: JSON.stringify(patch) }))
      toast.success(done)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function createAgent() {
    setBusy("agent")
    try {
      setS(await api<AiCallerSettings>("/api/ai-caller/setup", { method: "POST" }))
      toast.success("Agent créé dans ton compte ElevenLabs.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const tabs: [Tab, string][] = [
    ["setup", "Connexion"],
    ["hooks", "Accroches et déroulé"],
    ["voice", "Voix"],
    ["rules", "Garde-fous"],
    ["budget", "Budget"],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Link href="/app/ai-caller" className="inline-flex min-h-8 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Agent d’appel IA
          </Link>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.035em]">Réglages de l’agent</h1>
          <p className="text-sm text-muted-foreground">Ce que l’agent dit, comment il le dit, et ce qu’il ne fera jamais.{!canConfigure && " Seul le propriétaire peut les modifier."}</p>
        </div>
      </div>

      <div role="tablist" aria-label="Réglages" className="inline-flex flex-wrap gap-1.5 rounded-2xl border bg-card p-1.5 shadow-card">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("min-h-10 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === id ? "bg-sidebar text-sidebar-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {label}
            {id === "setup" && !s.setup.ready && <span aria-label="à terminer" className="ml-2 inline-block h-2 w-2 rounded-full bg-warning align-middle" />}
          </button>
        ))}
      </div>

      {tab === "setup" && <SetupTab s={s} account={account} hosts={hosts} canConfigure={canConfigure} busy={busy} onSave={save} onCreateAgent={createAgent} />}
      {tab === "hooks" && <HooksTab s={s} canConfigure={canConfigure} busy={busy} onSave={save} />}
      {tab === "voice" && <VoiceTab s={s} voices={account.voices} error={account.error} canConfigure={canConfigure} busy={busy} onSave={save} />}
      {tab === "rules" && (
        <section aria-label="Garde-fous" className="divide-y rounded-3xl border bg-card px-5 shadow-card">
          {RULES.map(([t, x]) => (
            <div key={t} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-[260px] flex-1 space-y-0.5">
                <p className="text-[15px] font-bold">{t}</p>
                <p className="text-[13px] text-muted-foreground">{x}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Toujours actif
              </span>
            </div>
          ))}
        </section>
      )}
      {tab === "budget" && <BudgetTab s={s} spentMicros={spentMicros} canConfigure={canConfigure} busy={busy} onSave={save} />}
    </div>
  )
}

type Save = (key: string, patch: Record<string, unknown>, done?: string) => Promise<void>

function Item({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-4">
      {ok ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-label="Fait" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-label="À faire" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[15px] font-bold">{title}</p>
        <div className="space-y-2 text-[13px] text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

function SetupTab({ s, account, hosts, canConfigure, busy, onSave, onCreateAgent }: { s: AiCallerSettings; account: Props["account"]; hosts: Props["hosts"]; canConfigure: boolean; busy: string | null; onSave: Save; onCreateAgent: () => void }) {
  const [number, setNumber] = useState(s.phoneNumberId ?? "")
  const [host, setHost] = useState(s.hostId ?? "")
  const select = "block min-h-11 w-full max-w-[460px] rounded-xl border bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
  const copy = async () => {
    await navigator.clipboard.writeText(s.webhookUrl)
    toast.success("Adresse copiée.")
  }
  return (
    <section aria-label="Connexion" className="rounded-3xl border bg-card px-5 shadow-card">
      <ol className="divide-y">
        <Item ok={s.setup.key} title="1. La clé ElevenLabs">
          <p>Dans ElevenLabs › Developers › API keys, crée une clé avec les droits « ElevenAgents » et « Voices ». Ajoute-la toi-même dans Vercel sous le nom <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">ELEVENLABS_API_KEY</code>, puis redéploie.</p>
        </Item>
        <Item ok={s.setup.number} title="2. Le numéro qui appelle (09 48 ou 09 49)">
          <p>Achète chez Zadarma un numéro réservé aux appels automatisés, puis importe-le dans ElevenLabs › Phone numbers comme « SIP trunk » (guide Zadarma « Integration with ElevenLabs »). Il apparaît ensuite ici.</p>
          {account.error && <p className="font-semibold text-destructive-text">{account.error}</p>}
          {s.setup.key && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select aria-label="Numéro de l’agent" value={number} onChange={(e) => setNumber(e.target.value)} disabled={!canConfigure} className={select}>
                <option value="">{account.numbers.length ? "Choisir le numéro" : "Aucun numéro importé dans ElevenLabs"}</option>
                {account.numbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.number}
                    {n.label ? ` · ${n.label}` : ""}
                  </option>
                ))}
              </select>
              {canConfigure && <Button onClick={() => onSave("number", { phoneNumberId: number }, "Numéro enregistré.")} loading={busy === "number"} disabled={number === (s.phoneNumberId ?? "")} className="min-h-11 rounded-xl px-4 font-bold">Enregistrer</Button>}
            </div>
          )}
        </Item>
        <Item ok={s.setup.agent} title="3. L’agent">
          <p>Cleads le crée dans ton compte ElevenLabs avec ses quatre outils (créneaux, réservation, rappel, liste rouge). Les consignes de chaque appel sont envoyées au moment de l’appel.</p>
          {canConfigure && s.setup.key && (
            <Button onClick={onCreateAgent} loading={busy === "agent"} variant={s.setup.agent ? "outline" : "default"} className="min-h-11 rounded-xl px-4 font-bold">{s.setup.agent ? "Recréer l’agent" : "Créer l’agent chez ElevenLabs"}</Button>
          )}
        </Item>
        <Item ok={s.setup.webhookSecret} title="4. Le compte rendu de fin d’appel">
          <p>Dans ElevenLabs › Agents › Settings › Webhooks, ajoute un webhook « post-call » (transcription et échecs d’appel) vers cette adresse. Mets le secret qu’il te donne dans Vercel sous le nom <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">ELEVENLABS_WEBHOOK_SECRET</code>.</p>
          <div className="flex max-w-[560px] items-center gap-2 rounded-xl border bg-background px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-foreground">{s.webhookUrl}</code>
            <button type="button" onClick={copy} aria-label="Copier l’adresse" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Item>
        <Item ok={s.setup.host} title="5. Qui reçoit les rendez-vous">
          <p>Le chef de projet dont l’agent propose les créneaux (ses Disponibilités). Pour la visio, son lien Google Meet est pris dans ses Disponibilités.</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <select aria-label="Chef de projet" value={host} onChange={(e) => setHost(e.target.value)} disabled={!canConfigure} className={select}>
              <option value="">Choisir</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.hasVideoLink ? "" : " · pas de lien Meet"}
                </option>
              ))}
            </select>
            <div role="group" aria-label="Format par défaut" className="flex gap-1.5">
              {(["meet", "phone"] as const).map((f) => (
                <button key={f} type="button" disabled={!canConfigure || busy === "format"} aria-pressed={s.meetingFormat === f} onClick={() => onSave("format", { meetingFormat: f })} className={cn("min-h-11 rounded-xl border px-3.5 text-[13px] font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", s.meetingFormat === f ? "border-sidebar bg-secondary" : "bg-card hover:bg-accent")}>
                  {f === "meet" ? "Google Meet" : "Téléphone"}
                </button>
              ))}
            </div>
            {canConfigure && <Button onClick={() => onSave("host", { hostId: host }, "Chef de projet enregistré.")} loading={busy === "host"} disabled={host === (s.hostId ?? "")} className="min-h-11 rounded-xl px-4 font-bold">Enregistrer</Button>}
          </div>
        </Item>
      </ol>
    </section>
  )
}

function HooksTab({ s, canConfigure, busy, onSave }: { s: AiCallerSettings; canConfigure: boolean; busy: string | null; onSave: Save }) {
  const [texts, setTexts] = useState<Record<HookKey, string>>(s.hooks)
  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Accroches" className="grid min-w-0 flex-[999_1_600px] grid-cols-1 gap-4 lg:grid-cols-2">
        {HOOK_KEYS.map((k) => {
          const changed = texts[k] !== s.hooks[k]
          return (
            <article key={k} className="flex flex-col gap-3 rounded-3xl border bg-card p-5 shadow-card">
              <div className="space-y-1">
                <h2 className="text-base font-extrabold">{HOOK_LABELS[k]}</h2>
                <p className="text-xs text-muted-foreground">Quand {HOOK_WHEN[k]}.</p>
              </div>
              <label className="sr-only" htmlFor={`hook-${k}`}>Texte de l’accroche « {HOOK_LABELS[k]} »</label>
              <textarea id={`hook-${k}`} value={texts[k]} onChange={(e) => setTexts({ ...texts, [k]: e.target.value })} readOnly={!canConfigure} maxLength={HOOK_MAX_LENGTH} rows={4} className="w-full resize-y rounded-2xl border-0 bg-secondary/70 px-4 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <div className="flex flex-wrap gap-1.5">
                {HOOK_VARIABLES.filter((v) => texts[k].includes(v)).map((v) => (
                  <span key={v} className="rounded-lg bg-info-subtle px-2 py-0.5 text-xs font-bold text-info">{v}</span>
                ))}
              </div>
              {canConfigure && (
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button onClick={() => onSave(`hook-${k}`, { hooks: { [k]: texts[k] } }, "Accroche enregistrée.")} loading={busy === `hook-${k}`} disabled={!changed} className="min-h-10 rounded-xl px-4 font-bold">Enregistrer</Button>
                  {texts[k] !== DEFAULT_HOOKS[k] && (
                    <Button variant="outline" onClick={() => setTexts({ ...texts, [k]: DEFAULT_HOOKS[k] })} className="min-h-10 rounded-xl px-4 font-bold">Texte d’origine</Button>
                  )}
                </div>
              )}
            </article>
          )
        })}
        <p className="text-xs text-muted-foreground lg:col-span-2">
          Variables : {HOOK_VARIABLES.join(", ")}. {"{probleme}"} reprend le problème trouvé par l’audit. Une fiche à qui une variable manque ne reçoit pas cette accroche : l’agent n’invente rien.
        </p>
      </section>
      <aside aria-label="Déroulé de l’appel" className="flex-[1_1_300px] space-y-3 rounded-3xl bg-sidebar p-5 text-sidebar-foreground shadow-card">
        <h2 className="text-base font-extrabold text-white">Déroulé d’un appel · 90 s maximum</h2>
        <ol className="space-y-1">
          {STEPS.map(([t, d, x], i) => (
            <li key={t} className="flex gap-3 py-2">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] font-extrabold text-primary">{i + 1}</span>
              <span className="space-y-0.5">
                <span className="block text-sm font-bold text-white">
                  {t} <span className="font-semibold text-sidebar-foreground/70">· {d}</span>
                </span>
                <span className="block text-[13px] leading-relaxed text-sidebar-foreground/80">{x}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}

function VoiceTab({ s, voices, error, canConfigure, busy, onSave }: { s: AiCallerSettings; voices: Voice[]; error: string | null; canConfigure: boolean; busy: string | null; onSave: Save }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  function listen(v: Voice) {
    audio.current?.pause()
    if (playing === v.id || !v.previewUrl) return setPlaying(null)
    const a = new Audio(v.previewUrl)
    a.onended = () => setPlaying(null)
    audio.current = a
    void a.play().then(() => setPlaying(v.id)).catch(() => setPlaying(null))
  }
  if (!voices.length) return <p className="rounded-3xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground shadow-card">{error ?? "Les voix apparaissent une fois la clé ElevenLabs ajoutée."}</p>
  return (
    <section aria-label="Voix" className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {voices.map((v) => {
          const on = s.voiceId === v.id
          return (
            <div key={v.id} className={cn("flex items-start gap-3 rounded-2xl border-2 bg-card p-4", on ? "border-sidebar" : "border-transparent shadow-card")}>
              <button type="button" onClick={() => listen(v)} disabled={!v.previewUrl} aria-label={playing === v.id ? `Arrêter l’écoute de ${v.name}` : `Écouter ${v.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sidebar text-white hover:bg-sidebar/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                {playing === v.id ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[15px] font-bold">{v.name}</p>
                <p className="line-clamp-2 text-[13px] text-muted-foreground">{v.description || "Voix ElevenLabs"}</p>
              </div>
              {on ? (
                <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-primary-foreground">Choisie</span>
              ) : (
                canConfigure && (
                  <Button variant="outline" onClick={() => onSave(`voice-${v.id}`, { voiceId: v.id }, `Voix « ${v.name} » choisie.`)} loading={busy === `voice-${v.id}`} className="min-h-9 rounded-xl px-3 text-[13px] font-bold">Choisir</Button>
                )
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">L’agent vouvoie toujours, parle en phrases courtes et se tait quand on le coupe. Les voix françaises sont en tête de liste.</p>
    </section>
  )
}

function BudgetTab({ s, spentMicros, canConfigure, busy, onSave }: { s: AiCallerSettings; spentMicros: number; canConfigure: boolean; busy: string | null; onSave: Save }) {
  const [cap, setCap] = useState(String(Math.round(s.monthlyCapCents / 100)))
  const n = Number(cap)
  const valid = Number.isInteger(n) && n >= 0 && n <= 1000
  const capMicros = s.monthlyCapCents * 10_000
  const pct = capMicros ? Math.min(100, Math.round((spentMicros / capMicros) * 100)) : 100
  const rows: [string, string][] = [
    ["Par appel décroché (1 min 30 en moyenne)", `≈ ${euros(Math.ceil(1.5 * EUR_PER_MINUTE * 1_000_000))}`],
    ["Par minute en ligne (ElevenLabs, modèle et Zadarma)", `≈ ${euros(EUR_PER_MINUTE * 1_000_000)}`],
    ["Sonnerie sans réponse", "0 €"],
    ["Numéro 09 48 chez Zadarma", "selon Zadarma, par mois"],
  ]
  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <section aria-label="Plafond" className="flex flex-[1_1_380px] flex-col gap-4 rounded-3xl border bg-card p-5 shadow-card">
        <h2 className="text-base font-extrabold">Plafond mensuel</h2>
        <label className="space-y-1.5 text-[13px] font-bold">
          <span>Montant maximum par mois</span>
          <span className="flex min-h-12 max-w-[220px] items-center gap-2 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <input value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 4))} readOnly={!canConfigure} inputMode="numeric" className="w-full bg-transparent text-base font-bold tabular-nums outline-none" />
            <span className="text-sm font-bold text-muted-foreground">€</span>
          </span>
        </label>
        <p className="text-[13px] text-muted-foreground">À 100 %, l’agent s’arrête jusqu’au mois suivant. Les appels en cours se terminent.</p>
        <div aria-hidden="true" className="h-2.5 rounded-full bg-secondary">
          <div className="h-full rounded-full bg-sidebar" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm">
          <strong>{euros(spentMicros)}</strong> utilisés sur {euros(capMicros)} ce mois
        </p>
        {canConfigure && <Button onClick={() => onSave("cap", { monthlyCapCents: n * 100 }, "Plafond enregistré.")} loading={busy === "cap"} disabled={!valid || n * 100 === s.monthlyCapCents} className="mt-auto min-h-11 self-start rounded-xl px-4 font-bold">Enregistrer</Button>}
      </section>
      <section aria-label="Coûts" className="flex flex-[1_1_380px] flex-col gap-2 rounded-3xl bg-sidebar p-5 text-sidebar-foreground shadow-card">
        <h2 className="pb-1 text-base font-extrabold text-white">Ce que coûte l’agent</h2>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-white/10 py-2 text-sm">
            <span className="text-sidebar-foreground/80">{k}</span>
            <strong className="text-right text-white">{v}</strong>
          </div>
        ))}
        <p className="pt-1 text-xs text-sidebar-foreground/70">Estimations, à confirmer sur les factures ElevenLabs et Zadarma.</p>
      </section>
    </div>
  )
}
