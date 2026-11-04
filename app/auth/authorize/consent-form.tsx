"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { AlertTriangle, Eye, Plug, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AuthorizeParams } from "@/features/mcp/oauth/authorize"
import type { AppIdentity } from "@/features/mcp/oauth/redirects"

/**
 * The consent form: a plain POST to /api/oauth/authorize, which checks everything again. Reading only is checked first
 * (D42). The decision is the clicked button's own value, as plain HTML sends it; the buttons grey out only after the
 * browser has read the form, since a disabled button sends nothing.
 */

const ACCESS = {
  read: { title: "Lecture seule", detail: "Fiches, campagnes, agenda, recherches, Extractor et pages du CRM. Rien ne change dans Cleads." },
  write: {
    title: "Lecture et actions",
    detail: "En plus : notes, tâches, étiquettes et appels, tout de suite. Les autres changements attendent votre validation dans Cleads, et ce qui contacte un prospect, toujours votre propre clic.",
  },
} as const

export function ConsentForm({
  params,
  here,
  app,
  canWrite,
  account,
  closing,
  local,
}: {
  params: AuthorizeParams
  here: string
  app: AppIdentity
  canWrite: boolean
  account: { name: string; email: string; role: string; workspace: string }
  closing: string | null
  local: boolean
}) {
  const [access, setAccess] = useState<"read" | "write">("read")
  const [sending, setSending] = useState<"allow" | "deny" | null>(null)

  return (
    <form
      method="post"
      action="/api/oauth/authorize"
      className="space-y-6"
      onSubmit={(e) => {
        if (sending) return e.preventDefault()
        const clicked = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "allow" ? "allow" : "deny"
        setTimeout(() => setSending(clicked), 0)
      }}
    >
      {Object.entries(params).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <section className="space-y-2 rounded-xl border bg-muted/40 p-4 text-sm">
        <p>
          Après votre accord, Cleads vous renverra vers <strong className="break-words font-semibold text-foreground">{app.destination}</strong>.
        </p>
        {local && (
          <p className="flex gap-2 rounded-lg bg-warning-subtle p-3 text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Autorisez seulement si vous venez de lancer cette connexion vous-même, depuis {app.name} : une application de cet ordinateur peut emprunter le nom d’une autre.</span>
          </p>
        )}
      </section>

      <section className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Votre compte</p>
          <p className="mt-1 break-words font-semibold">{account.name || account.email}</p>
          <p className="break-words text-muted-foreground">
            {account.email} · {account.role}
            {account.workspace ? ` · ${account.workspace}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-sm underline underline-offset-4 hover:text-foreground/70"
          onClick={() => void signOut({ callbackUrl: `/auth/login?callbackUrl=${encodeURIComponent(here)}` })}
        >
          Changer de compte
        </button>
      </section>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ce que {app.name} pourra faire</legend>
        {(["read", "write"] as const).map((value) => {
          const disabled = value === "write" && !canWrite
          return (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                access === value ? "border-primary bg-primary/10" : "hover:bg-accent/40",
                disabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
              )}
            >
              <input type="radio" name="access" value={value} checked={access === value} disabled={disabled} onChange={() => setAccess(value)} className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
              <span className="min-w-0">
                <span className="block font-semibold">{ACCESS[value].title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{disabled ? "L’application n’a demandé que la lecture." : ACCESS[value].detail}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <ul className="space-y-2.5 text-sm text-muted-foreground">
        <li className="flex gap-2.5">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Ce que {app.name} lit du CRM part vers son IA, hors des contrats de traitement de Cleads.</span>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Ses droits sont les vôtres, jamais plus : les changements attendent dans « À valider », le contact d’un prospect, votre propre clic.</span>
        </li>
        <li className="flex gap-2.5">
          <Plug className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Vous fermez cet accès quand vous voulez, dans Réglages › Accès MCP. Sans usage pendant 90 jours, il se ferme seul.</span>
        </li>
      </ul>

      {closing && (
        <p role="note" className="rounded-lg bg-info-subtle p-3 text-sm text-info">
          Vous avez déjà 10 connexions ouvertes : la moins utilisée, {closing}, sera fermée.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="submit" name="decision" value="deny" variant="outline" loading={sending === "deny"} disabled={!!sending}>
          Refuser
        </Button>
        <Button type="submit" name="decision" value="allow" loading={sending === "allow"} disabled={!!sending}>
          Autoriser
        </Button>
      </div>
    </form>
  )
}
