"use client"

import { useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function UnsubscribeButton({ token, email, done: initiallyDone }: { token: string; email: string; done: boolean }) {
  const [done, setDone] = useState(initiallyDone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/unsubscribe/${encodeURIComponent(token)}`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "La demande n’a pas abouti.")
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande n’a pas abouti.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 sm:p-8" aria-live="polite">
      {done ? (
        <>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" /> C’est fait</h1>
          <p className="mt-4 text-muted-foreground">L’adresse {email} ne recevra plus d’emails de prospection de notre part. Vous n’avez rien d’autre à faire.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Ne plus recevoir nos emails</h1>
          <p className="mt-4 text-muted-foreground">Confirmez et l’adresse {email} ne recevra plus aucun email de prospection de Cleads.</p>
          {error && <p role="alert" className="mt-4 text-sm text-destructive-text">{error}</p>}
          <Button className="mt-6 w-full sm:w-auto" size="lg" loading={busy} onClick={confirm}>Me désinscrire</Button>
        </>
      )}
    </section>
  )
}
