"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Copy, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
import { FormField } from "@/components/crm/form-field"
import { minuteLabel, parseMinute } from "@/features/meetings/slots"
import { api } from "../../leads/api"

type Window = { weekday: number; startMinute: number; endMinute: number }
type Exception = { date: string; available: boolean; startMinute: number | null; endMinute: number | null; reason: string }
interface Profile { slug: string; enabled: boolean; timezone: string; durationMin: number; bufferMin: number; minNoticeMin: number; horizonDays: number; videoUrl: string; intro: string }
interface Initial { hostId: string; hostName: string; windows: Window[]; exceptions: Exception[]; profile: Profile; saved: boolean; publicUrl: string | null }

const DAYS = [
  { id: 1, label: "Lundi" }, { id: 2, label: "Mardi" }, { id: 3, label: "Mercredi" }, { id: 4, label: "Jeudi" },
  { id: 5, label: "Vendredi" }, { id: 6, label: "Samedi" }, { id: 0, label: "Dimanche" },
]

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm"

function TimeInput({ value, onChange, label }: { value: number; onChange: (m: number) => void; label: string }) {
  const [text, setText] = useState(minuteLabel(value))
  return (
    <Input
      aria-label={label}
      type="time"
      step={300}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const m = parseMinute(e.target.value)
        if (m !== null) onChange(m)
      }}
      className="w-32"
    />
  )
}

export function AvailabilityForm({ initial, hosts }: { initial: Initial; hosts: { id: string; name: string }[] }) {
  const router = useRouter()
  const [windows, setWindows] = useState<Window[]>(initial.windows)
  const [exceptions, setExceptions] = useState<Exception[]>(initial.exceptions)
  const [profile, setProfile] = useState<Profile>(initial.profile)
  const [busy, setBusy] = useState(false)
  const [newDay, setNewDay] = useState("")
  const url = initial.publicUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/rdv/${profile.slug}` : `/rdv/${profile.slug}`)

  const setProfileField = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => ({ ...p, [k]: v }))
  const addWindow = (weekday: number) => {
    const last = windows.filter((w) => w.weekday === weekday).sort((a, b) => b.endMinute - a.endMinute)[0]
    const start = last ? Math.min(last.endMinute + 60, 1440 - 60) : 9 * 60
    setWindows([...windows, { weekday, startMinute: start, endMinute: Math.min(start + 180, 1440) }])
  }
  const patchWindow = (target: Window, patch: Partial<Window>) => setWindows(windows.map((w) => (w === target ? { ...w, ...patch } : w)))
  const weekdays = () => setWindows([1, 2, 3, 4, 5].flatMap((weekday) => [{ weekday, startMinute: 540, endMinute: 720 }, { weekday, startMinute: 840, endMinute: 1080 }]))

  async function save() {
    setBusy(true)
    try {
      await api("/api/meetings/availability", { method: "PUT", body: JSON.stringify({ hostId: initial.hostId, windows, exceptions: exceptions.map((e) => ({ ...e, reason: e.reason || undefined })), profile: { ...profile, videoUrl: profile.videoUrl || "", intro: profile.intro || "" } }) })
      toast.success("Disponibilités enregistrées")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {hosts.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          Closer
          <select value={initial.hostId} onChange={(e) => router.push(`/app/meetings/availability?host=${e.target.value}`)} className="h-9 rounded-md border bg-background px-2">
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      )}

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">Horaires de la semaine</h2>
          <Button type="button" variant="outline" size="sm" onClick={weekdays}>Lundi–vendredi, 9h–12h et 14h–18h</Button>
        </div>
        <ul className="divide-y">
          {DAYS.map((d) => {
            const list = windows.filter((w) => w.weekday === d.id).sort((a, b) => a.startMinute - b.startMinute)
            return (
              <li key={d.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                <span className="w-24 pt-2 text-sm font-medium">{d.label}</span>
                <div className="flex-1 space-y-2">
                  {list.length === 0 && <p className="pt-2 text-sm text-muted-foreground">Fermé</p>}
                  {list.map((w) => (
                    <div key={`${w.weekday}-${w.startMinute}-${w.endMinute}`} className="flex flex-wrap items-center gap-2">
                      <TimeInput label={`${d.label}, début`} value={w.startMinute} onChange={(m) => patchWindow(w, { startMinute: m })} />
                      <span aria-hidden="true">à</span>
                      <TimeInput label={`${d.label}, fin`} value={w.endMinute} onChange={(m) => patchWindow(w, { endMinute: m })} />
                      <Button type="button" variant="ghost" size="icon" aria-label={`Supprimer cette plage du ${d.label.toLowerCase()}`} onClick={() => setWindows(windows.filter((x) => x !== w))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                {list.length < 3 && <Button type="button" variant="ghost" size="sm" onClick={() => addWindow(d.id)}><Plus className="h-4 w-4" aria-hidden="true" /> Plage</Button>}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-bold">Jours particuliers</h2>
        <p className="text-sm text-muted-foreground">Congés, jours fériés ou ouverture exceptionnelle : ils remplacent les horaires de la semaine pour ce jour.</p>
        <ul className="space-y-2">
          {exceptions.map((e) => (
            <li key={e.date} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="w-28 font-medium">{new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${e.date}T12:00:00Z`))}</span>
              <label className="flex items-center gap-2"><Switch checked={e.available} onCheckedChange={(v) => setExceptions(exceptions.map((x) => (x === e ? { ...x, available: v, startMinute: v ? 600 : null, endMinute: v ? 720 : null } : x)))} aria-label="Ouvert ce jour" /> {e.available ? "Ouvert" : "Fermé"}</label>
              {e.available && e.startMinute !== null && e.endMinute !== null && (
                <>
                  <TimeInput label="Début" value={e.startMinute} onChange={(m) => setExceptions(exceptions.map((x) => (x === e ? { ...x, startMinute: m } : x)))} />
                  <span aria-hidden="true">à</span>
                  <TimeInput label="Fin" value={e.endMinute} onChange={(m) => setExceptions(exceptions.map((x) => (x === e ? { ...x, endMinute: m } : x)))} />
                </>
              )}
              <Input aria-label="Motif" placeholder="Motif (facultatif)" value={e.reason} onChange={(ev) => setExceptions(exceptions.map((x) => (x === e ? { ...x, reason: ev.target.value } : x)))} className="min-w-[10rem] flex-1" maxLength={120} />
              <Button type="button" variant="ghost" size="icon" aria-label="Supprimer ce jour" onClick={() => setExceptions(exceptions.filter((x) => x !== e))}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <FormField label="Ajouter un jour"><Input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} className="w-44" /></FormField>
          <Button type="button" variant="outline" disabled={!newDay || exceptions.some((e) => e.date === newDay)} onClick={() => { setExceptions([...exceptions, { date: newDay, available: false, startMinute: null, endMinute: null, reason: "" }].sort((a, b) => a.date.localeCompare(b.date))); setNewDay("") }}>Ajouter</Button>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Page de réservation publique</h2>
            <p className="text-sm text-muted-foreground">Les prospects réservent seuls, sans compte. Chaque réservation crée la fiche et l’opportunité.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={profile.enabled} onCheckedChange={(v) => setProfileField("enabled", v)} aria-label="Page ouverte" /> {profile.enabled ? "Ouverte" : "Fermée"}</label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Adresse" hint="Lettres minuscules, chiffres et tirets."><Input value={profile.slug} onChange={(e) => setProfileField("slug", e.target.value.toLowerCase())} maxLength={40} /></FormField>
          <FormField label="Fuseau horaire"><Input value={profile.timezone} onChange={(e) => setProfileField("timezone", e.target.value)} /></FormField>
          <FormField label="Durée">
            <select className={selectClass} value={profile.durationMin} onChange={(e) => setProfileField("durationMin", Number(e.target.value))}>{[15, 20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select>
          </FormField>
          <FormField label="Marge entre deux rendez-vous">
            <select className={selectClass} value={profile.bufferMin} onChange={(e) => setProfileField("bufferMin", Number(e.target.value))}>{[0, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n === 0 ? "Aucune" : `${n} minutes`}</option>)}</select>
          </FormField>
          <FormField label="Délai minimum avant un rendez-vous">
            <select className={selectClass} value={profile.minNoticeMin} onChange={(e) => setProfileField("minNoticeMin", Number(e.target.value))}>{[[0, "Aucun"], [60, "1 heure"], [120, "2 heures"], [240, "4 heures"], [1440, "1 jour"], [2880, "2 jours"]].map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select>
          </FormField>
          <FormField label="Réservable jusqu’à">
            <select className={selectClass} value={profile.horizonDays} onChange={(e) => setProfileField("horizonDays", Number(e.target.value))}>{[7, 14, 21, 30, 60, 90].map((n) => <option key={n} value={n}>{n} jours</option>)}</select>
          </FormField>
        </div>
        <FormField label="Lien de visio" hint="Joint à chaque confirmation (Meet, Teams, Zoom…)."><Input type="url" placeholder="https://" value={profile.videoUrl} onChange={(e) => setProfileField("videoUrl", e.target.value)} /></FormField>
        <FormField label="Texte d’accueil" hint="Affiché au-dessus du calendrier."><Textarea rows={2} value={profile.intro} onChange={(e) => setProfileField("intro", e.target.value)} maxLength={500} /></FormField>
        {initial.saved && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">
            <code className="min-w-0 flex-1 break-all">{url}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Lien copié"))}><Copy className="h-4 w-4" aria-hidden="true" /> Copier</Button>
          </div>
        )}
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" loading={busy} onClick={save}>Enregistrer</Button>
      </div>
    </div>
  )
}
