"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/crm/form-field"
import { LOST_REASONS } from "@/features/pipeline/rules"

/** Losing an opportunity always says why: the reasons are fixed so that they can be counted in the reports. */
export function LostDialog({ name, open, onCancel, onConfirm }: { name: string; open: boolean; onCancel: () => void; onConfirm: (reason: (typeof LOST_REASONS)[number], detail: string) => void }) {
  const [reason, setReason] = useState<(typeof LOST_REASONS)[number]>(LOST_REASONS[0])
  const [detail, setDetail] = useState("")
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(reason, detail) }} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Opportunité perdue</DialogTitle>
            <DialogDescription>{name} : pourquoi l’opportunité est-elle perdue ?</DialogDescription>
          </DialogHeader>
          <FormField label="Motif" required>
            {(field) => (
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Précision" hint={reason === "Autre" ? "Dites ce qui s’est passé." : "Facultatif."}><Input value={detail} onChange={(e) => setDetail(e.target.value)} autoFocus /></FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
            <Button type="submit" variant="destructive" disabled={reason === "Autre" && !detail.trim()}>Marquer comme perdue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
