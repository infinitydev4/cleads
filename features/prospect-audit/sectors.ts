import { normalizeName } from "@/lib/crm/normalize"

/**
 * What a business's sector says about what it needs (docs/crm-v1/AGENTS-IA.md §13 and the V1 skills): which playbook
 * applies, whether it sells with pictures, whether its clients search in a hurry, whether they book online. Matched on
 * words of the sector as the Extractor or the team wrote it ("Plombier", "Restaurant italien").
 */
const words = (list: string) => list.split(",").map((w) => normalizeName(w))

const PLAYBOOKS: [string, string[]][] = [
  ["playbook-artisans-batiment", words("plombier,plomberie,electricien,electricite,chauffagiste,chauffage,couvreur,toiture,macon,maconnerie,menuisier,menuiserie,peintre,carreleur,platrier,serrurier,serrurerie,vitrier,charpentier,charpente,batiment,btp,renovation,isolation,climatisation,terrassement,facade,paysagiste")],
  ["playbook-restaurants", words("restaurant,brasserie,bistrot,pizzeria,creperie,bar,cafe,traiteur,boulangerie,patisserie,boucherie,fromagerie,epicerie,sushi,burger,kebab,food truck,salon de the,caviste")],
  ["playbook-sante", words("medecin,dentiste,orthodontiste,kinesitherapeute,kine,osteopathe,psychologue,psychiatre,pharmacie,infirmier,orthophoniste,podologue,sage femme,opticien,audioprothesiste,clinique,cabinet medical,naturopathe,sophrologue,dieteticien,chiropracteur,veterinaire")],
  ["playbook-architectes", words("architecte,architecture,maitre d oeuvre,maitrise d oeuvre,architecte d interieur,decorateur d interieur,bureau d etudes")],
]

const VISUAL = words(
  "restaurant,bar,cafe,boulangerie,patisserie,traiteur,coiffeur,coiffure,barbier,esthetique,institut de beaute,beaute,onglerie,tatouage,fleuriste,decoration,architecte,architecture d interieur,paysagiste,photographe,mariage,hotel,gite,chambre d hotes,camping,boutique,pret a porter,bijouterie,salon,spa,yoga,fitness,salle de sport,cuisiniste,menuisier,ebeniste"
)
const HIGH_INTENT = words(
  "plombier,serrurier,electricien,chauffagiste,vitrier,depannage,depanneur,couvreur,degorgement,assainissement,deratisation,desinsectisation,demenagement,demenageur,avocat,garagiste,garage,remorquage,taxi,ambulance,veterinaire,climatisation,frigoriste"
)
const BOOKING = words(
  "medecin,dentiste,kinesitherapeute,kine,osteopathe,psychologue,orthophoniste,podologue,sage femme,coiffeur,coiffure,barbier,esthetique,institut de beaute,onglerie,massage,spa,restaurant,garage,garagiste,controle technique,auto ecole,coach,naturopathe,sophrologue,veterinaire,tatouage"
)

/** A multi-word entry must appear as such; a single word also matches its plural ("restaurants", "plombiers"). */
function hits(sector: string | null | undefined, list: string[]): boolean {
  const normalized = normalizeName(sector ?? "")
  if (!normalized) return false
  const padded = ` ${normalized} `
  const tokens = normalized.split(" ")
  return list.some((w) => (w.includes(" ") ? padded.includes(` ${w} `) : tokens.some((t) => t.startsWith(w) && t.length <= w.length + 2)))
}

/** The playbook of the sector, if one fits. */
export function playbookFor(sector: string | null | undefined): string | null {
  return PLAYBOOKS.find(([, list]) => hits(sector, list))?.[0] ?? null
}

export const isVisualSector = (sector: string | null | undefined) => hits(sector, VISUAL)
export const isHighIntentSector = (sector: string | null | undefined) => hits(sector, HIGH_INTENT)
export const isBookingSector = (sector: string | null | undefined) => hits(sector, BOOKING)
