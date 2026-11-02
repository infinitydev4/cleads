import type { OfferBilling, OfferCategory } from "@prisma/client"
import type { OfferSignal } from "./signals"

/**
 * The V1 offers catalogue (docs/crm-v1/AGENTS-IA.md §14), written from Cleads' offers and the plans of the landing
 * (components/home-v2/content.ts). Installed once per workspace as drafts: prices are indicative, and agents only
 * recommend an offer once the owner or a manager has checked and activated it.
 */
export interface OfferSeed {
  slug: string
  name: string
  category: OfferCategory
  summary: string
  deliverables: string[]
  signals: OfferSignal[]
  priceMinEur: number | null
  priceMaxEur: number | null
  billing: OfferBilling
  priceNote?: string
  angle: string
  objections: { objection: string; answer: string }[]
}

export const OFFERS_V1: readonly OfferSeed[] = [
  {
    slug: "site-vitrine",
    name: "Site vitrine",
    category: "WEBSITE",
    summary: "Un site professionnel de 5 à 8 pages pour une entreprise qui n'a pas de site, ou seulement une page de réseau social.",
    deliverables: ["Site de 5 à 8 pages, adapté au mobile", "Textes repris et mis en forme avec l'entreprise", "SEO de base : titres, descriptions, données structurées", "Mise en ligne, nom de domaine et hébergement", "Prise en main en une heure"],
    signals: ["no_website", "site_unreachable", "social_only"],
    priceMinEur: 1500,
    priceMaxEur: 4000,
    billing: "ONE_OFF",
    angle: "Vos clients vous cherchent sur Google avant d'appeler : sans site, ces demandes partent chez les concurrents qui en ont un.",
    objections: [
      { objection: "Le bouche-à-oreille me suffit.", answer: "Il continue de marcher, mais il se vérifie en ligne : la personne recommandée tape votre nom et tombe aujourd'hui sur… rien. Le site rassure ceux qu'on vous envoie." },
      { objection: "Je n'ai pas le temps de m'en occuper.", answer: "Nous reprenons vos contenus existants et vous demandons une heure au démarrage, puis une relecture. Le reste est pour nous." },
      { objection: "C'est trop cher pour moi.", answer: "On peut partir sur 5 pages essentielles et l'enrichir ensuite. Une seule demande de devis signée suffit souvent à le rembourser." },
    ],
  },
  {
    slug: "refonte-site",
    name: "Refonte de site",
    category: "WEBSITE",
    summary: "La refonte complète d'un site daté, lent sur mobile ou non sécurisé, en gardant ce qui marche déjà.",
    deliverables: ["Nouveau design adapté au mobile", "Reprise et réécriture des contenus", "Redirections des anciennes adresses pour garder le référencement", "Passage en HTTPS et vitesse optimisée", "Suivi des demandes de contact"],
    signals: ["site_outdated", "mobile_score_low", "no_https", "cms_outdated"],
    priceMinEur: 2000,
    priceMaxEur: 6000,
    billing: "ONE_OFF",
    angle: "Votre site est noté sous 50 sur mobile : la plupart de vos visiteurs arrivent par leur téléphone et repartent avant d'avoir vu vos services.",
    objections: [
      { objection: "Mon site fonctionne très bien.", answer: "Il s'affiche, oui. Mais il met plusieurs secondes à charger sur mobile et Google le signale comme non sécurisé : ce sont des visiteurs perdus avant même de vous lire." },
      { objection: "Je vais perdre mon référencement.", answer: "Chaque ancienne adresse est redirigée vers la nouvelle et les contenus qui marchent sont gardés : la refonte protège votre référencement au lieu de le casser." },
      { objection: "Mon neveu s'en occupe.", answer: "Très bien : nous pouvons travailler avec lui sur les points de l'audit, ou lui laisser la maintenance une fois la refonte livrée." },
    ],
  },
  {
    slug: "landing-conversion",
    name: "Landing de conversion",
    category: "WEBSITE",
    summary: "Une page pensée pour transformer les visites en demandes : une offre, des preuves, un appel à l'action, la prise de rendez-vous.",
    deliverables: ["Une page dédiée à une offre ou à une campagne", "Formulaire ou prise de rendez-vous en ligne", "Suivi des conversions (analyse et publicité)", "Deux versions d'accroche à comparer"],
    signals: ["weak_cta", "no_booking", "ads_without_landing"],
    priceMinEur: 600,
    priceMaxEur: 1500,
    billing: "ONE_OFF",
    angle: "Vos visiteurs ne trouvent pas en un coup d'œil comment vous demander un devis : une page dédiée, avec un seul bouton clair, change le nombre de demandes.",
    objections: [
      { objection: "J'ai déjà un site.", answer: "La landing ne le remplace pas : elle reçoit les visiteurs d'une campagne ou d'une offre précise et les amène à vous contacter, sans les perdre dans le menu." },
      { objection: "Je ne fais pas de publicité.", answer: "Elle sert aussi à vos emails, à vos réseaux et à votre fiche Google : partout où vous voulez qu'on vous contacte pour une offre précise." },
    ],
  },
  {
    slug: "seo-local",
    name: "SEO local",
    category: "SEO",
    summary: "Être trouvé par les clients de sa zone : fiche Google complète, avis, cohérence des coordonnées et pages locales.",
    deliverables: ["Fiche Google optimisée et suivie", "Méthode de collecte d'avis et réponses aux avis", "Coordonnées identiques sur les annuaires", "Pages locales et données structurées LocalBusiness", "Suivi mensuel des positions et des appels"],
    signals: ["gbp_incomplete", "few_reviews", "low_rating", "nap_inconsistent", "no_localbusiness_schema"],
    priceMinEur: 300,
    priceMaxEur: 800,
    billing: "MONTHLY",
    angle: "Quand on cherche votre métier dans votre ville, vos concurrents apparaissent avant vous sur la carte Google : leur fiche est plus complète et ils ont plus d'avis.",
    objections: [
      { objection: "Les avis, ça ne se contrôle pas.", answer: "On ne les contrôle pas, mais on les provoque : demander au bon moment à un client content multiplie les avis positifs. Nous vous donnons la méthode et les messages." },
      { objection: "Je suis déjà sur Google.", answer: "Être présent ne suffit pas : catégories, photos, horaires et réponses aux avis font la différence entre la première place et la cinquième." },
    ],
  },
  {
    slug: "seo-editorial",
    name: "SEO éditorial",
    category: "SEO",
    summary: "Des contenus utiles chaque mois (services, villes, questions des clients) pour gagner des visites qualifiées.",
    deliverables: ["Plan de contenus par service et par ville", "Articles et pages rédigés chaque mois", "Maillage interne et optimisation des pages existantes", "Suivi des positions et des visites"],
    signals: ["few_pages", "no_service_pages"],
    priceMinEur: 600,
    priceMaxEur: 1500,
    billing: "MONTHLY",
    angle: "Votre site a peu de pages : Google ne peut pas vous proposer pour chacun de vos services ni dans chacune des villes où vous intervenez.",
    objections: [
      { objection: "Le SEO, c'est trop long.", answer: "Les premiers effets demandent quelques mois, c'est vrai ; mais chaque page gagnée travaille ensuite pour vous sans coût par clic." },
      { objection: "Personne ne lit les blogs.", answer: "Il ne s'agit pas d'un blog : ce sont des pages qui répondent aux recherches de vos futurs clients, service par service." },
    ],
  },
  {
    slug: "geo",
    name: "GEO : visibilité dans les moteurs IA",
    category: "GEO",
    summary: "Rendre l'entreprise compréhensible par les assistants IA (ChatGPT, Gemini, Perplexity) qui recommandent des prestataires.",
    deliverables: ["Données structurées sur l'entreprise et ses services", "FAQ rédigée à partir des questions des clients", "Fichier llms.txt et règles pour les robots IA", "Contenus « réponse » sur les sujets clés"],
    signals: ["no_structured_data", "no_faq", "unclear_entity"],
    priceMinEur: 400,
    priceMaxEur: 1000,
    billing: "MONTHLY",
    angle: "De plus en plus de clients demandent à un assistant IA « quel prestataire choisir » : votre site ne lui dit pas clairement qui vous êtes, ce que vous faites ni où.",
    objections: [
      { objection: "Mes clients n'utilisent pas ChatGPT.", answer: "Une partie le fait déjà, et Google affiche lui aussi des réponses générées par IA. Le travail sert les deux : ce qui est clair pour une IA l'est aussi pour Google." },
      { objection: "C'est un effet de mode.", answer: "Les actions proposées (données structurées, FAQ, contenus clairs) améliorent aussi le référencement classique : rien n'est perdu si la mode passe." },
    ],
  },
  {
    slug: "reseaux-sociaux",
    name: "Réseaux sociaux",
    category: "SOCIAL",
    summary: "Une présence régulière et soignée sur les réseaux qui comptent pour le secteur, avec une ligne éditoriale claire.",
    deliverables: ["Ligne éditoriale et calendrier", "Contenus créés et publiés chaque semaine", "Animation de la communauté et réponses", "Bilan mensuel"],
    signals: ["no_social", "inactive_social", "visual_sector"],
    priceMinEur: 400,
    priceMaxEur: 1200,
    billing: "MONTHLY",
    angle: "Votre métier se montre : vos réalisations sont votre meilleure publicité, mais vos réseaux sont muets depuis des mois et donnent l'impression d'une entreprise à l'arrêt.",
    objections: [
      { objection: "Les réseaux ne m'ont jamais rapporté de client.", answer: "Sans régularité, ils ne rapportent rien, c'est vrai. Publiés chaque semaine, ils rassurent ceux qui vous découvrent et rappellent votre nom à ceux qui vous connaissent." },
      { objection: "Je n'ai pas de photos.", answer: "Nous vous montrons quoi prendre sur vos chantiers ou dans votre activité en deux minutes, et nous faisons le reste." },
    ],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    category: "ADS",
    summary: "Des campagnes Google sur les recherches à forte intention (urgence, devis), reliées à une page d'atterrissage et suivies jusqu'à la demande.",
    deliverables: ["Campagnes sur les recherches à forte intention", "Page d'atterrissage reliée", "Suivi des appels et des demandes", "Optimisation et bilan chaque mois"],
    signals: ["no_google_ads_high_intent", "ads_without_landing"],
    priceMinEur: 300,
    priceMaxEur: 900,
    billing: "MONTHLY",
    priceNote: "Hors budget publicitaire",
    angle: "Dans votre métier, les clients cherchent « en urgence » ou « devis » et choisissent parmi les premiers résultats : vous n'y êtes pas, vos concurrents si.",
    objections: [
      { objection: "J'ai essayé, ça coûte cher pour rien.", answer: "Le plus souvent, les annonces envoyaient vers la page d'accueil sans suivre les appels. Nous limitons aux recherches qui convertissent et mesurons chaque demande." },
      { objection: "Je ne veux pas dépenser en publicité.", answer: "On peut commencer avec un petit budget sur les seules recherches d'urgence, et arrêter si le coût par demande ne vous convient pas." },
    ],
  },
  {
    slug: "meta-ads",
    name: "Meta Ads",
    category: "ADS",
    summary: "Des campagnes Facebook et Instagram pour les secteurs visuels, avec le pixel installé et des créations adaptées.",
    deliverables: ["Pixel Meta installé et vérifié", "Créations (visuels et vidéos courtes)", "Campagnes et audiences locales", "Suivi des demandes et bilan mensuel"],
    signals: ["no_meta_pixel_visual", "visual_sector"],
    priceMinEur: 300,
    priceMaxEur: 900,
    billing: "MONTHLY",
    priceNote: "Hors budget publicitaire",
    angle: "Votre activité se vend en images : Instagram et Facebook permettent de montrer vos réalisations aux habitants de votre zone, au bon moment.",
    objections: [
      { objection: "Mes clients ne sont pas sur Facebook.", answer: "Instagram et Facebook touchent aujourd'hui toutes les tranches d'âge dans une zone donnée : on vérifie avec un petit test avant d'engager plus." },
      { objection: "Je ne sais pas faire de vidéos.", answer: "Les créations sont comprises : quelques photos de vos réalisations suffisent pour démarrer." },
    ],
  },
  {
    slug: "parcours-acquisition",
    name: "Parcours d'acquisition complet",
    category: "PACK",
    summary: "Site ou landing, SEO et GEO, réseaux, publicité et prospection travaillés ensemble quand plusieurs volets sont faibles.",
    deliverables: ["Site ou landing de conversion", "SEO local et GEO", "Réseaux sociaux", "Publicité Google ou Meta", "Prospection et reporting mensuel"],
    signals: ["three_low_scores"],
    priceMinEur: 1500,
    priceMaxEur: 4000,
    billing: "MONTHLY",
    angle: "Plusieurs volets de votre présence en ligne sont faibles en même temps : les traiter ensemble coûte moins cher et donne des résultats plus vite que pièce par pièce.",
    objections: [
      { objection: "C'est trop d'un coup.", answer: "On priorise : le premier mois porte sur ce qui rapporte le plus vite, les autres volets suivent. Vous voyez les résultats avant chaque étape." },
      { objection: "Je préfère commencer petit.", answer: "C'est possible avec une offre d'entrée (site ou SEO local), et le parcours complet ensuite si les résultats sont là." },
    ],
  },
  {
    slug: "cleads-essential",
    name: "Cleads Essential",
    category: "RETAINER",
    summary: "Poser les bases de son acquisition : stratégie personnalisée, prospection sur deux canaux et contenus réguliers.",
    deliverables: ["Stratégie d'acquisition personnalisée", "Prospection sur 2 canaux", "8 contenus par mois", "Optimisation du tunnel", "Reporting mensuel"],
    signals: ["long_term_fit"],
    priceMinEur: null,
    priceMaxEur: null,
    billing: "QUOTE",
    priceNote: "Sur devis, engagement initial de 3 mois",
    angle: "Vous voulez des demandes régulières sans recruter tous les métiers en interne : nous posons les bases et les faisons tourner chaque mois.",
    objections: [
      { objection: "Je ne veux pas m'engager.", answer: "L'engagement initial est de 3 mois, le temps de mesurer de vrais résultats ; ensuite, vous décidez mois par mois." },
      { objection: "Combien ça coûte ?", answer: "Le prix dépend de votre marché et des canaux : l'audit gratuit de 30 minutes permet de vous faire une proposition précise." },
    ],
  },
  {
    slug: "cleads-growth",
    name: "Cleads Growth",
    category: "RETAINER",
    summary: "Accélérer : prospection multicanale, contenus, SDR et qualification des leads, automatisations, pilotage hebdomadaire.",
    deliverables: ["Prospection multicanale", "12 contenus par mois", "SDR et qualification des leads", "Automatisations et optimisations", "Pilotage hebdomadaire"],
    signals: ["long_term_fit"],
    priceMinEur: null,
    priceMaxEur: null,
    billing: "QUOTE",
    priceNote: "Sur devis, engagement initial de 3 mois",
    angle: "Votre acquisition fonctionne mais plafonne : une équipe dédiée qualifie les leads et vous ne recevez que des rendez-vous utiles.",
    objections: [
      { objection: "J'ai déjà un commercial.", answer: "Il gagne du temps : nos SDR et les agents IA filtrent et relancent, il ne garde que les rendez-vous qualifiés." },
      { objection: "Combien ça coûte ?", answer: "Le prix dépend du volume et des canaux : l'audit gratuit permet de vous faire une proposition chiffrée." },
    ],
  },
  {
    slug: "cleads-enterprise",
    name: "Cleads Enterprise",
    category: "RETAINER",
    summary: "Une machine d'acquisition à l'échelle : plusieurs marchés ou pays, équipe dédiée, agents IA sur mesure, intégrations.",
    deliverables: ["Plusieurs marchés ou pays", "Équipe renforcée et dédiée", "Solutions et agents IA sur mesure", "Volumes et intégrations adaptés", "Accompagnement stratégique"],
    signals: ["long_term_fit"],
    priceMinEur: null,
    priceMaxEur: null,
    billing: "QUOTE",
    priceNote: "Sur devis",
    angle: "Vous visez plusieurs marchés : une équipe et des outils construits pour vos volumes, reliés à vos systèmes.",
    objections: [{ objection: "Nous avons nos propres outils.", answer: "Nous nous branchons dessus : les intégrations font partie de l'offre, rien n'est imposé." }],
  },
]
