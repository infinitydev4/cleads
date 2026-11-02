import { normalizeName, normalizePhone } from "@/lib/crm/normalize"
import type { OfferSignal } from "@/features/offers/signals"
import type { CompanyRecord } from "./annuaire"
import type { SiteFacts } from "./collect"
import { networkOf } from "./html"
import type { PsiOk, PsiResult } from "./pagespeed"
import type { Area, Evidence, Finding, Point, Scores, Severity, SignalHit, SiteContent } from "./schemas"
import { isBookingSector, isHighIntentSector, isVisualSector } from "./sectors"
import { isOutdatedCms } from "./stack"

/**
 * The measured half of the audit: rules turn facts (pages, PageSpeed, the Google listing, the registry) into findings,
 * sub-scores and offer signals, each with its evidence. The model only adds what needs judgement (the screenshots,
 * the wording of the site); it never invents a measure.
 */
export interface Listing {
  name: string
  phone: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  category: string | null
  city: string | null
  postalCode: string | null
  socials: string[]
  /** The Google Maps page, when the Extractor kept it. */
  sourceUrl: string | null
  fromExtractor: boolean
}

export interface AuditFacts {
  sector: string | null
  listing: Listing
  website: string | null
  /** The "website" is a social profile. */
  socialOnly: boolean
  site: SiteFacts | null
  psi: { mobile: PsiResult | null; desktop: PsiResult | null }
  registry: CompanyRecord | null
  registryError: string | null
}

export interface Measured {
  evidence: Evidence[]
  findings: Finding[]
  strengths: Point[]
  scores: Partial<Scores>
  signals: SignalHit[]
  notes: string[]
  partial: boolean
  /** Identifiers of the screenshots, in the order they are given to the model. */
  captures: { id: string; kind: "mobile" | "desktop" }[]
}

const LOCAL_TYPES = /LocalBusiness|Store|Restaurant|Dentist|Physician|Plumber|Electrician|HomeAndConstructionBusiness|ProfessionalService|AutomotiveBusiness|HealthAndBeautyBusiness|FoodEstablishment|LegalService|MedicalBusiness|Hotel|LodgingBusiness|RealEstateAgent|Locksmith|RoofingContractor|HVACBusiness|GeneralContractor|HousePainter/i
const ms = (v: number | null) => (v == null ? null : `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`)
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const digits = (s: string) => (normalizePhone(s) ?? s).replace(/\D/g, "").slice(-9)

class Book {
  readonly list: Evidence[] = []
  private counters: Record<string, number> = {}
  add(kind: Evidence["kind"], label: string, value: string | null = null, url: string | null = null): string {
    const prefix = { page: "P", measure: "M", capture: "C", source: "S" }[kind]
    this.counters[prefix] = (this.counters[prefix] ?? 0) + 1
    const id = `${prefix}${this.counters[prefix]}`
    this.list.push({ id, kind, label: label.slice(0, 200), value: value?.slice(0, 300) ?? null, url: url?.slice(0, 2_000) ?? null })
    return id
  }
}

export function measure(facts: AuditFacts, content: SiteContent | null, now = new Date()): Measured {
  const book = new Book()
  const findings: Finding[] = []
  const strengths: Point[] = []
  const signals = new Map<OfferSignal, string[]>()
  const notes: string[] = []
  const scores: Partial<Scores> = {}
  let partial = false
  const finding = (area: Area, severity: Severity, title: string, detail: string, evidence: string[]) => findings.push({ area, severity, title, detail, evidence, origin: "measure" })
  const signal = (key: OfferSignal, evidence: string[]) => signals.set(key, [...new Set([...(signals.get(key) ?? []), ...evidence])])

  // Sources first: they are the evidence of what the site cannot prove.
  const l = facts.listing
  const listingKnown = l.fromExtractor || l.rating != null || l.reviewCount != null
  const listingId = book.add(
    "source",
    l.fromExtractor ? "Fiche Google de l'entreprise (via l'Extractor)" : "Fiche du CRM",
    [l.rating != null ? `note ${l.rating.toLocaleString("fr-FR")}/5` : null, l.reviewCount != null ? `${l.reviewCount} avis` : null, l.category].filter(Boolean).join(" · ") || null,
    l.sourceUrl
  )
  const site = facts.site
  const pageIds = (site?.pages ?? []).map((p, i) => book.add("page", i === 0 ? "Page d'accueil" : (p.title ?? "Page du site"), p.title, p.url))
  const home = pageIds[0]

  // ── No site, or a social profile only ──
  if (!facts.website) {
    finding("technique", "high", "Pas de site web", "Aucun site n'est connu pour cette entreprise : les clients qui la cherchent en ligne ne trouvent que sa fiche Google, ou rien.", [listingId])
    signal("no_website", [listingId])
  } else if (facts.socialOnly) {
    const id = book.add("source", "Adresse donnée comme site", facts.website, facts.website)
    finding("technique", "high", "Seulement une page de réseau social", "Le « site » de l'entreprise est une page de réseau social : pas de pages par service, pas de référencement propre, pas de prise de contact maîtrisée.", [id])
    signal("social_only", [id])
  }

  // ── The site ──
  if (site) {
    if (site.blockedByRobots) {
      partial = true
      notes.push(site.failure ?? "robots.txt interdit la lecture du site.")
    } else if (!site.reachable) {
      partial = true
      const id = book.add("measure", "Accès au site", site.failure, site.input)
      finding("technique", "high", "Site injoignable", site.failure ?? "Le site n'a pas pu être lu.", [id])
      signal("site_unreachable", [id])
      notes.push(`${site.failure ?? "Site injoignable"} L'audit du site est donc partiel.`)
    }
  }

  if (site?.reachable && home) {
    const homePage = site.pages[0]
    let technique = 0
    if (site.https) technique += 25
    else {
      const id = book.add("measure", "Protocole", "HTTP, sans chiffrement", site.finalUrl)
      finding("technique", "high", "Le site n'est pas en HTTPS", "Les navigateurs affichent « Non sécurisé » : cela inquiète les visiteurs et pénalise le référencement.", [id])
      signal("no_https", [id])
    }
    if (site.status === 200) technique += 15
    if (site.redirects <= 2) technique += 10
    else finding("technique", "low", `${site.redirects} redirections avant la page d'accueil`, "Chaque redirection ralentit l'arrivée sur le site.", [home])
    if (homePage.title && homePage.title.length >= 10 && homePage.title.length <= 70) technique += 10
    else finding("technique", homePage.title ? "low" : "medium", homePage.title ? "Titre de page trop court ou trop long" : "Pas de titre de page", "Le titre est ce que Google affiche en premier : il doit dire le métier et la ville en moins de 70 caractères.", [home])
    if (homePage.description && homePage.description.length >= 50) technique += 10
    else finding("technique", "medium", "Pas de description pour Google", "Sans méta-description, Google choisit seul le texte affiché sous le lien, souvent mal.", [home])
    if (homePage.h1.length === 1) technique += 10
    else finding("technique", "low", homePage.h1.length ? `${homePage.h1.length} titres principaux (H1)` : "Pas de titre principal (H1)", "Un seul titre principal aide Google à comprendre le sujet de la page.", [home])
    if (site.sitemap) technique += 10
    else finding("technique", "low", "Pas de plan du site (sitemap.xml)", "Le plan du site aide Google à trouver toutes les pages.", [home])
    if (site.robotsFound) technique += 5
    if (homePage.openGraph) technique += 5
    scores.technique = clamp(technique)
    if (site.timeMs != null && site.timeMs > 3_000) {
      const id = book.add("measure", "Temps de réponse du serveur", ms(site.timeMs), site.finalUrl)
      finding("vitesse", "medium", "Serveur lent à répondre", `La page d'accueil a mis ${ms(site.timeMs)} à arriver, avant même de s'afficher.`, [id])
    }

    // Stack and age.
    const stack = site.stack
    if (stack?.cms) {
      const id = book.add("measure", "Outil du site", `${stack.cms.name}${stack.cms.version ? ` ${stack.cms.version}` : ""}`, site.finalUrl)
      if (isOutdatedCms(stack.cms)) {
        finding("technique", "medium", `${stack.cms.name} ${stack.cms.version} n'est plus à jour`, "Une version ancienne de l'outil du site expose à des failles et freine les évolutions.", [id])
        signal("cms_outdated", [id])
      }
    }
    const outdated: string[] = []
    const year = Math.max(...site.pages.map((p) => p.copyrightYear ?? 0))
    if (year > 0 && year <= now.getUTCFullYear() - 3) outdated.push(book.add("measure", "Année de copyright la plus récente", String(year), site.finalUrl))
    if (stack?.jquery && Number(stack.jquery.split(".")[0]) < 3) outdated.push(book.add("measure", "Bibliothèque jQuery", stack.jquery, site.finalUrl))
    if (!homePage.viewport) outdated.push(home)
    if (stack?.cms && isOutdatedCms(stack.cms)) outdated.push(book.list.find((e) => e.label === "Outil du site")!.id)
    if (outdated.length >= 2) signal("site_outdated", outdated)

    // Speed and mobile.
    const mobile = facts.psi.mobile?.ok ? facts.psi.mobile : null
    const desktop = facts.psi.desktop?.ok ? facts.psi.desktop : null
    const perfId = (r: PsiOk) => book.add("measure", `Performance ${r.strategy === "mobile" ? "mobile" : "ordinateur"} (PageSpeed)`, r.scores.performance != null ? `${r.scores.performance}/100` : "non calculée", r.reportUrl)
    const mobileId = mobile ? perfId(mobile) : null
    // The desktop measure is evidence too, cited by the analysis when it compares both.
    if (desktop) perfId(desktop)
    const mp = mobile?.scores.performance ?? null
    const dp = desktop?.scores.performance ?? null
    if (mp != null || dp != null) scores.vitesse = clamp(mp != null && dp != null ? 0.7 * mp + 0.3 * dp : (mp ?? dp)!)
    const viewport = mobile?.viewport ?? !!homePage.viewport
    if (mp != null) scores.mobile = clamp(0.6 * mp + 0.4 * (viewport ? 100 : 0))
    else if (!viewport) scores.mobile = 10
    if (mp != null && mp < 50) {
      finding("vitesse", "high", `Site lent sur mobile : ${mp}/100`, `PageSpeed note la version mobile ${mp}/100${mobile!.lab.lcpMs ? ` ; le contenu principal s'affiche en ${ms(mobile!.lab.lcpMs)}` : ""}. La plupart des visiteurs arrivent par leur téléphone.`, [mobileId!])
      signal("mobile_score_low", [mobileId!])
    }
    if (!viewport) {
      finding("mobile", "high", "Site non adapté au téléphone", "La page n'est pas prévue pour les petits écrans : il faut zoomer pour la lire.", [home])
      signal("mobile_score_low", [home])
    }
    for (const r of [facts.psi.mobile, facts.psi.desktop]) {
      if (r && !r.ok) {
        partial = true
        notes.push(`PageSpeed ${r.strategy === "mobile" ? "mobile" : "ordinateur"} : ${r.error}.`)
      }
    }

    // GEO.
    const types = [...new Set(site.pages.flatMap((p) => p.jsonLdTypes))]
    let geo = 0
    if (types.length) {
      geo += 25
      strengths.push({ text: `Données structurées présentes (${types.slice(0, 4).join(", ")})`, evidence: [home] })
    } else {
      finding("geo", "medium", "Aucune donnée structurée", "Rien n'indique aux moteurs de recherche et aux IA, dans un format qu'ils lisent, qui est l'entreprise, ce qu'elle fait et où.", [home])
      signal("no_structured_data", [home])
    }
    const faqPage = types.some((t) => /FAQPage/i.test(t))
    if (faqPage || content?.faq) geo += 20
    else signal("no_faq", [home])
    if (content) {
      if (content.entityClear) geo += 25
      else signal("unclear_entity", [home])
    }
    if (site.llmsTxt) geo += 10
    const blocked = site.aiBots.filter((b) => !b.allowed).map((b) => b.bot)
    if (!blocked.length) geo += 20
    else {
      geo += blocked.length < site.aiBots.length ? 10 : 0
      const id = book.add("measure", "Robots IA bloqués par robots.txt", blocked.join(", "), `${new URL(site.finalUrl!).origin}/robots.txt`)
      finding("geo", "low", "Des robots d'IA sont bloqués", `Le site interdit ${blocked.join(", ")} : ces assistants ne peuvent pas lire ses pages. C'est parfois voulu ; à confirmer avec l'entreprise.`, [id])
    }
    scores.geo = clamp(geo)

    // Conversion, from the pages (the model adds the screenshots' reading).
    const tel = site.pages.some((p) => p.tel.length > 0)
    const forms = site.pages.some((p) => p.forms > 0)
    const booking = stack?.booking ?? []
    let conversion = 0
    if (tel) conversion += 25
    if (forms || booking.length) conversion += 25
    if (content?.ctas.length) conversion += 20
    if (content?.proofs.length) conversion += 15
    if (content?.headline) conversion += 15
    scores.conversion = clamp(conversion)
    if (!tel && !forms && !booking.length) {
      finding("conversion", "high", "Aucun moyen direct de prendre contact", "Ni numéro cliquable, ni formulaire, ni réservation en ligne sur les pages lues.", pageIds.slice(0, 3))
      signal("weak_cta", pageIds.slice(0, 3))
    }
    if (booking.length) strengths.push({ text: `Réservation en ligne (${booking.join(", ")})`, evidence: [home] })
    else if (isBookingSector(facts.sector)) signal("no_booking", [home])

    // Content depth.
    const paths = new Set(site.pages.flatMap((p) => p.links.filter((x) => x.internal).map((x) => new URL(x.href).pathname.replace(/\/$/, ""))))
    if (paths.size < 6) {
      finding("geo", "low", `Peu de pages (${paths.size} liens internes)`, "Un site de quelques pages ne peut pas se positionner sur chaque service ni chaque ville.", [home])
      signal("few_pages", [home])
    }

    // Ads and measurement.
    const tags = stack?.tags
    const tagsId = book.add(
      "measure",
      "Balises de mesure et de publicité",
      [tags?.ga4.length ? "Google Analytics 4" : null, tags?.gtm.length ? "Google Tag Manager" : null, tags?.googleAds.length ? "Google Ads" : null, tags?.metaPixel ? "pixel Meta" : null, ...(tags?.otherAnalytics ?? [])].filter(Boolean).join(", ") || "aucune",
      site.finalUrl
    )
    if (isHighIntentSector(facts.sector) && !tags?.googleAds.length) signal("no_google_ads_high_intent", [tagsId])
    if (isVisualSector(facts.sector) && !tags?.metaPixel) signal("no_meta_pixel_visual", [tagsId])
    if (!tags?.ga4.length && !tags?.gtm.length && !tags?.otherAnalytics.length) finding("presence", "low", "Aucune mesure d'audience", "Sans outil de mesure, impossible de savoir d'où viennent les visites ni ce qu'elles donnent.", [tagsId])
  }

  // ── Local SEO ──
  if (listingKnown || site?.reachable) {
    let local = 0
    if (l.rating != null) {
      if (l.rating >= 4.5) local += 25
      else if (l.rating >= 4) local += 18
      else {
        local += 5
        finding("seoLocal", "high", `Note Google de ${l.rating.toLocaleString("fr-FR")}/5`, "Sous 4 sur 5, une partie des clients passe à un concurrent mieux noté sans appeler.", [listingId])
        signal("low_rating", [listingId])
      }
    }
    if (l.reviewCount != null) {
      if (l.reviewCount >= 50) local += 25
      else if (l.reviewCount >= 20) local += 15
      else {
        local += l.reviewCount >= 5 ? 8 : 0
        finding("seoLocal", "medium", `Seulement ${l.reviewCount} avis Google`, "Peu d'avis rassurent peu ; les concurrents avec plus d'avis passent devant sur la carte.", [listingId])
        signal("few_reviews", [listingId])
      }
    } else if (l.fromExtractor) {
      finding("seoLocal", "medium", "Aucun avis Google connu", "La fiche Google ne montre aucun avis.", [listingId])
      signal("few_reviews", [listingId])
    }
    if (l.fromExtractor && (!l.category || !l.phone)) signal("gbp_incomplete", [listingId])
    if (site?.reachable && home) {
      const types = site.pages.flatMap((p) => p.jsonLdTypes)
      if (types.some((t) => LOCAL_TYPES.test(t))) local += 20
      else {
        finding("seoLocal", "medium", "Pas de données LocalBusiness", "Le site ne décrit pas l'entreprise locale (adresse, horaires, zone) dans le format que Google lit.", [home])
        signal("no_localbusiness_schema", [home])
      }
      const sitePhones = new Set(site.pages.flatMap((p) => p.tel).map(digits))
      const listingPhone = l.phone ? digits(l.phone) : null
      if (listingPhone && sitePhones.has(listingPhone)) local += 15
      else if (listingPhone && sitePhones.size) {
        finding("seoLocal", "medium", "Téléphone différent entre le site et la fiche Google", "Deux numéros différents brouillent Google et les clients : un seul numéro, partout.", [listingId, home])
        signal("nap_inconsistent", [listingId, home])
      } else if (!sitePhones.size) finding("conversion", "medium", "Pas de numéro cliquable sur le site", "Sur téléphone, le visiteur doit recopier le numéro pour appeler.", [home])
      const city = normalizeName(l.city ?? "")
      if (city && site.pages.some((p) => normalizeName(`${p.title ?? ""} ${p.h1.join(" ")} ${p.text}`).includes(city))) local += 15
    }
    scores.seoLocal = clamp(local)
  } else {
    notes.push("Ni fiche Google ni site lisible : le SEO local n'a pas pu être évalué.")
  }

  // ── Presence ──
  const networks = new Set([...l.socials.map((s) => networkOf(s) ?? s), ...(site?.pages ?? []).flatMap((p) => p.links.map((x) => networkOf(x.href)).filter((n): n is string => !!n))])
  if (site?.reachable || listingKnown) {
    const n = networks.size
    let presence = n === 0 ? 10 : n === 1 ? 50 : n === 2 ? 70 : 85
    if (site?.stack && (site.stack.tags.ga4.length || site.stack.tags.gtm.length)) presence += 15
    scores.presence = clamp(presence)
    if (!n) {
      const id = book.add("measure", "Réseaux sociaux trouvés", "aucun (liens du site et Extractor)", site?.finalUrl ?? l.sourceUrl)
      finding("presence", "medium", "Aucun réseau social trouvé", "Ni le site ni la fiche ne mènent à un réseau social.", [id])
      signal("no_social", [id])
    } else {
      strengths.push({ text: `Présent sur ${[...networks].join(", ")}`, evidence: [home ?? listingId] })
    }
  }
  if (isVisualSector(facts.sector)) signal("visual_sector", [listingId])

  // ── Registry ──
  const r = facts.registry
  if (r) {
    const id = book.add("source", "Annuaire des entreprises", `${r.name} · SIREN ${r.siren}${r.naf ? ` · NAF ${r.naf}` : ""}`, r.url)
    if (r.labels.length) strengths.push({ text: `Labels officiels : ${r.labels.join(", ")}`, evidence: [id] })
    if (!r.active) finding("presence", "high", "Entreprise fermée au registre", "L'annuaire indique que l'entreprise a cessé son activité : à vérifier avant tout contact.", [id])
    if (r.opposition) notes.push("L'entreprise s'oppose à l'usage commercial de ses données (annuaire des entreprises) : aucun dirigeant n'est proposé comme contact.")
  } else if (facts.registryError) notes.push(facts.registryError)

  // ── Screenshots, for the model ──
  const captures: Measured["captures"] = []
  for (const res of [facts.psi.mobile, facts.psi.desktop]) {
    if (res?.ok && res.screenshot) captures.push({ id: book.add("capture", `Capture ${res.strategy === "mobile" ? "mobile" : "ordinateur"} (PageSpeed)`, res.strategy, res.reportUrl), kind: res.strategy })
  }

  return { evidence: book.list, findings, strengths, scores, signals: [...signals].map(([key, evidence]) => ({ key, evidence })), notes, partial, captures }
}

/** The overall score: the average of what was measured. */
export function overallScore(scores: Partial<Scores>): number | null {
  const values = Object.values(scores).filter((v): v is number => typeof v === "number")
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
}

/** Three sub-scores or more under 50 call for the full journey. */
export function lowAreas(scores: Partial<Scores>): Area[] {
  return (Object.entries(scores) as [Area, number | null][]).filter(([, v]) => typeof v === "number" && v < 50).map(([k]) => k)
}
