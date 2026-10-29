/**
 * Générateur d'articles SEO basés sur les tendances
 * Ce module permet de générer automatiquement des articles de blog optimisés
 * pour le référencement en s'appuyant sur les actualités récentes.
 */

import { generateBlogContent } from "@/lib/openai";
import { getOpenAIClient } from "@/lib/openai";
import { getHuggingFaceTextModel } from "@/lib/modelUtils";
import { getOpenAIModelById } from "@/lib/modelUtils";
import { prisma } from "@/lib/prisma";
import { RSS_FEEDS, getRssFeedsForCategory, getRandomRssFeeds, getValidatedRssFeedsForCategory, getRandomValidatedRssFeeds } from "@/lib/config/rss-feeds";
import { contentSourceManager, ContentFetchOptions } from "@/lib/sources/content-source-manager";
import { shuffleArray } from "@/lib/utils/array-utils";

// Types d'API de news supportées
export type ContentSourceType = "rss" | "ai" | "social" | "custom";

// Configuration pour la génération d'articles
export interface ArticleGenerationConfig {
  userId: string;               // ID de l'utilisateur
  openaiModel?: string;         // Modèle OpenAI à utiliser
  huggingFaceModel?: string;    // Modèle Hugging Face à utiliser
  provider?: string;            // Provider texte à utiliser ('openai' ou 'huggingface')
  language?: string;            // Langue de l'article ('français' par défaut)
  category?: string;            // Catégorie cible
  keywords?: string[];          // Mots-clés supplémentaires
  contentSource?: ContentSourceType; // Source de contenu à utiliser (rss par défaut)
  newsQuery?: string;           // Requête pour filtrer les actualités
  newsCategory?: string;        // Catégorie d'actualités (business, technology...)
  tone?: string;                // Ton de l'article
  rssSourceCount?: number;      // Nombre de sources RSS à utiliser (3 par défaut)
  rssArticleSelectionMode?: 'recent' | 'random' | 'mixed'; // Mode de sélection des articles
  highQualityGeneration?: boolean; // Mode génération de haute qualité
  allowRsslessGeneration?: boolean; // Autoriser la génération sans source RSS
  seed?: string;                // Seed pour la génération de variété
}

/**
 * Structure des articles d'actualité conservée pour compatibilité
 */
interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: {
    name: string;
  };
}

/**
 * Articles de secours réutilisables
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

/**
 * Extrait des mots-clés pertinents à partir d'articles d'actualité
 * @param articles - Liste d'articles d'actualité
 * @param additionalKeywords - Mots-clés supplémentaires à inclure
 * @returns Liste de mots-clés optimisés pour le SEO
 */
function extractKeywordsFromNews(
  articles: NewsArticle[], 
  additionalKeywords: string[] = []
): string[] {
  // Mots à exclure (stop words)
  const stopWords = ["le", "la", "les", "un", "une", "des", "et", "ou", "pour", "par", "sur", "dans"];
  
  // Mots-clés spécifiques au domaine de Cleads
  const domainKeywords = [
    "marketing digital", "SEO", "référencement", "acquisition client", 
    "développement web", "site internet", "landing page", "tunnel de vente",
    "conversion", "trafic web", "UX design", "expérience utilisateur"
  ];
  
  // Extraction de texte depuis les titres et descriptions
  const allText = articles
    .map(article => `${article.title} ${article.description || ""}`)
    .join(" ")
    .toLowerCase();
  
  // Extraction des mots et expressions
  const words = allText.split(/\s+/);
  const phrases = [];
  
  // Extraire des expressions de 2-3 mots
  for (let i = 0; i < words.length - 1; i++) {
    if (!stopWords.includes(words[i]) && !stopWords.includes(words[i+1])) {
      phrases.push(`${words[i]} ${words[i+1]}`);
    }
    
    if (i < words.length - 2 && !stopWords.includes(words[i]) && 
        !stopWords.includes(words[i+1]) && !stopWords.includes(words[i+2])) {
      phrases.push(`${words[i]} ${words[i+1]} ${words[i+2]}`);
    }
  }
  
  // Compter les occurrences des expressions
  const phraseCounts: Record<string, number> = {};
  phrases.forEach(phrase => {
    phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
  });
  
  // Trier par fréquence
  const sortedPhrases = Object.entries(phraseCounts)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);
  
  // Combiner avec les mots-clés du domaine et ceux fournis
  const combinedKeywords = [
    ...sortedPhrases.slice(0, 5),
    ...domainKeywords.slice(0, 3),
    ...additionalKeywords
  ];
  
  // Dédupliquer et nettoyer
  return Array.from(new Set(combinedKeywords))
    .filter(keyword => keyword.length > 3)
    .slice(0, 7); // Limiter à 7 mots-clés
}

/**
 * Génère un titre et une description d'article optimisés pour le SEO
 * à partir d'actualités
 */
function generateArticleTopicFromNews(articles: NewsArticle[]): {
  topic: string;
  description: string;
} {
  // Sélectionner les 3 articles les plus pertinents
  const topArticles = articles.slice(0, 3);
  
  // Extraire les sujets principaux
  const mainTopics = topArticles.map(article => {
    const title = article.title.replace(/['":.?!]/, "").trim();
    return title;
  });
  
  // Créer un titre englobant les sujets principaux
  let topic = "";
  
  if (mainTopics.length >= 2) {
    // Trouver des points communs entre les sujets
    const commonWords = findCommonWords(mainTopics);
    
    if (commonWords.length > 0) {
      // Utiliser les mots communs comme base du sujet
      topic = `Les dernières tendances en ${commonWords.join(" ")} : Guide pour les professionnels`;
    } else {
      // Utiliser le premier article comme base
      const mainTopic = mainTopics[0];
      topic = `${mainTopic} : Analyse et perspectives pour les professionnels du digital`;
    }
  } else if (mainTopics.length === 1) {
    // Adapter le titre du premier article
    topic = `${mainTopics[0]} : Implications pour votre stratégie digitale`;
  } else {
    // Titre par défaut si aucun article n'est trouvé
    topic = "Les dernières tendances en marketing digital et développement web";
  }
  
  // Créer une description basée sur les articles
  const description = topArticles.length > 0
    ? `Analyse des dernières actualités concernant ${topArticles[0].title.split(':')[0]}. Découvrez comment ces évolutions impactent votre stratégie digitale et les meilleures pratiques à adopter.`
    : "Découvrez les dernières tendances en marketing digital, SEO et développement web pour optimiser votre présence en ligne et votre stratégie d'acquisition client.";
  
  return { topic, description };
}

/**
 * Trouve les mots communs entre plusieurs chaînes de texte
 */
function findCommonWords(texts: string[]): string[] {
  if (texts.length === 0) return [];
  
  // Tokeniser et filtrer les stopwords pour chaque texte
  const stopWords = ["le", "la", "les", "un", "une", "des", "et", "ou", "pour", "par", "sur", "dans", "qui", "que", "quoi", "dont", "où"];
  
  const tokenizedTexts = texts.map(text =>
    text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word))
  );
  
  // Trouver les mots qui apparaissent dans au moins 2 textes
  const wordFrequency: Record<string, number> = {};
  
  tokenizedTexts.forEach(words => {
    // Dédupliquer les mots dans chaque texte
    const uniqueWords = Array.from(new Set(words));
    
    uniqueWords.forEach(word => {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    });
  });
  
  // Filtrer les mots qui apparaissent dans au moins 2 textes
  return Object.entries(wordFrequency)
    .filter(([_, count]) => count >= 2)
    .map(([word, _]) => word)
    .slice(0, 3); // Limiter à 3 mots pour ne pas alourdir le titre
}

/**
 * Récupère les paramètres utilisateur pour la génération d'articles
 */
async function getUserSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      settings: {
        select: {
          openaiApiKey: true,
          openaiModel: true,
          textProvider: true,
          huggingFaceApiKey: true,
          huggingFaceTextModel: true,
          imageProvider: true,
          huggingFaceModel: true,
          replicateModel: true,
        }
      }
    }
  });
  
  if (!user || !user.settings) {
    throw new Error("Utilisateur ou paramètres non trouvés");
  }
  
  return user.settings;
}

/**
 * Analyse une catégorie pour générer une requête de recherche adaptée
 */
function generateSearchQueryFromCategory(category: string): string {
  const categoryKeywords: Record<string, string> = {
    "Marketing Digital": "marketing digital SEO acquisition",
    "Développement Web": "développement web application site internet",
    "E-commerce": "e-commerce boutique en ligne vente plateforme",
    "UX/UI Design": "UX UI design expérience utilisateur interface",
    "Growth Hacking": "growth hacking acquisition croissance startup",
    "Réseaux Sociaux": "réseaux sociaux social media stratégie",
    "SaaS": "SaaS logiciel service cloud application",
    "Business": "business entrepreneuriat entreprise startup",
    "Technologie": "technologie innovation digital numérique",
    // Catégories par défaut
    "Blog": "marketing digital développement web",
    "Actualités": "actualités digital marketing développement"
  };
  
  return categoryKeywords[category] || "marketing digital développement web";
}

/**
 * Fonction principale pour générer un article SEO basé sur les tendances
 * @param config - Configuration de génération d'article
 * @returns Article généré avec structure complète
 */
export async function generateTrendingSEOArticle(config: ArticleGenerationConfig) {
  // Paramètres par défaut
  const language = config.language || "français";
  const provider = config.provider || "openai";
  const rssSourceCount = config.rssSourceCount || 3;
  const contentSource = config.contentSource || "rss";
  const rssArticleSelectionMode = config.rssArticleSelectionMode || "recent";
  const highQualityGeneration = config.highQualityGeneration || false;
  // Utiliser la seed si fournie pour ajouter de la variété dans la génération
  const seed = config.seed || `gen-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  try {
    console.log("Début de la génération d'article tendance avec config:", { ...config, seed });
    
    // Récupération des actualités
    let newsQuery = config.newsQuery;
    
    // Si pas de requête spécifiée, générer une requête basée sur la catégorie
    if (!newsQuery && config.category) {
      newsQuery = generateSearchQueryFromCategory(config.category);
    }
    
    // Si pas de requête générée, utiliser une requête par défaut
    if (!newsQuery) {
      newsQuery = "marketing digital SEO acquisition";
    }
    
    // Ajouter un paramètre aléatoire à la requête pour plus de variété
    // mais seulement si on n'a pas un contenu spécifique demandé
    if (!config.newsQuery) {
      // Extraire une partie aléatoire de la seed pour l'ajouter à la requête
      const seedPart = seed.split('-').pop() || '';
      // Ajouter un modificateur aléatoire léger à la requête 
      // qui ne changera pas son sens mais apportera de la variété
      const randomModifiers = [
        "actualité", "tendance", "innovation", "stratégie", 
        "perspective", "évolution", "nouveauté", "analyse", 
        "futur", "développement", "croissance", "performance", 
        "optimisation", "transformation", "disruption", "impact"
      ];
      const selectedModifier = randomModifiers[
        Math.floor(parseInt(seedPart, 36) % randomModifiers.length)
      ];
      newsQuery = `${newsQuery} ${selectedModifier} ${Date.now() % 1000}`;
    }

    console.log(`Recherche d'actualités pour la requête: "${newsQuery}" avec source: ${contentSource}`);
    
    // Options pour la récupération des articles
    const fetchOptions: ContentFetchOptions = {
      category: config.newsCategory,
      sourceCount: rssSourceCount,
      selectionMode: rssArticleSelectionMode,
      limit: 10
    };
    
    // Utiliser le gestionnaire de sources de contenu pour récupérer les articles
    let newsArticles: NewsArticle[] = [];
    
    // Déterminer la source à utiliser
    if (config.allowRsslessGeneration && contentSource === "ai") {
      // Utiliser la source IA
      newsArticles = await contentSourceManager.fetchFromSource("ai", newsQuery, fetchOptions);
      console.log(`Génération d'articles via IA avec requête: "${newsQuery}"`);
    } else {
      // Utiliser la source RSS par défaut
      newsArticles = await contentSourceManager.fetchFromSource("rss", newsQuery, fetchOptions);
    }
    
    // Si aucun article trouvé, essayer de générer avec l'IA ou utiliser les articles de secours
    if (!newsArticles || newsArticles.length === 0) {
      console.log("Aucun article trouvé, tentative avec source alternative");
      
      if (config.allowRsslessGeneration) {
        // Essayer la source IA si autorisée et si on n'a pas déjà essayé cette source
        if (contentSource !== "ai") {
          newsArticles = await contentSourceManager.fetchFromSource("ai", newsQuery, fetchOptions);
        } else {
          // Si on avait déjà essayé l'IA et qu'elle n'a rien donné, utiliser les articles de secours
          console.log("Aucun résultat via IA, utilisation des articles de secours");
          // Utiliser un ensemble modifié d'articles de secours basé sur la seed
          newsArticles = getRandomizedBackupArticles(seed);
        }
      } else {
        // Utiliser les articles de secours
        console.log("Utilisation des articles de secours");
        // Utiliser un ensemble modifié d'articles de secours basé sur la seed
        newsArticles = getRandomizedBackupArticles(seed);
      }
    }
    
    console.log(`${newsArticles.length} articles récupérés depuis la source: ${contentSource}`);
    
    // Vérifier si les articles générés ne sont pas des duplicatas d'articles déjà générés
    if (contentSource === "ai" && contentSourceManager.lastFetchedArticles.has("rss")) {
      const rssArticles = contentSourceManager.lastFetchedArticles.get("rss") || [];
      const rssTopics = rssArticles.map(article => article.title.toLowerCase());
      
      // Filtrer les articles IA qui pourraient être trop similaires aux articles RSS
      newsArticles = newsArticles.filter(article => {
        const title = article.title.toLowerCase();
        return !rssTopics.some(topic => 
          // Vérifier si le titre de l'article IA ne contient pas un sujet déjà traité dans RSS
          title.includes(topic) || 
          // Ou l'inverse (si un sujet RSS contient le titre AI)
          rssTopics.some(t => t.includes(title))
        );
      });
      
      // Si après filtrage on n'a plus assez d'articles, compléter si nécessaire
      if (newsArticles.length < 3) {
        console.log("Après filtrage des duplicats, ajout d'articles complémentaires");
        // Mélanger les articles de secours pour éviter de toujours utiliser les mêmes
        const backupArticles = getRandomizedBackupArticles(seed).slice(0, 3 - newsArticles.length);
        newsArticles = [...newsArticles, ...backupArticles];
      }
    }
    
    // Générer le contenu à partir des articles trouvés
    return generateArticleContentFromNews(newsArticles, config);
    
  } catch (error) {
    console.error("Erreur lors de la génération d'article:", error);
    throw error;
  }
}

/**
 * Obtient des articles de secours randomisés basés sur une seed
 * pour éviter que les articles de secours soient toujours les mêmes
 */
function getRandomizedBackupArticles(seed: string): NewsArticle[] {
  // Obtenir les articles de secours de base
  const baseArticles = getBackupArticles();
  
  // Obtenir la date actuelle pour simuler des articles récents
  const now = new Date();
  
  // Créer des variations des articles de secours
  const variationWords = [
    "Comment", "Pourquoi", "Les", "10", "5", "Guide", 
    "Explorez", "Découvrez", "Analyser", "Optimiser",
    "Maîtriser", "Impact", "Futur", "Révolution"
  ];
  
  // Utiliser la seed pour générer un index pseudo-aléatoire
  const seedValue = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const variationIndex = seedValue % variationWords.length;
  const variationWord = variationWords[variationIndex];
  
  // Appliquer des modifications aux articles existants
  const modifiedArticles = baseArticles.map((article, index) => {
    // Varier le titre en fonction de la seed
    const seedPart = (seedValue + index) % 100;
    let newTitle = article.title;
    
    // Modifier le titre de façon pseudo-aléatoire
    if (seedPart < 25) {
      newTitle = `${variationWord} ${article.title.toLowerCase()}`;
    } else if (seedPart < 50) {
      newTitle = `${article.title}: ${variationWord.toLowerCase()} pour 2025`;
    } else if (seedPart < 75) {
      newTitle = `${article.title} - Perspectives ${2025 + (index % 3)}`;
    } else {
      newTitle = `${article.title}: un guide pour les professionnels`;
    }
    
    // Créer une nouvelle instance (pour ne pas modifier l'original)
    return {
      ...article,
      title: newTitle,
      // Ajouter un petit modificateur à la description aussi
      description: `${article.description} [${variationWord}]`,
      // Varier la date de publication
      publishedAt: new Date(now.getTime() - (seedValue + index) * 86400000).toISOString(),
    };
  });
  
  // Mélanger les articles en utilisant la seed
  return shuffleArray(modifiedArticles);
}

/**
 * Génère le contenu d'un article à partir des actualités récupérées
 */
async function generateArticleContentFromNews(
  newsArticles: NewsArticle[],
  config: ArticleGenerationConfig
) {
  try {
    // Générer le sujet et les mots-clés à partir des actualités
    const { topic, description } = generateArticleTopicFromNews(newsArticles);
    console.log(`Sujet généré: ${topic}`);
    
    // Extraire les mots-clés pertinents
    const keywords = extractKeywordsFromNews(newsArticles, config.keywords || []);
    console.log(`Mots-clés extraits:`, keywords);
    
    // Sélectionner le modèle AI à utiliser
    const provider = config.provider || "openai";
    const selectedModel = config.openaiModel || "GPT35";
    
    console.log(`Génération de l'article avec ${provider}, modèle: ${selectedModel}`);
    
    // Préparer le contexte pour la génération
    const context = newsArticles
      .slice(0, 3)
      .map(article => `Titre: ${article.title}\nDescription: ${article.description || 'N/A'}\n`)
      .join("\n");
    
    // Générer le contenu avec le bon fournisseur
    if (provider === "openai") {
      // Utiliser OpenAI
      return await generateWithOpenAI(
        context,
        topic,
        {
          keywords: keywords,
          tone: config.tone || "professionnel",
          language: config.language || "français",
          highQuality: config.highQualityGeneration,
          seed: config.seed
        }
      );
    } else if (provider === "huggingface") {
      // Utiliser Hugging Face
      if (!config.huggingFaceModel) {
        throw new Error("Modèle Hugging Face non spécifié");
      }
      
      // Implémenter la génération avec Hugging Face
      throw new Error("Génération via Hugging Face non implémentée");
    } else {
      // Fallback à OpenAI
      return await generateWithOpenAI(
        context,
        topic,
        {
          keywords: keywords,
          tone: config.tone || "professionnel",
          language: config.language || "français",
          highQuality: config.highQualityGeneration,
          seed: config.seed
        }
      );
    }
  } catch (error) {
    console.error("Erreur lors de la génération du contenu:", error);
    throw error;
  }
}

/**
 * Fonction pour générer du contenu avec OpenAI
 */
async function generateWithOpenAI(
  context: string,
  topic: string,
  options: {
    keywords: string[];
    tone: string;
    language: string;
    highQuality?: boolean;
    seed?: string;
  }
) {
  try {
    console.log(`Génération de contenu avec OpenAI, modèle: gpt-3.5-turbo`);
    
    // Récupérer la clé API OpenAI depuis les paramètres
    const settings = await prisma.settings.findFirst({
      where: {
        openaiApiKey: {
          not: null
        }
      }
    });
    
    if (!settings?.openaiApiKey) {
      throw new Error("Aucune clé API OpenAI n'a été configurée dans les paramètres");
    }
    
    // Créer un client OpenAI avec la clé API
    const openaiClient = getOpenAIClient(settings.openaiApiKey);
    
    // Calculer une température variable basée sur la seed pour créer de la variété
    let temperature = 0.7; // Valeur par défaut
    if (options.seed) {
      // Générer un nombre entre 0.6 et 0.9 basé sur la seed
      const seedValue = Array.from(options.seed).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      temperature = 0.6 + ((seedValue % 30) / 100);
      console.log(`Température calculée depuis la seed: ${temperature}`);
    }
    
    // Appeler l'API OpenAI via la fonction existante avec les bons paramètres
    // Inclure le contexte des articles dans la requête pour un meilleur résultat
    const result = await generateBlogContent(openaiClient, "gpt-3.5-turbo", {
      topic: `${topic}\nContexte des actualités:\n${context}`,
      keywords: options.keywords,
      tone: options.tone,
      language: options.language,
      // Passer l'option de haute qualité si elle existe
      highQuality: options.highQuality,
      // Passer la température calculée à partir de la seed
      temperature: temperature
    });
    
    // La fonction generateBlogContent retourne déjà un objet structuré
    return {
      title: result.title || topic,
      metaTitle: result.metaTitle || topic,
      metaDescription: result.metaDescription || "",
      excerpt: result.excerpt || "",
      tags: result.tags || [],
      category: result.category || "Blog",
      content: result.content || "",
      imageSuggestions: result.imageSuggestions || []
    };
  } catch (error) {
    console.error("Erreur lors de la génération avec OpenAI:", error);
    throw error;
  }
}

/**
 * Planifie la génération périodique d'articles SEO
 * @param config - Configuration de base pour la génération
 * @param frequencyDays - Fréquence en jours (1 = quotidien, 7 = hebdomadaire)
 * @param categoriesRotation - Rotation des catégories par génération
 * @returns ID de la planification créée
 */
export async function scheduleArticleGeneration(
  config: ArticleGenerationConfig,
  frequencyDays: number,
  categoriesRotation: string[]
) {
  try {
    // Créer la planification dans la base de données
    // Note: Cette fonction est un placeholder, la logique complète 
    // nécessiterait l'ajout d'un modèle dans le schéma Prisma
    
    console.log(
      `Planification de génération d'articles configurée:` +
      `\n- Fréquence: ${frequencyDays} jours` +
      `\n- Catégories: ${categoriesRotation.join(", ")}` +
      `\n- Provider: ${config.provider || "par défaut"}`
    );
    
    return "scheduled_task_id";
  } catch (error) {
    console.error("Erreur lors de la planification:", error);
    throw error;
  }
} 