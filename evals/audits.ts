import type { OfferSignal } from "@/features/offers/signals"
import { AREAS, type Area, type AuditReport, type Evidence, type Scores, type Severity } from "@/features/prospect-audit/schemas"

/**
 * Reference audits (docs/crm-v1/AGENTS-IA.md §20), the input of two suites:
 * - the Conseiller offres, which must pick its main offer among `expect.main`, never one of `expect.never`, and cite
 *   only the audit's evidence;
 * - the Rédacteur outreach, whose first email is checked by code (length, one request, sourced facts) and graded by a
 *   judge against the audit.
 * The businesses are those of the frozen sites (evals/sites.ts), audited as the Auditeur would: fictional, coherent.
 */
export interface ReferenceAudit {
  id: string
  about: string
  company: { name: string; sector: string; city: string }
  contactFirstName: string | null
  audit: { domain: string | null; score: number; scores: Scores; summary: string[]; report: AuditReport }
  expect: {
    /** Offers a good advisor may lead with. */
    main: string[]
    /** Offers it must not recommend at all: wrong size, wrong need. */
    never: string[]
  }
}

type Ev = readonly [id: string, kind: Evidence["kind"], label: string, value: string | null]
type Item = readonly [text: string, evidence: readonly string[]]

function audit(spec: {
  domain: string | null
  scores: Partial<Scores>
  evidence: readonly Ev[]
  findings: readonly (readonly [Area, Severity, string, string, readonly string[]])[]
  strengths?: readonly Item[]
  frictions?: readonly Item[]
  opportunities?: readonly Item[]
  signals: Partial<Record<OfferSignal, readonly string[]>>
  summary: readonly string[]
}): ReferenceAudit["audit"] {
  const scores = Object.fromEntries(AREAS.map((a) => [a, spec.scores[a] ?? null])) as Scores
  const known = Object.values(scores).filter((v): v is number => v != null)
  const url = (kind: Evidence["kind"]) => (spec.domain && kind !== "source" ? `https://${spec.domain}/` : null)
  const points = (list: readonly Item[] = []) => list.map(([text, evidence]) => ({ text, evidence: [...evidence] }))
  return {
    domain: spec.domain,
    score: known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 0,
    scores,
    summary: [...spec.summary],
    report: {
      findings: spec.findings.map(([area, severity, title, detail, evidence]) => ({ area, severity, title, detail, evidence: [...evidence], origin: "measure" as const })),
      strengths: points(spec.strengths),
      frictions: points(spec.frictions),
      opportunities: points(spec.opportunities),
      signals: Object.entries(spec.signals).map(([key, evidence]) => ({ key: key as OfferSignal, evidence: [...(evidence ?? [])] })),
      evidence: spec.evidence.map(([id, kind, label, value]) => ({ id, kind, label, value, url: url(kind) })),
      people: [],
      registry: null,
      site: spec.domain ? { reachable: true, pages: [`https://${spec.domain}/`], cms: null, blockedByRobots: false } : null,
      notes: [],
      models: { extraction: null, analysis: null },
    },
  }
}

export const AUDITS: readonly ReferenceAudit[] = [
  {
    id: "a01-plomberie-roche",
    about: "Site daté et lent : la refonte d'abord, pas d'offre démesurée",
    company: { name: "Plomberie Roche", sector: "Plombier", city: "Lyon" },
    contactFirstName: "Bruno",
    audit: audit({
      domain: "plomberie-roche.example",
      scores: { technique: 35, vitesse: 37, mobile: 17, seoLocal: 60, geo: 20, conversion: 50, presence: 10 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,6/5 · 38 avis · Plombier"],
        ["P1", "page", "Page d'accueil", "Plomberie Roche - Plombier Lyon 7"],
        ["M1", "measure", "Protocole", "HTTP, sans chiffrement"],
        ["M2", "measure", "Outil du site", "WordPress 5.2.4"],
        ["M3", "measure", "Année de copyright la plus récente", "2017"],
        ["M4", "measure", "Performance mobile (PageSpeed)", "28/100"],
        ["M5", "measure", "Balises de mesure et de publicité", "aucune"],
      ],
      findings: [
        ["technique", "high", "Le site n'est pas en HTTPS", "Les navigateurs affichent « Non sécurisé » : cela inquiète les visiteurs et pénalise le référencement.", ["M1"]],
        ["vitesse", "high", "Site lent sur mobile : 28/100", "PageSpeed note la version mobile 28/100 ; le contenu principal s'affiche en 7,4 s.", ["M4"]],
        ["mobile", "high", "Site non adapté au téléphone", "La page n'est pas prévue pour les petits écrans : il faut zoomer pour la lire.", ["P1"]],
        ["technique", "medium", "WordPress 5.2.4 n'est plus à jour", "Une version ancienne de l'outil du site expose à des failles.", ["M2"]],
      ],
      strengths: [["Note Google de 4,6/5 sur 38 avis", ["S1"]]],
      opportunities: [["Un site rapide et lisible sur téléphone transformerait les recherches « plombier Lyon 7 » en appels", ["M4", "P1"]]],
      signals: { no_https: ["M1"], cms_outdated: ["M2"], site_outdated: ["M3", "P1", "M2"], mobile_score_low: ["M4", "P1"], no_structured_data: ["P1"], no_localbusiness_schema: ["P1"], no_faq: ["P1"], no_social: ["P1"], no_google_ads_high_intent: ["M5"], few_pages: ["P1"] },
      summary: ["Le site n'est pas sécurisé (HTTP) et s'affiche mal sur téléphone.", "Il met plus de 7 secondes à charger sur mobile.", "Les avis Google sont bons : un site à la hauteur les transformerait en appels."],
    }),
    expect: { main: ["refonte-site"], never: ["cleads-enterprise"] },
  },
  {
    id: "a02-comptoir-chartrons",
    about: "Restaurant sans réservation en ligne : la conversion avant la publicité",
    company: { name: "Le Comptoir des Chartrons", sector: "Restaurant", city: "Bordeaux" },
    contactFirstName: "Claire",
    audit: audit({
      domain: "comptoir-chartrons.example",
      scores: { technique: 80, vitesse: 54, mobile: 66, seoLocal: 85, geo: 45, conversion: 45, presence: 50 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,5/5 · 214 avis · Restaurant"],
        ["P1", "page", "Page d'accueil", "Le Comptoir des Chartrons — Restaurant bistronomique à Bordeaux"],
        ["P2", "page", "Contact et horaires — Le Comptoir des Chartrons", null],
        ["M1", "measure", "Performance mobile (PageSpeed)", "44/100"],
        ["M2", "measure", "Balises de mesure et de publicité", "aucune"],
      ],
      findings: [
        ["conversion", "high", "Pas de réservation en ligne", "Les clients ne peuvent réserver que par téléphone, aux heures où le restaurant décroche.", ["P1", "P2"]],
        ["vitesse", "high", "Site lent sur mobile : 44/100", "La plupart des clients cherchent un restaurant depuis leur téléphone.", ["M1"]],
      ],
      strengths: [["214 avis Google à 4,5/5", ["S1"]]],
      opportunities: [["Une réservation en ligne prendrait les tables du soir sans mobiliser le personnel", ["P1"]]],
      signals: { no_booking: ["P1"], visual_sector: ["S1"], no_meta_pixel_visual: ["M2"], mobile_score_low: ["M1"], no_faq: ["P1"] },
      summary: ["On ne peut réserver que par téléphone.", "Le site est lent sur mobile (44/100).", "La réputation est excellente : 214 avis à 4,5/5."],
    }),
    expect: { main: ["landing-conversion", "refonte-site"], never: ["cleads-enterprise", "site-vitrine"] },
  },
  {
    id: "a03-solutions-habitat",
    about: "Entité floue et peu d'avis : être compris et trouvé localement",
    company: { name: "Solutions Habitat Plus", sector: "Rénovation", city: "Metz" },
    contactFirstName: null,
    audit: audit({
      domain: "solutions-habitat-plus.example",
      scores: { technique: 70, vitesse: 70, mobile: 80, seoLocal: 35, geo: 20, conversion: 40, presence: 10 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,1/5 · 9 avis · Rénovation"],
        ["P1", "page", "Page d'accueil", "Solutions Habitat Plus — Votre partenaire"],
        ["P2", "page", "Contact", null],
        ["M1", "measure", "Réseaux sociaux trouvés", "aucun (liens du site et Extractor)"],
      ],
      findings: [
        ["geo", "high", "On ne sait pas ce que fait l'entreprise ni où", "Le site ne dit ni le métier précis, ni la ville, ni la clientèle : Google et les assistants IA ne peuvent pas le recommander.", ["P1"]],
        ["seoLocal", "medium", "Seulement 9 avis Google", "Peu d'avis rassurent peu ; les concurrents avec plus d'avis passent devant sur la carte.", ["S1"]],
        ["presence", "medium", "Aucun réseau social trouvé", "Ni le site ni la fiche ne mènent à un réseau social.", ["M1"]],
      ],
      frictions: [["Le seul contact est un formulaire générique", ["P2"]]],
      signals: { unclear_entity: ["P1"], no_faq: ["P1"], few_reviews: ["S1"], few_pages: ["P1"], no_structured_data: ["P1"], no_social: ["M1"] },
      summary: ["Le site ne dit ni le métier, ni la ville : impossible d'être recommandé.", "Seulement 9 avis Google.", "Aucun réseau social."],
    }),
    expect: { main: ["geo", "seo-local"], never: ["cleads-enterprise", "site-vitrine"] },
  },
  {
    id: "a04-garage-pont-neuf",
    about: "Vieux site non sécurisé dans un métier d'urgence",
    company: { name: "Garage du Pont-Neuf", sector: "Garage automobile", city: "Tours" },
    contactFirstName: "Alain",
    audit: audit({
      domain: "garage-pont-neuf.example",
      scores: { technique: 30, vitesse: 26, mobile: 13, seoLocal: 50, geo: 15, conversion: 40, presence: 10 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,3/5 · 58 avis · Garage automobile"],
        ["P1", "page", "Page d'accueil", "Garage du Pont-Neuf - Tours"],
        ["M1", "measure", "Protocole", "HTTP, sans chiffrement"],
        ["M2", "measure", "Outil du site", "Joomla 3.9"],
        ["M3", "measure", "Performance mobile (PageSpeed)", "22/100"],
        ["M4", "measure", "Balises de mesure et de publicité", "aucune"],
      ],
      findings: [
        ["technique", "high", "Le site n'est pas en HTTPS", "Les navigateurs affichent « Non sécurisé ».", ["M1"]],
        ["vitesse", "high", "Site lent sur mobile : 22/100", "Le contenu principal s'affiche en plus de 8 secondes.", ["M3"]],
        ["conversion", "medium", "Rendez-vous seulement par téléphone", "Un garage reçoit beaucoup de demandes de rendez-vous hors des heures d'ouverture.", ["P1"]],
      ],
      strengths: [["58 avis Google à 4,3/5", ["S1"]]],
      signals: { cms_outdated: ["M2"], site_outdated: ["M2", "P1"], no_https: ["M1"], mobile_score_low: ["M3", "P1"], no_booking: ["P1"], no_google_ads_high_intent: ["M4"], no_structured_data: ["P1"], no_faq: ["P1"] },
      summary: ["Le site n'est pas sécurisé et date de 2019.", "Il est très lent sur mobile (22/100).", "Pas de prise de rendez-vous en ligne."],
    }),
    expect: { main: ["refonte-site"], never: ["cleads-enterprise", "site-vitrine"] },
  },
  {
    id: "a05-saveurs-partage",
    about: "Traiteur qu'on ne peut contacter que par email",
    company: { name: "Saveurs & Partage", sector: "Traiteur", city: "Grenoble" },
    contactFirstName: "Inès",
    audit: audit({
      domain: "saveurs-partage.example",
      scores: { technique: 75, vitesse: 64, mobile: 77, seoLocal: 55, geo: 30, conversion: 15, presence: 10 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,5/5 · 29 avis · Traiteur"],
        ["P1", "page", "Page d'accueil", "Saveurs & Partage — Traiteur à Grenoble"],
        ["P2", "page", "Contact — Saveurs & Partage", null],
        ["M1", "measure", "Réseaux sociaux trouvés", "aucun (liens du site et Extractor)"],
        ["M2", "measure", "Balises de mesure et de publicité", "aucune"],
      ],
      findings: [
        ["conversion", "high", "Aucun moyen direct de prendre contact", "Ni numéro cliquable, ni formulaire : seulement une adresse email.", ["P1", "P2"]],
        ["presence", "medium", "Aucun réseau social trouvé", "Un traiteur se choisit sur photos.", ["M1"]],
      ],
      signals: { weak_cta: ["P1", "P2"], no_social: ["M1"], visual_sector: ["S1"], no_meta_pixel_visual: ["M2"], no_structured_data: ["P1"] },
      summary: ["On ne peut contacter le traiteur que par email.", "Aucun réseau social pour montrer les buffets.", "Les avis sont bons (4,5/5)."],
    }),
    expect: { main: ["landing-conversion", "reseaux-sociaux"], never: ["cleads-enterprise", "site-vitrine", "refonte-site"] },
  },
  {
    id: "a06-atelier-lumen",
    about: "Architectes au site beau mais lourd : vitesse et vitrine visuelle",
    company: { name: "Atelier Lumen Architectes", sector: "Architecte", city: "Strasbourg" },
    contactFirstName: "Hugo",
    audit: audit({
      domain: "atelier-lumen.example",
      scores: { technique: 85, vitesse: 50, mobile: 63, seoLocal: 70, geo: 50, conversion: 60, presence: 50, image: 82 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 5/5 · 23 avis · Architecte"],
        ["P1", "page", "Page d'accueil", "Atelier Lumen — Architectes à Strasbourg"],
        ["M1", "measure", "Performance mobile (PageSpeed)", "39/100"],
        ["M2", "measure", "Balises de mesure et de publicité", "aucune"],
        ["C1", "capture", "Capture ordinateur (PageSpeed)", "desktop"],
      ],
      findings: [
        ["vitesse", "high", "Site lent sur mobile : 39/100", "Les photos des projets pèsent lourd : le contenu principal s'affiche en 6,1 s.", ["M1"]],
        ["image", "low", "Belle vitrine visuelle", "Les projets sont mis en valeur par de grandes photos.", ["C1"]],
      ],
      strengths: [["Note parfaite de 5/5", ["S1"]], ["Projets bien photographiés", ["C1"]]],
      signals: { visual_sector: ["S1"], no_meta_pixel_visual: ["M2"], mobile_score_low: ["M1"], no_faq: ["P1"] },
      summary: ["Le site est très lent sur mobile à cause des photos.", "Les projets sont superbes : ils mériteraient d'être vus ailleurs que sur le site.", "Aucune mesure d'audience."],
    }),
    expect: { main: ["refonte-site", "reseaux-sociaux", "meta-ads"], never: ["cleads-enterprise", "site-vitrine"] },
  },
  {
    id: "a07-toitures-marchand",
    about: "Couvreur peu noté en avis et sans publicité dans un métier d'urgence",
    company: { name: "Toitures Marchand", sector: "Couvreur", city: "Clermont-Ferrand" },
    contactFirstName: "Fabrice",
    audit: audit({
      domain: "toitures-marchand.example",
      scores: { technique: 70, vitesse: 45, mobile: 60, seoLocal: 26, geo: 20, conversion: 50, presence: 50 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,2/5 · 7 avis · Couvreur"],
        ["P1", "page", "Page d'accueil", "Toitures Marchand | Couvreur Clermont-Ferrand"],
        ["M1", "measure", "Performance mobile (PageSpeed)", "34/100"],
        ["M2", "measure", "Balises de mesure et de publicité", "aucune"],
      ],
      findings: [
        ["seoLocal", "medium", "Seulement 7 avis Google", "Les couvreurs mieux notés passent devant sur la carte.", ["S1"]],
        ["vitesse", "high", "Site lent sur mobile : 34/100", "Une fuite se cherche depuis son téléphone, souvent en urgence.", ["M1"]],
        ["seoLocal", "medium", "Pas de données LocalBusiness", "Le site ne décrit pas l'entreprise locale dans le format que Google lit.", ["P1"]],
      ],
      signals: { mobile_score_low: ["M1"], few_reviews: ["S1"], no_structured_data: ["P1"], no_localbusiness_schema: ["P1"], no_google_ads_high_intent: ["M2"], no_faq: ["P1"] },
      summary: ["Seulement 7 avis Google.", "Aucune publicité sur les recherches urgentes (« fuite toiture »).", "Le site est lent sur mobile."],
    }),
    expect: { main: ["seo-local", "google-ads"], never: ["cleads-enterprise", "site-vitrine"] },
  },
  {
    id: "a08-kine-saint-michel",
    about: "Cabinet de santé qui ne prend ses rendez-vous que par téléphone",
    company: { name: "Kiné Saint-Michel", sector: "Kinésithérapeute", city: "Reims" },
    contactFirstName: "Laure",
    audit: audit({
      domain: "kine-saint-michel.example",
      scores: { technique: 80, vitesse: 65, mobile: 74, seoLocal: 65, geo: 25, conversion: 50, presence: 50 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,9/5 · 41 avis · Kinésithérapeute"],
        ["P1", "page", "Page d'accueil", "Kiné Saint-Michel — Kinésithérapeutes à Reims"],
        ["P2", "page", "Contact — Kiné Saint-Michel, Reims", null],
      ],
      findings: [
        ["conversion", "high", "Rendez-vous seulement par téléphone", "Le secrétariat est saturé aux heures de pointe ; les patients appellent ailleurs.", ["P1", "P2"]],
        ["geo", "medium", "Aucune donnée structurée", "Rien n'indique aux moteurs et aux IA qui est le cabinet et où.", ["P1"]],
      ],
      strengths: [["4,9/5 sur 41 avis", ["S1"]]],
      signals: { no_booking: ["P1"], no_structured_data: ["P1"], no_localbusiness_schema: ["P1"], no_faq: ["P1"] },
      summary: ["Les rendez-vous ne se prennent que par téléphone.", "Le site ne décrit pas le cabinet pour Google.", "Les patients sont très satisfaits (4,9/5)."],
    }),
    expect: { main: ["landing-conversion", "seo-local"], never: ["cleads-enterprise", "site-vitrine", "meta-ads"] },
  },
  {
    id: "a09-taxi-gregoire",
    about: "Aucun site : la seule bonne offre est d'en créer un",
    company: { name: "Taxi Grégoire", sector: "Taxi", city: "Pau" },
    contactFirstName: "Grégoire",
    audit: audit({
      domain: null,
      scores: { seoLocal: 70, presence: 10 },
      evidence: [["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,8/5 · 94 avis · Taxi"]],
      findings: [["technique", "high", "Pas de site web", "Les clients qui cherchent un taxi à Pau ne trouvent que la fiche Google.", ["S1"]]],
      strengths: [["94 avis à 4,8/5", ["S1"]]],
      signals: { no_website: ["S1"] },
      summary: ["Aucun site web.", "Une très bonne réputation sur Google (4,8/5).", "Les réservations à l'avance passent par le téléphone seulement."],
    }),
    expect: { main: ["site-vitrine"], never: ["refonte-site", "cleads-enterprise"] },
  },
  {
    id: "a10-bijouterie-anais",
    about: "Une page Instagram pour tout site, dans un secteur visuel",
    company: { name: "Bijouterie Anaïs", sector: "Bijouterie", city: "Lyon" },
    contactFirstName: "Anaïs",
    audit: audit({
      domain: null,
      scores: { seoLocal: 70, presence: 50 },
      evidence: [
        ["S1", "source", "Fiche Google de l'entreprise (via l'Extractor)", "note 4,9/5 · 61 avis · Bijouterie"],
        ["S2", "source", "Adresse donnée comme site", "https://www.instagram.com/bijouterie.anais.example"],
      ],
      findings: [["technique", "high", "Seulement une page de réseau social", "Pas de pages par collection, pas de référencement propre.", ["S2"]]],
      strengths: [["61 avis à 4,9/5", ["S1"]]],
      signals: { social_only: ["S2"], visual_sector: ["S1"] },
      summary: ["Le « site » est une page Instagram.", "Les créations se prêtent à une vitrine en ligne.", "Une excellente note Google."],
    }),
    expect: { main: ["site-vitrine"], never: ["refonte-site", "cleads-enterprise"] },
  },
]

export const auditById = (id: string) => AUDITS.find((a) => a.id === id) ?? null
