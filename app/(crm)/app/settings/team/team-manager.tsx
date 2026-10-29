"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Check, Copy, MailPlus, UserCheck, UserX, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/crm/data-table"
import { EmptyState } from "@/components/crm/empty-state"
import { FormField } from "@/components/crm/form-field"
import { CRM_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type CrmRole } from "@/lib/crm/roles"

interface Member {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: CrmRole
  active: boolean
  lastLoginAt: string | null
}
interface Invitation {
  id: string
  email: string
  role: string
  expiresAt: string
  invitedBy: string
}

const date = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "Jamais"

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? "Une erreur est survenue")
  return body
}

export function TeamManager({ members, invitations, currentUserId, canManage }: { members: Member[]; invitations: Invitation[]; currentUserId: string; canManage: boolean }) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function change(id: string, body: { role?: CrmRole; active?: boolean }, success: string) {
    setBusy(id)
    try {
      await call(`/api/team/members/${id}`, { method: "PATCH", body: JSON.stringify(body) })
      toast.success(success)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function revoke(id: string) {
    setBusy(id)
    try {
      await call(`/api/team/invitations/${id}`, { method: "DELETE" })
      toast.success("Invitation annulée")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        id: "member",
        header: "Membre",
        accessorFn: (m) => m.name ?? m.email ?? "",
        cell: ({ row }) => {
          const m = row.original
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={m.image ?? undefined} alt="" />
                <AvatarFallback className="text-xs font-semibold">{(m.name ?? m.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {m.name ?? "Sans nom"} {m.id === currentUserId && <span className="font-normal text-muted-foreground">(vous)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "role",
        header: "Rôle",
        cell: ({ row }) => {
          const m = row.original
          if (!canManage || m.id === currentUserId) return <Badge variant="neutral">{ROLE_LABELS[m.role]}</Badge>
          return (
            <Select value={m.role} disabled={busy === m.id} onValueChange={(role) => change(m.id, { role: role as CrmRole }, "Rôle modifié")}>
              <SelectTrigger className="h-9 w-40" aria-label={`Rôle de ${m.name ?? m.email}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        },
      },
      {
        accessorKey: "active",
        header: "Statut",
        cell: ({ row }) => <Badge variant={row.original.active ? "success" : "outline"}>{row.original.active ? "Actif" : "Désactivé"}</Badge>,
      },
      { accessorKey: "lastLoginAt", header: "Dernière connexion", cell: ({ row }) => <span className="text-muted-foreground">{date(row.original.lastLoginAt)}</span> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original
          if (!canManage || m.id === currentUserId) return null
          return (
            <Button
              variant="ghost"
              size="sm"
              loading={busy === m.id}
              onClick={() => change(m.id, { active: !m.active }, m.active ? "Accès désactivé" : "Accès réactivé")}
            >
              {m.active ? <UserX className="h-4 w-4" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
              {m.active ? "Désactiver" : "Réactiver"}
            </Button>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, canManage, currentUserId]
  )

  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="members-title">
        <div className="flex items-center justify-between gap-4">
          <h2 id="members-title" className="text-xl font-extrabold tracking-[-0.03em]">
            Membres ({members.length})
          </h2>
          {canManage && (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus className="h-4 w-4" aria-hidden="true" /> Inviter
            </Button>
          )}
        </div>
        <DataTable columns={columns} data={members} caption="Membres de l’équipe" getRowId={(m) => m.id} />
      </section>

      <section className="space-y-4" aria-labelledby="invites-title">
        <h2 id="invites-title" className="text-xl font-extrabold tracking-[-0.03em]">
          Invitations en attente ({invitations.length})
        </h2>
        {invitations.length === 0 ? (
          <EmptyState title="Aucune invitation en attente" description="Invitez un closer, un SDR ou un manager : il recevra un lien valable 7 jours." />
        ) : (
          <ul className="divide-y rounded-xl border bg-card shadow-card">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[i.role as CrmRole] ?? i.role} · invité par {i.invitedBy} · expire le {date(i.expiresAt)}
                  </p>
                </div>
                {canManage && (
                  <Button variant="ghost" size="sm" loading={busy === i.id} onClick={() => revoke(i.id)}>
                    <X className="h-4 w-4" aria-hidden="true" /> Annuler
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onDone={() => router.refresh()} />
    </div>
  )
}

function InviteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CrmRole>("SDR")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<{ link: string; emailSent: boolean; email: string }>()
  const [copied, setCopied] = useState(false)

  function reset(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setEmail("")
      setRole("SDR")
      setError(undefined)
      setResult(undefined)
      setCopied(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      const body = await call("/api/team/invitations", { method: "POST", body: JSON.stringify({ email, role }) })
      setResult({ link: body.link, emailSent: body.emailSent, email: body.email })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!result) return
    await navigator.clipboard.writeText(result.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitation créée</DialogTitle>
              <DialogDescription>
                {result.emailSent ? `Un email a été envoyé à ${result.email}.` : "L’email n’a pas pu être envoyé : transmettez ce lien vous-même."} Il est valable 7 jours et ne s’affiche qu’une fois.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={result.link} aria-label="Lien d’invitation" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" onClick={copy} aria-label="Copier le lien">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => reset(false)}>Terminer</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Inviter un membre</DialogTitle>
              <DialogDescription>La personne reçoit un lien pour choisir son mot de passe.</DialogDescription>
            </DialogHeader>
            <FormField label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="prenom@entreprise.fr" />
            </FormField>
            <FormField label="Rôle" hint={ROLE_DESCRIPTIONS[role]}>
              {(field) => (
                <Select value={role} onValueChange={(v) => setRole(v as CrmRole)}>
                  <SelectTrigger {...field}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {error && (
              <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => reset(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={loading} disabled={!email}>
                Envoyer l’invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
