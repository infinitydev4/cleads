import { z } from "zod"

/**
 * The BODACC (Bulletin officiel des annonces civiles et commerciales) as open data from the DILA, on Opendatasoft:
 * every notice of the commercial registers, published each working day, free and without a key (Licence Ouverte
 * Etalab 2.0). Read by publication day; only what a fiche needs is kept. Deposits of accounts are never read.
 * The notices cover the RCS: a sole trader registered only as a craftsman or a liberal profession is not in them.
 */
export const BODACC_SOURCE = "BODACC"
export const BODACC_ENDPOINT = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records"
const PAGE = 100
/** Opendatasoft refuses offset + limit above 10 000. */
const MAX_OFFSET = 9_900

export const FAMILIES = ["creation", "immatriculation", "vente", "modification", "collective", "radiation"] as const
export type BodaccFamily = (typeof FAMILIES)[number]

export interface BodaccNotice {
  id: string
  family: BodaccFamily
  /** YYYY-MM-DD */
  publishedOn: string
  department: string | null
  /** SIRENs the notice names, the company itself first (a sale also names the seller). */
  sirens: string[]
  name: string
  tradeName: string | null
  postalCode: string | null
  city: string | null
  activity: string | null
  /** Start of activity (creations, sales), YYYY-MM-DD. */
  startedOn: string | null
  /** Collective proceedings: the judgment. */
  judgment: { nature: string; date: string | null } | null
  /** Modifications and registrations: what happened, as the register words it. */
  change: string | null
  /** Sales: who sold the business. */
  seller: { name: string; siren: string | null } | null
  url: string
}

const record = z
  .object({
    id: z.string(),
    dateparution: z.string(),
    familleavis: z.string(),
    numerodepartement: z.string().nullish(),
    commercant: z.string().nullish(),
    ville: z.string().nullish(),
    cp: z.string().nullish(),
    registre: z.array(z.string()).nullish(),
    listepersonnes: z.string().nullish(),
    listeetablissements: z.string().nullish(),
    acte: z.string().nullish(),
    jugement: z.string().nullish(),
    modificationsgenerales: z.string().nullish(),
    listeprecedentproprietaire: z.string().nullish(),
    listeprecedentexploitant: z.string().nullish(),
    url_complete: z.string().nullish(),
  })
  .passthrough()
const page = z.object({ total_count: z.number().default(0), results: z.array(z.unknown()).default([]) }).passthrough()

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
/** The notices keep their structured parts as JSON text: read leniently, never trusted to have every field. */
function parsed(text: string | null | undefined): Obj {
  if (!text) return {}
  try {
    const v: unknown = JSON.parse(text)
    return isObj(v) ? v : {}
  } catch {
    return {}
  }
}
const first = (v: unknown): Obj => (Array.isArray(v) ? (isObj(v[0]) ? v[0] : {}) : isObj(v) ? v : {})
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const words = (v: unknown): string | null => (Array.isArray(v) ? str(v.filter((x) => typeof x === "string").join(" ")) : str(v))
const day = (v: unknown): string | null => {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}
const sirenOf = (v: unknown): string | null => {
  const s = str(v)?.replace(/\s/g, "")
  return s && /^\d{9}$/.test(s) ? s : null
}

/** A person of the notice: a company's name, or a sole trader's first and last names. */
function personName(p: Obj): string | null {
  if (p.typePersonne === "pm" || p.denomination) return str(p.denomination)
  const given = words(p.prenom)?.split(/\s+/)[0] ?? null
  const family = str(p.nomUsage) ?? str(p.nom)
  return [given, family].filter(Boolean).join(" ") || null
}

export function parseNotice(raw: unknown): BodaccNotice | null {
  const r = record.safeParse(raw)
  if (!r.success || !(FAMILIES as readonly string[]).includes(r.data.familleavis)) return null
  const d = r.data
  const person = first(parsed(d.listepersonnes).personne)
  const place = first(parsed(d.listeetablissements).etablissement)
  const address = isObj(place.adresse) ? place.adresse : {}
  const act = parsed(d.acte)
  const judgment = parsed(d.jugement)
  const change = str(parsed(d.modificationsgenerales).descriptif)
  const registration = isObj(act.immatriculation) ? str(act.immatriculation.categorieImmatriculation) : null
  const previous = first(parsed(d.listeprecedentproprietaire ?? d.listeprecedentexploitant).personne)
  const sirens = [...new Set((d.registre ?? []).map(sirenOf).filter((s): s is string => !!s))]
  const sellerSiren = isObj(previous.numeroImmatriculation) ? sirenOf(previous.numeroImmatriculation.numeroIdentification) : null
  const sellerName = personName(previous)
  return {
    id: d.id,
    family: d.familleavis as BodaccFamily,
    publishedOn: d.dateparution.slice(0, 10),
    department: str(d.numerodepartement),
    sirens,
    name: personName(person) ?? str(d.commercant)?.split(",")[0] ?? "Entreprise",
    tradeName: str(person.nomCommercial),
    postalCode: str(address.codePostal) ?? str(d.cp)?.split(",")[0]?.trim() ?? null,
    city: str(address.ville) ?? str(d.ville)?.split(",")[0]?.trim() ?? null,
    activity: str(place.activite) ?? str(person.activite),
    startedOn: day(act.dateCommencementActivite),
    judgment: str(judgment.nature) ? { nature: str(judgment.nature)!, date: day(judgment.date) } : null,
    change: change ?? registration ?? str(act.descriptif),
    seller: sellerName ? { name: sellerName, siren: sellerSiren } : null,
    url: str(d.url_complete) ?? `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:${d.id}`,
  }
}

export interface BodaccQuery {
  families: readonly BodaccFamily[]
  /** Département codes; every département when empty. */
  departments?: readonly string[]
  /** Inclusive publication days, YYYY-MM-DD. */
  from: string
  to: string
}

export interface BodaccDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  signal?: AbortSignal
}

const quoted = (values: readonly string[]) => values.map((v) => `"${v.replace(/[^0-9A-Za-z]/g, "")}"`).join(",")

/** The ODSQL filter of a query; the values are reduced to safe characters before being quoted. */
export function whereOf(q: BodaccQuery): string {
  const parts = [`familleavis in (${quoted(q.families)})`, `dateparution >= date'${q.from.slice(0, 10)}'`, `dateparution <= date'${q.to.slice(0, 10)}'`]
  if (q.departments?.length) parts.push(`numerodepartement in (${quoted(q.departments)})`)
  return parts.join(" and ")
}

/**
 * Every notice of the query, oldest first, page after page. A day with more notices than Opendatasoft's offset limit
 * is read day by day by the caller (the morning sweep). Throws on an HTTP error: the caller retries at its next pass.
 */
export async function fetchNotices(q: BodaccQuery, deps: BodaccDeps = {}): Promise<{ notices: BodaccNotice[]; total: number; truncated: boolean }> {
  const notices: BodaccNotice[] = []
  let total = 0
  for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE) {
    const params = new URLSearchParams({ where: whereOf(q), order_by: "dateparution asc, id asc", limit: String(PAGE), offset: String(offset) })
    const signal = deps.signal ? AbortSignal.any([deps.signal, AbortSignal.timeout(deps.timeoutMs ?? 20_000)]) : AbortSignal.timeout(deps.timeoutMs ?? 20_000)
    const res = await (deps.fetchImpl ?? fetch)(`${BODACC_ENDPOINT}?${params}`, { signal, headers: { Accept: "application/json" } })
    if (!res.ok) throw new Error(`Le BODACC a répondu ${res.status}`)
    const body = page.parse(await res.json())
    total = body.total_count
    for (const raw of body.results) {
      const n = parseNotice(raw)
      if (n) notices.push(n)
    }
    if (body.results.length < PAGE || offset + PAGE >= total) return { notices, total, truncated: false }
  }
  return { notices, total, truncated: true }
}
