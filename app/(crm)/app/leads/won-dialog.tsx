"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/crm/form-field"

/** "4 500,50" → 450050; null when it is not a positive amount. */
export function parseEuros(raw: string): number | null {
  const cents = Math.round(Number(raw.replace(/[\s  €]/g, "").replace(",", ".")) * 100)
  return Number.isFinite(cents) && cents > 0 ? cents : null
}

/** Winning an opportunity always says for how much: the reports add up the amounts signed (E10). */
export function WonDialog({ name, open, onCancel, onConfirm }: { name: string; open: boolean; onCancel: () => void; onConfirm: (amountCents: number) => void }) {
  const [raw, setRaw] = useState("")
  const cents = parseEuros(raw)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); if (cents) onConfirm(cents) }} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Opportunité gagnée</DialogTitle>
            <DialogDescription>{name} : quel montant a été signé ?</DialogDescription>
          </DialogHeader>
          <FormField label="Montant HT signé (€)" required hint="Hors taxes, tel qu’il figure sur le devis ou le contrat signé.">
            {(field) => <Input {...field} value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" placeholder="Ex. : 4 500" autoFocus />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
            <Button type="submit" disabled={!cents}>Marquer comme gagnée</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
