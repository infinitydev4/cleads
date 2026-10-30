"use client"

import { useId, useState } from "react"
import { CalendarCheck, Clock, ExternalLink, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { SlotPicker, browserTimezone, longDay } from "@/components/meetings/slot-picker"

interface Profile {
  hostName: string
  intro: string | null
  durationMin: number
  timezone: string
  horizonDays: number
}

interface Done {
  startsAt: string
  manageUrl: string
  emailSent: boolean
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error ?? "Une erreur est survenue."), { code: body.code as string | undefined })
  return body as T
}

const hourLabel = (iso: string, tz: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

/** Two taps and three fields: a time, a name, an address. Everything else is optional and folded away. */
export function BookingFlow({ slug, profile }: { slug: string; profile: Profile }) {
  const tz = browserTimezone()
  const [slot, setSlot] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "", website: "" })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [reload, setReload] = useState(0)
  const formId = useId()
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!slot || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await call<Done>(`/api/public/rdv/${slug}`, {
        method: "POST",
        body: JSON.stringify({ startsAt: slot, name: form.name, email: form.email, phone: form.phone || undefined, company: form.company || undefined, message: form.message || undefined, website: form.website, consent, timezone: tz }),
      })
      setDone(r)
    } catch (e) {
      const err = e as Error & { code?: string }
      setError({ message: err.message, code: err.code })
      // The slot was taken meanwhile: offer fresh ones instead of leaving the person stuck.
      if (err.code === "slot_taken") {
        setSlot(null)
        setReload((n) => n + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section aria-live="polite" className="rounded-2xl border bg-card p-6 sm:p-8">
        <CalendarCheck className="mb-4 h-8 w-8 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">C’est réservé</h1>
        <p className="mt-3 text-lg first-letter:uppercase">{longDay(done.startsAt, tz)} à {hourLabel(done.startsAt, tz)}</p>
        <p className="text-muted-foreground">avec {profile.hostName}, {profile.durationMin} minutes.</p>
        <p className="mt-5 text-sm text-muted-foreground">
          {done.emailSent ? "Un email de confirmation avec une invitation de calendrier vient de partir." : "Gardez cette page : l’email de confirmation n’a pas pu partir, mais votre créneau est bien réservé."}
        </p>
        {done.manageUrl && (
          <Button asChild variant="outline" className="mt-6 w-full sm:w-auto">
            <a href={done.manageUrl}>Modifier ou annuler</a>
          </Button>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold sm:text-3xl">Rendez-vous avec {profile.hostName}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" /> {profile.durationMin} minutes</span>
          <span className="inline-flex items-center gap-1.5"><Video className="h-4 w-4" aria-hidden="true" /> En visio</span>
        </p>
        {profile.intro && <p className="mt-4 text-muted-foreground">{profile.intro}</p>}
      </header>

      <section aria-labelledby={`${formId}-when`} className="rounded-2xl border bg-card p-4 sm:p-6">
        <h2 id={`${formId}-when`} className="mb-4 text-base font-semibold">1. Choisissez un horaire</h2>
        <SlotPicker load={(from, days) => call(`/api/public/rdv/${slug}/slots?from=${from}&days=${days}`)} value={slot} onChange={setSlot} timezone={tz} days={Math.min(profile.horizonDays + 1, 35)} reloadKey={`${slug}-${reload}`} />
      </section>

      {slot && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby={`${formId}-who`}>
          <h2 id={`${formId}-who`} className="text-base font-semibold">2. Vos coordonnées</h2>
          <p className="text-sm first-letter:uppercase text-muted-foreground">{longDay(slot, tz)} à {hourLabel(slot, tz)}</p>
          <FormField label="Nom" required><Input autoComplete="name" value={form.name} onChange={set("name")} required minLength={2} maxLength={120} /></FormField>
          <FormField label="Email professionnel" required><Input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} required maxLength={254} /></FormField>
          <details className="rounded-lg border bg-background p-3 text-sm">
            <summary className="cursor-pointer font-medium">Ajouter des précisions (facultatif)</summary>
            <div className="mt-3 space-y-4">
              <FormField label="Téléphone"><Input type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} maxLength={40} /></FormField>
              <FormField label="Entreprise"><Input autoComplete="organization" value={form.company} onChange={set("company")} maxLength={160} /></FormField>
              <FormField label="Sujet du rendez-vous"><Textarea value={form.message} onChange={set("message")} rows={3} maxLength={1000} /></FormField>
            </div>
          </details>
          {/* Honeypot: people never see it, robots fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>Ne pas remplir<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" required />
            <span>J’accepte que Cleads me recontacte au sujet de ce rendez-vous. Mes données servent uniquement à cela ; voir la <a className="underline" href="/politique-de-confidentialite" target="_blank" rel="noreferrer">politique de confidentialité <ExternalLink className="inline h-3 w-3" aria-hidden="true" /></a>.</span>
          </label>
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error.message}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!consent}>Confirmer le rendez-vous</Button>
        </form>
      )}
      {!slot && error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error.message}</p>}
    </div>
  )
}
