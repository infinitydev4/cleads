"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { BadgeCheck, Check, Copy, KeyRound, Plug, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { TOKEN_DAYS } from "@/features/mcp/names"
import type { McpCallView, McpTokenView } from "@/features/mcp/tokens"
import { api } from "../../leads/api"

/**
 * Réglages › Accès MCP (E29): the owner opens MCP for the workspace (D39). Each member connects their applications by
 * OAuth (lot 2: Claude, ChatGPT, Claude Code, Cursor), or makes a personal token for another tool; they see what each
 * did and close it; the owner also sees the team's. A token's secret is shown once, with what to paste where.
 */

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
const moment = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

const PLACEHOLDER = "<votre jeton>"

/** With a personal token: a tool that sends a header. The applications that know OAuth connect without one. */
function snippets(endpoint: string, token: string) {
  return [
    { id: "claude-code", title: "Claude Code", where: "Dans un terminal", code: `claude mcp add --transport http cleads ${endpoint} --header "Authorization: Bearer ${token}"` },
    { id: "cursor", title: "Cursor", where: "Dans ~/.cursor/mcp.json", code: JSON.stringify({ mcpServers: { cleads: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } } }, null, 2) },
  ]
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      {/* Long lines wrap instead of sliding under the copy button; the copy keeps them whole. */}
      <pre className="max-w-full whitespace-pre-wrap rounded-md bg-muted p-3 pr-11 text-xs leading-relaxed [overflow-wrap:anywhere]">
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="absolute right-1.5 top-1.5 h-7 w-7"
        aria-label={`Copier : ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1_500)
          } catch {
            toast.error("Copie impossible : sélectionnez le texte à la main.")
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </Button>
    </div>
  )
}

function Connect({ endpoint, token = PLACEHOLDER }: { endpoint: string; token?: string }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {snippets(endpoint, token).map((s) => (
        <div key={s.id} className="min-w-0 space-y-2">
          <p className="text-sm font-semibold">{s.title}</p>
          <p className="text-xs text-muted-foreground">{s.where}</p>
          <CodeBlock code={s.code} label={s.title} />
        </div>
      ))}
    </div>
  )
}

/** The applications that connect by OAuth: the member authorizes them in Cleads, no token to copy (lot 2). */
function oauthGuides(endpoint: string) {
  return [
    {
      id: "claude",
      title: "Claude",
      where: "claude.ai, Claude Desktop et mobile",
      steps: [
        "Personnaliser › Connecteurs › Ajouter un connecteur personnalisé.",
        "Nom : Cleads ; URL du serveur : l’adresse ci-dessous. Ajoutez, puis cliquez « Se connecter ».",
        "Cleads s’ouvre : connectez-vous, choisissez l’accès et cliquez « Autoriser ».",
      ],
      note: "Sur un compte Claude Team ou Enterprise, le propriétaire de l’organisation ajoute le connecteur ; chacun s’y connecte ensuite.",
      code: endpoint,
    },
    {
      id: "claude-code",
      title: "Claude Code",
      where: "Dans un terminal",
      steps: ["Ajoutez le serveur avec la commande ci-dessous.", "Dans Claude Code, tapez /mcp, choisissez cleads, puis « Authenticate » : Cleads s’ouvre pour autoriser l’accès."],
      code: `claude mcp add --transport http cleads ${endpoint}`,
    },
    {
      id: "chatgpt",
      title: "ChatGPT",
      where: "Mode développeur, offres payantes",
      steps: ["Ajoutez une application MCP avec l’adresse ci-dessous et l’authentification OAuth.", "Cleads s’ouvre pour autoriser l’accès."],
      code: endpoint,
    },
    {
      id: "cursor",
      title: "Cursor",
      where: "Dans ~/.cursor/mcp.json",
      steps: ["Ajoutez le serveur, sans jeton : Cursor ouvre Cleads pour autoriser l’accès."],
      code: JSON.stringify({ mcpServers: { cleads: { url: endpoint } } }, null, 2),
    },
  ]
}

function OAuthGuides({ endpoint }: { endpoint: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {oauthGuides(endpoint).map((g) => (
        <div key={g.id} className="min-w-0 space-y-2">
          <p className="text-sm font-semibold">
            {g.title} <span className="font-normal text-muted-foreground">· {g.where}</span>
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {g.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <CodeBlock code={g.code} label={g.title} />
          {g.note && <p className="text-xs text-muted-foreground">{g.note}</p>}
        </div>
      ))}
    </div>
  )
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function usage(t: McpTokenView): string {
  if (t.kind === "connection") {
    const parts = [`autorisée le ${day.format(new Date(t.createdAt))}`]
    if (t.status === "revoked" && t.revokedAt) parts.push(`fermée le ${day.format(new Date(t.revokedAt))}`)
    else if (t.status === "expired") parts.push(`expirée le ${day.format(new Date(t.expiresAt))}`)
    parts.push(t.lastUsedAt ? `utilisée le ${moment.format(new Date(t.lastUsedAt))}${t.lastClient ? ` par ${t.lastClient}` : ""}` : "pas encore utilisée")
    if (t.status === "active") parts.push("se ferme après 90 jours sans usage")
    return capitalize(parts.join(" · "))
  }
  const parts = [`créé le ${day.format(new Date(t.createdAt))}`]
  if (t.status === "revoked" && t.revokedAt) parts.push(`révoqué le ${day.format(new Date(t.revokedAt))}`)
  else parts.push(`${t.status === "expired" ? "expiré" : "expire"} le ${day.format(new Date(t.expiresAt))}`)
  parts.push(t.lastUsedAt ? `utilisé le ${moment.format(new Date(t.lastUsedAt))}${t.lastClient ? ` par ${t.lastClient}` : ""}` : "jamais utilisé")
  return capitalize(parts.join(" · "))
}

const OUTCOMES: Record<McpCallView["outcome"], { label: string; tone: "success" | "warning" | "neutral" | "destructive" }> = {
  DONE: { label: "Faite", tone: "success" },
  PENDING: { label: "À valider", tone: "warning" },
  REFUSED: { label: "Refusée", tone: "neutral" },
  ERROR: { label: "Erreur", tone: "destructive" },
}

interface ActivityState {
  token: McpTokenView
  calls: McpCallView[] | null
  error?: string
}

function Activity({ activity, onClose }: { activity: ActivityState | null; onClose: () => void }) {
  return (
    <Sheet open={!!activity} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Activité de « {activity?.token.name} »</SheetTitle>
          <SheetDescription>
            Les derniers appels {activity?.token.kind === "connection" ? "de cette connexion" : "de ce jeton"}, sur 90 jours. Ce qui a changé une fiche figure aussi dans son historique, « via … (MCP) ».
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 text-sm">
          {activity?.error ? (
            <p className="text-destructive-text">{activity.error}</p>
          ) : !activity?.calls ? (
            <p className="text-muted-foreground">Chargement…</p>
          ) : activity.calls.length === 0 ? (
            <p className="text-muted-foreground">Aucun appel pour l’instant.</p>
          ) : (
            <ul className="divide-y">
              {activity.calls.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs">{c.tool}</span>
                    <span className="text-xs text-muted-foreground">
                      {moment.format(new Date(c.createdAt))}
                      {c.client ? ` · ${c.client}` : ""} · {c.durationMs} ms
                    </span>
                  </span>
                  <Badge variant={OUTCOMES[c.outcome].tone}>{OUTCOMES[c.outcome].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function TokenList({ tokens, onActivity, onRevoked, empty, team = false }: { tokens: McpTokenView[]; onActivity: (t: McpTokenView) => void; onRevoked: (t: McpTokenView) => void; empty: string; team?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!tokens.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  async function revoke(t: McpTokenView) {
    setBusy(t.id)
    try {
      onRevoked(await api<McpTokenView>(`/api/ai/mcp/tokens/${t.id}`, { method: "DELETE" }))
      toast.success(t.kind === "connection" ? `« ${t.name} » est déconnecté` : `« ${t.name} » est révoqué`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Révocation impossible")
    } finally {
      setBusy(null)
    }
  }
  return (
    <ul className="divide-y">
      {tokens.map((t) => (
        <li key={t.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="min-w-0 break-words">{t.name}</span>
              {t.app?.verified && <BadgeCheck className="h-4 w-4 text-success" aria-label="Application reconnue par Cleads" />}
              {team && <Badge variant="outline">{t.kind === "connection" ? "Connexion" : "Jeton"}</Badge>}
              <Badge variant={t.readOnly ? "neutral" : "info"}>{t.readOnly ? "Lecture seule" : "Lecture et actions"}</Badge>
              {t.status !== "active" && (
                <Badge variant={t.status === "revoked" ? "destructive" : "warning"}>
                  {t.kind === "connection" ? (t.status === "revoked" ? "Fermée" : "Expirée") : t.status === "revoked" ? "Révoqué" : "Expiré"}
                </Badge>
              )}
            </p>
            <p className={cn("break-all text-xs text-muted-foreground", !t.app && "font-mono")}>
              {t.app ? `Vers ${t.app.destination}` : t.hint}
              {t.owner ? ` · ${t.owner.name}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{usage(t)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onActivity(t)}>
              Activité
            </Button>
            {t.canRevoke && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={busy === t.id}>
                    {t.kind === "connection" ? "Déconnecter" : "Révoquer"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.kind === "connection" ? `Déconnecter « ${t.name} » ?` : `Révoquer « ${t.name} » ?`}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t.kind === "connection"
                        ? `${t.name} perd l’accès tout de suite, et ce qu’il a laissé en attente dans « À valider » est refusé. Pour le rebrancher, il faudra l’autoriser de nouveau.`
                        : "Le client qui l’utilise perd l’accès tout de suite, et ce qu’il a laissé en attente dans « À valider » est refusé. Un jeton révoqué ne se réactive pas."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void revoke(t)}>{t.kind === "connection" ? "Déconnecter" : "Révoquer"}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function McpAccessView({ enabled: initialEnabled, canManage, endpoint, mine: initialMine, team: initialTeam }: { enabled: boolean; canManage: boolean; endpoint: string; mine: McpTokenView[]; team: McpTokenView[] | null }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [switching, setSwitching] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [mine, setMine] = useState(initialMine)
  const [team, setTeam] = useState(initialTeam)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"read" | "write">("read")
  const [days, setDays] = useState<string>("90")
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null)
  const [activity, setActivity] = useState<ActivityState | null>(null)
  const replace = (list: McpTokenView[], t: McpTokenView) => list.map((x) => (x.id === t.id ? { ...t, owner: x.owner } : x))
  const onRevoked = (t: McpTokenView) => {
    setMine((list) => replace(list, t))
    setTeam((list) => (list ? replace(list, t) : list))
  }

  function openActivity(token: McpTokenView) {
    setActivity({ token, calls: null })
    const keep = (next: Omit<ActivityState, "token">) => setActivity((a) => (a?.token.id === token.id ? { token, ...next } : a))
    api<McpCallView[]>(`/api/ai/mcp/tokens/${token.id}/calls`)
      .then((calls) => keep({ calls }))
      .catch((e: unknown) => keep({ calls: [], error: e instanceof Error ? e.message : "Lecture impossible" }))
  }

  async function toggle(next: boolean) {
    setSwitching(true)
    try {
      await api("/api/ai/mcp", { method: "PUT", body: JSON.stringify({ enabled: next }) })
      setEnabled(next)
      toast.success(next ? "Accès MCP activé" : "Accès MCP coupé : tous les accès sont arrêtés")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible")
    } finally {
      setSwitching(false)
    }
  }

  async function create() {
    setBusy(true)
    try {
      const out = await api<{ token: McpTokenView; secret: string }>("/api/ai/mcp/tokens", { method: "POST", body: JSON.stringify({ name, readOnly: scope === "read", days: Number(days) }) })
      setMine((list) => [out.token, ...list])
      setCreating(false)
      setName("")
      setScope("read")
      setDays("90")
      setSecret({ name: out.token.name, value: out.secret })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {canManage ? (
        <Card className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 id="mcp-switch" className="flex items-center gap-2 text-base font-semibold">
                <Plug className="h-4 w-4" aria-hidden="true" />
                Autoriser l’accès MCP
              </h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Les membres qui ont l’IA (propriétaire, manager, SDR, closer) pourront brancher Claude, ChatGPT, Claude Code ou Cursor sur le CRM, avec leurs droits et rien de plus. Les fiches que ces outils lisent partent vers l’IA de chacun, hors des contrats de traitement de Cleads : n’activez qu’avec des outils que l’agence accepte.
              </p>
            </div>
            {/*
              The switch is never a dialog's trigger: a trigger sets its own data-state ("closed") over the switch's
              ("unchecked"), and the switch loses its track. Switching on asks first; switching off does not.
            */}
            <label className="flex shrink-0 cursor-pointer items-center gap-2.5">
              <span className={cn("text-sm font-semibold", enabled ? "text-success" : "text-muted-foreground")}>{enabled ? "Activé" : "Coupé"}</span>
              <Switch checked={enabled} aria-labelledby="mcp-switch" disabled={switching} onCheckedChange={(v) => (v ? setConfirming(true) : void toggle(false))} />
            </label>
          </div>
          {!enabled && <p className="text-sm font-medium">L’accès est coupé : aucune application ne peut se connecter, et aucun jeton ne peut être créé ni utilisé. Activez-le avec l’interrupteur pour que l’équipe puisse brancher ses outils.</p>}
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Activer l’accès MCP ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Chaque membre pourra connecter ses outils. Ce qu’un client MCP lit du CRM part vers l’IA qu’il utilise. Les changements attendront la validation dans Cleads, et ce qui contacte un prospect, toujours son propre clic. Vous pourrez tout couper ici.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => void toggle(true)}>Activer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-sm">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 align-[-3px] text-muted-foreground" aria-hidden="true" />
            Ce que les clients MCP peuvent faire, famille par famille, se règle dans{" "}
            <Link href="/app/agents?tab=agents" className="font-medium underline underline-offset-4 hover:text-foreground/70">
              Agents IA › Agents › Droits
            </Link>
            .
          </p>
        </Card>
      ) : (
        !enabled && (
          <Card className="p-5 text-sm">
            <p className="font-semibold">L’accès MCP est coupé dans cet espace</p>
            <p className="mt-1 text-muted-foreground">Le propriétaire l’active ici ; vous pourrez alors connecter vos outils.</p>
          </Card>
        )
      )}

      <section aria-labelledby="mcp-connect" className="space-y-4">
        <div>
          <h2 id="mcp-connect" className="text-lg font-bold">
            Se connecter
          </h2>
          <p className="text-sm text-muted-foreground">
            Adresse du serveur : <span className="break-all font-mono text-foreground">{endpoint}</span>. Ces applications vous envoient sur Cleads pour autoriser l’accès : aucun jeton à copier.
          </p>
        </div>
        <Card className="p-5">
          <OAuthGuides endpoint={endpoint} />
        </Card>
      </section>

      <section aria-labelledby="mcp-connections" className="space-y-4">
        <div>
          <h2 id="mcp-connections" className="text-lg font-bold">
            Vos connexions
          </h2>
          <p className="text-sm text-muted-foreground">Les applications que vous avez autorisées. Chacune agit avec vos droits ; une connexion en lecture seule ne change rien.</p>
        </div>
        <Card className="p-5">
          <TokenList
            tokens={mine.filter((t) => t.kind === "connection")}
            empty="Aucune connexion pour l’instant. Ajoutez Cleads dans Claude, ChatGPT ou Claude Code : l’application vous enverra ici pour autoriser l’accès."
            onActivity={openActivity}
            onRevoked={onRevoked}
          />
        </Card>
      </section>

      <section aria-labelledby="mcp-tokens" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="mcp-tokens" className="text-lg font-bold">
              Vos jetons
            </h2>
            <p className="text-sm text-muted-foreground">Pour un script ou un outil sans OAuth : un jeton par outil, révocable seul. Il agit avec vos droits, et un jeton en lecture seule ne change rien.</p>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button type="button" onClick={() => setCreating(true)} disabled={!enabled} aria-describedby={enabled ? undefined : "mcp-create-why"}>
              <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              Créer un jeton
            </Button>
            {/* A greyed button says why. */}
            {!enabled && (
              <p id="mcp-create-why" className="text-xs text-muted-foreground">
                {canManage ? "Activez d’abord l’accès MCP, en haut de la page." : "Le propriétaire doit d’abord activer l’accès MCP."}
              </p>
            )}
          </div>
        </div>
        <Card className="space-y-5 p-5">
          <TokenList tokens={mine.filter((t) => t.kind === "token")} empty="Aucun jeton pour l’instant. Créez-en un par outil, par exemple « Script d’export (serveur) »." onActivity={openActivity} onRevoked={onRevoked} />
          <div className="space-y-3 border-t pt-5">
            <p className="text-sm text-muted-foreground">Avec un jeton, remplacez {PLACEHOLDER} par sa valeur :</p>
            <Connect endpoint={endpoint} />
          </div>
        </Card>
      </section>

      {team && (
        <section aria-labelledby="mcp-team" className="space-y-4">
          <div>
            <h2 id="mcp-team" className="text-lg font-bold">
              Accès de l’équipe
            </h2>
            <p className="text-sm text-muted-foreground">Les connexions et les jetons des autres membres, que vous pouvez fermer. Couper l’accès MCP les arrête tous sans les effacer.</p>
          </div>
          <Card className="p-5">
            <TokenList tokens={team} team empty="Aucun autre membre n’a de connexion ni de jeton." onActivity={openActivity} onRevoked={(t) => setTeam((list) => (list ? replace(list, t) : list))} />
          </Card>
        </section>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un jeton</DialogTitle>
            <DialogDescription>Il agit avec vos droits. Il ne sera montré qu’une fois.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mcp-name">Nom</Label>
              <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code (portable)" maxLength={60} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mcp-scope">Portée</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as "read" | "write")}>
                  <SelectTrigger id="mcp-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Lecture seule</SelectItem>
                    <SelectItem value="write">Lecture et actions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-days">Expire dans</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger id="mcp-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOKEN_DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} jours
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {scope === "read"
                ? "Lecture seule : fiches, campagnes, agenda, recherches, Extractor, pages du CRM."
                : "Lecture et actions : notes, tâches et étiquettes tout de suite ; les autres changements attendent votre validation dans Cleads, et ce qui contacte un prospect, toujours votre propre clic."}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                Créer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!secret} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Votre jeton « {secret?.name} »</DialogTitle>
            <DialogDescription>Copiez-le maintenant : Cleads n’en garde qu’une empreinte et ne pourra plus l’afficher. Traitez-le comme un mot de passe.</DialogDescription>
          </DialogHeader>
          {secret && (
            <div className="min-w-0 space-y-5">
              <CodeBlock code={secret.value} label="le jeton" />
              <Connect endpoint={endpoint} token={secret.value} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setSecret(null)}>
              J’ai copié le jeton
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Activity activity={activity} onClose={() => setActivity(null)} />
    </div>
  )
}
