"use client"

import { useEffect, useRef, useState } from "react"
import { Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { DraftReview, fetchDraft, isAbort } from "@/components/crm/ai/drafts"
import { answerSubject } from "@/features/email-draft/edits"
import type { DraftView } from "@/features/email-draft/labels"
import type { ReplyView } from "@/features/outreach/replies"
import { hasPlaceholder } from "@/features/outreach/template"
import { isOffered } from "@/features/reply-triage/labels"
import { api } from "../leads/api"

/**
 * Answers a reply in its thread, from the mailbox that received it (E22). « Réponse suggérée » asks the Rédacteur for a
 * short answer proposing a 15-minute call, with the booking link; nothing leaves without being read.
 */
export function AnswerDialog({ reply, canUseAi, onClose, onSent }: { reply: ReplyView; canUseAi: boolean; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState(() => answerSubject(reply.subject))
  const [body, setBody] = useState("")
  const [draft, setDraft] = useState<DraftView | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)
  const drafts = useRef<AbortController | null>(null)
  useEffect(() => () => drafts.current?.abort(), [])

  const filed = reply.replyClass ?? (isOffered(reply.triage) ? reply.triage.replyClass : null)
  const interested = filed === "INTERESTED"
  const canSend = subject.trim().length >= 2 && body.trim().length >= 10 && !hasPlaceholder(subject) && !hasPlaceholder(body)

  async function suggest() {
    drafts.current?.abort()
    const controller = new AbortController()
    drafts.current = controller
    setDrafting(true)
    try {
      const d = await fetchDraft(`/api/replies/${reply.id}/draft`, {}, controller.signal)
      setSubject(d.subject)
      setBody(d.body)
      setDraft(d)
    } catch (e) {
      if (!isAbort(e)) toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      if (drafts.current === controller) setDrafting(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSend || busy) return
    setBusy(true)
    try {
      await api(`/api/replies/${reply.id}/answer`, { method: "POST", body: JSON.stringify({ subject, body, draftId: draft?.id ?? null }) })
      toast.success(`Réponse envoyée à ${reply.fromEmail}`)
      onSent()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <DialogHeader>
            <DialogTitle>Répondre à {reply.leadName ?? reply.fromEmail}</DialogTitle>
            <DialogDescription>
              Dans le fil de sa réponse, depuis {reply.toEmail}. La signature et le lien de désinscription sont ajoutés automatiquement.
            </DialogDescription>
          </DialogHeader>
          <blockquote className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border-l-4 border-muted bg-muted/50 p-3 text-sm text-muted-foreground">{reply.bodyText || "(message vide)"}</blockquote>

          {canUseAi && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-2.5">
              <Button type="button" variant="outline" size="sm" onClick={suggest} loading={drafting} disabled={!interested || drafting} title={interested ? "Une réponse courte qui propose un échange de 15 minutes, avec votre lien de réservation." : undefined}>
                {!drafting && <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                {drafting ? "Le Rédacteur écrit…" : draft ? "Nouvelle suggestion" : "Réponse suggérée"}
              </Button>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {interested ? "Propose un échange de 15 minutes, avec votre lien de réservation s’il est actif. À relire avant l’envoi." : "La réponse suggérée est prévue pour les réponses classées « Intéressé »."}
              </span>
            </div>
          )}

          <FormField label="Objet" required>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
          </FormField>
          <FormField label="Message" required error={hasPlaceholder(body) ? "Une variable {{…}} reste dans le texte : complétez-la." : undefined}>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Bonjour…" />
          </FormField>
          {draft && <DraftReview draft={draft} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={busy} disabled={!canSend}>
              <Send className="h-4 w-4" aria-hidden="true" /> Envoyer la réponse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
