import {
  Bot,
  ChartNoAxesCombined,
  Code2,
  Headphones,
  Megaphone,
  Search,
  CalendarCheck,
  Handshake,
  Layers3,
  Rocket,
  Crown,
} from "lucide-react";

export const navigation = [
  { label: "Acquisition B2B", href: "#la-machine" },
  { label: "Agents IA", href: "#agents-ia" },
  { label: "Nos offres", href: "#offres" },
  { label: "L’équipe", href: "#equipe" },
];

export const method = [
  {
    title: "Audit & Stratégie",
    icon: Search,
    text: "Analyse de votre marché, vos cibles et vos leviers.",
    detail:
      "Nous analysons votre présence, votre offre et votre parcours commercial. Vous repartez avec des priorités claires, pas une liste d’outils.",
    outcome: "Une feuille de route précise",
  },
  {
    title: "Acquisition",
    icon: Megaphone,
    text: "Contenus, campagnes et prospection multicanale.",
    detail:
      "Contenus, campagnes et prospection multicanale travaillent ensemble. Chaque action est reliée à votre cible et à un objectif commercial.",
    outcome: "Des conversations qui démarrent",
  },
  {
    title: "Qualification",
    icon: CalendarCheck,
    text: "Échanges, filtres et prises de rendez-vous.",
    detail:
      "Notre équipe et vos agents IA filtrent, enrichissent et relancent les opportunités selon les critères que nous définissons ensemble.",
    outcome: "Du temps rendu à votre équipe",
  },
  {
    title: "Résultats",
    icon: Handshake,
    text: "Des rendez-vous qualifiés et un pipeline qui se remplit.",
    detail:
      "Rendez-vous, qualité des leads, progression du pipeline : nous suivons les indicateurs utiles et optimisons les actions à partir des résultats.",
    outcome: "Des décisions fondées sur vos données",
  },
];

export const team = [
  {
    role: "Community manager",
    text: "Votre visibilité. Votre image.",
    icon: Megaphone,
    image: "/images/home/team/community-manager.png",
  },
  {
    role: "Closer / SDR",
    text: "Des échanges aux opportunités.",
    icon: Headphones,
    image: "/images/home/team/closer.png",
  },
  {
    role: "Développeur & IA",
    text: "Vos outils. Vos automatisations.",
    icon: Code2,
    image: "/images/home/team/developpeur.png",
  },
  {
    role: "Chef de projet",
    text: "Un cap clair. Un pilotage précis.",
    icon: ChartNoAxesCombined,
    image: "/images/home/team/chef-de-projet.png",
  },
];

export const plans = [
  {
    name: "Cleads Essential",
    price: null,
    icon: Layers3,
    description: "Posez les bases de votre acquisition.",
    features: [
      "Stratégie d’acquisition personnalisée",
      "Prospection sur 2 canaux",
      "8 contenus par mois",
      "Optimisation de votre tunnel",
      "Reporting mensuel",
    ],
    cta: "Parlons d’Essential",
    featured: false,
  },
  {
    name: "Cleads Growth",
    price: null,
    icon: Rocket,
    description: "Passez à la vitesse supérieure.",
    features: [
      "Prospection multicanale",
      "12 contenus par mois",
      "SDR & qualification des leads",
      "Automatisations & optimisations",
      "Pilotage hebdomadaire",
    ],
    cta: "Activer ma croissance",
    featured: true,
  },
  {
    name: "Cleads Enterprise",
    price: null,
    icon: Crown,
    description: "Une machine à votre échelle.",
    features: [
      "Plusieurs marchés ou pays",
      "Équipe renforcée et dédiée",
      "Solutions & agents IA sur mesure",
      "Volumes et intégrations adaptés",
      "Accompagnement stratégique",
    ],
    cta: "Construisons votre solution",
    featured: false,
  },
];

export const agentUseCases = [
  {
    id: "qualification",
    label: "Qualifier",
    title: "Les bonnes opportunités arrivent à la bonne personne.",
    text: "Votre agent échange avec les prospects, collecte les informations utiles et prépare le passage à votre équipe commerciale.",
    steps: [
      "Nouveau contact",
      "Échange & qualification",
      "Transmission au commercial",
    ],
    icon: Bot,
  },
  {
    id: "followup",
    label: "Relancer",
    title: "Aucune opportunité ne se perd dans le silence.",
    text: "Votre agent déclenche les relances prévues, adapte le suivi au contexte et alerte votre équipe dès qu’une réponse mérite son attention.",
    steps: ["Prospect à suivre", "Relance contextualisée", "Équipe informée"],
    icon: Headphones,
  },
  {
    id: "operations",
    label: "Automatiser",
    title: "Moins de tâches répétitives. Plus de temps utile.",
    text: "Connecté à vos outils, votre agent enrichit les données, met à jour votre CRM et exécute les actions métier que vous lui confiez.",
    steps: [
      "Vos outils connectés",
      "Actions exécutées",
      "Suivi dans votre CRM",
    ],
    icon: Code2,
  },
];

export const faqs = [
  {
    q: "À qui s’adresse l’acquisition B2B Cleads ?",
    a: "Aux PME, cabinets, entreprises de services et équipes B2B qui veulent structurer leur acquisition sans recruter tous les métiers en interne. L’audit permet de vérifier que votre offre, votre marché et vos objectifs se prêtent à l’accompagnement.",
  },
  {
    q: "Que vais-je obtenir pendant l’audit gratuit ?",
    a: "Un échange de 30 minutes pour faire le point sur votre acquisition, identifier vos principaux freins et définir les premières actions à prioriser. Nous évaluons ensuite ensemble si Cleads est le bon partenaire pour vous.",
  },
  {
    q: "Les agents IA remplacent-ils mon équipe ?",
    a: "Ils prennent en charge les tâches cadrées et répétitives pour que votre équipe se concentre sur les échanges et les décisions. Nous définissons leurs accès, leurs actions autorisées et les situations qui nécessitent un passage à un humain.",
  },
  {
    q: "En combien de temps peut-on voir des résultats ?",
    a: "Le délai dépend de votre marché, de votre cycle de vente, de vos données et des canaux activés. Nous définissons des objectifs réalistes pendant le cadrage et suivons leur progression. Aucun volume universel de rendez-vous ou de ventes n’est garanti sur cette page.",
  },
  {
    q: "Comment fonctionnent les tarifs et l’engagement ?",
    a: "Essential et Growth sont proposés sur devis, avec un engagement initial de 3 mois. Le budget publicitaire et les développements IA spécifiques sont chiffrés séparément, sauf mention contraire dans votre proposition.",
  },
];
