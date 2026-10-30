"use client"

import { useState } from "react"
import { CalendarX2, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SlotPicker, browserTimezone, longDay } from "@/components/meetings/slot-picker"

interface GuestMeeting {
  token: string
  hostName: string
  startsAt: string
  endsAt: string
  durationMin: number
  status: string
  videoUrl: string | null
  locked: string | null
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error ?? "Une erreur est survenue."), { code: body.code as string | undefined })
  return body as T
}

const hour = (iso: string, tz: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const STATUS: Record<string, string> = { CANCELED: "Ce rendez-vous est annulé.", COMPLETED: "Ce rendez-vous a eu lieu.", NO_SHOW: "Ce rendez-vous est clos.", RESCHEDULED: "Ce rendez-vous a été déplacé." }

export function ManageMeeting({ initial }: { initial: GuestMeeting }) {
  const tz = browserTimezone()
  const [m, setM] = useState(initial)
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view")
  const [slot, setSlot] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const active = m.status === "SCHEDULED" || m.status === "CONFIRMED"
  const base = `/api/public/rdv/manage/${encodeURIComponent(m.token)}`

  async function act(body: object, message: string) {
    setBusy(true)
    setError(null)
    try {
      setM(await call<GuestMeeting>(base, { method: "POST", body: JSON.stringify(body) }))
      setNotice(message)
      setMode("view")
      setSlot(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 sm:p-8" aria-live="polite">
      <h1 className="text-2xl font-semibold">Votre rendez-vous</h1>
      <p className="mt-4 text-lg first-letter:uppercase">{longDay(m.startsAt, tz)} à {hour(m.startsAt, tz)}</p>
      <p className="text-muted-foreground">avec {m.hostName}, {m.durationMin} minutes.</p>
      {m.videoUrl && active && (
        <p className="mt-3 text-sm"><Video className="mr-1 inline h-4 w-4" aria-hidden="true" /> <a className="underline" href={m.videoUrl}>Lien de la visio</a></p>
      )}
      {!active && <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted p-3 text-sm"><CalendarX2 className="h-4 w-4" aria-hidden="true" /> {STATUS[m.status] ?? "Ce rendez-vous n’est plus actif."}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}

      {active && m.locked && <p className="mt-4 text-sm text-muted-foreground">{m.locked}</p>}

      {active && !m.locked && mode === "view" && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => setMode("move")} className="sm:w-auto">Choisir un autre horaire</Button>
          <Button variant="outline" onClick={() => setMode("cancel")}>Annuler le rendez-vous</Button>
        </div>
      )}

      {active && !m.locked && mode === "move" && (
        <div className="mt-6 space-y-4">
          <SlotPicker load={(from, days) => call(`${base}/slots?from=${from}&days=${days}`)} value={slot} onChange={setSlot} timezone={tz} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button loading={busy} disabled={!slot} onClick={() => slot && act({ action: "reschedule", startsAt: slot }, "Votre rendez-vous a été déplacé. Un nouvel email de confirmation vous a été envoyé.")}>Confirmer le nouvel horaire</Button>
            <Button variant="ghost" onClick={() => { setMode("view"); setSlot(null) }}>Retour</Button>
          </div>
        </div>
      )}

      {active && !m.locked && mode === "cancel" && (
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Pourquoi ? (facultatif)<Textarea className="mt-2" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="destructive" loading={busy} onClick={() => act({ action: "cancel", reason: reason.trim() || undefined }, "Votre rendez-vous est annulé.")}>Annuler définitivement</Button>
            <Button variant="ghost" onClick={() => setMode("view")}>Retour</Button>
          </div>
        </div>
      )}
    </section>
  )
}
