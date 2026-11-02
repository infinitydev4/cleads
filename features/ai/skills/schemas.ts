import { z } from "zod"
import { SKILL_LIMITS, cleanSkillPath, skillNameError, type SkillFile } from "./skill-md"

const description = z
  .string()
  .trim()
  .min(1, "Décrivez quand utiliser ce skill : c'est ce que les agents lisent pour le choisir")
  .max(SKILL_LIMITS.descriptionMax, `Description : ${SKILL_LIMITS.descriptionMax} caractères au plus`)
const content = z.string().trim().min(1, "Le skill n'a pas de contenu").max(SKILL_LIMITS.contentMax, `Contenu : ${SKILL_LIMITS.contentMax.toLocaleString("fr-FR")} caractères au plus`)
const note = z.string().trim().max(200, "Note : 200 caractères au plus").nullish().transform((v) => v || null)

/** Annexes written in the editor: every path must be clean, the whole set within the limits. */
export const skillFilesSchema = z
  .array(z.object({ path: z.string().max(200), content: z.string().max(SKILL_LIMITS.fileMax, `Fichier annexe : ${SKILL_LIMITS.fileMax.toLocaleString("fr-FR")} caractères au plus`) }))
  .max(SKILL_LIMITS.filesMax, `${SKILL_LIMITS.filesMax} fichiers annexes au plus`)
  .transform((files, ctx) => {
    const out: SkillFile[] = []
    for (const f of files) {
      const cleaned = cleanSkillPath(f.path)
      if ("error" in cleaned) {
        ctx.addIssue({ code: "custom", message: cleaned.error })
        return z.NEVER
      }
      if (out.some((o) => o.path === cleaned.path)) {
        ctx.addIssue({ code: "custom", message: `Deux fichiers portent le chemin « ${cleaned.path} »` })
        return z.NEVER
      }
      out.push({ path: cleaned.path, content: f.content })
    }
    if (out.reduce((n, f) => n + f.content.length, 0) > SKILL_LIMITS.filesTotalMax) {
      ctx.addIssue({ code: "custom", message: `Fichiers annexes : ${SKILL_LIMITS.filesTotalMax.toLocaleString("fr-FR")} caractères au plus en tout` })
      return z.NEVER
    }
    return out
  })

export const createSkillSchema = z
  .object({
    name: z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        const error = skillNameError(v)
        if (error) ctx.addIssue({ code: "custom", message: error })
      }),
    description,
    content,
    files: skillFilesSchema.default([]),
    note,
  })
  .strict()
export type CreateSkillInput = z.infer<typeof createSkillSchema>

/** A new version (description, content, files), an archive switch, or going back to an earlier version. */
export const updateSkillSchema = z
  .object({
    description: description.optional(),
    content: content.optional(),
    files: skillFilesSchema.optional(),
    note: note.optional(),
    archived: z.boolean().optional(),
    restoreVersion: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((v) => v.description !== undefined || v.content !== undefined || v.files !== undefined || v.archived !== undefined || v.restoreVersion !== undefined, {
    message: "Aucun changement demandé",
  })
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>

/** A SKILL.md and the files of its folder, read by the browser from a .md or a .zip. Bad annexes are skipped, not fatal. */
export const importSkillSchema = z
  .object({
    markdown: z.string().max(SKILL_LIMITS.documentMax, "SKILL.md trop long"),
    files: z.array(z.object({ path: z.string().max(300), content: z.string().max(SKILL_LIMITS.fileMax * 2) })).max(50, "Trop de fichiers dans le dossier du skill").default([]),
  })
  .strict()
export type ImportSkillInput = z.infer<typeof importSkillSchema>
