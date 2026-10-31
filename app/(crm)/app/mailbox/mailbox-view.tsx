"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import type { ReplyClass } from "@prisma/client"
import { Archive, ChevronDown, FileText, Pencil, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/crm/empty-state"
import { FormField } from "@/components/crm/form-field"
import { formatDateTime } from "@/lib/crm/format"
import { cn } from "@/lib/utils"
import type { MailboxView as Mailbox } from "@/features/outreach/mailboxes"
import type { EmailView } from "@/features/outreach/service"
import type { ReplyView } from "@/features/outreach/replies"
import type { TemplateView } from "@/features/outreach/templates"
import { VARIABLES, templateErrors } from "@/features/outreach/template"
import { api } from "../leads/api"

export const EMAIL_STATUS: Record<EmailView["status"], { label: string; variant: "success" | "info" | "destructive" | "warning" }> = {
  SENT: { label: "Envoyé", variant: "success" },
  SENDING: { label: "En cours", variant: "info" },
  FAILED: { label: "Échec", variant: "destructive" },
  BOUNCED: { label: "Rebond", variant: "warning" },
  RECEIVED: { label: "Reçu", variant: "info" },
}

export const REPLY_LABELS: Record<ReplyClass, string> = {
  INTERESTED: "Intéressé",
  NOT_NOW: "Pas maintenant",
  NOT_INTERESTED: "Pas intéressé",
  OUT_OF_OFFICE: "Absent (réponse automatique)",
  WRONG_PERSON: "Mauvais interlocuteur",
  STOP: "Ne plus écrire",
  OTHER: "Autre",
}

interface Props {
  initialEmails: { items: EmailView[]; hasMore: boolean }
  initialReplies: { items: ReplyView[]; hasMore: boolean; unread: number }
  mailboxes: Mailbox[]
  initialTemplates: TemplateView[]
  canManageTemplates: boolean
  showSender: boolean
}

export function MailboxView({ initialEmails, initialReplies, mailboxes, initialTemplates, canManageTemplates, showSender }: Props) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [unread, setUnread] = useState(initialReplies.unread)
  return (
    <div className="space-y-6">
      {mailboxes.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Boîtes d’envoi">
          {mailboxes.map((m) => (
            <li key={m.id}>
              <Card className="space-y-1 p-4">
                <p className="truncate font-semibold" title={m.address}>{m.address}</p>
                <p className="text-sm"><span className="text-2xl font-extrabold tracking-tight">{m.sentToday}</span> / {m.allowanceToday} aujourd’hui</p>
                <p className="text-xs text-muted-foreground">{m.status === "ACTIVE" ? (m.ownerName ? `Boîte de ${m.ownerName}` : "Partagée") : m.status === "PAUSED" ? "En pause" : "En erreur : envoi impossible"}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Tabs defaultValue={initialReplies.unread > 0 ? "replies" : "sent"}>
        <TabsList>
          <TabsTrigger value="sent">Envoyés</TabsTrigger>
          <TabsTrigger value="replies">Réponses{unread > 0 ? ` (${unread})` : ""}</TabsTrigger>
          <TabsTrigger value="templates">Modèles ({templates.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="sent" className="mt-4">
          <SentList initial={initialEmails} showSender={showSender} hasMailbox={mailboxes.length > 0} />
        </TabsContent>
        <TabsContent value="replies" className="mt-4">
          <Replies initial={initialReplies} onUnread={(d) => setUnread((n) => Math.max(0, n + d))} showSender={showSender} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <Templates templates={templates} onChange={setTemplates} canManage={canManageTemplates} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SentList({ initial, showSender, hasMailbox }: { initial: { items: EmailView[]; hasMore: boolean }; showSender: boolean; hasMailbox: boolean }) {
  const [page, setPage] = useState(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function more() {
    setLoading(true)
    try {
      const next = await api<{ items: EmailView[]; hasMore: boolean }>(`/api/emails?before=${encodeURIComponent(page.items.at(-1)!.createdAt)}`)
      setPage({ items: [...page.items, ...next.items], hasMore: next.hasMore })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setLoading(false)
    }
  }

  if (page.items.length === 0) {
    return <EmptyState art="target" title="Aucun email envoyé" description={hasMailbox ? "Ouvrez une fiche prospect et cliquez sur « Email » : le message part de votre boîte, avec le lien de désinscription." : "Il faut d’abord une boîte d’envoi, ajoutée par le propriétaire dans Réglages → Boîtes d’envoi."} />
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border bg-card">
        {page.items.map((m) => {
          const s = EMAIL_STATUS[m.status]
          const expanded = open === m.id
          return (
            <li key={m.id} className="p-3 sm:p-4">
              <button type="button" className="flex w-full min-w-0 items-start gap-3 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : m.id)}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate font-semibold">{m.subject}</span>
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {m.isTest && <Badge variant="outline">Test</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.leadName ? `${m.leadName} · ` : ""}{m.toEmail} · depuis {m.fromEmail}{showSender && m.sentByName ? ` · par ${m.sentByName}` : ""}{m.templateName ? ` · modèle « ${m.templateName} »` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.sentAt ?? m.createdAt)}</span>
                <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="mt-3 space-y-2">
                  {m.error && <p role="status" className="text-sm text-destructive-text">Raison : {m.error}</p>}
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-sm">{m.bodyText}</pre>
                  {m.leadId && <Link className="text-sm font-medium underline underline-offset-4" href={`/app/leads/${m.leadId}`}>Ouvrir la fiche</Link>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {page.hasMore && <div className="flex justify-center"><Button variant="outline" size="sm" loading={loading} onClick={more}>Voir plus</Button></div>}
    </div>
  )
}

function Replies({ initial, onUnread, showSender }: { initial: { items: ReplyView[]; hasMore: boolean; unread: number }; onUnread: (delta: number) => void; showSender: boolean }) {
  const [items, setItems] = useState(initial.items)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function patchLocal(id: string, change: Partial<ReplyView>) {
    setItems((list) => {
      const next = list.map((r) => (r.id === id ? { ...r, ...change } : r))
      return next
    })
  }

  async function update(r: ReplyView, body: { replyClass?: ReplyClass | null; read?: boolean }) {
    try {
      await api(`/api/replies/${r.id}`, { method: "PATCH", body: JSON.stringify(body) })
      const wasUnread = !r.read
      const nowRead = body.read ?? true
      patchLocal(r.id, { ...(body.replyClass !== undefined ? { replyClass: body.replyClass } : {}), read: nowRead })
      if (wasUnread !== !nowRead) onUnread(nowRead ? -1 : 1)
      if (body.replyClass === "STOP") toast.success("Cette adresse ne recevra plus rien")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  async function toggle(r: ReplyView) {
    const expanded = open === r.id
    setOpen(expanded ? null : r.id)
    if (!expanded && !r.read) await update(r, { read: true })
  }

  async function more() {
    setLoading(true)
    try {
      const next = await api<{ items: ReplyView[]; hasMore: boolean }>(`/api/replies?before=${encodeURIComponent(items.at(-1)!.receivedAt)}`)
      setItems([...items, ...next.items])
      setHasMore(next.hasMore)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return <EmptyState art="target" title="Aucune réponse pour l’instant" description="Les réponses à vos emails apparaissent ici quelques minutes après leur arrivée dans la boîte d’envoi. Les rebonds sont lus aussi : l’adresse est alors exclue automatiquement." />
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((r) => {
          const expanded = open === r.id
          return (
            <li key={r.id} className="p-3 sm:p-4">
              <button type="button" className="flex w-full min-w-0 items-start gap-3 text-left" aria-expanded={expanded} onClick={() => toggle(r)}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    {!r.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Non lu" />}
                    <span className={cn("truncate", r.read ? "font-medium" : "font-semibold")}>{r.leadName ?? r.fromEmail}</span>
                    {r.replyClass && <Badge variant={r.replyClass === "INTERESTED" ? "success" : "outline"}>{REPLY_LABELS[r.replyClass]}</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{r.subject}{showSender ? ` · reçu sur ${r.toEmail}` : ""}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(r.receivedAt)}</span>
                <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">De {r.fromEmail}{r.sentSubject ? ` · en réponse à « ${r.sentSubject} »` : ""}</p>
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-sm">{r.bodyText || "(message vide)"}</pre>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Classer :</span>
                      <select className="h-9 rounded-md border bg-background px-2 text-sm" value={r.replyClass ?? ""} onChange={(e) => update(r, { replyClass: (e.target.value || null) as ReplyClass | null })}>
                        <option value="">Non classée</option>
                        {(Object.keys(REPLY_LABELS) as ReplyClass[]).map((c) => <option key={c} value={c}>{REPLY_LABELS[c]}</option>)}
                      </select>
                    </label>
                    {r.leadId && <Link className="text-sm font-medium underline underline-offset-4" href={`/app/leads/${r.leadId}`}>Ouvrir la fiche</Link>}
                  </div>
                  {r.replyClass === "STOP" && <p className="text-xs text-muted-foreground">Cette adresse est exclue : plus aucun email de prospection ne lui sera envoyé.</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {hasMore && <div className="flex justify-center"><Button variant="outline" size="sm" loading={loading} onClick={more}>Voir plus</Button></div>}
    </div>
  )
}

const EXAMPLE = `Bonjour {{prenom|Madame, Monsieur}},

J’ai vu que {{entreprise}} intervient à {{ville|votre secteur}}. Nous aidons les artisans à recevoir plus de demandes de devis depuis Google, sans publicité.

Seriez-vous d’accord pour en parler 15 minutes cette semaine ?`

function Templates({ templates, onChange, canManage }: { templates: TemplateView[]; onChange: (t: TemplateView[]) => void; canManage: boolean }) {
  const [editing, setEditing] = useState<TemplateView | "new" | null>(null)

  async function reload() {
    onChange((await api<{ templates: TemplateView[] }>("/api/email-templates")).templates)
  }

  async function archive(t: TemplateView) {
    if (!window.confirm(`Archiver le modèle « ${t.name} » ? Les emails déjà envoyés le gardent.`)) return
    try {
      await api(`/api/email-templates/${t.id}`, { method: "DELETE" })
      await reload()
      toast.success("Modèle archivé")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Nouveau modèle</Button></div>}
      {templates.length === 0 ? (
        <EmptyState art="agent" title="Aucun modèle" description="Un modèle garde un message qui marche, avec des variables ({{prenom}}, {{entreprise}}…) remplies depuis la fiche. Court, sans pièce jointe, un seul lien au plus." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {t.name}</p>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Modifier ${t.name}`} onClick={() => setEditing(t)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
                      <Button variant="ghost" size="sm" aria-label={`Archiver ${t.name}`} onClick={() => archive(t)}><Archive className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium">{t.subject}</p>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
                <p className="mt-auto text-xs text-muted-foreground">{t.uses} envoi{t.uses > 1 ? "s" : ""}{t.createdByName ? ` · créé par ${t.createdByName}` : ""}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateDialog template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await reload(); setEditing(null) }} />}
    </div>
  )
}

function TemplateDialog({ template, onClose, onSaved }: { template: TemplateView | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(template?.name ?? "")
  const [subject, setSubject] = useState(template?.subject ?? "{{entreprise}} : une question rapide")
  const [body, setBody] = useState(template?.body ?? EXAMPLE)
  const [busy, setBusy] = useState(false)
  const errors = [...templateErrors(subject), ...templateErrors(body)]

  function insert(variable: string) {
    setBody((b) => `${b}{{${variable}}}`)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (errors.length) return
    setBusy(true)
    try {
      await api(template ? `/api/email-templates/${template.id}` : "/api/email-templates", { method: template ? "PUT" : "POST", body: JSON.stringify({ name, subject, body }) })
      toast.success(template ? "Modèle enregistré" : "Modèle créé")
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <DialogHeader>
            <DialogTitle>{template ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle>
            <DialogDescription>Texte brut. La signature de la boîte et le pied de page (origine de l’adresse, lien de désinscription) sont ajoutés automatiquement.</DialogDescription>
          </DialogHeader>
          <FormField label="Nom du modèle" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Premier contact artisans" /></FormField>
          <FormField label="Objet" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} /></FormField>
          <FormField label="Message" required error={errors[0]} hint="{{prenom|Madame, Monsieur}} : le texte après | remplace une valeur absente. {{prenom|}} l’efface.">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
          </FormField>
          <div className="flex flex-wrap gap-1.5" aria-label="Insérer une variable">
            {Object.entries(VARIABLES).map(([v, label]) => (
              <Button key={v} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" title={label} onClick={() => insert(v)}>{`{{${v}}}`}</Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={busy} disabled={!!errors.length}>{template ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
