import { keepEvidenced } from "@/features/prospect-audit/analysis"
import { AREA_LABELS, SEVERITY_LABELS } from "@/features/prospect-audit/labels"
import type { Finding } from "@/features/prospect-audit/schemas"
import { TEAM_NOTE } from "./document"
import { CATALOG_FAMILIES, DEFAULT_FONTS } from "./fonts"
import { parseColor, toHex } from "./palette"
import { BRIEF_LIMITS, clipText, type Brief, type BriefOutput, type Collected } from "./schemas"

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

const FALLBACK_PRIMARY = "#2563eb"

/**
 * The brief as it is kept: points that cite nothing known are dropped, notes for the team are moved to « à vérifier »,
 * texts are clipped to what the brief allows, an image or a font outside the lists is replaced, and the person is told
 * what was taken out.
 */
export function cleanBrief(out: BriefOutput, known: { ids: ReadonlySet<string>; assets: ReadonlySet<string>; fonts: readonly string[]; hasBooking: boolean; hasPhone: boolean; hasEmail: boolean }): { brief: Brief; notes: string[] } {
  const notes: string[] = []
  const toCheck = out.toCheck.map((t) => clipText(t, BRIEF_LIMITS.check)).filter((t) => t.length >= 2)
  let dropped = 0
  let moved = 0
  const sections = out.sections.slice(0, 9).map((s) => {
    // A note for the team is moved, whatever it cites; a point for visitors stays only if its source exists.
    const visitor = s.points.filter((p) => {
      if (!TEAM_NOTE.test(p.text)) return true
      toCheck.push(clipText(p.text, BRIEF_LIMITS.check))
      moved++
      return false
    })
    const points = keepEvidenced(visitor, known.ids)
    dropped += visitor.length - points.length
    return { kind: s.kind, title: clipText(s.title, BRIEF_LIMITS.title), points: points.slice(0, 8).map((p) => ({ text: clipText(p.text, BRIEF_LIMITS.point), evidence: p.evidence.slice(0, 4) })) }
  })
  if (dropped) notes.push(`${dropped} point${dropped > 1 ? "s" : ""} du brief ne citai${dropped > 1 ? "ent" : "t"} aucune source connue : retiré${dropped > 1 ? "s" : ""}.`)
  if (moved) notes.push(`${moved} point${moved > 1 ? "s" : ""} s’adressai${moved > 1 ? "ent" : "t"} à l’équipe plutôt qu’aux visiteurs : déplacé${moved > 1 ? "s" : ""} dans « À vérifier ».`)
  const changes = keepEvidenced(out.changes, known.ids)
    .slice(0, 6)
    .map((c) => ({ text: clipText(c.text, BRIEF_LIMITS.point), evidence: c.evidence.slice(0, 4) }))
  if (!changes.length) notes.push("Aucun changement par rapport au site actuel n’était sourcé : à compléter avant la génération.")
  const fonts = new Set(known.fonts)
  const heading = fonts.has(out.fonts.heading) ? out.fonts.heading : DEFAULT_FONTS.heading
  const body = fonts.has(out.fonts.body) ? out.fonts.body : DEFAULT_FONTS.body
  const images = out.images
    .filter((i) => known.assets.has(i.name))
    .slice(0, 10)
    .map((i) => ({ name: i.name, use: i.use, alt: clipText(i.alt, BRIEF_LIMITS.alt) }))
  const primary = parseColor(out.palette.primary)
  const accent = out.palette.accent ? parseColor(out.palette.accent) : null
  if (!primary) notes.push("La couleur principale proposée était illisible : une couleur neutre la remplace, à choisir.")
  // The main button only promises what exists.
  const ctaKind = out.cta.kind === "booking" && !known.hasBooking ? (known.hasPhone ? "phone" : "email") : out.cta.kind === "phone" && !known.hasPhone ? (known.hasEmail ? "email" : "phone") : out.cta.kind
  const label = clipText(out.cta.label, BRIEF_LIMITS.cta)
  return {
    brief: {
      positioning: clipText(out.positioning, BRIEF_LIMITS.positioning).padEnd(10, "."),
      audience: clipText(out.audience, BRIEF_LIMITS.audience),
      tone: clipText(out.tone, BRIEF_LIMITS.tone),
      headline: clipText(out.headline, BRIEF_LIMITS.headline).padEnd(4, "."),
      subheadline: clipText(out.subheadline, BRIEF_LIMITS.subheadline),
      sections: sections.length >= 3 ? sections : [...sections, ...Array.from({ length: 3 - sections.length }, () => ({ kind: "contact" as const, title: "Contact", points: [] }))],
      palette: { primary: primary ? toHex(primary) : FALLBACK_PRIMARY, accent: accent ? toHex(accent) : null, why: clipText(out.palette.why, BRIEF_LIMITS.why) },
      fonts: { heading, body, why: clipText(out.fonts.why, BRIEF_LIMITS.why) },
      images,
      cta: { kind: ctaKind, label: label.length >= 2 ? label : "Nous contacter" },
      changes: changes.length ? changes : [{ text: "À compléter : ce que la maquette améliore par rapport au site actuel.", evidence: [] }],
      toCheck: [...new Set(toCheck)].slice(0, 12),
      notes: "",
    },
    notes,
  }
}
