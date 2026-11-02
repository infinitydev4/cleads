import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { SKILL_NAME } from "../agents"

/**
 * The SKILL.md format of agentskills.io (docs/crm-v1/AGENTS-IA.md §8): a YAML front matter with `name` and
 * `description`, then the instructions in Markdown, and optional text files next to it. Skills written for other tools
 * import as they are, and ours export the same way.
 */
export const SKILL_LIMITS = {
  nameMax: 64,
  descriptionMax: 1024,
  contentMax: 40_000,
  fileMax: 50_000,
  filesMax: 10,
  filesTotalMax: 200_000,
  documentMax: 60_000,
} as const

/** Annexes are read by agents, never run: text formats only. */
export const TEXT_FILE = /\.(md|markdown|txt|csv|tsv|json|ya?ml|xml|html?)$/i

export class SkillFormatError extends Error {}

export interface SkillDocument {
  name: string
  description: string
  content: string
}

export interface SkillFile {
  path: string
  content: string
}

/** A readable reason when the name breaks the standard's rules; null when it is valid. */
export function skillNameError(name: string): string | null {
  if (!name) return "Le skill n'a pas de nom (champ name)."
  if (name.length > SKILL_LIMITS.nameMax) return `Nom du skill : ${SKILL_LIMITS.nameMax} caractères au plus.`
  if (!SKILL_NAME.test(name)) return `Nom du skill « ${name.slice(0, 80)} » : minuscules, chiffres et tirets seulement, sans tiret au début, à la fin ni en double (par exemple audit-seo-local).`
  return null
}

const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/

/** Reads a SKILL.md. Throws SkillFormatError with a message for the person who imports it. */
export function parseSkillMd(text: string): SkillDocument {
  if (text.length > SKILL_LIMITS.documentMax) throw new SkillFormatError(`Fichier trop long : ${SKILL_LIMITS.documentMax.toLocaleString("fr-FR")} caractères au plus.`)
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  const match = FRONT_MATTER.exec(normalized)
  if (!match) throw new SkillFormatError("Le fichier doit commencer par un en-tête YAML entre deux lignes « --- », avec name et description.")
  let meta: unknown
  try {
    // No aliases: a few bytes of YAML must not expand into a huge document.
    meta = parseYaml(match[1], { maxAliasCount: 0 })
  } catch (error) {
    throw new SkillFormatError(`En-tête YAML illisible : ${error instanceof Error ? error.message.split("\n")[0] : "format inconnu"}`)
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new SkillFormatError("L'en-tête doit contenir name et description.")
  const { name, description } = meta as Record<string, unknown>
  if (typeof name !== "string") throw new SkillFormatError("Le skill n'a pas de nom (champ name).")
  const nameError = skillNameError(name.trim())
  if (nameError) throw new SkillFormatError(nameError)
  if (typeof description !== "string" || !description.trim()) throw new SkillFormatError("Le skill n'a pas de description (champ description) : elle dit aux agents quand s'en servir.")
  if (description.trim().length > SKILL_LIMITS.descriptionMax) throw new SkillFormatError(`Description : ${SKILL_LIMITS.descriptionMax} caractères au plus.`)
  const content = normalized.slice(match[0].length).trim()
  if (!content) throw new SkillFormatError("Le skill n'a pas de contenu après son en-tête.")
  if (content.length > SKILL_LIMITS.contentMax) throw new SkillFormatError(`Contenu : ${SKILL_LIMITS.contentMax.toLocaleString("fr-FR")} caractères au plus.`)
  return { name: name.trim(), description: description.trim(), content }
}

export function serializeSkillMd(doc: SkillDocument): string {
  const head = stringifyYaml({ name: doc.name, description: doc.description }, { lineWidth: 0 }).trimEnd()
  return `---\n${head}\n---\n\n${doc.content.trim()}\n`
}

/**
 * A safe relative path for an annex ("references/grille.md"), or a reason to refuse it. No absolute path, no "..",
 * no hidden file, text formats only, and never SKILL.md itself.
 */
export function cleanSkillPath(raw: string): { path: string } | { error: string } {
  const path = raw.replace(/\\/g, "/").replace(/^(\.\/)+/, "").trim()
  if (!path || path.length > 120) return { error: `Chemin de fichier vide ou trop long : « ${raw.slice(0, 60)} »` }
  const parts = path.split("/")
  if (path.startsWith("/") || parts.some((p) => !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(p) || p === "..")) return { error: `Chemin refusé : « ${path.slice(0, 80)} »` }
  if (/^skill\.md$/i.test(parts[parts.length - 1]) && parts.length === 1) return { error: "SKILL.md est le skill lui-même, pas une annexe." }
  if (!TEXT_FILE.test(path)) return { error: `« ${path} » ignoré : les agents lisent des fichiers texte (Markdown, texte, CSV, JSON, YAML), ils n'exécutent pas de scripts.` }
  return { path }
}
