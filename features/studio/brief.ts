import { keepEvidenced } from "@/features/prospect-audit/analysis"
import { AREA_LABELS, SEVERITY_LABELS } from "@/features/prospect-audit/labels"
import type { Finding } from "@/features/prospect-audit/schemas"
import { CATALOG_FAMILIES, DEFAULT_FONTS } from "./fonts"
import type { Brief, BriefOutput, Collected } from "./schemas"

/**
 * The brief (E23): what the Designer may say on the page and where each point comes from. Evidence ids are the
 * Studio's own: P1… the pages read, F1… the fiche's facts, A1… the audit's findings.
 */
export interface FicheFacts {
  name: string
  sector: string | null
  address: string | null
  postalCode: string | null
  city: string | null
  phone: string | null
  email: string | null
  rating: number | null
  reviewCount: number | null
  website: string | null
}

const frNumber = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/** The fiche's facts, numbered: the page may state them as they are. */
export function ficheFacts(f: FicheFacts, site: { phone: string | null; email: string | null; booking: string | null; url: string | null }): Collected["facts"] {
  const out: Omit<Collected["facts"][number], "id">[] = []
  out.push({ label: "Nom", value: f.name, source: "fiche" })
  if (f.sector) out.push({ label: "Activité", value: f.sector, source: "fiche" })
  const town = [f.postalCode, f.city].filter(Boolean).join(" ")
  if (f.address) out.push({ label: "Adresse", value: [f.address, town].filter(Boolean).join(", "), source: "fiche" })
  else if (town) out.push({ label: "Ville", value: town, source: "fiche" })
  const phone = f.phone ?? site.phone
  if (phone) out.push({ label: "Téléphone", value: phone, source: f.phone ? "fiche" : "site" })
  const email = f.email ?? site.email
  if (email) out.push({ label: "Email", value: email, source: f.email ? "fiche" : "site" })
  if (f.rating != null && f.reviewCount) out.push({ label: "Note Google", value: `${frNumber(f.rating)}/5 sur ${f.reviewCount} avis`, source: "fiche Google" })
  if (site.booking) out.push({ label: "Réservation en ligne", value: site.booking, source: "site" })
  if (site.url) out.push({ label: "Site actuel", value: site.url, source: "site" })
  return out.map((x, i) => ({ id: `F${i + 1}`, ...x }))
}

/** The audit's findings worth changing, numbered A1…, most serious first. */
export function auditPoints(findings: readonly Finding[], max = 10): { id: string; text: string }[] {
  const order = { high: 0, medium: 1, low: 2 } as const
  return [...findings]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, max)
    .map((x, i) => ({ id: `A${i + 1}`, text: `[${SEVERITY_LABELS[x.severity]}] ${AREA_LABELS[x.area]} — ${x.title} : ${x.detail}` }))
}

/** Families the Designer may choose: the short list, plus the site's own when Google Fonts has them. */
export const allowedFonts = (siteFonts: readonly string[]) => [...new Set([...CATALOG_FAMILIES, ...siteFonts])]

/**
 * The brief as it is kept: points that cite nothing known are dropped, an image or a font outside the lists is
 * replaced, and the person is told what was taken out.
 */
export function cleanBrief(out: BriefOutput, known: { ids: ReadonlySet<string>; assets: ReadonlySet<string>; fonts: readonly string[]; hasBooking: boolean; hasPhone: boolean; hasEmail: boolean }): { brief: Brief; notes: string[] } {
  const notes: string[] = []
  let dropped = 0
  const sections = out.sections.map((s) => {
    const points = keepEvidenced(s.points, known.ids)
    dropped += s.points.length - points.length
    return { kind: s.kind, title: s.title.trim(), points: points.map((p) => ({ text: p.text.trim(), evidence: p.evidence })) }
  })
  if (dropped) notes.push(`${dropped} point${dropped > 1 ? "s" : ""} du brief ne citai${dropped > 1 ? "ent" : "t"} aucune source connue : retiré${dropped > 1 ? "s" : ""}.`)
  const changes = keepEvidenced(out.changes, known.ids).map((c) => ({ text: c.text.trim(), evidence: c.evidence }))
  if (!changes.length) notes.push("Aucun changement par rapport au site actuel n’était sourcé : à compléter avant la génération.")
  const fonts = new Set(known.fonts)
  const heading = fonts.has(out.fonts.heading) ? out.fonts.heading : DEFAULT_FONTS.heading
  const body = fonts.has(out.fonts.body) ? out.fonts.body : DEFAULT_FONTS.body
  const images = out.images.filter((i) => known.assets.has(i.name)).map((i) => ({ name: i.name, use: i.use, alt: i.alt.trim() }))
  // The main button only promises what exists.
  const ctaKind = out.cta.kind === "booking" && !known.hasBooking ? (known.hasPhone ? "phone" : "email") : out.cta.kind === "phone" && !known.hasPhone ? (known.hasEmail ? "email" : "phone") : out.cta.kind
  return {
    brief: {
      positioning: out.positioning.trim(),
      audience: out.audience.trim(),
      tone: out.tone.trim(),
      headline: out.headline.trim(),
      subheadline: out.subheadline.trim(),
      sections: sections.length >= 3 ? sections : [...sections, ...Array.from({ length: 3 - sections.length }, () => ({ kind: "contact" as const, title: "Contact", points: [] }))],
      palette: { primary: out.palette.primary.toLowerCase(), accent: out.palette.accent?.toLowerCase() ?? null, why: out.palette.why.trim() },
      fonts: { heading, body, why: out.fonts.why.trim() },
      images,
      cta: { kind: ctaKind, label: out.cta.label.trim() },
      changes: changes.length ? changes : [{ text: "À compléter : ce que la maquette améliore par rapport au site actuel.", evidence: [] }],
      notes: "",
    },
    notes,
  }
}
