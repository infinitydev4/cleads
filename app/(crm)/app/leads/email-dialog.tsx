"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CircleAlert, Send } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { ago } from "@/lib/crm/format"
import type { ComposeContext } from "@/features/outreach/service"
import { composeText } from "@/features/outreach/footer"
import { VARIABLES, hasPlaceholder, renderTemplate, templateValues } from "@/features/outreach/template"
import { api } from "./api"

const FREE = "__free__"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  leadName: string
  onDone: () => void
}

/** Writes one email to the prospect, from one of the person's mailboxes. Every rule is checked again by the server. */
export function EmailDialog({ open, onOpenChange, leadId, leadName, onDone }: Props) {
  const [ctx, setCtx] = useState<ComposeContext | null>(null)
  const [mailboxId, setMailboxId] = useState("")
  const [templateId, setTemplateId] = useState(FREE)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [confirmGeneric, setConfirmGeneric] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<ComposeContext>(`/api/leads/${leadId}/email`)
      .then((c) => {
        setCtx(c)
        setMailboxId((c.mailboxes.find((m) => !m.blocker) ?? c.mailboxes[0])?.id ?? "")
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Échec"))
  }, [leadId])

  const mailbox = ctx?.mailboxes.find((m) => m.id === mailboxId) ?? null
  const values = useMemo(() => {
    const sender = templateValues({ senderName: mailbox?.displayName })
    return { ...ctx?.values, expediteur: sender.expediteur, expediteur_prenom: sender.expediteur_prenom }
  }, [ctx, mailbox])

  function chooseTemplate(id: string) {
    setTemplateId(id)
    const t = ctx?.templates.find((x) => x.id === id)
    if (!t) return
    setSubject(renderTemplate(t.subject, values).text)
    setBody(renderTemplate(t.body, values).text)
  }

  const unfilled = hasPlaceholder(subject) || hasPlaceholder(body)
  const missing = [...new Set([...renderTemplate(subject, values).missing, ...renderTemplate(body, values).missing])]
  const generic = ctx?.recipient?.kind === "GENERIC"
  const blocked = !ctx || ctx.blockers.length > 0 || !mailbox || !!mailbox.blocker
  const canSend = !blocked && !unfilled && subject.trim().length >= 2 && body.trim().length >= 10 && (!generic || confirmGeneric)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSend || busy) return
    setBusy(true)
    try {
      await api(`/api/leads/${leadId}/email`, { method: "POST", body: JSON.stringify({ mailboxId, subject, body, templateId: templateId === FREE ? null : templateId, confirmGeneric: generic ? confirmGeneric : undefined }) })
      toast.success(`Email envoyé à ${ctx!.recipient!.email}`)
      onDone()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <DialogHeader>
            <DialogTitle>Écrire à {leadName}</DialogTitle>
            <DialogDescription>Le message part de votre boîte de prospection, en texte simple, sans suivi d’ouverture. La signature et le lien de désinscription sont ajoutés automatiquement.</DialogDescription>
          </DialogHeader>

          {!ctx ? (
            <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-40 w-full" /></div>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">À :</span>
                {ctx.recipient ? <span className="font-medium">{ctx.recipient.email}</span> : <span className="text-muted-foreground">aucune adresse</span>}
                {ctx.recipient && (generic ? <Badge variant="warning">Adresse générique</Badge> : ctx.recipient.kind === "NOMINATIVE" ? <Badge variant="success">Nominative</Badge> : null)}
              </p>

              {ctx.blockers.length > 0 && (
                <ul role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive-subtle p-3 text-sm text-destructive-text">
                  {ctx.blockers.map((b) => <li key={b.code} className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {b.label}</li>)}
                </ul>
              )}

              {ctx.mailboxes.length === 0 ? (
                <p role="alert" className="text-sm text-destructive-text">Aucune boîte d’envoi ne vous est attribuée. Le propriétaire en ajoute dans Réglages → Boîtes d’envoi.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Depuis" hint={mailbox?.blocker?.label ?? (mailbox ? `${mailbox.sentToday} / ${mailbox.allowanceToday} envoyés aujourd’hui` : undefined)} error={mailbox?.blocker ? mailbox.blocker.label : undefined}>
                    {(field) => (
                      <Select value={mailboxId} onValueChange={setMailboxId}>
                        <SelectTrigger {...field}><SelectValue placeholder="Choisir une boîte" /></SelectTrigger>
                        <SelectContent>{ctx.mailboxes.map((m) => <SelectItem key={m.id} value={m.id}>{m.address} ({m.sentToday}/{m.allowanceToday})</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </FormField>
                  <FormField label="Modèle">
                    {(field) => (
                      <Select value={templateId} onValueChange={chooseTemplate}>
                        <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={FREE}>Message libre</SelectItem>
                          {ctx.templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                </div>
              )}

              <FormField label="Objet" required>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
              </FormField>
              <FormField label="Message" required error={unfilled ? `À compléter : ${missing.length ? missing.map((m) => `{{${m}}} (${VARIABLES[m].toLowerCase()})`).join(", ") : "une variable {{…}} reste dans le texte"}.` : undefined}>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Bonjour…" />
              </FormField>

              {mailbox && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ajouté sous le message</p>
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-xs text-muted-foreground">
                    {composeText({ body: "", signature: mailbox.signature, senderName: mailbox.displayName, origin: ctx.origin, unsubscribeUrl: "[lien de désinscription]" }).trim()}
                  </pre>
                </div>
              )}

              {generic && ctx.blockers.length === 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={confirmGeneric} onCheckedChange={(v) => setConfirmGeneric(v === true)} className="mt-0.5" />
                  <span>J’écris quand même à cette adresse générique. <span className="text-muted-foreground">Une adresse nominative (prenom@…) est préférable : le cadre légal des adresses génériques est moins clair.</span></span>
                </label>
              )}

              {ctx.recent.length > 0 && (
                <div className="space-y-1 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Déjà envoyés</p>
                  <ul className="space-y-0.5">{ctx.recent.map((m) => <li key={m.id} className="truncate">{m.subject} <span className="text-muted-foreground">· {ago(m.sentAt ?? m.createdAt)}{m.status === "FAILED" ? " · échec" : ""}</span></li>)}</ul>
                  <Link href="/app/mailbox" className="text-xs underline underline-offset-4">Tous les emails</Link>
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={busy} disabled={!canSend}><Send className="h-4 w-4" aria-hidden="true" /> Envoyer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

