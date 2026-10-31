import type { EmailKind, LeadStatus, MailboxStatus } from "@prisma/client"
import { addDays, dayKey } from "@/lib/crm/day"
import { inferEmailKind, normalizeEmail } from "@/lib/crm/normalize"
import { canAccessRecord } from "@/lib/rbac"
import type { CrmRole } from "@/lib/crm/roles"
import { OPEN_STAGES } from "@/features/pipeline/rules"

// ── Warm-up and daily allowance ─────────────────────────────────────────────────────────────────────────────────

/**
 * Most a mailbox may send per day, by week since its warm-up began. A new address that sends thirty identical
 * messages on day one looks like a spammer; the allowance grows while the mailbox earns a reputation.
 */
export const WARMUP_STEPS = [5, 10, 20, 30] as const
/** No mailbox goes above this, warmed up or not (docs/crm-v1/PLAN.md section 7.1: 30 to 50 per mailbox per day). */
export const MAX_DAILY_CAP = 50
export const WARMUP_DAYS = WARMUP_STEPS.length * 7

/** Paris calendar days since the warm-up began (0 on the first day, negative before it starts). */
export function warmupDay(startedAt: Date, now = new Date()): number {
  const from = dayKey(startedAt)
  const to = dayKey(now)
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

/** What a mailbox may send today: the warm-up step, never above its own cap. */
export function dailyAllowance(m: { dailyCap: number; warmupStartedAt: Date }, now = new Date()): number {
  const day = warmupDay(m.warmupStartedAt, now)
  if (day < 0) return 0
  const step = WARMUP_STEPS[Math.floor(day / 7)] ?? Number.POSITIVE_INFINITY
  return Math.max(0, Math.min(m.dailyCap, step, MAX_DAILY_CAP))
}

/** Start date that makes a mailbox count as already warmed up (it was used for weeks elsewhere). */
export const warmedUpStart = (now = new Date()) => new Date(`${addDays(dayKey(now), -WARMUP_DAYS)}T12:00:00Z`)

// ── Who receives the email ──────────────────────────────────────────────────────────────────────────────────────

export interface RecipientSource {
  contact: { id: string; email: string | null; emailKind: EmailKind; doNotContact: boolean; doNotContactReason: string | null } | null
  company: { email: string | null } | null
}

export interface Recipient {
  email: string
  kind: EmailKind
  contactId: string | null
}

/** The named contact's address first; the company's address (often `contact@`) only when there is none. */
export function recipientOf(lead: RecipientSource): Recipient | null {
  const own = normalizeEmail(lead.contact?.email)
  if (own) return { email: own, kind: lead.contact!.emailKind === "UNKNOWN" ? inferEmailKind(own) : lead.contact!.emailKind, contactId: lead.contact!.id }
  const shared = normalizeEmail(lead.company?.email)
  if (shared) return { email: shared, kind: inferEmailKind(shared) === "NOMINATIVE" ? "NOMINATIVE" : "GENERIC", contactId: null }
  return null
}

/**
 * May this person write to the prospect? The one the fiche is assigned to (an SDR claims it first, so two people
 * never write to the same prospect), the closer holding its open opportunity, or owners and managers.
 */
export function mayEmailLead(user: { id: string; role: CrmRole }, lead: { ownerId: string | null; deals: { ownerId: string | null; stage: string }[] }) {
  if (canAccessRecord(user, "email:send", lead.ownerId)) return true
  return user.role === "CLOSER" && lead.deals.some((d) => d.ownerId === user.id && (OPEN_STAGES as readonly string[]).includes(d.stage))
}

// ── What stops a send ───────────────────────────────────────────────────────────────────────────────────────────

export type Blocker =
  | "no_email"
  | "do_not_contact"
  | "suppressed"
  | "lead_closed"
  | "not_yours"
  | "no_mailbox"
  | "mailbox_inactive"
  | "quota_reached"
  | "just_sent"

export const BLOCKER_LABELS: Record<Blocker, string> = {
  no_email: "Aucune adresse email sur la fiche.",
  do_not_contact: "Ce contact est marqué « ne pas contacter ».",
  suppressed: "Cette adresse (ou son domaine) est dans la liste d’exclusion : désinscription, rebond ou plainte.",
  lead_closed: "La fiche est marquée « ne pas contacter ».",
  not_yours: "Seule la personne à qui la fiche est attribuée peut lui écrire. Attribuez-vous la fiche d’abord.",
  no_mailbox: "Aucune boîte d’envoi ne vous est attribuée. Le propriétaire en ajoute dans Réglages → Boîtes d’envoi.",
  mailbox_inactive: "Cette boîte d’envoi est en pause ou en erreur.",
  quota_reached: "Le plafond du jour de cette boîte est atteint. Réessayez demain ou choisissez une autre boîte.",
  just_sent: "Un email vient de partir vers cette adresse. Attendez quelques minutes avant de réécrire.",
}

/** A second message to the same address within this delay is almost always a double click. */
export const DUPLICATE_WINDOW_MS = 10 * 60_000

export interface LeadCheck {
  status: LeadStatus
  recipient: Recipient | null
  contactDoNotContact: boolean
  suppressed: boolean
  mayWrite: boolean
}

/** Reasons tied to the fiche itself, in the order a person would fix them. The mailbox is checked separately. */
export function leadBlockers(c: LeadCheck): Blocker[] {
  const out: Blocker[] = []
  if (!c.mayWrite) out.push("not_yours")
  if (c.status === "DO_NOT_CONTACT") out.push("lead_closed")
  // The person asked not to be contacted: writing to the company's shared address instead would get round it.
  if (c.contactDoNotContact) out.push("do_not_contact")
  if (!c.recipient) out.push("no_email")
  else if (c.suppressed) out.push("suppressed")
  return out
}

export function mailboxBlocker(m: { status: MailboxStatus } | null, sentToday: number, allowance: number): Blocker | null {
  if (!m) return "no_mailbox"
  if (m.status !== "ACTIVE") return "mailbox_inactive"
  if (sentToday >= allowance) return "quota_reached"
  return null
}
