import type { Basis, StrategyBrief, StrategyOutput } from "./schemas"
import { BASES, TARGET_LIMITS } from "./schemas"

/**
 * What the code makes of the Stratège's answer (E25): every target is clipped and checked before it is kept. A target
 * without a single argued point, without a search, or naming an offer that is not active is dropped, and the run says
 * which and why. "Chaque proposition de secteur est argumentée" is enforced here, not hoped for.
 */
export interface TargetDraft {
  rank: number
  sector: string
  sectorKey: string | null
  zones: string[]
  pains: string[]
  offerId: string
  offerName: string
  angle: string
  rationale: { text: string; basis: Basis }[]
  campaignName: string
  activity: string
  location: string
  maxResults: number
  knownCount: number | null
}

const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}
const list = (items: readonly string[] | undefined, max: number, each: number) => [...new Set((items ?? []).map((x) => clip(x, each)).filter(Boolean))].slice(0, max)
const SECTOR_KEY = /^[a-z0-9][a-z0-9_.-]{0,59}$/
export const DEFAULT_RESULTS = 100

export function cleanTargets(
  output: StrategyOutput,
  offers: ReadonlyMap<string, { id: string; name: string }>,
  sectorKeys: ReadonlySet<string> | null
): { targets: TargetDraft[]; dropped: string[] } {
  const targets: TargetDraft[] = []
  const dropped: string[] = []
  const searches = new Set<string>()
  for (const t of output.targets ?? []) {
    const sector = clip(t.sector, TARGET_LIMITS.sector)
    const label = sector || "cible sans secteur"
    if (targets.length >= TARGET_LIMITS.targets) {
      dropped.push(`${label} : au-delà de ${TARGET_LIMITS.targets} cibles`)
      continue
    }
    const offer = offers.get(t.offer)
    const rationale = (t.rationale ?? [])
      .map((r) => ({ text: clip(r.text, TARGET_LIMITS.point), basis: (BASES as readonly string[]).includes(r.basis) ? r.basis : "hypothesis" }))
      .filter((r) => r.text)
      .slice(0, TARGET_LIMITS.rationale) as TargetDraft["rationale"]
    const activity = clip(t.search?.activity, TARGET_LIMITS.activity)
    const location = clip(t.search?.location, TARGET_LIMITS.location)
    const why = !sector ? "sans secteur" : !offer ? `offre « ${t.offer} » inconnue ou non active` : !rationale.length ? "aucun argument" : activity.length < 2 || location.length < 2 ? "sans recherche à lancer" : null
    const key = `${activity.toLowerCase()}|${location.toLowerCase()}`
    if (why || searches.has(key)) {
      dropped.push(`${label} : ${why ?? "même recherche qu'une autre cible"}`)
      continue
    }
    searches.add(key)
    const zones = list(t.zones, TARGET_LIMITS.zones, TARGET_LIMITS.zone)
    const rawKey = t.sectorKey?.trim().toLowerCase() ?? null
    const results = Number.isFinite(t.search.maxResults) ? Math.round(t.search.maxResults) : DEFAULT_RESULTS
    targets.push({
      rank: targets.length + 1,
      sector,
      sectorKey: rawKey && SECTOR_KEY.test(rawKey) && (!sectorKeys || sectorKeys.has(rawKey)) ? rawKey : null,
      zones: zones.length ? zones : [location],
      pains: list(t.pains, TARGET_LIMITS.pains, TARGET_LIMITS.pain),
      offerId: offer!.id,
      offerName: offer!.name,
      angle: clip(t.angle, TARGET_LIMITS.angle),
      rationale,
      campaignName: clip(t.campaignName, TARGET_LIMITS.campaignName) || clip(`${sector} — ${zones[0] ?? location}`, TARGET_LIMITS.campaignName),
      activity,
      location,
      maxResults: Math.min(Math.max(results, 10), 1_000),
      knownCount: typeof t.knownCount === "number" && Number.isFinite(t.knownCount) && t.knownCount >= 0 ? Math.round(t.knownCount) : null,
    })
  }
  return { targets, dropped }
}

const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })

/** The question put to the Stratège: the person's brief, or the CRM's own figures alone. */
export function strategyPrompt(brief: StrategyBrief, offerName: string | null, now = new Date()): string {
  return [
    `Nous sommes le ${day.format(now)}. Propose à l'agence deux à quatre cibles de prospection pour les semaines qui viennent.`,
    brief.zone ? `Zone souhaitée par la personne : ${clip(brief.zone, 120)}.` : "Aucune zone imposée : propose celles où l'agence a le plus de chances, d'après ses résultats.",
    offerName ? `Offre à pousser en priorité : ${offerName}.` : null,
    brief.focus ? `Ce que la personne précise : ${clip(brief.focus, 400)}` : null,
    "Méthode :",
    "1. Lis les résultats avec campaign_metrics et le catalogue avec list_offers (seules ces offres peuvent être proposées).",
    "2. Choisis des secteurs dans la taxonomie de l'Extractor (list_sectors) quand c'est possible, et mesure avec search_prospect_base ce que sa base connaît déjà pour le secteur et la zone.",
    "3. Pour chaque cible : secteur et zones, douleurs du métier, offre phare et angle, arguments chacun avec sa base (crm, extractor, catalogue ou hypothesis), nom de campagne et recherche Extractor à lancer (activité, lieu, nombre de résultats).",
    "Tu ne lances rien et tu ne crées rien : une personne valide chaque campagne et chaque recherche. Peu de cibles bien argumentées valent mieux que beaucoup de cibles survolées.",
  ]
    .filter(Boolean)
    .join("\n")
}
