/**
 * Gestionnaire de sources de contenu
 * 
 * Ce module offre une architecture modulaire et extensible pour gérer différentes sources
 * de contenu (RSS, API, réseaux sociaux, etc.) pour la génération d'articles.
 */

import { getRssFeedsForCategory, getRandomRssFeeds, getValidatedRssFeedsForCategory, getRandomValidatedRssFeeds } from "@/lib/config/rss-feeds";
import { NewsArticle } from "@/types/blog";
import Parser from 'rss-parser';
import { shuffleArray } from "@/lib/utils/array-utils";

// Constante pour définir si on utilise la validation des flux par défaut
const USE_VALIDATED_FEEDS = true;

// Types personnalisés pour rss-parser
type CustomItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  description?: string;
  contentEncoded?: string; // Champ personnalisé pour le contenu encodé
  media?: any; // Champ personnalisé pour les médias
};

type CustomFeed = {
  title?: string;
  description?: string;
  items: CustomItem[];
};

// Instance du parser RSS avec types personnalisés
const rssParser = new Parser<CustomFeed, CustomItem>({
  customFields: {
    item: [
      ['media:content', 'media'],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

// Interface commune pour toutes les sources de contenu
export interface ContentSource {
  id: string;
  name: string;
  description: string;
  type: ContentSourceType;
  isEnabled: boolean;
  isPremium: boolean;
  fetchContent: (query?: string, options?: any) => Promise<NewsArticle[]>;
}

// Types de sources de contenu disponibles
export enum ContentSourceType {
  RSS = "rss",
  API = "api",
  SOCIAL = "social",
  AI = "ai",
  CUSTOM = "custom"
}

// Interface pour les options de récupération de contenu
export interface ContentFetchOptions {
  category?: string;
  limit?: number;
  sourceCount?: number;
  selectionMode?: 'recent' | 'random' | 'mixed';
  language?: string;
  timeRange?: 'day' | 'week' | 'month' | 'any';
}

// Source de contenu RSS
export const RssContentSource: ContentSource = {
  id: "rss",
  name: "Flux RSS",
  description: "Récupère le contenu à partir de flux RSS",
  type: ContentSourceType.RSS,
  isEnabled: true,
  isPremium: false,
  
  fetchContent: async (query?: string, options: ContentFetchOptions = {}): Promise<NewsArticle[]> => {
    const {
      category,
      sourceCount = 3,
      selectionMode = 'recent',
      limit = 10
    } = options;
    
    // Déterminer les flux RSS à utiliser
    let rssFeeds: string[] = [];
    
    try {
      if (USE_VALIDATED_FEEDS) {
        console.log("Utilisation des flux RSS validés");
        
        if (query && !category) {
          // Si on a une requête mais pas de catégorie, on cherche les flux RSS correspondants
          const matchingCategory = findCategoryFromQuery(query);
          rssFeeds = await getValidatedRssFeedsForCategory(matchingCategory, sourceCount);
        } else if (category) {
          // Si on a une catégorie, on utilise les flux correspondants
          rssFeeds = await getValidatedRssFeedsForCategory(category, sourceCount);
        } else {
          // Si on n'a ni requête ni catégorie, on prend des flux aléatoires
          rssFeeds = await getRandomValidatedRssFeeds(sourceCount);
        }
      } else {
        // Utiliser les fonctions non validées pour la rétrocompatibilité
        if (query && !category) {
          // Si on a une requête mais pas de catégorie, on cherche les flux RSS correspondants
          const matchingCategory = findCategoryFromQuery(query);
          rssFeeds = getRssFeedsForCategory(matchingCategory, sourceCount);
        } else if (category) {
          // Si on a une catégorie, on utilise les flux correspondants
          rssFeeds = getRssFeedsForCategory(category, sourceCount);
        } else {
          // Si on n'a ni requête ni catégorie, on prend des flux aléatoires
          rssFeeds = getRandomRssFeeds(sourceCount);
        }
      }
      
      if (rssFeeds.length === 0) {
        console.warn("Aucun flux RSS trouvé, utilisation des articles de secours");
        return getBackupArticles();
      }
      
      // Récupérer les articles de chaque flux en parallèle
      const articlePromises = rssFeeds.map(feedUrl => 
        fetchArticlesFromRss(feedUrl).catch(error => {
          console.log(`Erreur lors de la récupération des articles RSS depuis ${feedUrl}:`, error);
          return [] as NewsArticle[];
        })
      );
      
      // Attendre que toutes les promesses se résolvent
      const articlesPerFeed = await Promise.all(articlePromises);
      
      // Fusionner tous les articles en une seule liste
      let allArticles: NewsArticle[] = articlesPerFeed.flat();
      
      // Si aucun article n'est trouvé, utiliser les articles de secours
      if (allArticles.length === 0) {
        console.warn("Aucun article trouvé dans les flux, utilisation des articles de secours");
        return getBackupArticles();
      }
      
      // Filtrer si nécessaire par la requête
      if (query) {
        const queryLower = query.toLowerCase();
        allArticles = allArticles.filter(article => {
          const titleLower = article.title.toLowerCase();
          const descLower = article.description.toLowerCase();
          return titleLower.includes(queryLower) || descLower.includes(queryLower);
        });
      }
      
      // Trier et sélectionner les articles selon le mode choisi
      let selectedArticles: NewsArticle[] = [];
      
      if (selectionMode === 'recent') {
        // Les plus récents
        selectedArticles = allArticles
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, limit);
      } else if (selectionMode === 'random') {
        // Aléatoire
        selectedArticles = shuffleArray(allArticles).slice(0, limit);
      } else {
        // Mode mixte (50% récents, 50% aléatoires)
        const recentCount = Math.ceil(limit / 2);
        const randomCount = limit - recentCount;
        
        const recentArticles = allArticles
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, recentCount);
        
        const randomArticles = shuffleArray(
          allArticles.filter(a => !recentArticles.includes(a))
        ).slice(0, randomCount);
        
        selectedArticles = [...recentArticles, ...randomArticles];
      }
      
      return selectedArticles;
    } catch (error) {
      console.error(`Erreur lors de la récupération des articles depuis les flux RSS:`, error);
      return [];
    }
  }
};

// Source de contenu basée sur l'IA (génération sans source)
export const AiContentSource: ContentSource = {
  id: "ai",
  name: "IA Générative",
  description: "Génère des idées d'articles sans source externe",
  type: ContentSourceType.AI,
  isEnabled: true,
  isPremium: false,
  
  fetchContent: async (query?: string, options: ContentFetchOptions = {}): Promise<NewsArticle[]> => {
    const {
      category,
      limit = 5
    } = options;
    
    // Créer des articles fictifs basés sur la requête ou catégorie
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    const topic = query || category || "marketing digital";
    
    // Générer des titres d'articles fictifs basés sur le sujet
    const titleTemplates = [
      `Les meilleures stratégies de ${topic} en 2025`,
      `Comment optimiser votre approche de ${topic}`,
      `5 tendances incontournables en ${topic}`,
      `L'avenir du ${topic} : analyses et prédictions`,
      `Guide ultime pour maîtriser le ${topic}`,
      `${topic} : les pratiques à adopter immédiatement`,
      `Maximiser vos résultats en ${topic}`,
      `Les erreurs à éviter en ${topic}`,
      `${topic} : étude de cas et succès remarquables`
    ];
    
    // Générer des articles fictifs
    const articles: NewsArticle[] = shuffleArray(titleTemplates)
      .slice(0, limit)
      .map((title, index) => ({
        title,
        description: `Découvrez les dernières innovations et stratégies optimales dans le domaine du ${topic}. Cet article vous guidera à travers les meilleures pratiques et tendances actuelles.`,
        url: `https://cleads.fr/blog/${slugify(title)}`,
        publishedAt: new Date(now.getTime() - index * 86400000).toISOString(),
        source: {
          name: "IA Générative Cleads"
        }
      }));
    
    return articles;
  }
};

// Liste des sources de contenu disponibles
export const contentSources: ContentSource[] = [
  RssContentSource,
  AiContentSource
  // Facilement extensible pour ajouter d'autres sources
];

/**
 * Articles de secours réutilisables quand les flux RSS échouent
 */
function getBackupArticles(): NewsArticle[] {
  // Obtenir la date actuelle pour simuler des articles récents
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - 2);
  
  return [
    {
      title: "Les tendances du marketing digital pour 2025",
      description: "Découvrez les stratégies de contenu, d'IA et d'automatisation qui transformeront le marketing digital cette année",
      url: "https://cleads.fr/blog/tendances-marketing-digital",
      publishedAt: now.toISOString(),
      source: {
        name: "Cleads Magazine"
      }
    },
    {
      title: "Comment l'intelligence artificielle révolutionne la création de contenu",
      description: "Les outils d'IA générative comme GPT-4 transforment radicalement la façon dont les entreprises produisent du contenu à grande échelle",
      url: "https://cleads.fr/blog/ia-creation-contenu",
      publishedAt: yesterday.toISOString(),
      source: {
        name: "Tech Insights"
      }
    },
    {
      title: "SEO en 2025 : Les facteurs de classement qui comptent vraiment",
      description: "Google continue d'évoluer avec des mises à jour d'algorithme privilégiant l'intention de recherche et l'expérience utilisateur",
      url: "https://cleads.fr/blog/seo-facteurs-classement",
      publishedAt: twoDaysAgo.toISOString(),
      source: {
        name: "SEO Experts"
      }
    },
    {
      title: "Les frameworks JavaScript qui domineront le développement web",
      description: "React, Vue.js, Svelte et les nouveaux frameworks qui façonnent l'avenir du développement frontend",
      url: "https://cleads.fr/blog/frameworks-javascript",
      publishedAt: twoDaysAgo.toISOString(),
      source: {
        name: "Dev Chronicles"
      }
    },
    {
      title: "Automatisation marketing : optimiser ses campagnes grâce à l'IA",
      description: "Comment les plateformes d'automatisation marketing utilisent l'intelligence artificielle pour améliorer les performances",
      url: "https://cleads.fr/blog/automatisation-marketing-ia",
      publishedAt: yesterday.toISOString(),
      source: {
        name: "Marketing Automation Today"
      }
    }
  ];
}

// Gestionnaire de sources de contenu
export class ContentSourceManager {
  private sources: Map<string, ContentSource>;
  private _lastFetchedArticles: Map<string, NewsArticle[]> = new Map(); // Garder une trace des derniers articles générés par source
  
  constructor() {
    this.sources = new Map();
    
    // Enregistrer les sources par défaut
    contentSources.forEach(source => {
      this.registerSource(source);
    });
  }
  
  // Obtenir les derniers articles générés pour une source
  get lastFetchedArticles(): Map<string, NewsArticle[]> {
    return this._lastFetchedArticles;
  }
  
  // Enregistrer une nouvelle source
  registerSource(source: ContentSource): void {
    this.sources.set(source.id, source);
  }
  
  // Récupérer une source par son ID
  getSource(id: string): ContentSource | undefined {
    return this.sources.get(id);
  }
  
  // Récupérer toutes les sources disponibles
  getAllSources(): ContentSource[] {
    return Array.from(this.sources.values());
  }
  
  // Récupérer toutes les sources activées
  getEnabledSources(): ContentSource[] {
    return Array.from(this.sources.values()).filter(s => s.isEnabled);
  }
  
  // Récupérer le contenu depuis une source spécifique
  async fetchFromSource(sourceId: string, query?: string, options?: ContentFetchOptions): Promise<NewsArticle[]> {
    const source = this.getSource(sourceId);
    if (!source) {
      throw new Error(`Source de contenu "${sourceId}" non trouvée`);
    }
    
    const articles = await source.fetchContent(query, options);
    
    // Stocker les articles récupérés pour éviter des duplications entre sources
    this._lastFetchedArticles.set(sourceId, articles);
    
    return articles;
  }
  
  // Récupérer le contenu depuis toutes les sources activées et les fusionner
  async fetchFromAllSources(query?: string, options?: ContentFetchOptions): Promise<NewsArticle[]> {
    const enabledSources = this.getEnabledSources();
    const limit = options?.limit || 10;
    
    // Répartir la limite entre les sources
    const limitPerSource = Math.ceil(limit / enabledSources.length);
    
    // Récupérer le contenu de chaque source en parallèle
    const promises = enabledSources.map(source => 
      source.fetchContent(query, { ...options, limit: limitPerSource })
        .catch(error => {
          console.error(`Erreur lors de la récupération depuis la source ${source.id}:`, error);
          return [] as NewsArticle[];
        })
    );
    
    // Attendre que toutes les promesses se résolvent
    const resultsPerSource = await Promise.all(promises);
    
    // Fusionner tous les résultats
    let allArticles: NewsArticle[] = resultsPerSource.flat();
    
    // Supprimer les doublons potentiels (par URL)
    const uniqueArticles = Array.from(
      new Map(allArticles.map(article => [article.url, article])).values()
    );
    
    // Appliquer toute autre logique de filtrage ou tri
    return uniqueArticles.slice(0, limit);
  }
}

// Créer une instance globale du gestionnaire
export const contentSourceManager = new ContentSourceManager();

// Fonctions utilitaires

// Récupérer des articles depuis un flux RSS
async function fetchArticlesFromRss(feedUrl: string): Promise<NewsArticle[]> {
  try {
    console.log(`Récupération du flux RSS: ${feedUrl}`);
    
    // Utiliser rss-parser pour analyser le flux
    const feed = await rssParser.parseURL(feedUrl);
    
    if (!feed.items || feed.items.length === 0) {
      console.log(`Aucun élément trouvé dans le flux RSS: ${feedUrl}`);
      return [];
    }
    
    console.log(`${feed.items.length} éléments trouvés dans le flux: ${feedUrl}`);
    
    // Convertir les éléments du flux en NewsArticle
    return feed.items.map(item => {
      // Déterminer la meilleure description à utiliser
      let description = item.contentSnippet || item.description || '';
      
      // Si le contenu encodé est disponible, l'utiliser comme fallback
      if (!description && item.contentEncoded) {
        // Nettoyer le HTML du contenu encodé et le tronquer
        description = cleanHtmlEntities(item.contentEncoded).substring(0, 200) + '...';
      }
      
      // Nettoyer les descriptions
      description = cleanHtmlEntities(description);
      
      return {
        title: item.title || "Sans titre",
        description: description,
        url: item.link || "",
        publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
        source: {
          name: feed.title ? feed.title : extractDomainFromUrl(feedUrl)
        }
      };
    });
  } catch (error) {
    console.error(`Erreur lors de la récupération des articles depuis ${feedUrl}:`, error);
    return [];
  }
}

// Trouver une catégorie à partir d'une requête
function findCategoryFromQuery(query: string): string | undefined {
  const queryLower = query.toLowerCase();
  
  // Mapping de mots-clés vers des catégories
  const keywordMappings: Record<string, string[]> = {
    'technology': ['tech', 'technologie', 'digital', 'numérique', 'innovation'],
    'marketing': ['marketing', 'publicité', 'communication', 'marque', 'branding'],
    'ia': ['ia', 'intelligence artificielle', 'ai', 'machine learning', 'apprentissage', 'deep learning'],
    'developpement_web': ['web', 'développement web', 'frontend', 'backend', 'fullstack', 'javascript', 'html', 'css'],
    'mobile': ['mobile', 'app', 'application', 'android', 'ios', 'smartphone'],
    'programmation': ['programmation', 'code', 'développement', 'logiciel', 'software'],
    'business': ['business', 'entreprise', 'startup', 'entrepreneur', 'économie'],
    'seo': ['seo', 'référencement', 'google', 'moteur de recherche', 'ranking'],
    'ux_design': ['ux', 'ui', 'design', 'utilisateur', 'expérience', 'interface']
  };
  
  // Rechercher des correspondances dans les mots-clés
  for (const [category, keywords] of Object.entries(keywordMappings)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      return category;
    }
  }
  
  return undefined;
}

// Nettoyer les entités HTML
function cleanHtmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&lt;.*?&gt;/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]*>/g, '');  // Supprimer les balises HTML
}

// Extraire le domaine d'une URL
function extractDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname
      .replace(/^www\./, '')
      .split('.')
      .slice(0, -1)
      .join('.')
      .charAt(0).toUpperCase() + hostname.replace(/^www\./, '').split('.')[0].slice(1);
  } catch (e) {
    return 'Source RSS';
  }
}

// Convertir un texte en slug
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}