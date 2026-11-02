"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { strToU8, zipSync } from "fflate"
import { Archive, ArchiveRestore, Copy, Download, FlaskConical, History, Pencil, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { AgentView } from "@/features/ai/definitions"
import type { SkillDetail, SkillVersionView } from "@/features/ai/skills/service"
import { api } from "../leads/api"
import { SkillEditor } from "./skill-editor"
import { SkillTestDialog } from "./skill-test-dialog"

const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const MODE_LABELS = { ALWAYS: "toujours", ON_DEMAND: "à la demande" } as const

/** The skill folder of agentskills.io: name/SKILL.md and its annexes. */
function downloadZip(skill: SkillDetail) {
  const entries: Record<string, Uint8Array> = { [`${skill.name}/SKILL.md`]: strToU8(skill.markdown) }
  for (const f of skill.files) entries[`${skill.name}/${f.path}`] = strToU8(f.content)
  const blob = new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: "application/zip" })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement("a"), { href: url, download: `${skill.name}.zip` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function Text({ children }: { children: string }) {
  return <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-card p-4 font-mono text-xs leading-relaxed">{children}</pre>
}

export function SkillSheet({ skillId, agents, canManage, workerOnline, onClose, onOpenRun }: { skillId: string | null; agents: AgentView[]; canManage: boolean; workerOnline: boolean; onClose: () => void; onOpenRun: (id: string) => void }) {
  const router = useRouter()
  const [skill, setSkill] = useState<SkillDetail | null>(null)
  const [old, setOld] = useState<SkillVersionView | null>(null)
  const [editing, setEditing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [busy, setBusy] = useState(false)
  // Another skill opened: forget the previous one at once.
  const [shown, setShown] = useState(skillId)
  if (shown !== skillId) {
    setShown(skillId)
    setSkill(null)
    setOld(null)
  }

  // Raised after a save made in the editor: loads the skill again.
  const [reloads, setReloads] = useState(0)
  useEffect(() => {
    if (!skillId) return
    let cancelled = false
    api<SkillDetail>(`/api/ai/skills/${skillId}`)
      .then((next) => !cancelled && setSkill(next))
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : "Chargement impossible"))
    return () => {
      cancelled = true
    }
  }, [skillId, reloads])

  async function patch(body: Record<string, unknown>, done: string) {
    if (!skill) return
    setBusy(true)
    try {
      setSkill(await api<SkillDetail>(`/api/ai/skills/${skill.id}`, { method: "PATCH", body: JSON.stringify(body) }))
      setOld(null)
      toast.success(done)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function showVersion(version: number) {
    if (!skill) return
    if (version === skill.version) return setOld(null)
    try {
      setOld(await api<SkillVersionView>(`/api/ai/skills/${skill.id}/versions/${version}`))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible")
    }
  }

  return (
    <>
      <Sheet open={!!skillId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2 font-mono">
              {skill?.name ?? "Skill"}
              {skill && <Badge variant="outline">v{skill.version}</Badge>}
              {skill?.archived && <Badge variant="neutral">Archivé</Badge>}
            </SheetTitle>
            <SheetDescription>{skill?.description ?? "Chargement…"}</SheetDescription>
          </SheetHeader>
          {skill && (
            <div className="mt-5 space-y-6">
              <div className="flex flex-wrap gap-2">
                {canManage && !skill.generator && !skill.archived && (
                  <Button size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Modifier
                  </Button>
                )}
                {canManage && !skill.archived && (
                  <Button size="sm" variant="outline" onClick={() => setTesting(true)}>
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                    Tester sur une fiche
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => downloadZip(skill)}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Exporter (.zip)
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(skill.markdown)
                      .then(() => toast.success("SKILL.md copié"))
                      .catch(() => toast.error("Copie impossible"))
                  }
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copier le SKILL.md
                </Button>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => patch({ archived: !skill.archived }, skill.archived ? "Skill restauré" : "Skill archivé : les agents ne le reçoivent plus")} disabled={busy}>
                    {skill.archived ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                    {skill.archived ? "Restaurer" : "Archiver"}
                  </Button>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {skill.agents.length ? <>Donné à : {skill.agents.map((a) => `${a.label} (${MODE_LABELS[a.mode]})`).join(" · ")}. </> : "Donné à aucun agent : attribuez-le dans l’onglet Agents. "}
                {skill.updatedBy && <>Dernière modification par {skill.updatedBy}.</>}
              </p>
              {skill.generator && <p className="rounded-lg bg-info-subtle p-3 text-sm text-info">Ce skill est écrit à partir des offres actives, à chaque utilisation : pour le changer, modifiez le catalogue d’offres. Ci-dessous, ce que les agents lisent aujourd’hui.</p>}

              <section aria-labelledby="skill-content" className="space-y-2">
                <h3 id="skill-content" className="text-sm font-bold">
                  {old ? `Version ${old.version} (${when.format(new Date(old.createdAt))})` : "Contenu"}
                </h3>
                {old && <p className="text-sm text-muted-foreground">{old.description}</p>}
                <Text>{old ? old.content : skill.content}</Text>
                {(old ? old.files : skill.files).map((f) => (
                  <details key={f.path} className="text-sm">
                    <summary className="cursor-pointer font-mono text-xs">{f.path}</summary>
                    <div className="mt-2">
                      <Text>{f.content}</Text>
                    </div>
                  </details>
                ))}
                {old && canManage && !skill.generator && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => patch({ restoreVersion: old.version }, `Version ${old.version} remise en service (nouvelle version)`)} disabled={busy}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Revenir à cette version
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOld(null)}>
                      Voir la version actuelle
                    </Button>
                  </div>
                )}
              </section>

              <section aria-labelledby="skill-history" className="space-y-2">
                <h3 id="skill-history" className="flex items-center gap-2 text-sm font-bold">
                  <History className="h-4 w-4" aria-hidden="true" />
                  Historique
                </h3>
                <ol className="divide-y rounded-lg border">
                  {skill.versions.map((v) => (
                    <li key={v.version}>
                      <button type="button" onClick={() => showVersion(v.version)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-accent">
                        <span className="font-medium">v{v.version}</span>
                        {v.version === skill.version && <Badge variant="success">Actuelle</Badge>}
                        {old?.version === v.version && <Badge variant="info">Affichée</Badge>}
                        <span className="min-w-0 flex-1 truncate">{v.note ?? "Sans note"}</span>
                        <span className="text-muted-foreground">
                          {v.createdBy ?? "Catalogue"} · {when.format(new Date(v.createdAt))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {editing && skill && (
        <SkillEditor
          skill={skill}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            router.refresh()
            setReloads((n) => n + 1)
          }}
        />
      )}
      {testing && skill && (
        <SkillTestDialog
          skill={skill}
          agents={agents}
          workerOnline={workerOnline}
          onClose={() => setTesting(false)}
          onStarted={(runId) => {
            setTesting(false)
            onClose()
            router.refresh()
            onOpenRun(runId)
          }}
        />
      )}
    </>
  )
}
