import type { RelevanceVerdict } from "@prisma/client"
import { OFFERS_V1 } from "@/features/offers/catalog-v1"
import type { CampaignTarget, FicheFacts } from "@/features/relevance/rules"

/**
 * The Analyste qualification's reference set (E25, docs/crm-v1/AGENTS-IA.md §17 and §20): imported fiches judged for
 * their campaign, the way the person who runs the campaign would. Three campaigns built on V1 offers; the businesses
 * are fictional. The hard cases sit on the edges: a neighbouring town, a nearby trade, a national chain.
 */
export interface LabelledFiche {
  id: string
  campaign: CampaignKey
  company: NonNullable<FicheFacts["company"]>
  label: RelevanceVerdict
  trap?: string
}

const offer = (slug: string) => {
  const o = OFFERS_V1.find((x) => x.slug === slug)
  if (!o) throw new Error(`Offre ${slug} absente du catalogue V1`)
  return { name: o.name, summary: o.summary, signals: [...o.signals] }
}

export const CAMPAIGNS = {
  plombiers: { name: "Plombiers de Lyon — refonte de site", sector: "Plombier", area: "Lyon et Villeurbanne", offer: offer("refonte-site") },
  restaurants: { name: "Restaurants de Bordeaux — réservation en ligne", sector: "Restaurant", area: "Bordeaux", offer: offer("landing-conversion") },
  dentistes: { name: "Dentistes de Toulouse — SEO local", sector: "Dentiste", area: "Toulouse", offer: offer("seo-local") },
} as const satisfies Record<string, CampaignTarget>
export type CampaignKey = keyof typeof CAMPAIGNS

let n = 0
const f = (campaign: CampaignKey, label: RelevanceVerdict, c: Partial<LabelledFiche["company"]> & { name: string }, trap?: string): LabelledFiche => {
  n++
  return {
    id: `f${String(n).padStart(2, "0")}`,
    campaign,
    company: { sector: null, city: null, postalCode: null, website: null, rating: null, reviewCount: null, hasPhone: true, hasEmail: false, ...c },
    label,
    ...(trap ? { trap } : {}),
  }
}

export const FICHES: readonly LabelledFiche[] = [
  // ── Plombiers de Lyon : refonte de site ──
  f("plombiers", "RELEVANT", { name: "Plomberie Gerland Services", sector: "Plombier", city: "Lyon", postalCode: "69007", website: "plomberie-gerland.example", rating: 4.5, reviewCount: 31 }),
  f("plombiers", "RELEVANT", { name: "Duval Plomberie Chauffage", sector: "Plombier chauffagiste", city: "Villeurbanne", postalCode: "69100", website: "duval-plomberie.example", rating: 4.2, reviewCount: 12 }),
  f("plombiers", "RELEVANT", { name: "SOS Fuite Croix-Rousse", sector: "Plombier", city: "Lyon", postalCode: "69004", website: "sosfuite-croixrousse.example", rating: 3.9, reviewCount: 8 }),
  f("plombiers", "RELEVANT", { name: "Martin & Fils Sanitaire", sector: "Plomberie", city: "Lyon", postalCode: "69003", website: "martinfils-sanitaire.example", rating: 4.7, reviewCount: 64 }),
  f("plombiers", "MAYBE", { name: "Plomberie des Monts d'Or", sector: "Plombier", city: "Limonest", postalCode: "69760", website: "plomberie-montsdor.example", rating: 4.6, reviewCount: 22 }, "commune voisine, hors de la zone écrite"),
  f("plombiers", "MAYBE", { name: "Rhône Thermique", sector: "Chauffagiste", city: "Lyon", postalCode: "69008", website: "rhone-thermique.example", rating: 4.4, reviewCount: 40 }, "métier voisin"),
  f("plombiers", "MAYBE", { name: "Entreprise Bernard", sector: null, city: "Lyon", postalCode: "69006", website: null, rating: null, reviewCount: null, hasPhone: true }, "secteur inconnu"),
  f("plombiers", "NOT_RELEVANT", { name: "Plomberie Marseillaise", sector: "Plombier", city: "Marseille", postalCode: "13005", website: "plomberie-marseillaise.example", rating: 4.1, reviewCount: 19 }, "bon métier, mauvaise ville"),
  f("plombiers", "NOT_RELEVANT", { name: "Boulangerie du Parc", sector: "Boulangerie", city: "Lyon", postalCode: "69006", website: "boulangerie-du-parc.example", rating: 4.8, reviewCount: 210 }),
  f("plombiers", "NOT_RELEVANT", { name: "Hydro Services France — agence Lyon", sector: "Plombier", city: "Lyon", postalCode: "69002", website: "hydroservices-france.example", rating: 3.4, reviewCount: 1_840 }, "réseau national"),
  f("plombiers", "NOT_RELEVANT", { name: "Brico Géant Lyon Est", sector: "Magasin de bricolage", city: "Lyon", postalCode: "69008", website: "bricogeant.example", rating: 4, reviewCount: 3_120 }, "grande surface"),
  f("plombiers", "RELEVANT", { name: "Atelier Plomberie Lafayette", sector: "Plombier", city: "Lyon", postalCode: "69006", website: null, rating: 4.9, reviewCount: 17 }, "pas de site : la refonte devient une création, toujours utile"),
  f("plombiers", "MAYBE", { name: "Electro Plomb' Services", sector: "Électricien plombier", city: "Villeurbanne", postalCode: "69100", website: "electroplomb.example", rating: 4.3, reviewCount: 26 }),
  f("plombiers", "NOT_RELEVANT", { name: "Plomberie Grenobloise", sector: "Plombier", city: "Grenoble", postalCode: "38000", website: "plomberie-grenobloise.example", rating: 4.5, reviewCount: 33 }),
  f("plombiers", "RELEVANT", { name: "Les Plombiers du 7e", sector: "Plombier", city: "Lyon", postalCode: "69007", website: "plombiers-du-7.example", rating: 4, reviewCount: 6 }),

  // ── Restaurants de Bordeaux : réservation en ligne ──
  f("restaurants", "RELEVANT", { name: "Chez Margaux", sector: "Restaurant", city: "Bordeaux", postalCode: "33000", website: "chez-margaux.example", rating: 4.6, reviewCount: 140 }),
  f("restaurants", "RELEVANT", { name: "La Table du Marché", sector: "Restaurant français", city: "Bordeaux", postalCode: "33800", website: "table-du-marche.example", rating: 4.4, reviewCount: 98 }),
  f("restaurants", "RELEVANT", { name: "Bistrot Saint-Pierre", sector: "Bistrot", city: "Bordeaux", postalCode: "33000", website: null, rating: 4.3, reviewCount: 57 }),
  f("restaurants", "RELEVANT", { name: "Sakura Bordeaux", sector: "Restaurant japonais", city: "Bordeaux", postalCode: "33300", website: "sakura-bordeaux.example", rating: 4.5, reviewCount: 203 }),
  f("restaurants", "MAYBE", { name: "Le Comptoir de Mérignac", sector: "Restaurant", city: "Mérignac", postalCode: "33700", website: "comptoir-merignac.example", rating: 4.2, reviewCount: 76 }, "commune de la métropole, hors de la zone écrite"),
  f("restaurants", "MAYBE", { name: "Café des Quais", sector: "Café", city: "Bordeaux", postalCode: "33000", website: "cafe-des-quais.example", rating: 4.1, reviewCount: 320 }, "un café réserve peu"),
  f("restaurants", "MAYBE", { name: "Traiteur Garonne", sector: "Traiteur", city: "Bordeaux", postalCode: "33100", website: "traiteur-garonne.example", rating: 4.7, reviewCount: 45 }, "métier voisin, sans tables"),
  f("restaurants", "NOT_RELEVANT", { name: "Burger Express — Bordeaux Lac", sector: "Restauration rapide", city: "Bordeaux", postalCode: "33300", website: "burger-express.example", rating: 3.6, reviewCount: 2_900 }, "chaîne nationale"),
  f("restaurants", "NOT_RELEVANT", { name: "La Brasserie Lyonnaise", sector: "Restaurant", city: "Lyon", postalCode: "69002", website: "brasserie-lyonnaise.example", rating: 4.3, reviewCount: 410 }),
  f("restaurants", "NOT_RELEVANT", { name: "Cave Saint-Michel", sector: "Caviste", city: "Bordeaux", postalCode: "33800", website: "cave-saint-michel.example", rating: 4.8, reviewCount: 88 }),
  f("restaurants", "NOT_RELEVANT", { name: "Optique des Chartrons", sector: "Opticien", city: "Bordeaux", postalCode: "33000", website: "optique-chartrons.example", rating: 4.9, reviewCount: 120 }),
  f("restaurants", "RELEVANT", { name: "Osteria Bastide", sector: "Restaurant italien", city: "Bordeaux", postalCode: "33100", website: "osteria-bastide.example", rating: 4.5, reviewCount: 160 }),
  f("restaurants", "MAYBE", { name: "Food Truck La Roulotte", sector: "Food truck", city: "Bordeaux", postalCode: "33000", website: null, rating: 4.6, reviewCount: 39 }, "pas de salle à réserver"),
  f("restaurants", "RELEVANT", { name: "Le Petit Garonnais", sector: "Restaurant", city: "Bordeaux", postalCode: "33000", website: "petit-garonnais.example", rating: 4.2, reviewCount: 11 }),
  f("restaurants", "NOT_RELEVANT", { name: "Hôtel-Restaurant des Pins", sector: "Restaurant", city: "Arcachon", postalCode: "33120", website: "hotel-des-pins.example", rating: 4.4, reviewCount: 530 }, "hors de Bordeaux, à une heure"),

  // ── Dentistes de Toulouse : SEO local ──
  f("dentistes", "RELEVANT", { name: "Cabinet dentaire Capitole", sector: "Dentiste", city: "Toulouse", postalCode: "31000", website: "dentaire-capitole.example", rating: 4.1, reviewCount: 14 }),
  f("dentistes", "RELEVANT", { name: "Dr Lefèvre, chirurgien-dentiste", sector: "Chirurgien-dentiste", city: "Toulouse", postalCode: "31400", website: null, rating: 3.8, reviewCount: 9 }),
  f("dentistes", "RELEVANT", { name: "Centre dentaire Saint-Cyprien", sector: "Dentiste", city: "Toulouse", postalCode: "31300", website: "dentaire-saint-cyprien.example", rating: 4.3, reviewCount: 52 }),
  f("dentistes", "MAYBE", { name: "Orthodontie Compans", sector: "Orthodontiste", city: "Toulouse", postalCode: "31000", website: "ortho-compans.example", rating: 4.8, reviewCount: 97 }, "spécialité voisine"),
  f("dentistes", "MAYBE", { name: "Cabinet dentaire de Blagnac", sector: "Dentiste", city: "Blagnac", postalCode: "31700", website: "dentaire-blagnac.example", rating: 4.2, reviewCount: 30 }, "commune de la métropole"),
  f("dentistes", "MAYBE", { name: "SCM Docteurs Roux et Associés", sector: null, city: "Toulouse", postalCode: "31500", website: null, rating: null, reviewCount: null }, "secteur inconnu"),
  f("dentistes", "NOT_RELEVANT", { name: "DentiPlus — centre de Toulouse", sector: "Centre dentaire", city: "Toulouse", postalCode: "31000", website: "dentiplus.example", rating: 2.9, reviewCount: 1_450 }, "réseau national de centres"),
  f("dentistes", "NOT_RELEVANT", { name: "Cabinet dentaire du Vieux-Port", sector: "Dentiste", city: "Marseille", postalCode: "13002", website: "dentaire-vieuxport.example", rating: 4.4, reviewCount: 61 }),
  f("dentistes", "NOT_RELEVANT", { name: "Pharmacie des Minimes", sector: "Pharmacie", city: "Toulouse", postalCode: "31200", website: "pharmacie-minimes.example", rating: 4.5, reviewCount: 74 }),
  f("dentistes", "NOT_RELEVANT", { name: "Prothèses Occitanie", sector: "Prothésiste dentaire", city: "Toulouse", postalCode: "31100", website: "protheses-occitanie.example", rating: 4.9, reviewCount: 5, hasPhone: true }, "fournisseur des dentistes, pas un cabinet"),
  f("dentistes", "RELEVANT", { name: "Cabinet du Dr Nguyen", sector: "Dentiste", city: "Toulouse", postalCode: "31200", website: "dr-nguyen-dentiste.example", rating: 4.6, reviewCount: 18 }),
  f("dentistes", "RELEVANT", { name: "Dentistes des Carmes", sector: "Dentiste", city: "Toulouse", postalCode: "31000", website: "dentistes-carmes.example", rating: 3.7, reviewCount: 44 }),
  f("dentistes", "MAYBE", { name: "Cabinet dentaire de Muret", sector: "Dentiste", city: "Muret", postalCode: "31600", website: null, rating: 4, reviewCount: 21 }, "à 20 km"),
  f("dentistes", "NOT_RELEVANT", { name: "Clinique vétérinaire Rangueil", sector: "Vétérinaire", city: "Toulouse", postalCode: "31400", website: "veto-rangueil.example", rating: 4.7, reviewCount: 190 }),
  f("dentistes", "RELEVANT", { name: "Cabinet dentaire Jean-Jaurès", sector: "Dentiste", city: "Toulouse", postalCode: "31000", website: "dentaire-jeanjaures.example", rating: 4.4, reviewCount: 7 }),
]
