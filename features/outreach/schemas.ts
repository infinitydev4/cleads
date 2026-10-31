import { z } from "zod"
import { BODY_MAX, SUBJECT_MAX } from "./footer"
import { MAX_DAILY_CAP } from "./rules"
import { MAX_DELAY_DAYS, MAX_STEPS } from "./sequence-rules"

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

const stepSchema = z.object({
  /** Days after the previous message; ignored for step 1, which leaves at enrollment. */
  delayDays: z.coerce.number().int().min(0).max(MAX_DELAY_DAYS, `${MAX_DELAY_DAYS} jours au plus entre deux messages`),
  /** May be empty on steps 2+: the message then continues the first one's thread. */
  subject: z.string().trim().max(SUBJECT_MAX),
  body: z.string().trim().min(10, "Le message est trop court").max(BODY_MAX),
})

export const sequenceSchema = z.object({
  name: z.string().trim().min(2, "Donnez un nom à la séquence").max(80),
  steps: z.array(stepSchema).min(1, "Il faut au moins un message").max(MAX_STEPS, `${MAX_STEPS} messages au plus`),
}).superRefine((v, ctx) => {
  if (v.steps[0].subject.length < 2) ctx.addIssue({ code: "custom", path: ["steps", 0, "subject"], message: "Indiquez l’objet du premier message" })
  v.steps.forEach((st, i) => {
    if (i > 0 && st.delayDays < 1) ctx.addIssue({ code: "custom", path: ["steps", i, "delayDays"], message: "Attendez au moins 1 jour entre deux messages" })
  })
})

export const enrollSchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(100, "100 fiches au plus à la fois"),
  mailboxId: z.string().min(1),
  confirmGeneric: z.boolean().optional(),
})

export type CreateMailboxInput = z.infer<typeof createMailboxSchema>
export type UpdateMailboxInput = z.infer<typeof updateMailboxSchema>
export type TemplateInput = z.infer<typeof templateSchema>
export type SendInput = z.infer<typeof sendSchema>
export type SequenceInput = z.infer<typeof sequenceSchema>
export type EnrollInput = z.infer<typeof enrollSchema>
