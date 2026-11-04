import type { LegalState, SignalKind } from "@prisma/client"
import type { BodaccFamily, BodaccNotice } from "@/features/enrichment/sources/bodacc"

/**
 * Company signals (E30): what a BODACC notice says about a company, turned into one dated sentence by code. No model
 * reads or writes them. Safe in the browser.
 */
export const SIGNAL_LABELS: Record<SignalKind, string> = {
  CREATED: "Création",
  TAKEOVER: "Reprise",
  NEW_LEADER: "Nouveau dirigeant",
  MOVED: "Déménagement",
  NEW_SITE: "Nouvel établissement",
  INSOLVENCY: "Procédure collective",
  CLOSED: "Radiation ou dissolution",
  GEO_ABSENT: "Absente des moteurs de réponse",
}

/** A signal counts as recent for 90 days after its publication, and is purged after a year. */
export const RECENT_DAYS = 90
export const PURGE_DAYS = 365

/** What a watch can look for: new companies, and businesses that changed hands. */
export const WATCH_KINDS = ["CREATED", "TAKEOVER"] as const satisfies readonly SignalKind[]
export type WatchKind = (typeof WATCH_KINDS)[number]
export const WATCH_FAMILIES: Record<WatchKind, BodaccFamily[]> = { CREATED: ["creation"], TAKEOVER: ["vente"] }

export interface SignalDraft {
  siren: string
  kind: SignalKind
  /** YYYY-MM-DD */
  occurredAt: string
  publishedOn: string
  summary: string
  details: Record<string, string>
  externalKey: string
  sourceUrl: string
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)
const frDay = (iso: string) => {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
const norm = (s: string | null) => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** What a modification or a registration means for prospecting; null when it says nothing useful (capital…). */
export function changeKind(text: string | null): SignalKind | null {
  const t = norm(text)
  if (!t) return null
  if (/dissolution|cessation d.activite|mise en sommeil/.test(t)) return "CLOSED"
  if (/administration|dirigeant|gerant|president/.test(t)) return "NEW_LEADER"
  if (/transfert|nouveau siege|adresse du siege/.test(t)) return "MOVED"
  if (/etablissement (secondaire|principal)|nouvel etablissement|ouverture/.test(t)) return "NEW_SITE"
  return null
}

/** A merger, a split or a contribution of assets, published among the sales. */
export const isRestructuring = (text: string | null) => /fusion|scission|apport partiel/.test(norm(text))

/** What a judgment of collective proceedings means: closed for want of assets, otherwise still under proceedings. */
export const judgmentKind = (nature: string): SignalKind => (/insuffisance d.actif/.test(norm(nature)) ? "CLOSED" : "INSOLVENCY")

/**
 * A company in collective proceedings or closed is not prospected (D49), unless an owner or a manager chose to after
 * that state was recorded: a newer judgment blocks it again.
 */
export function legallyBlocked(c: { legalState: LegalState; legalStateAt: Date | string | null; legalOverrideAt: Date | string | null } | null | undefined): boolean {
  if (!c || c.legalState === "ACTIVE") return false
  if (!c.legalOverrideAt) return true
  return !!c.legalStateAt && new Date(c.legalStateAt).getTime() > new Date(c.legalOverrideAt).getTime()
}

export const LEGAL_STATE_LABELS: Record<LegalState, string> = { ACTIVE: "Active", INSOLVENT: "Procédure collective", CLOSED: "Fermée ou radiée" }

/** The legal state a signal sets, if any. */
export function legalStateOf(kind: SignalKind): LegalState | null {
  if (kind === "INSOLVENCY") return "INSOLVENT"
  if (kind === "CLOSED") return "CLOSED"
  return null
}

/** One signal per company the notice names. */
export function signalsOf(n: BodaccNotice): SignalDraft[] {
  const main = n.sirens[0]
  if (!main) return []
  const base = { publishedOn: n.publishedOn, externalKey: `bodacc:${n.id}`, sourceUrl: n.url }
  const details: Record<string, string> = {}
  if (n.activity) details.activity = clip(n.activity, 300)
  if (n.city) details.city = n.city
  if (n.tradeName) details.tradeName = n.tradeName
  const what = n.activity ? ` « ${clip(n.activity, 120)} »` : ""
  const where = n.city ? ` (${n.city})` : ""
  const one = (kind: SignalKind, summary: string, occurredAt = n.publishedOn): SignalDraft[] => [{ ...base, siren: main, kind, occurredAt, summary, details }]

  switch (n.family) {
    case "creation":
      return one("CREATED", `Création${n.tradeName ? ` de « ${n.tradeName} »` : ""}${what}${where}${n.startedOn ? `, activité commencée le ${frDay(n.startedOn)}` : ""}.`, n.startedOn ?? n.publishedOn)
    case "immatriculation": {
      const kind = changeKind(n.change)
      if (kind === "MOVED") return one("MOVED", `Siège transféré${where}.`)
      if (kind === "NEW_SITE") return one("NEW_SITE", `Nouvel établissement${what}${where}.`)
      return []
    }
    case "vente": {
      // Mergers, splits and contributions are published with the sales: no business changes hands to a new owner there.
      if (isRestructuring(n.change)) return []
      const out = one("TAKEOVER", `Reprise du fonds${what}${where}${n.seller ? `, cédé par ${n.seller.name}` : ""}.`, n.startedOn ?? n.publishedOn)
      if (n.seller) out[0].details = { ...details, seller: n.seller.name }
      const sellerSiren = n.seller?.siren ?? n.sirens[1]
      if (sellerSiren && sellerSiren !== main) {
        out.push({ ...base, siren: sellerSiren, kind: "TAKEOVER", occurredAt: n.startedOn ?? n.publishedOn, summary: `Cession du fonds${what}${where} à ${n.name}.`, details: { ...details, role: "seller", buyer: n.name } })
      }
      return out
    }
    case "modification": {
      const kind = changeKind(n.change)
      if (!kind) return []
      const text = { CLOSED: "Dissolution ou cessation d'activité.", NEW_LEADER: "Changement dans la direction.", MOVED: `Siège transféré${where}.`, NEW_SITE: `Nouvel établissement${where}.` } as Partial<Record<SignalKind, string>>
      return one(kind, text[kind] ?? clip(n.change ?? "", 160))
    }
    case "collective": {
      if (!n.judgment) return one("INSOLVENCY", "Procédure collective publiée.")
      const kind = judgmentKind(n.judgment.nature)
      return one(kind, `${kind === "CLOSED" ? "Liquidation clôturée" : "Procédure collective"} : ${clip(n.judgment.nature, 140)}${n.judgment.date ? ` (${frDay(n.judgment.date)})` : ""}.`, n.judgment.date ?? n.publishedOn)
    }
    case "radiation":
      return one("CLOSED", "Radiée du registre du commerce et des sociétés.")
  }
}

// ── Sectors of a watch ─────────────────────────────────────────────────────────────────────────────────────────

/** An Extractor sector as a watch keeps it: its NAF codes, and the words its activity is described with. */
export interface WatchSector {
  key: string
  label: string
  naf: string[]
  keywords: string[]
}

/** Word starts that recognise a sector in a notice's free-text activity (« plomberie » for « plombier »). */
export function sectorStems(s: WatchSector): string[] {
  const out = new Set<string>()
  for (const phrase of [s.label, ...s.keywords]) {
    for (const word of norm(phrase).split(/[^a-z]+/)) if (word.length >= 4) out.add(word.slice(0, 5))
  }
  return [...out]
}

/** Words that start like a trade without being one: a « chauffeur » is no heating engineer. */
const FALSE_FRIENDS = ["chauffeur", "electron", "electoral"]

/** Does a notice's activity name one of the sectors? Words must start with a stem: « prestation » is no restaurant. */
export function activityMatches(activity: string | null, sectors: readonly WatchSector[]): boolean {
  if (!sectors.length) return true
  const tokens = norm(activity).split(/[^a-z]+/).filter((t) => t && !FALSE_FRIENDS.some((f) => t.startsWith(f)))
  return sectors.some((s) => sectorStems(s).some((stem) => tokens.some((t) => t.startsWith(stem))))
}

/** A company whose registered activity code is one of the sectors'. */
export const nafMatches = (naf: string | null, sectors: readonly WatchSector[]) => !sectors.length || (!!naf && sectors.some((s) => s.naf.includes(naf)))

// ── Headcount bands (INSEE) ────────────────────────────────────────────────────────────────────────────────────

export const HEADCOUNT_LABELS: Record<string, string> = {
  NN: "sans salarié",
  "00": "0 salarié",
  "01": "1 ou 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
  "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés",
  "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
}
export const headcountLabel = (band: string | null | undefined) => (band ? (HEADCOUNT_LABELS[band] ?? null) : null)
