import type { Brief, Collected } from "@/features/studio/schemas"

/**
 * The Designer web's reference briefs (docs/crm-v1/AGENTS-IA.md §20): three briefs as a person validates them in the
 * Studio, for businesses of the frozen sites. The page built from each is sanitised, rendered and checked by axe-core
 * in the worker's browser, then graded by the critique with a fixed judge model. No image and no web font: the page
 * must stand on its text, its colours and the system fonts.
 */
export interface ReferenceBrief {
  id: string
  about: string
  company: string
  contact: Collected["contact"]
  brief: Brief
}

const point = (text: string) => ({ text, evidence: [] })

export const BRIEFS: readonly ReferenceBrief[] = [
  {
    id: "b01-plomberie-roche",
    about: "Artisan d'urgence : le téléphone doit dominer le premier écran",
    company: "Plomberie Roche",
    contact: { phone: "01 99 00 12 01", email: null, address: "12 rue de Gerland, 69007 Lyon", booking: null },
    brief: {
      positioning: "Plomberie Roche, plombier chauffagiste à Lyon 7e depuis 1998, dépanne et rénove pour les particuliers et les syndics de Lyon et Villeurbanne.",
      audience: "Particuliers et syndics de copropriété de Lyon 7e, Lyon 8e et Villeurbanne",
      tone: "Rassurant, direct, artisan de confiance",
      headline: "Une fuite ? Un plombier à Lyon 7e vous rappelle dans l'heure",
      subheadline: "Dépannage, chauffe-eau et salles de bains depuis 1998 · 4,6/5 sur 38 avis Google",
      sections: [
        { kind: "hero", title: "Votre plombier à Lyon 7e", points: [point("Dépannage de fuites, chauffe-eau et salles de bains depuis 1998.")] },
        { kind: "services", title: "Ce que nous faisons", points: [point("Dépannage de fuites et débouchage"), point("Remplacement et entretien de chauffe-eau"), point("Rénovation de salles de bains, douches à l'italienne")] },
        { kind: "proof", title: "Ils nous font confiance", points: [point("4,6/5 sur 38 avis Google"), point("Plus de 25 ans à Lyon")] },
        { kind: "area", title: "Où nous intervenons", points: [point("Lyon 7e, Lyon 8e et Villeurbanne")] },
        { kind: "contact", title: "Appelez-nous", points: [point("Du lundi au samedi, de 8 h à 19 h")] },
      ],
      palette: { primary: "#0f4c81", accent: "#f59e0b", why: "Le bleu de l'eau, l'ambre pour l'urgence des appels" },
      fonts: { heading: "Inter", body: "Inter", why: "Lisible sur téléphone" },
      images: [],
      cta: { kind: "phone", label: "Appeler un plombier" },
      changes: [point("Le numéro de téléphone devient le premier bouton, visible sans défiler"), point("Une page lisible sur téléphone"), point("Les avis Google mis en avant")],
      toCheck: [],
      notes: "",
    },
  },
  {
    id: "b02-comptoir-chartrons",
    about: "Restaurant : appétit, horaires et réservation en un coup d'œil",
    company: "Le Comptoir des Chartrons",
    contact: { phone: "01 99 00 12 03", email: null, address: "21 rue Notre-Dame, 33000 Bordeaux", booking: null },
    brief: {
      positioning: "Le Comptoir des Chartrons sert une bistronomie de saison aux Bordelais et aux visiteurs du quartier des Chartrons, midi et soir du mardi au samedi.",
      audience: "Habitants des Chartrons, couples, petits groupes et visiteurs de Bordeaux",
      tone: "Chaleureux, gourmand, simple",
      headline: "La bistronomie de saison au cœur des Chartrons",
      subheadline: "Déjeuner et dîner du mardi au samedi · 4,5/5 sur 214 avis Google",
      sections: [
        { kind: "hero", title: "Bienvenue au Comptoir", points: [point("Une cuisine de saison, midi et soir, du mardi au samedi.")] },
        { kind: "services", title: "La carte du moment", points: [point("Velouté de potimarron, œuf parfait"), point("Magret, purée de céleri ; poisson du jour"), point("Canelé maison, crème glacée")] },
        { kind: "proof", title: "Ce qu'en disent nos clients", points: [point("4,5/5 sur 214 avis Google")] },
        { kind: "about", title: "Le lieu", points: [point("Un bistrot du quartier des Chartrons, à deux pas des quais")] },
        { kind: "contact", title: "Réserver une table", points: [point("Mardi - samedi, 12 h - 14 h et 19 h - 22 h"), point("21 rue Notre-Dame, 33000 Bordeaux")] },
      ],
      palette: { primary: "#7c2d12", accent: "#d97706", why: "Le bois et le vin, une touche dorée" },
      fonts: { heading: "Inter", body: "Inter", why: "Sobre et lisible" },
      images: [],
      cta: { kind: "phone", label: "Réserver une table" },
      changes: [point("La réservation devient le premier bouton"), point("Les horaires visibles dès le premier écran"), point("La carte du moment sur la page d'accueil")],
      toCheck: [],
      notes: "",
    },
  },
  {
    id: "b03-kine-saint-michel",
    about: "Cabinet de santé : sobriété, confiance, prise de rendez-vous",
    company: "Kiné Saint-Michel",
    contact: { phone: "01 99 00 12 06", email: null, address: "40 rue de Vesle, 51100 Reims", booking: null },
    brief: {
      positioning: "Kiné Saint-Michel réunit quatre kinésithérapeutes à Reims pour la rééducation, le sport et la kinésithérapie respiratoire des adultes et des enfants.",
      audience: "Patients de Reims sur ordonnance : adultes, sportifs, parents de nourrissons",
      tone: "Professionnel, apaisant, clair",
      headline: "Quatre kinésithérapeutes à Reims pour vous remettre en mouvement",
      subheadline: "Rééducation, sport et kiné respiratoire, du lundi au samedi · 4,9/5 sur 41 avis",
      sections: [
        { kind: "hero", title: "Votre cabinet de kinésithérapie", points: [point("Quatre praticiens, du lundi au samedi, sur ordonnance.")] },
        { kind: "services", title: "Nos soins", points: [point("Rééducation après une opération ou une blessure"), point("Kinésithérapie du sport"), point("Kinésithérapie respiratoire pour les nourrissons et les adultes")] },
        { kind: "process", title: "Votre premier rendez-vous", points: [point("Apportez votre ordonnance et vos examens"), point("Un bilan de 45 minutes, puis un programme de séances")] },
        { kind: "proof", title: "Nos patients", points: [point("4,9/5 sur 41 avis Google")] },
        { kind: "contact", title: "Prendre rendez-vous", points: [point("40 rue de Vesle, 51100 Reims"), point("Secrétariat du lundi au samedi")] },
      ],
      palette: { primary: "#0e7490", accent: null, why: "Un bleu-vert apaisant, médical sans être froid" },
      fonts: { heading: "Inter", body: "Inter", why: "Clair pour tous les âges" },
      images: [],
      cta: { kind: "phone", label: "Prendre rendez-vous" },
      changes: [point("Le bouton de rendez-vous visible partout"), point("Les soins expliqués simplement"), point("Le déroulé du premier rendez-vous")],
      toCheck: [],
      notes: "",
    },
  },
]
