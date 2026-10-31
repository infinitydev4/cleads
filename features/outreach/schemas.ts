import { z } from "zod"
import { BODY_MAX, SUBJECT_MAX } from "./footer"
import { MAX_DAILY_CAP } from "./rules"

const host = z.string().trim().toLowerCase().min(3, "Hôte invalide").max(253).regex(/^[a-z0-9.-]+$/, "Hôte invalide (ex. smtp.exemple.com)")
const port = z.coerce.number().int().min(1).max(65535)
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null)

const mailboxFields = {
  address: z.string().trim().toLowerCase().email("Adresse email invalide").max(254),
  displayName: z.string().trim().min(2, "Indiquez le nom affiché").max(80),
  ownerId: z.string().min(1).nullable(),
  smtpHost: host,
  smtpPort: port,
  smtpSecure: z.boolean(),
  username: z.string().trim().min(1, "Indiquez l’identifiant").max(254),
  imapHost: host.optional().nullable().or(z.literal("").transform(() => null)),
  imapPort: port.optional().nullable(),
  imapSecure: z.boolean().default(true),
  sentFolder: optionalText(200),
  dailyCap: z.coerce.number().int().min(1).max(MAX_DAILY_CAP, `${MAX_DAILY_CAP} par jour au plus`),
  signature: optionalText(1_000),
}

export const createMailboxSchema = z.object({
  ...mailboxFields,
  password: z.string().min(1, "Indiquez le mot de passe").max(500),
  /** The mailbox has been sending for weeks elsewhere: skip the warm-up. */
  alreadyWarm: z.boolean().default(false),
})

export const updateMailboxSchema = z
  .object({
    ...mailboxFields,
    /** Empty keeps the stored password. */
    password: z.string().max(500).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]),
    restartWarmup: z.boolean(),
  })
  .partial()

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Donnez un nom au modèle").max(80),
  subject: z.string().trim().min(2, "Indiquez un objet").max(SUBJECT_MAX),
  body: z.string().trim().min(10, "Le message est trop court").max(BODY_MAX),
})

export const sendSchema = z.object({
  mailboxId: z.string().min(1),
  subject: z.string().trim().min(2, "Indiquez un objet").max(SUBJECT_MAX),
  body: z.string().trim().min(10, "Le message est trop court").max(BODY_MAX),
  templateId: z.string().min(1).optional().nullable(),
  /** The address is generic (contact@…): the sender confirmed they want to write to it anyway. */
  confirmGeneric: z.boolean().optional(),
})

export type CreateMailboxInput = z.infer<typeof createMailboxSchema>
export type UpdateMailboxInput = z.infer<typeof updateMailboxSchema>
export type TemplateInput = z.infer<typeof templateSchema>
export type SendInput = z.infer<typeof sendSchema>
