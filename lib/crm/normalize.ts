/**
 * Normalisation shared by the import, the forms and the duplicate detection. Two records describe the same
 * business when their normalised keys match, so every rule here errs on the side of NOT matching:
 * a missed duplicate costs a manual merge, a wrong match loses a prospect.
 */

const strip = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "")

/** Mailbox providers: an address there says nothing about the company. */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com",
  "yahoo.com", "yahoo.fr", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "bbox.fr", "icloud.com",
  "me.com", "aol.com", "gmx.com", "gmx.fr", "protonmail.com", "proton.me", "yandex.com", "mail.com", "club-internet.fr",
])

/** Hosts that are not the business's own site (social pages, directories, free site builders). */
const AGGREGATOR_DOMAINS = [
  "facebook.com", "fb.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com", "tiktok.com",
  "pagesjaunes.fr", "google.com", "g.page", "goo.gl", "maps.app.goo.gl", "tripadvisor.fr", "tripadvisor.com", "yelp.com",
  "business.site", "wixsite.com", "wix.com", "weebly.com", "jimdofree.com", "sites.google.com", "linktr.ee", "doctolib.fr",
  "societe.com", "infogreffe.fr", "pappers.fr", "mappy.com", "thefork.fr", "ubereats.com", "booking.com",
]

const GENERIC_LOCALS = new Set([
  "contact", "info", "infos", "information", "accueil", "bonjour", "hello", "hi", "commercial", "commerciale", "vente", "ventes",
  "direction", "admin", "administration", "secretariat", "support", "service", "reservation", "reservations", "resa", "rdv",
  "agence", "cabinet", "boutique", "magasin", "compta", "comptabilite", "devis", "mail", "email", "office", "sales", "team",
  "societe", "entreprise", "client", "clients", "gestion", "facturation", "rh", "recrutement", "webmaster", "noreply", "no-reply",
])

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Scraped pages leave percent-encoding behind ("%20jb@site.fr"): decode before looking for the address.
  let value = raw
  if (/%[0-9a-f]{2}/i.test(value)) {
    try {
      value = decodeURIComponent(value)
    } catch {
      /* not valid percent-encoding: keep it as is, validation will refuse it */
    }
  }
  const first = value.replace(/^mailto:/i, "").split(/[;,\s]+/).find(Boolean)
  const email = first?.trim().toLowerCase()
  return email && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) && email.length <= 254 ? email : null
}

export const emailDomain = (email: string) => email.slice(email.lastIndexOf("@") + 1)

export function isFreeEmailDomain(domain: string) {
  return FREE_EMAIL_DOMAINS.has(domain)
}

function isAggregator(host: string) {
  return AGGREGATOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/** Registrable-looking host of a website, without "www.". Null for social pages, directories and anything that is not a site. */
export function domainFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value || /\s/.test(value)) return null
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "")
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || isAggregator(host)) return null
    return host
  } catch {
    return null
  }
}

/** Domain to match companies on: the website first, else the domain of a company mailbox (never a free provider). */
export function companyDomain(website: string | null | undefined, email: string | null | undefined): string | null {
  const fromSite = domainFromUrl(website)
  if (fromSite) return fromSite
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const domain = emailDomain(normalized)
  return isFreeEmailDomain(domain) || isAggregator(domain) ? null : domain
}

/**
 * Canonical phone: "+33…" for French numbers (0X…, 0033…, +33…), "+…" for other international numbers, null otherwise.
 * Numbers in a country other than France must carry their international prefix.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`
  if (digits.startsWith("+")) {
    const d = digits.slice(1).replace(/\D/g, "")
    if (d.startsWith("0")) return null // no country code starts with 0
    if (d.startsWith("330")) return d.length === 12 ? `+33${d.slice(3)}` : null
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null
  }
  return /^0[1-9]\d{8}$/.test(digits) ? `+33${digits.slice(1)}` : null
}

/** "+33123456789" to "01 23 45 67 89"; other numbers are shown as stored. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ""
  const m = /^\+33([1-9]\d{8})$/.exec(phone)
  return m ? `0${m[1]}`.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : phone
}

const LEGAL_FORMS = /\b(sarl|sas|sasu|eurl|sa|snc|sci|scp|selarl|ei|eirl|ltd|llc|gmbh|inc)\b/g

/** Lower case, no accents, no legal form, no punctuation: "Éts. Dupont & Fils SARL" gives "ets dupont fils". */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return ""
  return strip(raw)
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(LEGAL_FORMS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

/** Name plus city: two shops of the same chain in different cities are different prospects. Null when there is not enough to be sure. */
export function nameKey(name: string | null | undefined, city: string | null | undefined): string | null {
  const n = normalizeName(name)
  const c = normalizeName(city)
  return n.length >= 3 && c.length >= 2 ? `${n}|${c}` : null
}

/** 14 digits and a valid Luhn checksum. */
export function normalizeSiret(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\s/g, "")
  if (!/^\d{14}$/.test(digits)) return null
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let d = Number(digits[i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0 ? digits : null
}

export type EmailKindGuess = "NOMINATIVE" | "GENERIC" | "UNKNOWN"

/** prenom.nom@ is nominative, contact@ is generic, anything else is left to a human. */
export function inferEmailKind(email: string | null | undefined): EmailKindGuess {
  const normalized = normalizeEmail(email)
  if (!normalized) return "UNKNOWN"
  const local = strip(normalized.split("@")[0])
  if (GENERIC_LOCALS.has(local) || GENERIC_LOCALS.has(local.replace(/\d+$/, ""))) return "GENERIC"
  return /^[a-z]{2,}[._-][a-z]{2,}$/.test(local) ? "NOMINATIVE" : "UNKNOWN"
}

export function normalizeTags(input: string[] | string | null | undefined): string[] {
  const list = Array.isArray(input) ? input : (input ?? "").split(/[,;|]/)
  return [...new Set(list.map((t) => strip(t).toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")).filter((t) => t.length > 0 && t.length <= 30))].slice(0, 20)
}
