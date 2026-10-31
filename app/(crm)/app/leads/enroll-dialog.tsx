"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/crm/form-field"
import type { SequenceView, EnrollResult } from "@/features/outreach/sequences"
import { api } from "./api"

interface Box {
  id: string
  address: string
  displayName: string
  status: "ACTIVE" | "PAUSED" | "ERROR"
  sentToday: number
  allowanceToday: number
  ownerId: string | null
}

/** Puts the selected fiches into a sequence. The server checks each one and lists the ones it skipped, with the reason. */
export function EnrollDialog({ ids, currentUserId, onClose, onDone }: { ids: string[]; currentUserId: string; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<{ sequences: SequenceView[]; mailboxes: Box[] } | null>(null)
  const [sequenceId, setSequenceId] = useState("")
  const [mailboxId, setMailboxId] = useState("")
  const [confirmGeneric, setConfirmGeneric] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EnrollResult | null>(null)

  useEffect(() => {
    api<{ sequences: SequenceView[]; mailboxes: Box[] }>("/api/sequences")
      .then((d) => {
        setData(d)
        const usable = d.mailboxes.filter((m) => m.status === "ACTIVE")
        setMailboxId((usable.find((m) => m.ownerId === currentUserId) ?? usable[0])?.id ?? "")
        setSequenceId(d.sequences.find((s) => s.status === "ACTIVE")?.id ?? "")
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Échec"))
  }, [currentUserId])

  async function submit() {
    setBusy(true)
    try {
      const r = await api<EnrollResult>(`/api/sequences/${sequenceId}/enroll`, { method: "POST", body: JSON.stringify({ leadIds: ids, mailboxId, confirmGeneric }) })
      setResult(r)
      if (r.enrolled) toast.success(`${r.enrolled} fiche(s) inscrite(s)`)
      if (!r.skipped.length) {
        onDone()
        onClose()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  const active = data?.sequences.filter((s) => s.status === "ACTIVE") ?? []
  const mailboxes = data?.mailboxes ?? []
  return (
    <Dialog open onOpenChange={(open) => { if (!open) { if (result?.enrolled) onDone(); onClose() } }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inscrire dans une séquence</DialogTitle>
          <DialogDescription>{ids.length} fiche{ids.length > 1 ? "s" : ""} sélectionnée{ids.length > 1 ? "s" : ""}. Le premier message part dans les minutes qui suivent, aux heures d’envoi (lundi au vendredi, 9 h – 17 h 30).</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold">{result.enrolled}</span> inscrite(s), <span className="font-semibold">{result.skipped.length}</span> écartée(s) :</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
              {result.skipped.map((s) => (
                <li key={s.leadId}>
                  {s.name ? <Link className="font-medium underline underline-offset-4" href={`/app/leads/${s.leadId}`}>{s.name}</Link> : <span className="font-medium">Fiche</span>} : <span className="text-muted-foreground">{s.reason}</span>
                </li>
              ))}
            </ul>
            <DialogFooter><Button onClick={() => { onDone(); onClose() }}>Fermer</Button></DialogFooter>
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="space-y-4">
            {active.length === 0 && <p className="text-sm text-muted-foreground">Aucune séquence active. <Link className="font-medium underline underline-offset-4" href="/app/sequences">Créez-en une</Link> d’abord.</p>}
            {mailboxes.length === 0 && <p className="text-sm text-muted-foreground">Aucune boîte d’envoi ne vous est attribuée : le propriétaire en ajoute dans Réglages → Boîtes d’envoi.</p>}
            <FormField label="Séquence" required>
              {(p) => (
                <Select value={sequenceId} onValueChange={setSequenceId}>
                  <SelectTrigger id={p.id} aria-label="Séquence"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>{active.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.steps.length} messages)</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Envoyer depuis" required hint="Chaque message part de cette boîte, dans la limite de son plafond du jour (les relances attendent le lendemain au besoin).">
              {(p) => (
                <Select value={mailboxId} onValueChange={setMailboxId}>
                  <SelectTrigger id={p.id} aria-label="Boîte d’envoi"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>{mailboxes.map((m) => <SelectItem key={m.id} value={m.id} disabled={m.status !== "ACTIVE"}>{m.address}{m.status !== "ACTIVE" ? " (indisponible)" : ` · ${m.sentToday}/${m.allowanceToday} aujourd’hui`}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmGeneric} onChange={(e) => setConfirmGeneric(e.target.checked)} />
              <span>Inclure les adresses génériques (contact@, info@…)</span>
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button loading={busy} disabled={!sequenceId || !mailboxId} onClick={submit}>Inscrire</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
