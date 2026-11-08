import type { ActivityKind, EmailDirection, EmailStatus, LeadSource, SuppressionReason } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { inferEmailKind, normalizeEmail } from "@/lib/crm/normalize"
import { dealStage, leadStatus, meetingStatus } from "@/lib/crm/status"
import { CALL_OUTCOMES } from "@/features/activity/rules"
import { MEETING_TYPE_LABELS, OUTCOME_LABELS } from "@/features/meetings/rules"
import { CANDIDATE_ROLE_LABELS, CANDIDATE_STATUS_LABELS } from "@/features/research/labels"
import { LeadError } from "./errors"

/**
 * E14 lot 4 (D65): what the CRM holds about one person, for an access request (GDPR art. 15). French keys and labels:
 * the file is handed to the person. Nothing about anyone else: no other contact of the company, no member of the team
 * (who wrote, called or hosted), not the raw source data of the company (its officers).
 */
export interface PersonExport {
  document: string
  genereLe: string
  contactId: string
  identite: {
    nom: string | null
    fonction: string | null
    email: string | null
    telephone: string | null
    linkedin: string | null
    role: string
    source: string
    origine: string | null
    collecteLe: string | null
    baseLegale: string | null
    nePasContacter: boolean
    motifNePasContacter: string | null
    creeLe: string
    modifieLe: string
  }
  entreprise: {
    nom: string
    siteWeb: string | null
    telephone: string | null
    email: string | null
    adresse: string | null
    codePostal: string | null
    ville: string | null
    pays: string
    secteur: string | null
    siret: string | null
    siren: string | null
  } | null
  fiches: {
    id: string
    statut: string
    source: string
    creeLe: string
    modifieLe: string
    dernierContactLe: string | null
    historique: { date: string; type: string; texte: string | null; detail: string | null }[]
    opportunites: { etape: string; montant: number | null; devise: string; creeLe: string; clotureEstimeeLe: string | null; gagneeLe: string | null; perdueLe: string | null; motifPerte: string | null }[]
  }[]
  emails: { sens: string; statut: string; date: string; objet: string; texte: string }[]
  rendezVous: { debut: string; fin: string; fuseau: string; type: string; statut: string; issue: string | null; notes: string | null; motifAnnulation: string | null }[]
  profilsProposes: { nom: string; fonction: string | null; role: string; profil: string; confiance: string; extrait: string; statut: string; proposeLe: string; decideLe: string | null }[]
  listeOpposition: { adresse: string | null; presente: boolean; motif: string | null; depuis: string | null }
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  EXTRACTOR: "Cleads Extractor (fiches d’entreprises publiques)",
  CSV: "Import d’un fichier",
  INBOUND: "Formulaire du site ou réservation en ligne",
  MANUAL: "Saisie par l’équipe",
  LEGACY: "Ancien back-office",
  REGISTRY: "Veille du registre (BODACC)",
  RESEARCH: "Recherche web (profil professionnel public)",
}

/** Older contacts store a code, newer sources write the full sentence. */
const LEGAL_BASIS_LABELS: Record<string, string> = {
  legitimate_interest_b2b: "Intérêt légitime (RGPD art. 6.1.f) : prospection B2B",
  consent: "Consentement (RGPD art. 6.1.a) : réservation en ligne",
  pre_contractual_request: "Demande de la personne avant un contrat (RGPD art. 6.1.b)",
}

/** The fiche's history kept in the export: what was written, said or decided about the person. */
const HISTORY_KINDS = ["NOTE", "CALL", "STATUS_CHANGE"] as const satisfies readonly ActivityKind[]
const HISTORY_LABELS: Record<(typeof HISTORY_KINDS)[number], string> = { NOTE: "Note", CALL: "Appel", STATUS_CHANGE: "Changement de statut" }

const DIRECTION_LABELS: Record<EmailDirection, string> = { OUTBOUND: "Envoyé à la personne", INBOUND: "Reçu de la personne" }
const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = { SENDING: "En cours d’envoi", SENT: "Envoyé", FAILED: "Échec de l’envoi", BOUNCED: "Non remis (rebond)", RECEIVED: "Reçu" }
const SUPPRESSION_LABELS: Record<SuppressionReason, string> = { UNSUBSCRIBED: "Désinscription", BOUNCED: "Adresse en rebond", COMPLAINED: "Signalement comme spam", MANUAL: "Opposition enregistrée par l’équipe" }

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null
const text = (v: unknown) => (typeof v === "string" ? v : null)
const statusLabel = (v: unknown) => {
  const s = text(v)
  return s ? ((leadStatus as Record<string, { label: string }>)[s]?.label ?? s) : "—"
}

/** The call's outcome and length, or the status change, as the fiche shows them. */
function historyDetail(kind: (typeof HISTORY_KINDS)[number], data: unknown): string | null {
  const d = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  if (kind === "CALL") {
    const outcome = text(d.outcome)
    return [outcome && ((CALL_OUTCOMES as Record<string, string>)[outcome] ?? outcome), typeof d.durationMin === "number" ? `${d.durationMin} min` : null].filter(Boolean).join(" · ") || null
  }
  if (kind === "STATUS_CHANGE") return `${statusLabel(d.from)} → ${statusLabel(d.to)}`
  return null
}

/** Everything the workspace holds about one contact, ready to hand over. Owners and managers only (data:export); each export is in the audit log, without its content. */
export async function exportPerson(user: CurrentUser, contactId: string, ip?: string | null): Promise<PersonExport> {
  if (!can(user.role, "data:export")) throw new LeadError("forbidden", "Seuls le propriétaire et les managers exportent les données d’une personne.", 403)
  const ws = user.workspaceId
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: ws }, include: { company: true } })
  if (!contact) throw new LeadError("not_found", "Contact introuvable.", 404)

  const leads = await prisma.lead.findMany({
    where: { workspaceId: ws, contactId: contact.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      activities: { where: { kind: { in: [...HISTORY_KINDS] } }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] },
      deals: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  })
  const leadIds = leads.map((l) => l.id)
  const own = normalizeEmail(contact.email)
  // The same public profile on the same company is the person even before anyone confirmed it; a homonym is not.
  const ownProfile = contact.companyId && contact.linkedinUrl ? [{ companyId: contact.companyId, url: contact.linkedinUrl }] : []
  const [messages, meetings, candidates, suppression] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { workspaceId: ws, isTest: false, OR: [{ contactId: contact.id }, ...(own ? [{ direction: "INBOUND" as const, fromEmail: { equals: own, mode: "insensitive" as const } }] : [])] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    // A meeting of the fiche booked with a colleague is the colleague's.
    prisma.meeting.findMany({ where: { workspaceId: ws, OR: [{ contactId: contact.id }, { contactId: null, leadId: { in: leadIds } }] }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
    prisma.contactCandidate.findMany({ where: { workspaceId: ws, OR: [{ contactId: contact.id }, ...ownProfile] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    contact.email ? prisma.suppression.findFirst({ where: { workspaceId: ws, email: { equals: contact.email, mode: "insensitive" } } }) : null,
  ])
  // A reply on the person's thread from another address (a colleague, an assistant) is that other person's message.
  const addresses = new Set([own, ...messages.filter((e) => e.direction === "OUTBOUND").map((e) => normalizeEmail(e.toEmail))].filter(Boolean))
  const emails = messages.filter((e) => e.direction === "OUTBOUND" || addresses.has(normalizeEmail(e.fromEmail)))
  const c = contact.company
  // An import copies the fiche's address onto the company: a colleague's own address stays out, a shared one stays in.
  const companyEmail = c?.email && (normalizeEmail(c.email) === own || inferEmailKind(c.email) === "GENERIC") ? c.email : null

  const exported: PersonExport = {
    document: "Données personnelles enregistrées dans le CRM (RGPD, article 15)",
    genereLe: new Date().toISOString(),
    contactId: contact.id,
    identite: {
      nom: contact.name,
      fonction: contact.jobTitle,
      email: contact.email,
      telephone: contact.phone,
      linkedin: contact.linkedinUrl,
      role: CANDIDATE_ROLE_LABELS[contact.role],
      source: SOURCE_LABELS[contact.source],
      origine: contact.collectedFrom,
      collecteLe: iso(contact.collectedAt),
      baseLegale: contact.legalBasis && (LEGAL_BASIS_LABELS[contact.legalBasis] ?? contact.legalBasis),
      nePasContacter: contact.doNotContact,
      motifNePasContacter: contact.doNotContactReason,
      creeLe: contact.createdAt.toISOString(),
      modifieLe: contact.updatedAt.toISOString(),
    },
    entreprise: c && {
      nom: c.name, siteWeb: c.website, telephone: c.phone, email: companyEmail, adresse: c.address, codePostal: c.postalCode, ville: c.city, pays: c.country, secteur: c.sector, siret: c.siret, siren: c.siren,
    },
    fiches: leads.map((l) => ({
      id: l.id,
      statut: leadStatus[l.status].label,
      source: SOURCE_LABELS[l.source],
      creeLe: l.createdAt.toISOString(),
      modifieLe: l.updatedAt.toISOString(),
      dernierContactLe: iso(l.lastContactedAt),
      historique: l.activities.map((a) => {
        const kind = a.kind as (typeof HISTORY_KINDS)[number]
        return { date: a.occurredAt.toISOString(), type: HISTORY_LABELS[kind], texte: a.body, detail: historyDetail(kind, a.data) }
      }),
      opportunites: l.deals.map((d) => ({
        etape: dealStage[d.stage].label, montant: d.amountCents == null ? null : d.amountCents / 100, devise: d.currency, creeLe: d.createdAt.toISOString(),
        clotureEstimeeLe: iso(d.expectedCloseAt), gagneeLe: iso(d.wonAt), perdueLe: iso(d.lostAt), motifPerte: d.lostReason,
      })),
    })),
    emails: emails.map((e) => ({ sens: DIRECTION_LABELS[e.direction], statut: EMAIL_STATUS_LABELS[e.status], date: (e.sentAt ?? e.createdAt).toISOString(), objet: e.subject, texte: e.bodyText })),
    rendezVous: meetings.map((m) => ({
      debut: m.startsAt.toISOString(), fin: m.endsAt.toISOString(), fuseau: m.timezone, type: MEETING_TYPE_LABELS[m.type], statut: meetingStatus[m.status].label,
      issue: m.outcome && OUTCOME_LABELS[m.outcome], notes: m.notes, motifAnnulation: m.cancelReason,
    })),
    profilsProposes: candidates.map((k) => ({
      nom: k.name, fonction: k.title, role: CANDIDATE_ROLE_LABELS[k.role], profil: k.url, confiance: `${Math.round(k.confidence * 100)} %`, extrait: k.evidence,
      statut: CANDIDATE_STATUS_LABELS[k.status], proposeLe: k.createdAt.toISOString(), decideLe: iso(k.decidedAt),
    })),
    listeOpposition: { adresse: contact.email, presente: !!suppression, motif: suppression && SUPPRESSION_LABELS[suppression.reason], depuis: iso(suppression?.createdAt) },
  }
  await audit({ action: "contact.exported", actorId: user.id, workspaceId: ws, entityType: "Contact", entityId: contact.id, ip })
  return exported
}
