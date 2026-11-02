"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import type { SkillDetail } from "@/features/ai/skills/service"
import { api } from "../leads/api"

const TEMPLATE = `# Titre du skill

Quand et pourquoi l'utiliser, en une phrase.

## Étapes
1. …
2. …

## À ne pas faire
- …`

/** Creates a skill, or saves a new version of one. The server checks every rule again (name, sizes, annex paths). */
export function SkillEditor({ skill, onClose, onSaved }: { skill?: SkillDetail; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(skill?.name ?? "")
  const [description, setDescription] = useState(skill?.description ?? "")
  const [content, setContent] = useState(skill?.content ?? TEMPLATE)
  const [files, setFiles] = useState(skill?.files ?? [])
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const r = skill
        ? await api<SkillDetail>(`/api/ai/skills/${skill.id}`, { method: "PATCH", body: JSON.stringify({ description, content, files, note: note || null }) })
        : await api<SkillDetail>("/api/ai/skills", { method: "POST", body: JSON.stringify({ name: name.trim(), description, content, files }) })
      toast.success(skill ? (r.version > skill.version ? `Version ${r.version} enregistrée` : "Rien n’a changé") : `Skill « ${r.name} » créé`)
      onSaved(r.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{skill ? `Modifier « ${skill.name} »` : "Nouveau skill"}</DialogTitle>
            <DialogDescription>
              {skill ? `L’enregistrement crée la version ${skill.version + 1} ; la version ${skill.version} reste lisible dans l’historique.` : "Au format SKILL.md : un nom, une description qui dit quand s’en servir, puis les consignes en Markdown."}
            </DialogDescription>
          </DialogHeader>
          {!skill && (
            <FormField label="Nom" required hint="Minuscules, chiffres et tirets : audit-seo-local, playbook-paysagistes. Il ne change plus ensuite.">
              <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} maxLength={64} autoFocus className="font-mono" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            </FormField>
          )}
          <FormField label="Description" required hint="Les agents la lisent pour décider de charger ce skill : commencez par « À utiliser pour… ».">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1024} rows={2} />
          </FormField>
          <FormField label="Contenu (Markdown)" required>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={40_000} rows={16} className="font-mono text-xs leading-relaxed" />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Fichiers annexes</legend>
            <p className="text-xs text-muted-foreground">Grilles, exemples, listes : des fichiers texte que l’agent lit avec read_skill quand il en a besoin.</p>
            {files.map((f, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                  <Input
                    value={f.path}
                    onChange={(e) => setFiles((list) => list.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))}
                    placeholder="references/grille.md"
                    aria-label="Chemin du fichier"
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} aria-label={`Retirer ${f.path || "ce fichier"}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <Textarea value={f.content} onChange={(e) => setFiles((list) => list.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} rows={5} aria-label={`Contenu de ${f.path || "ce fichier"}`} className="font-mono text-xs" />
              </div>
            ))}
            {files.length < 10 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setFiles((list) => [...list, { path: "", content: "" }])}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter un fichier
              </Button>
            )}
          </fieldset>
          {skill && (
            <FormField label="Ce qui change" hint="Facultatif, visible dans l’historique.">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </FormField>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={busy}>
              {skill ? "Enregistrer une version" : "Créer le skill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
