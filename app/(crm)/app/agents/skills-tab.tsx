"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { strFromU8, unzipSync } from "fflate"
import { Archive, BookOpen, FileUp, Plus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/crm/empty-state"
import type { AgentView } from "@/features/ai/definitions"
import type { SkillView } from "@/features/ai/skills/service"
import { api } from "../leads/api"
import { SkillEditor } from "./skill-editor"
import { SkillSheet } from "./skill-sheet"

const MODE_LABELS = { ALWAYS: "toujours", ON_DEMAND: "à la demande" } as const

/** Reads a SKILL.md, or a .zip of a skill folder (SKILL.md at its root or one folder down, with its text files). */
async function readSkillFile(file: File): Promise<{ markdown: string; files: { path: string; content: string }[] }> {
  if (!/\.zip$/i.test(file.name)) return { markdown: await file.text(), files: [] }
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.originalSize <= 200_000 && !f.name.endsWith("/") })
  const names = Object.keys(entries).filter((n) => !n.startsWith("__MACOSX/"))
  const skillMd = names.filter((n) => /(^|\/)SKILL\.md$/i.test(n)).sort((a, b) => a.split("/").length - b.split("/").length)[0]
  if (!skillMd) throw new Error("Aucun fichier SKILL.md dans l’archive.")
  const root = skillMd.slice(0, skillMd.length - "SKILL.md".length)
  const files = names
    .filter((n) => n !== skillMd && n.startsWith(root))
    .map((n) => {
      try {
        return { path: n.slice(root.length), content: strFromU8(entries[n]) }
      } catch {
        return null
      }
    })
    .filter((f): f is { path: string; content: string } => !!f && !f.content.includes("\u0000"))
  return { markdown: strFromU8(entries[skillMd]), files }
}

export function SkillsTab({ skills, archived, agents, canManage, workerOnline, onOpenRun }: { skills: SkillView[]; archived: SkillView[]; agents: AgentView[]; canManage: boolean; workerOnline: boolean; onOpenRun: (id: string) => void }) {
  const router = useRouter()
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const list = showArchived ? archived : skills

  async function importFile(file: File) {
    setImporting(true)
    try {
      const body = await readSkillFile(file)
      const result = await api<{ skill: { id: string; name: string; version: number }; created: boolean; skipped: string[] }>("/api/ai/skills/import", { method: "POST", body: JSON.stringify(body) })
      toast.success(result.created ? `Skill « ${result.skill.name} » importé` : `« ${result.skill.name} » mis à jour : version ${result.skill.version}`, {
        description: result.skipped.length ? result.skipped.join(" ") : undefined,
      })
      router.refresh()
      setOpenId(result.skill.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import impossible")
    } finally {
      setImporting(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Un skill est un savoir-faire écrit par l’équipe (procédure d’audit, règles de rédaction, playbook de secteur), au format SKILL.md. Chaque modification crée une version ; les précédentes restent lisibles.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {showArchived ? "Skills actifs" : `Archives${archived.length ? ` (${archived.length})` : ""}`}
          </Button>
          {canManage && (
            <>
              <input ref={input} type="file" accept=".md,.markdown,.zip" className="sr-only" aria-label="Fichier SKILL.md ou archive .zip" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              <Button variant="outline" size="sm" onClick={() => input.current?.click()} loading={importing}>
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Importer
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nouveau skill
              </Button>
            </>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState art="agent" title={showArchived ? "Aucun skill archivé" : "Aucun skill"} description={showArchived ? undefined : "Créez un skill ou importez un fichier SKILL.md : les agents le liront quand il leur sera utile."} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((s) => (
            <li key={s.id}>
              <Card className="h-full p-0">
                <button type="button" onClick={() => setOpenId(s.id)} className="flex h-full w-full flex-col gap-2 rounded-xl p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex flex-wrap items-center gap-2">
                    <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="font-mono text-sm font-semibold">{s.name}</span>
                    <Badge variant="outline">v{s.version}</Badge>
                    {s.generator && <Badge variant="info">Généré depuis les offres</Badge>}
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{s.description}</span>
                  <span className="text-xs text-muted-foreground">{s.agents.length ? s.agents.map((a) => `${a.label} (${MODE_LABELS[a.mode]})`).join(" · ") : "Donné à aucun agent"}</span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <SkillEditor
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false)
            router.refresh()
            setOpenId(id)
          }}
        />
      )}
      <SkillSheet skillId={openId} agents={agents} canManage={canManage} workerOnline={workerOnline} onClose={() => setOpenId(null)} onOpenRun={onOpenRun} />
    </div>
  )
}
