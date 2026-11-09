import { z } from "zod"
import { CRM_ROLES } from "@/lib/crm/roles"
import { EXTENSION_RE } from "@/features/telephony/rules"

const role = z.enum(CRM_ROLES)

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide").max(254),
  role,
})

export const memberChangeSchema = z
  .object({
    role: role.optional(),
    active: z.boolean().optional(),
    /** E32: the member's extension on the Zadarma PBX; null takes it back. */
    zadarmaExtension: z
      .string()
      .trim()
      .regex(EXTENSION_RE, "Un poste Zadarma s’écrit en chiffres, comme 100")
      .nullable()
      .optional(),
  })
  .refine((v) => v.role !== undefined || v.active !== undefined || v.zadarmaExtension !== undefined, { message: "Aucun changement demandé" })

export const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2, "Indiquez votre nom").max(100),
  password: z.string().min(1).max(200),
})

export type InviteInput = z.infer<typeof inviteSchema>
export type MemberChange = z.infer<typeof memberChangeSchema>
