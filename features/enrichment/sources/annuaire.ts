import { z } from "zod"
import { normalizeName } from "@/lib/crm/normalize"

/**
 * The Annuaire des entreprises (recherche-entreprises.api.gouv.fr, public data from INSEE and the RNE, free, no key):
 * SIREN, activity code, legal form, creation date, labels, and the company's officers. Officers are proposed as
 * contacts only when the company did not object to commercial use of its data and its record is fully public; an
 * email address is never guessed. Shared by the audit (E20) and the registry enrichment (E30).
 */
export const ANNUAIRE_SOURCE = "Annuaire des entreprises (recherche-entreprises.api.gouv.fr)"
export const LEGAL_BASIS = "Intérêt légitime (RGPD art. 6.1.f) : prospection B2B d'un dirigeant, données publiques du registre"

export interface Officer {
  name: string
  role: string | null
}

export interface CompanyRecord {
  siren: string
  /** The head office's SIRET. */
  siret: string | null
  name: string
  naf: string | null
  legalForm: string | null
  createdOn: string | null
  active: boolean
  employees: string | null
  /** INSEE category: PME, ETI or GE. */
  category: string | null
  /** False when the record is partly public: the company asked for its data not to be reused. */
  diffusible: boolean
  postalCode: string | null
  city: string | null
  /** Labels the registry lists: RGE, Qualiopi, organic, health establishments… */
  labels: string[]
  /** The company objected to commercial use of its data: no officer is proposed. */
  opposition: boolean
  officers: Officer[]
  url: string
}

const officer = z
  .object({ nom: z.string().nullish(), prenoms: z.string().nullish(), qualite: z.string().nullish(), type_dirigeant: z.string().nullish(), denomination: z.string().nullish() })
  .passthrough()

const result = z
  .object({
    siren: z.string(),
    nom_complet: z.string().nullish(),
    nom_raison_sociale: z.string().nullish(),
    activite_principale: z.string().nullish(),
    nature_juridique: z.string().nullish(),
    date_creation: z.string().nullish(),
    etat_administratif: z.string().nullish(),
    tranche_effectif_salarie: z.string().nullish(),
    categorie_entreprise: z.string().nullish(),
    statut_diffusion: z.string().nullish(),
    opposition_diffusion_commerciale: z.boolean().nullish(),
    siege: z
      .object({ siret: z.string().nullish(), code_postal: z.string().nullish(), libelle_commune: z.string().nullish(), nom_commercial: z.string().nullish(), liste_enseignes: z.array(z.string()).nullish() })
      .passthrough()
      .nullish(),
    dirigeants: z.array(officer).nullish(),
    complements: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough()

const responseSchema = z.object({ results: z.array(result).default([]) }).passthrough()
type Result = z.infer<typeof result>

const LABELS: [string, string][] = [
  ["est_rge", "RGE"],
  ["est_qualiopi", "Qualiopi"],
  ["est_bio", "Agriculture biologique"],
  ["est_finess", "Établissement de santé (FINESS)"],
  ["est_ess", "Économie sociale et solidaire"],
  ["est_societe_mission", "Société à mission"],
  ["est_entrepreneur_spectacle", "Entrepreneur de spectacles"],
]

const capitalize = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())

function officersOf(r: Result): Officer[] {
  return (r.dirigeants ?? [])
    .filter((d) => d.type_dirigeant === "personne physique" && d.nom && d.prenoms && !/non[- ]diffusible/i.test(`${d.nom} ${d.prenoms}`))
    .slice(0, 3)
    .map((d) => ({ name: `${capitalize(d.prenoms!.split(/\s+/)[0])} ${capitalize(d.nom!)}`, role: d.qualite ? capitalize(d.qualite).slice(0, 80) : null }))
}

function toRecord(r: Result): CompanyRecord {
  const opposition = r.opposition_diffusion_commerciale === true
  const diffusible = (r.statut_diffusion ?? "O") === "O"
  const complements = r.complements ?? {}
  return {
    siren: r.siren,
    siret: r.siege?.siret ?? null,
    name: r.nom_complet ?? r.nom_raison_sociale ?? r.siren,
    naf: r.activite_principale ?? null,
    legalForm: r.nature_juridique ?? null,
    createdOn: r.date_creation ?? null,
    active: (r.etat_administratif ?? "A") === "A",
    employees: r.tranche_effectif_salarie ?? null,
    category: r.categorie_entreprise ?? null,
    diffusible,
    postalCode: r.siege?.code_postal ?? null,
    city: r.siege?.libelle_commune ?? null,
    labels: LABELS.filter(([k]) => complements[k] === true).map(([, label]) => label),
    opposition,
    officers: opposition || !diffusible ? [] : officersOf(r),
    url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`,
  }
}

/** The company the fiche is about: by SIREN when known, otherwise by name in the same postal code, never a guess. */
export function pickCompany(json: unknown, query: { siren?: string | null; name: string; postalCode?: string | null }): CompanyRecord | null {
  const parsed = responseSchema.safeParse(json)
  if (!parsed.success) return null
  const results = parsed.data.results
  if (query.siren) {
    const hit = results.find((r) => r.siren === query.siren)
    return hit ? toRecord(hit) : null
  }
  if (!query.postalCode) return null
  const wanted = normalizeName(query.name)
  if (!wanted) return null
  const names = (r: Result) => [r.nom_complet, r.nom_raison_sociale, r.siege?.nom_commercial, ...(r.siege?.liste_enseignes ?? [])].map((n) => normalizeName(n ?? "")).filter(Boolean)
  const candidates = results.filter((r) => r.siege?.code_postal === query.postalCode && names(r).some((n) => n === wanted || n.includes(wanted) || wanted.includes(n)))
  const exact = candidates.filter((r) => names(r).includes(wanted))
  const chosen = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null
  return chosen ? toRecord(chosen) : null
}

export interface AnnuaireDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function findCompany(query: { siren?: string | null; name: string; postalCode?: string | null }, deps: AnnuaireDeps = {}): Promise<{ record: CompanyRecord | null; error: string | null }> {
  const siren = query.siren?.replace(/\D/g, "").slice(0, 9) || null
  if (!siren && !query.postalCode) return { record: null, error: "Ni SIREN ni code postal : recherche dans l'annuaire impossible sans risque d'erreur" }
  const params = new URLSearchParams(siren ? { q: siren, per_page: "5" } : { q: query.name.slice(0, 100), code_postal: query.postalCode!, per_page: "10" })
  try {
    const res = await (deps.fetchImpl ?? fetch)(`https://recherche-entreprises.api.gouv.fr/search?${params}`, { signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000), headers: { Accept: "application/json" } })
    if (!res.ok) return { record: null, error: `L'annuaire a répondu ${res.status}` }
    return { record: pickCompany(await res.json(), { ...query, siren }), error: null }
  } catch {
    return { record: null, error: "Annuaire des entreprises injoignable" }
  }
}
