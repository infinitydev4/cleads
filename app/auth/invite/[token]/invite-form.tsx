"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/crm/form-field"
import { validatePassword } from "@/lib/auth/password"

export function InviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const passwordError = password ? validatePassword(password, { email, name }) : null
  const mismatch = confirm && confirm !== password ? "Les deux mots de passe ne correspondent pas." : undefined

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (passwordError || mismatch) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Une erreur est survenue")
      const login = await signIn("credentials", { email, password, redirect: false })
      if (login?.error) throw new Error("Compte créé. Connectez-vous avec vos identifiants.")
      router.push("/app")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormField label="Email">
        <Input value={email} readOnly disabled />
      </FormField>
      <FormField label="Votre nom" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" minLength={2} />
      </FormField>
      <FormField label="Mot de passe" required hint="12 caractères minimum. Une phrase longue convient très bien." error={passwordError ?? undefined}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </FormField>
      <FormField label="Confirmer le mot de passe" required error={mismatch}>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </FormField>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={loading} disabled={!name.trim() || !password || !confirm || !!passwordError || !!mismatch}>
        Créer mon accès
      </Button>
    </form>
  )
}
