/**
 * Configuration des flux RSS par catégorie
 * Ce fichier centralise tous les flux RSS utilisés pour la génération d'articles
 */

export interface RssFeedConfig {
  url: string;
  name: string;
  language: string;
  category: string;
  priority?: number; // Plus le nombre est élevé, plus la priorité est haute
  isValid?: boolean; // Indique si le flux a été vérifié et est valide
}

// Collection de flux RSS par catégorie
export const RSS_FEEDS: Record<string, RssFeedConfig[]> = {
  "technology": [
    { url: "https://www.journaldunet.com/rss/", name: "Journal du Net", language: "fr", category: "technology", priority: 3 },
    { url: "https://www.01net.com/actualites/feed/", name: "01net", language: "fr", category: "technology", priority: 3 },
    { url: "https://www.zdnet.fr/feeds/rss/actualites/", name: "ZDNet", language: "fr", category: "technology", priority: 2 },
    { url: "https://feeds.feedburner.com/frandroid", name: "Frandroid", language: "fr", category: "technology", priority: 2 },
    { url: "https://services.lesechos.fr/rss/les-echos-tech-medias.xml", name: "Les Echos Tech Medias", language: "fr", category: "technology", priority: 2 },
    { url: "https://www.nextinpact.com/feed/", name: "Next INpact", language: "fr", category: "technology", priority: 1 },
    { url: "https://korben.info/feed", name: "Korben", language: "fr", category: "technology", priority: 2 },
  ],
  
  "marketing": [
    { url: "https://www.blogdumoderateur.com/feed/", name: "Blog du Modérateur", language: "fr", category: "marketing", priority: 3 },
    { url: "https://comarketing-news.fr/feed/", name: "Comarketing News", language: "fr", category: "marketing", priority: 2 },
    { url: "https://www.webmarketing-com.com/feed", name: "Webmarketing & co'm", language: "fr", category: "marketing", priority: 2 },
  ],
  
  "ia": [
    { url: "https://intelligence-artificielle.com/feed/", name: "Intelligence Artificielle", language: "fr", category: "ia", priority: 3 },
    { url: "https://siecledigital.fr/category/intelligence-artificielle/feed", name: "Siècle Digital IA", language: "fr", category: "ia", priority: 3 },
    { url: "https://www.lebigdata.fr/feed", name: "Le Big Data", language: "fr", category: "ia", priority: 2 },
    { url: "https://www.actuia.com/feed/", name: "Actu IA", language: "fr", category: "ia", priority: 3 },
    { url: "https://www.usine-digitale.fr/intelligence-artificielle/rss", name: "Usine Digitale IA", language: "fr", category: "ia", priority: 2 },
    { url: "https://datanews.levif.be/feed/", name: "Data News", language: "fr", category: "ia", priority: 1 },
    { url: "https://www.silicon.fr/rss/data-ia-1372.xml", name: "Silicon Data IA", language: "fr", category: "ia", priority: 1 },
    { url: "https://www.e-marketing.fr/rss/toutelinfo", name: "E-marketing", language: "fr", category: "marketing", priority: 3 },
    { url: "https://www.usine-digitale.fr/ia-generative/rss", name: "Usine Digitale IA Générative", language: "fr", category: "ia", priority: 2 },
  ],
  
  "developpement_web": [
    { url: "https://www.programmez.com/rss.xml", name: "Programmez", language: "fr", category: "developpement_web", priority: 3 },
    { url: "https://css-tricks.com/feed/", name: "CSS-Tricks", language: "en", category: "developpement_web", priority: 3 },
    { url: "https://www.alsacreations.com/rss/actualites.xml", name: "Alsacréations", language: "fr", category: "developpement_web", priority: 2 },
    { url: "https://www.creativejuiz.fr/blog/feed", name: "Creative Juiz", language: "fr", category: "developpement_web", priority: 2 },
    { url: "https://blog.eleven-labs.com/feed.xml", name: "Eleven Labs", language: "fr", category: "developpement_web", priority: 2 },
    { url: "https://www.lemondeinformatique.fr/flux-rss/thematique/toutes-les-actualites/rss.xml", name: "Le Monde Informatique", language: "fr", category: "developpement_web", priority: 2 },
    { url: "https://www.usine-digitale.fr/logiciels-applications/rss", name: "Usine Digitale Logiciels & Applications", language: "fr", category: "developpement_web", priority: 2 },
  ],
  
  "mobile": [
    { url: "https://www.frandroid.com/category/android/feed", name: "Frandroid Android", language: "fr", category: "mobile", priority: 3 },
    { url: "https://www.frandroid.com/category/ios/feed", name: "Frandroid iOS", language: "fr", category: "mobile", priority: 3 },
    { url: "https://www.journaldugeek.com/category/smartphone/feed/", name: "Journal du Geek Mobile", language: "fr", category: "mobile", priority: 2 },
  ],
  
  "programmation": [
    { url: "https://www.developpez.com/index/rss", name: "Developpez.com", language: "fr", category: "programmation", priority: 3 },
    { url: "https://news.humancoders.com/t/developpement/items/feed.rss", name: "Human Coders News", language: "fr", category: "programmation", priority: 2 },
    { url: "https://blog.jetbrains.com/fr/feed/", name: "JetBrains Blog", language: "fr", category: "programmation", priority: 2 },
    { url: "https://www.infoq.com/fr/feed", name: "InfoQ", language: "fr", category: "programmation", priority: 2 },
    { url: "https://dev.to/feed", name: "DEV Community", language: "en", category: "programmation", priority: 3 },
    { url: "https://korben.info/feed", name: "Korben", language: "fr", category: "programmation", priority: 1 },
  ],
  
  "business": [
    { url: "https://www.maddyness.com/feed/", name: "Maddyness", language: "fr", category: "business", priority: 3 },
    { url: "https://services.lesechos.fr/rss/les-echos-start-up.xml", name: "Les Echos Start-up", language: "fr", category: "business", priority: 3 },
    { url: "https://services.lesechos.fr/rss/les-echos-entreprises.xml", name: "Les Echos Entreprises", language: "fr", category: "business", priority: 3 },
    { url: "https://www.silicon.fr/rss/business-1367.xml", name: "Silicon", language: "fr", category: "business", priority: 3 },
    { url: "https://www.usine-digitale.fr/rss", name: "Usine Digitale", language: "fr", category: "business", priority: 2 },
    { url: "https://services.lesechos.fr/rss/les-echos-economie.xml", name: "Les Échos", language: "fr", category: "business", priority: 3 },
    { url: "https://services.lesechos.fr/rss/les-echos-finance-marches.xml", name: "Les Echos Finance Marches", language: "fr", category: "business", priority: 3 },
  ],
  
  "seo": [
    { url: "https://www.abondance.com/feed", name: "Abondance", language: "fr", category: "seo", priority: 3 },
    { url: "https://www.leptidigital.fr/feed/", name: "Le P'tit Digital", language: "fr", category: "seo", priority: 2 },
    { url: "https://seo.fr/blog/feed/", name: "SEO.fr", language: "fr", category: "seo", priority: 2 },
    { url: "https://www.seomix.fr/feed/", name: "SEOMix", language: "fr", category: "seo", priority: 2 },
  ],
  
  "ux_design": [
    { url: "https://uxmind.eu/feed/", name: "UX Mind", language: "fr", category: "ux_design", priority: 2 },
    { url: "https://www.ux-republic.com/feed/", name: "UX Republic", language: "fr", category: "ux_design", priority: 3 },
    { url: "https://www.usabilis.com/feed/", name: "Usabilis", language: "fr", category: "ux_design", priority: 1 },
  ]
};

/**
 * Obtient des flux RSS pour une catégorie spécifique
 * @param category - Catégorie pour laquelle obtenir les flux RSS
 * @param limit - Nombre maximum de flux à retourner (3 par défaut)
 * @returns Liste des URLs de flux RSS pour la catégorie
 */
export function getRssFeedsForCategory(category: string | undefined, limit: number = 3): string[] {
  console.log(`Recherche de flux RSS pour la catégorie: "${category || 'non spécifiée'}", limite: ${limit}`);
  
  if (!category) {
    console.log("Aucune catégorie spécifiée, utilisation du flux par défaut");
    return [RSS_FEEDS["business"][0].url]; // Valeur par défaut
  }
  
  // Rechercher une correspondance exacte
  if (RSS_FEEDS[category]) {
    console.log(`Correspondance exacte trouvée pour la catégorie "${category}"`);
    // Trier par priorité et retourner les URLs
    const feeds = RSS_FEEDS[category]
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, limit)
      .map(feed => feed.url);
    
    console.log(`${feeds.length} flux sélectionnés pour la catégorie "${category}"`);
    return feeds;
  }
  
  // Rechercher une correspondance partielle
  for (const [key, feeds] of Object.entries(RSS_FEEDS)) {
    if (category.toLowerCase().includes(key.toLowerCase()) || 
        key.toLowerCase().includes(category.toLowerCase())) {
      console.log(`Correspondance partielle trouvée: "${category}" ↔ "${key}"`);
      const selectedFeeds = feeds
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, limit)
        .map(feed => feed.url);
      
      console.log(`${selectedFeeds.length} flux sélectionnés pour la correspondance partielle "${key}"`);
      return selectedFeeds;
    }
  }
  
  // Aucune correspondance, retourner des flux généraux
  console.log(`Aucune correspondance trouvée pour "${category}", utilisation des flux par défaut`);
  const defaultFeeds = [
    RSS_FEEDS["technology"][0].url,
    RSS_FEEDS["business"][0].url,
    RSS_FEEDS["marketing"][0].url
  ];
  
  return defaultFeeds.slice(0, limit);
}

/**
 * Vérifie si un flux RSS est accessible
 * @param url - URL du flux RSS à vérifier
 * @returns Promise<boolean> - true si le flux est valide, false sinon
 */
export async function checkRssFeedValidity(url: string): Promise<boolean> {
  try {
    console.log(`Vérification de la validité du flux RSS: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout de 5 secondes
    
    const response = await fetch(url, { 
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`Le flux RSS ${url} a retourné un statut ${response.status}`);
      return false;
    }
    
    // Vérifier le type de contenu
    const contentType = response.headers.get('content-type');
    const isXmlContentType = contentType && (
      contentType.includes('xml') || 
      contentType.includes('rss') || 
      contentType.includes('atom') ||
      contentType.includes('text/plain') || // Certains serveurs envoient du XML comme text/plain
      contentType.includes('application/octet-stream') // Ou comme binaire générique
    );
    
    if (!isXmlContentType) {
      console.warn(`Le flux ${url} n'a pas un type de contenu XML (${contentType})`);
      // Pour les contenus non détectés comme XML, essayons d'examiner le contenu
      const text = await response.text();
      const containsXmlElements = /<(rss|feed|channel|item|entry)[\s>]/i.test(text);
      
      if (containsXmlElements) {
        console.log(`Le flux ${url} a un type de contenu non standard, mais contient des éléments XML/RSS`);
        return true;
      }
      
      return false;
    }
    
    // Examiner le contenu pour s'assurer qu'il s'agit bien d'un flux
    const text = await response.text();
    
    // Chercher des balises XML caractéristiques des flux RSS/Atom
    const isRss = /<rss[\s>]/i.test(text);
    const isAtom = /<feed[\s>]/i.test(text);
    const hasChannel = /<channel[\s>]/i.test(text);
    const hasItems = /<item[\s>]/i.test(text) || /<entry[\s>]/i.test(text);
    
    const isValidFeed = (isRss || isAtom) && (hasChannel || hasItems);
    
    if (isValidFeed) {
      console.log(`Le flux RSS ${url} est valide (${isRss ? 'RSS' : 'Atom'})`);
      return true;
    }
    
    console.warn(`Le flux ${url} a un type de contenu XML mais ne contient pas d'éléments RSS/Atom`);
    return false;
  } catch (error) {
    console.error(`Erreur lors de la vérification du flux RSS ${url}:`, error);
    return false;
  }
}

/**
 * Obtient des flux RSS validés pour une catégorie spécifique
 * @param category - Catégorie pour laquelle obtenir les flux RSS
 * @param limit - Nombre maximum de flux à retourner (3 par défaut)
 * @returns Promise<string[]> - Liste des URLs de flux RSS valides pour la catégorie
 */
export async function getValidatedRssFeedsForCategory(category: string | undefined, limit: number = 3): Promise<string[]> {
  console.log(`Recherche de flux RSS validés pour la catégorie: "${category || 'non spécifiée'}", limite: ${limit}`);
  
  // Obtenir les candidats de flux RSS
  const candidateFeeds = getRssFeedsForCategory(category, limit * 2); // Demander plus de flux pour avoir une marge
  
  // Vérifier la validité de chaque flux en parallèle
  const validityChecks = await Promise.all(
    candidateFeeds.map(async (url) => ({
      url,
      isValid: await checkRssFeedValidity(url)
    }))
  );
  
  // Filtrer les flux valides
  const validFeeds = validityChecks
    .filter(feed => feed.isValid)
    .map(feed => feed.url)
    .slice(0, limit);
  
  console.log(`${validFeeds.length} flux valides trouvés sur ${candidateFeeds.length} candidats pour la catégorie "${category || 'non spécifiée'}"`);
  
  // Si aucun flux valide n'est trouvé, essayer avec des flux généraux
  if (validFeeds.length === 0) {
    console.warn(`Aucun flux valide trouvé pour la catégorie "${category || 'non spécifiée'}", utilisation des flux généraux`);
    
    // Essayer quelques flux généraux réputés fiables
    const generalFeeds = [
      "https://www.lemonde.fr/rss/une.xml",
      "https://www.journaldunet.com/rss/",
      "https://www.01net.com/actualites/feed/",
      "https://www.usine-digitale.fr/rss"
    ];
    
    const validGeneralFeeds = await Promise.all(
      generalFeeds.map(async (url) => ({
        url,
        isValid: await checkRssFeedValidity(url)
      }))
    );
    
    return validGeneralFeeds
      .filter(feed => feed.isValid)
      .map(feed => feed.url)
      .slice(0, limit);
  }
  
  return validFeeds;
}

/**
 * Obtient des flux RSS aléatoires de plusieurs catégories (version synchrone pour compatibilité)
 * @param count - Nombre total de flux à retourner
 * @returns Liste des URLs de flux RSS
 */
export function getRandomRssFeeds(count: number = 3): string[] {
  const allFeeds = Object.values(RSS_FEEDS).flat();
  const shuffled = [...allFeeds].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(feed => feed.url);
}

/**
 * Obtient des flux RSS aléatoires validés de plusieurs catégories
 * @param count - Nombre total de flux à retourner
 * @returns Promise<string[]> - Liste des URLs de flux RSS valides
 */
export async function getRandomValidatedRssFeeds(count: number = 3): Promise<string[]> {
  const allFeeds = Object.values(RSS_FEEDS).flat();
  const shuffled = [...allFeeds].sort(() => 0.5 - Math.random());
  const candidateFeeds = shuffled.slice(0, count * 2).map(feed => feed.url);
  
  // Vérifier la validité de chaque flux en parallèle
  const validityChecks = await Promise.all(
    candidateFeeds.map(async (url) => ({
      url,
      isValid: await checkRssFeedValidity(url)
    }))
  );
  
  // Filtrer les flux valides
  const validFeeds = validityChecks
    .filter(feed => feed.isValid)
    .map(feed => feed.url)
    .slice(0, count);
  
  console.log(`${validFeeds.length} flux aléatoires valides trouvés sur ${candidateFeeds.length} candidats`);
  
  if (validFeeds.length < count) {
    console.warn(`Nombre insuffisant de flux aléatoires validés (${validFeeds.length}/${count})`);
  }
  
  return validFeeds;
} 