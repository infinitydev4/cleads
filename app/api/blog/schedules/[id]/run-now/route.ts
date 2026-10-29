import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";
import { generateTrendingSEOArticle } from "@/lib/seo/generateTrendingSEOArticle";
import { slugify } from "@/lib/utils";
import { ContentSourceType, ArticleSchedule } from "@/types/blog";

// Exécuter immédiatement une planification d'articles
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    // Ajout d'une fonction pour générer l'image de façon asynchrone
    const generateImageAndSaveArticle = async (
      articleData: any,
      scheduleData: any,
      userData: any,
      articleId?: string
    ) => {
      try {
        // Import dynamique des fournisseurs d'images
        const { 
          generateImageWithPicsum, 
          generateImageWithReplicate, 
          generateImageWithPexels,
          generateImageWithHuggingFace, 
          generateImageWithStableDiffusion,
          generateImageWithOpenAI
        } = await import('@/lib/imageProviders');
        
        // Génération de prompt pour image basé sur le titre et le contenu
        const imagePrompt = `${articleData.title}. ${articleData.excerpt || ''}`;
        let coverImage = null;
        
        // Fonction de fallback
        const fallbackToDefaultImage = async () => {
          console.log("Utilisation de Picsum comme fournisseur d'image de secours");
          return await generateImageWithPicsum();
        };
        
        console.log(`Génération d'image avec le fournisseur: ${scheduleData.imageProvider}`);
        
        try {
          switch (scheduleData.imageProvider) {
            case 'picsum':
              coverImage = await generateImageWithPicsum();
              break;
            
            case 'replicate':
              if (userData.settings?.replicateApiKey && scheduleData.imageModel) {
                coverImage = await generateImageWithReplicate(
                  userData.settings.replicateApiKey,
                  imagePrompt,
                  { model: scheduleData.imageModel }
                );
              } else {
                coverImage = await fallbackToDefaultImage();
              }
              break;
            
            case 'openai':
              if (userData.settings?.openaiApiKey && scheduleData.imageModel) {
                coverImage = await generateImageWithOpenAI(
                  userData.settings.openaiApiKey,
                  imagePrompt,
                  { model: scheduleData.imageModel === 'DALLE3' ? 'dall-e-3' : 'dall-e-2' }
                );
              } else {
                coverImage = await fallbackToDefaultImage();
              }
              break;
            
            case 'huggingface':
              if (userData.settings?.huggingFaceApiKey && scheduleData.imageModel) {
                coverImage = await generateImageWithHuggingFace(
                  userData.settings.huggingFaceApiKey,
                  imagePrompt,
                  { model: scheduleData.imageModel }
                );
              } else {
                coverImage = await fallbackToDefaultImage();
              }
              break;
            
            case 'sdapi':
              if (userData.settings?.stableDiffusionApiKey) {
                coverImage = await generateImageWithStableDiffusion(
                  userData.settings.stableDiffusionApiKey,
                  imagePrompt
                );
              } else {
                coverImage = await fallbackToDefaultImage();
              }
              break;
            
            default:
              coverImage = await fallbackToDefaultImage();
          }
        } catch (error) {
          console.error("Erreur lors de la génération d'image:", error);
          coverImage = await fallbackToDefaultImage();
        }

        console.log("Image générée avec succès:", coverImage?.substring(0, 50) + "...");
        
        // Si on a un article à publier
        if (scheduleData.publishImmediately) {
          // Si on a déjà créé l'article (articleId fourni), mettre à jour uniquement l'image
          if (articleId) {
            await prisma.article.update({
              where: { id: articleId },
              data: { coverImage }
            });
            console.log(`Article existant mis à jour avec l'image: ${articleId}`);
          } else {
            // Sinon créer un nouvel article avec l'image
            // Gérer d'abord la catégorie si nécessaire
            let categoryId: string | null = null;
            
            if (scheduleData.categories && scheduleData.categories.length > 0) {
              try {
                const categoryName = scheduleData.categories[0];
                // D'abord, essayer de trouver la catégorie
                const existingCategory = await prisma.category.findFirst({
                  where: { name: categoryName }
                });
                
                if (existingCategory) {
                  // Si la catégorie existe déjà, utiliser son ID
                  categoryId = existingCategory.id;
                  console.log(`Catégorie existante trouvée: ${categoryName} (ID: ${categoryId})`);
                } else {
                  // Sinon, créer une nouvelle catégorie avec un slug unique
                  const categorySlug = `${slugify(categoryName)}-${Math.random().toString(36).substring(2, 6)}`;
                  const newCategory = await prisma.category.create({
                    data: {
                      name: categoryName,
                      slug: categorySlug
                    }
                  });
                  categoryId = newCategory.id;
                  console.log(`Nouvelle catégorie créée: ${categoryName} (ID: ${categoryId})`);
                }
              } catch (categoryError) {
                console.error("Erreur lors de la gestion de la catégorie:", categoryError);
                // On continue sans catégorie
              }
            }
            
            // Préparation des tags
            const tagsToConnect = [];
            
            for (const tagName of articleData.tags) {
              try {
                // D'abord, essayer de trouver le tag
                const existingTag = await prisma.tag.findFirst({
                  where: { name: tagName }
                });
                
                if (existingTag) {
                  // Si le tag existe, le connecter
                  tagsToConnect.push({ id: existingTag.id });
                } else {
                  // Sinon, créer un nouveau tag avec un slug unique
                  const tagSlug = `${slugify(tagName)}-${Math.random().toString(36).substring(2, 6)}`;
                  const newTag = await prisma.tag.create({
                    data: {
                      name: tagName,
                      slug: tagSlug
                    }
                  });
                  tagsToConnect.push({ id: newTag.id });
                }
              } catch (tagError) {
                console.error(`Erreur lors de la gestion du tag "${tagName}":`, tagError);
                // Continuer avec les autres tags
              }
            }
            
            // Génération d'un slug réellement unique avec timestamp et identifiant aléatoire
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 10);
            const baseSlug = slugify(articleData.title);
            const uniqueSlug = `${baseSlug}-${timestamp}-${randomId}`;
            
            console.log(`Création d'article avec slug unique: ${uniqueSlug}`);
            
            // Créer l'article en utilisant connect pour les tags au lieu de connectOrCreate
            const dbArticle = await prisma.article.create({
              data: {
                title: articleData.title,
                slug: uniqueSlug,
                content: articleData.content,
                excerpt: articleData.excerpt,
                coverImage: coverImage || null,
                metaTitle: articleData.metaTitle,
                metaDescription: articleData.metaDescription,
                status: "PUBLISHED",
                publishedAt: new Date(),
                userId: userData.id,
                categoryId: categoryId,
                tags: {
                  connect: tagsToConnect
                }
              }
            });

            console.log(`Article publié avec succès: ${dbArticle.title} (ID: ${dbArticle.id})`);
          }
        }
        
        // Mettre à jour le statut de la planification
        await prisma.articleSchedule.update({
          where: { id: scheduleData.id },
          data: {
            lastRunStatus: "SUCCESS"
          }
        });
        
        console.log("Traitement asynchrone terminé avec succès");
        return true;
      } catch (error) {
        console.error("Erreur lors du traitement asynchrone:", error);
        // Mettre à jour le statut de la planification
        await prisma.articleSchedule.update({
          where: { id: scheduleData.id },
          data: {
            lastRunStatus: "FAILED"
          }
        });
        return false;
      }
    };

    const startTime = Date.now();

    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération de l'utilisateur avec ses paramètres
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true
      }
    });

    if (!user || !user.settings) {
      return NextResponse.json({ error: "Utilisateur ou paramètres non trouvés" }, { status: 404 });
    }

    // Récupération de la planification
    const schedule = await prisma.articleSchedule.findFirst({
      where: {
        id,
        userId: user.id
      }
    }) as unknown as ArticleSchedule;

    if (!schedule) {
      return NextResponse.json({ error: "Planification non trouvée" }, { status: 404 });
    }

    // Configuration pour la génération d'article
    const config = {
      userId: user.id,
      contentSource: schedule.contentSource as ContentSourceType || "rss",
      newsQuery: schedule.newsQuery || undefined,
      category: schedule.category || user.settings.defaultRssCategory || undefined,
      provider: schedule.textProvider || user.settings.textProvider || "openai",
      openaiModel: schedule.openaiModel || user.settings.openaiModel || "GPT35",
      huggingFaceModel: schedule.huggingFaceModel || user.settings.huggingFaceTextModel || undefined,
      rssSourceCount: schedule.rssSourceCount || user.settings.rssSourceCount || 3,
      rssArticleSelectionMode: (schedule.rssArticleSelectionMode || user.settings.rssArticleSelectionMode || "recent") as "recent" | "random" | "mixed",
      highQualityGeneration: schedule.highQualityGeneration || user.settings.highQualityGeneration || false,
      allowRsslessGeneration: user.settings.allowRsslessGeneration || false,
      tone: schedule.tone,
      language: schedule.language,
      keywords: schedule.keywords || [],
      seed: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
    };

    console.log("Exécution immédiate de la planification:", schedule.name);

    // Vérifier si un article similaire a été généré récemment
    const recentArticles = await prisma.article.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10, // Augmentation de 5 à 10 pour une détection plus large
      select: {
        title: true,
        metaDescription: true,
        content: true // Ajouter le contenu pour une comparaison plus approfondie
      }
    });

    // Phase 1: Marquer la planification comme étant en cours d'exécution
    await prisma.articleSchedule.update({
      where: { id },
      data: {
        lastRunDate: new Date(),
        lastRunStatus: "IN_PROGRESS"
      }
    });

    // Générer un sujet légèrement différent chaque fois en ajoutant un modificateur
    const topicModifiers = [
      "récentes", "dernières", "actuelles", "nouvelles", "meilleures", 
      "importantes", "essentielles", "cruciales", "principales", "innovantes",
      "2025", "prochaines", "futures", "émergentes"
    ];
    
    // Créer une variante de seed plus forte
    const enhancedSeed = `${config.seed}-${Math.floor(Date.now() / 3600000)}-${topicModifiers[Date.now() % topicModifiers.length]}`;
    
    // Mettre à jour la configuration avec notre seed améliorée
    config.seed = enhancedSeed;

    // Générer un premier article
    let article = await generateTrendingSEOArticle(config);
    
    // Vérifier si l'article généré est similaire à un article récent
    const isSimilarToRecent = recentArticles.some(recentArticle => {
      // Vérifier la similarité des titres
      const titleSimilarity = stringSimilarity(
        recentArticle.title.toLowerCase(),
        article.title.toLowerCase()
      );
      
      // Vérifier la similarité du contenu (comparaison des premiers mots)
      const contentSimilarity = recentArticle.content && article.content ? 
        stringSimilarity(
          recentArticle.content.split(' ').slice(0, 50).join(' ').toLowerCase(),
          article.content.split(' ').slice(0, 50).join(' ').toLowerCase()
        ) : 0;
      
      // Si les titres sont très similaires (>70%) ou le contenu début est similaire (>60%), considérer comme un doublon
      return titleSimilarity > 0.7 || contentSimilarity > 0.6;
    });

    if (isSimilarToRecent) {
      console.log("Article similaire détecté, regénération avec une seed plus différente");
      
      // Approche 1: Modifier totalement la seed
      const alternativeSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}-retry-${topicModifiers[(Date.now() + 5) % topicModifiers.length]}`;
      config.seed = alternativeSeed;
      
      // Approche 2: Si une catégorie existe, changer légèrement la catégorie
      if (config.category) {
        // Ajouter un modificateur à la catégorie
        config.category = `${config.category} ${topicModifiers[(Date.now() + 7) % topicModifiers.length]}`;
      }
      
      // Approche 3: Modifier les mots-clés s'ils existent
      if (config.keywords && config.keywords.length > 0) {
        // Ajouter un mot-clé supplémentaire
        config.keywords.push(topicModifiers[(Date.now() + 3) % topicModifiers.length]);
        // Réorganiser les mots-clés pour changer la priorité
        config.keywords = config.keywords.reverse();
      }
      
      // Réessayer avec toutes ces modifications
      const regeneratedArticle = await generateTrendingSEOArticle(config);
      
      // Si second article toujours trop similaire, créer un article vraiment différent
      const stillTooSimilar = recentArticles.some(recentArticle => 
        stringSimilarity(recentArticle.title.toLowerCase(), regeneratedArticle.title.toLowerCase()) > 0.7
      );
      
      if (stillTooSimilar) {
        console.log("Second article toujours trop similaire, génération d'un article radicalement différent");
        
        // Utiliser une catégorie totalement différente si possible
        const alternativeCategories = [
          "Développement Web", "UX/UI Design", "E-commerce", 
          "Intelligence Artificielle", "Growth Hacking"
        ];
        
        // Choisir une catégorie différente aléatoirement
        config.category = alternativeCategories[Date.now() % alternativeCategories.length];
        config.seed = `completely-different-${Date.now()}`;
        
        // Troisième tentative avec des paramètres radicalement différents
        article = await generateTrendingSEOArticle(config);
      } else {
        // Utiliser le second article si c'est suffisamment différent
        article = regeneratedArticle;
      }
    }
    
    // Vérifier si nous approchons de la limite de temps Netlify (environ 10 secondes)
    const currentDuration = Date.now() - startTime;
    console.log(`Phase 1 terminée en ${currentDuration}ms`);
    
    // Variable pour stocker l'ID d'article si créé partiellement
    let createdArticleId: string | undefined;
    
    // Nous allons toujours terminer précocement et déléguer la génération d'image et 
    // la création de l'article à un processus asynchrone
    console.log("Termination précoce, délégation du reste du traitement en tâche de fond");
    
    // Mettre à jour la planification pour indiquer que le contenu a été généré
    await prisma.articleSchedule.update({
      where: { id },
      data: {
        articlesGenerated: {
          increment: 1
        }
      }
    });
    
    // Démarrer le processus de génération d'image et de publication en arrière-plan
    // en utilisant la fonction d'arrière-plan Netlify
    if (schedule.generateImage && schedule.imageProvider) {
      try {
        console.log(`Configuration de la planification: publishImmediately=${schedule.publishImmediately}, generateImage=${schedule.generateImage}`);
        
        // Préparer les données à envoyer à la fonction d'arrière-plan
        const payload = {
          articleData: article,
          scheduleId: id,
          userId: user.id,
          imageProvider: schedule.imageProvider,
          imageModel: schedule.imageModel,
          publishImmediately: schedule.publishImmediately // S'assurer que cette information est transmise
        };
        
        // Vérifier si nous sommes en environnement de développement
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        if (isDevelopment) {
          // En développement, exécuter la génération d'image directement ici
          console.log("Environnement de développement détecté, traitement synchrone de l'image");
          
          try {
            // Appeler directement la fonction de génération d'image
            const result = await generateImageAndSaveArticle(
              article,
              schedule,
              user,
              undefined // ID d'article non défini car nouvel article
            );
            
            console.log("Génération d'image et sauvegarde terminée avec résultat:", result);
          } catch (localError) {
            console.error("Erreur lors du traitement local de l'image:", localError);
            // Continuer malgré l'erreur
          }
        } else {
          // En production, utiliser la fonction Netlify d'arrière-plan
          // Obtenir l'URL de base du site à partir des variables d'environnement
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://cleads.fr';
          
          // Construire l'URL complète de la fonction Netlify
          const functionUrl = `${baseUrl}/.netlify/functions/process-image-background-function`;
          
          console.log(`Appel de la fonction Netlify à l'URL: ${functionUrl}`);
          
          // Utiliser un AbortController pour limiter le temps d'attente
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout après 5 secondes
          
          try {
            // Appeler la fonction d'arrière-plan Netlify avec une URL absolue
            const response = await fetch(functionUrl, {
              method: 'POST',
              body: JSON.stringify(payload),
              headers: {
                'Content-Type': 'application/json'
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              console.warn(`Appel à la fonction d'arrière-plan a échoué (statut: ${response.status}), continuons quand même`);
            } else {
              console.log("Fonction d'arrière-plan démarrée avec succès");
            }
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            
            // Si l'erreur est due au timeout, ce n'est pas grave - la fonction continue en arrière-plan
            if (fetchError.name === 'AbortError') {
              console.log("Temps d'attente dépassé pour la réponse de la fonction, mais elle continue en arrière-plan");
            } else {
              console.error("Erreur lors de l'appel à la fonction d'arrière-plan:", fetchError);
            }
            
            // Lancer une deuxième tentative asynchrone sans attendre la réponse
            setTimeout(() => {
              fetch(functionUrl, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: {
                  'Content-Type': 'application/json'
                }
              }).catch(retryError => {
                console.error("Erreur lors de la seconde tentative d'appel à la fonction d'arrière-plan:", retryError);
              });
            }, 100);
          }
        }
      } catch (err) {
        console.error("Erreur lors de la préparation du traitement d'image:", err);
        // Continuer malgré l'erreur
      }
    }
    
    // Retourner une réponse immédiate avec plus d'informations
    const processingMessage = "La génération du contenu est terminée. Le traitement d'image et la publication se poursuivent en arrière-plan et peuvent prendre jusqu'à 15 minutes.";
    
    return NextResponse.json({
      success: true,
      article,
      published: false,
      imageGenerated: false,
      status: "IN_PROGRESS",
      message: processingMessage,
      backgroundProcessing: true,
      estimatedCompletionTime: "15 minutes"
    });

  } catch (error: any) {
    console.error("Erreur lors de l'exécution de la planification:", error);
    
    // Mettre à jour le statut d'erreur
    try {
      await prisma.articleSchedule.update({
        where: { id: params.id },
        data: {
          lastRunDate: new Date(),
          lastRunStatus: "FAILED"
        }
      });
    } catch (updateError) {
      console.error("Erreur lors de la mise à jour du statut d'échec:", updateError);
    }
    
    return NextResponse.json(
      { error: error.message || "Erreur lors de l'exécution de la planification" },
      { status: 500 }
    );
  }
}

// Fonction utilitaire pour calculer la similarité entre deux chaînes
function stringSimilarity(str1: string, str2: string): number {
  // Implémentation simple de la distance de Levenshtein normalisée
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Si l'une des chaînes est vide, la similarité est 0
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  // Créer la matrice
  const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  // Initialiser la première colonne et la première ligne
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Remplir la matrice
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // suppression
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  // La distance est la valeur en bas à droite
  const distance = matrix[len1][len2];
  
  // Normaliser la distance (0 = totalement différent, 1 = identique)
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
} 