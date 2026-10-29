// Fonction d'arrière-plan Netlify pour le traitement des images
// Le suffixe "-background" dans le nom du fichier est important pour que Netlify
// l'exécute comme une fonction d'arrière-plan avec une limite de 15 minutes

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Définition directe des fonctions utilitaires au lieu de les importer
// Fonction slugify pour créer des URLs conviviales
const slugify = (text) => {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

// Définition directe des fonctions de génération d'images
const generateImageWithPicsum = async () => {
  const width = 1200;
  const height = 800;
  const randomId = Math.floor(Math.random() * 1000);
  return `https://picsum.photos/id/${randomId}/${width}/${height}`;
};

const generateImageWithReplicate = async (apiKey, prompt, options = {}) => {
  try {
    const model = options.model || "stability-ai/sdxl";
    
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({
        version: model,
        input: {
          prompt: prompt,
          num_outputs: 1
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Replicate API error: ${response.statusText}`);
    }

    const prediction = await response.json();
    
    // Polling pour obtenir le résultat
    const maxAttempts = 20;
    let attempts = 0;
    let imageUrl = null;

    while (attempts < maxAttempts) {
      attempts++;
      
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!statusResponse.ok) {
        throw new Error(`Replicate Status API error: ${statusResponse.statusText}`);
      }
      
      const result = await statusResponse.json();
      
      if (result.status === "succeeded") {
        imageUrl = result.output?.[0];
        break;
      } else if (result.status === "failed") {
        throw new Error("Image generation failed");
      }
      
      // Attente avant la prochaine vérification
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (!imageUrl) {
      throw new Error("Timeout while waiting for image generation");
    }

    return imageUrl;
  } catch (error) {
    console.error("Error generating image with Replicate:", error);
    throw error;
  }
};

const generateImageWithOpenAI = async (apiKey, prompt, options = {}) => {
  try {
    const model = options.model || "dall-e-2";
    const quality = options.quality || "standard";
    const size = options.size || "1024x1024";
    
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        n: 1,
        size: size,
        quality: quality,
        response_format: "url"
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const data = await response.json();
    return data.data?.[0]?.url;
  } catch (error) {
    console.error("Error generating image with OpenAI:", error);
    throw error;
  }
};

const generateImageWithHuggingFace = async (apiKey, prompt, options = {}) => {
  try {
    const model = options.model || "stabilityai/stable-diffusion-xl-base-1.0";
    
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          num_inference_steps: 50,
          guidance_scale: 7.5,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.statusText}`);
    }

    // L'API retourne directement les données binaires de l'image
    const buffer = await response.arrayBuffer();
    // Convertir en base64 pour stocker dans la base de données
    const base64Image = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error("Error generating image with HuggingFace:", error);
    throw error;
  }
};

const generateImageWithStableDiffusion = async (apiKey, prompt) => {
  try {
    const response = await fetch("https://stablediffusionapi.com/api/v3/text2img", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: apiKey,
        prompt: prompt,
        width: "1024",
        height: "1024",
        samples: "1",
        num_inference_steps: "30",
        guidance_scale: 7.5,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stable Diffusion API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.status === "success") {
      return data.output?.[0];
    } else {
      throw new Error(`Stable Diffusion API error: ${data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error generating image with Stable Diffusion:", error);
    throw error;
  }
};

// Objet regroupant toutes les fonctions de génération d'images
const imageProviders = {
  generateImageWithPicsum,
  generateImageWithReplicate,
  generateImageWithOpenAI,
  generateImageWithHuggingFace,
  generateImageWithStableDiffusion
};

// Utilise exports.handler pour la compatibilité avec Netlify Functions
exports.handler = async (event) => {
  console.log("Fonction d'arrière-plan pour le traitement d'image démarrée");
  
  // Gestion du CORS
  const allowedOrigins = [
    'https://cleads.fr',
    'https://www.cleads.fr',
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL
  ].filter(Boolean); // Filtre les valeurs nulles ou undefined
  
  const origin = event.headers.origin || '';
  const isAllowedOrigin = allowedOrigins.includes(origin) || origin.endsWith('.netlify.app');
  
  const headers = {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Gestion des requêtes OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }
  
  // Pour les fonctions d'arrière-plan, nous devons retourner une réponse immédiatement
  // et continuer le traitement en arrière-plan
  let payload;
  try {
    payload = JSON.parse(event.body);
    
    // Démarrer immédiatement le traitement en arrière-plan sans attendre
    processInBackground(payload, headers).catch(error => {
      console.error("Erreur dans le processus d'arrière-plan:", error);
    });
    
    // Retourner immédiatement une réponse de succès
    return { 
      statusCode: 202, // 202 Accepted
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: "Traitement démarré en arrière-plan" 
      }) 
    };
  } catch (error) {
    console.error("Erreur lors de l'analyse du payload:", error);
    return { 
      statusCode: 400, 
      headers,
      body: JSON.stringify({ 
        error: "Payload invalide" 
      }) 
    };
  }
};

// Fonction asynchrone pour le traitement en arrière-plan
async function processInBackground(payload, headers) {
  const prisma = new PrismaClient();
  
  try {
    const { 
      articleData, 
      scheduleId, 
      userId,
      imageProvider, 
      imageModel,
      articleId,
      publishImmediately
    } = payload;
    
    console.log(`Traitement asynchrone pour la planification: ${scheduleId}`);
    console.log(`Données utilisateur: userId=${userId}, imageProvider=${imageProvider}, imageModel=${imageModel || 'non défini'}, publishImmediately=${publishImmediately}`);
    
    // Récupérer les informations de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true }
    });
    
    if (!user || !user.settings) {
      throw new Error("Utilisateur ou paramètres non trouvés");
    }
    
    // Récupérer la planification
    const schedule = await prisma.articleSchedule.findUnique({
      where: { id: scheduleId }
    });
    
    if (!schedule) {
      throw new Error("Planification non trouvée");
    }

    console.log(`Planification trouvée: ${schedule.name}, publishImmediately dans schedule=${schedule.publishImmediately}, publishImmediately dans payload=${publishImmediately}`);
    
    // Utiliser la valeur du payload comme priorité, sinon celle de la planification
    if (publishImmediately === undefined) {
      console.log("publishImmediately non défini dans le payload, utilisation de la valeur dans schedule");
      publishImmediately = schedule.publishImmediately || false;
    }
    
    // Mise à jour du statut pour indiquer que le traitement a commencé
    await prisma.articleSchedule.update({
      where: { id: scheduleId },
      data: { lastRunStatus: "IN_PROGRESS" }
    });
    
    // Génération de l'image
    let coverImage = null;
    const imagePrompt = `${articleData.title}. ${articleData.excerpt || ''}`;
    
    // Fonction de fallback
    const fallbackToDefaultImage = async () => {
      console.log("Utilisation de Picsum comme fournisseur d'image de secours");
      return await imageProviders.generateImageWithPicsum();
    };
    
    try {
      console.log(`Génération d'image avec le fournisseur: ${imageProvider}`);
      
      switch (imageProvider) {
        case 'picsum':
          coverImage = await imageProviders.generateImageWithPicsum();
          break;
        
        case 'replicate':
          if (user.settings?.replicateApiKey && imageModel) {
            coverImage = await imageProviders.generateImageWithReplicate(
              user.settings.replicateApiKey,
              imagePrompt,
              { model: imageModel }
            );
          } else {
            coverImage = await fallbackToDefaultImage();
          }
          break;
        
        case 'openai':
          if (user.settings?.openaiApiKey && imageModel) {
            coverImage = await imageProviders.generateImageWithOpenAI(
              user.settings.openaiApiKey,
              imagePrompt,
              { model: imageModel === 'DALLE3' ? 'dall-e-3' : 'dall-e-2' }
            );
          } else {
            coverImage = await fallbackToDefaultImage();
          }
          break;
        
        case 'huggingface':
          if (user.settings?.huggingFaceApiKey && imageModel) {
            coverImage = await imageProviders.generateImageWithHuggingFace(
              user.settings.huggingFaceApiKey,
              imagePrompt,
              { model: imageModel }
            );
          } else {
            coverImage = await fallbackToDefaultImage();
          }
          break;
        
        case 'sdapi':
          if (user.settings?.stableDiffusionApiKey) {
            coverImage = await imageProviders.generateImageWithStableDiffusion(
              user.settings.stableDiffusionApiKey,
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
    
    // Gérer les catégories
    let categoryId = null;
    if (schedule.categories && schedule.categories.length > 0) {
      try {
        const categoryName = schedule.categories[0];
        // D'abord, essayer de trouver la catégorie
        const existingCategory = await prisma.category.findFirst({
          where: { name: categoryName }
        });
        
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          // Créer une nouvelle catégorie avec un slug unique
          const categorySlug = `${slugify(categoryName)}-${Math.random().toString(36).substring(2, 6)}`;
          const newCategory = await prisma.category.create({
            data: {
              name: categoryName,
              slug: categorySlug
            }
          });
          categoryId = newCategory.id;
        }
      } catch (error) {
        console.error("Erreur lors de la gestion de la catégorie:", error);
      }
    }
    
    // Gérer les tags
    const tagsToConnect = [];
    
    // Vérifier si les tags sont un tableau valide
    if (!Array.isArray(articleData.tags)) {
      console.error("articleData.tags n'est pas un tableau:", articleData.tags);
      // Essayer de nettoyer et convertir les tags si possible
      let cleanedTags = [];
      
      if (typeof articleData.tags === 'string') {
        // Si c'est une chaîne, essayer de la séparer par virgules
        cleanedTags = articleData.tags.split(',').map(tag => tag.trim());
      } else if (articleData.tags && typeof articleData.tags === 'object') {
        // Si c'est un objet, essayer d'extraire des valeurs
        for (const key in articleData.tags) {
          if (typeof articleData.tags[key] === 'string') {
            cleanedTags.push(articleData.tags[key]);
          }
        }
      }
      
      console.log("Tags nettoyés:", cleanedTags);
      articleData.tags = cleanedTags;
    }
    
    for (const tagItem of articleData.tags) {
      try {
        // Extraire le nom du tag (peut être un objet ou une chaîne)
        let tagName = tagItem;
        if (typeof tagItem === 'object' && tagItem !== null) {
          tagName = tagItem.name || tagItem.value || Object.values(tagItem)[0];
        }
        
        if (!tagName || typeof tagName !== 'string') {
          console.warn(`Tag ignoré car format invalide:`, tagItem);
          continue;
        }
        
        const existingTag = await prisma.tag.findFirst({
          where: { name: tagName }
        });
        
        if (existingTag) {
          tagsToConnect.push({ id: existingTag.id });
        } else {
          const tagSlug = `${slugify(tagName)}-${Math.random().toString(36).substring(2, 6)}`;
          const newTag = await prisma.tag.create({
            data: {
              name: tagName,
              slug: tagSlug
            }
          });
          tagsToConnect.push({ id: newTag.id });
        }
      } catch (error) {
        console.error(`Erreur lors de la gestion du tag "${JSON.stringify(tagItem)}":`, error);
      }
    }
    
    // Si un articleId est fourni, mettre à jour l'article existant
    if (articleId) {
      await prisma.article.update({
        where: { id: articleId },
        data: { coverImage }
      });
      console.log(`Article existant mis à jour avec l'image: ${articleId}`);
    } 
    // Sinon, créer un nouvel article si nécessaire
    else if (publishImmediately) {
      console.log(`Création d'un nouvel article car publishImmediately=true`);
      
      // Gérer les catégories
      let categoryId = null;
      if (schedule.categories && schedule.categories.length > 0) {
        try {
          const categoryName = schedule.categories[0];
          // D'abord, essayer de trouver la catégorie
          const existingCategory = await prisma.category.findFirst({
            where: { name: categoryName }
          });
          
          if (existingCategory) {
            categoryId = existingCategory.id;
          } else {
            // Créer une nouvelle catégorie avec un slug unique
            const categorySlug = `${slugify(categoryName)}-${Math.random().toString(36).substring(2, 6)}`;
            const newCategory = await prisma.category.create({
              data: {
                name: categoryName,
                slug: categorySlug
              }
            });
            categoryId = newCategory.id;
          }
        } catch (error) {
          console.error("Erreur lors de la gestion de la catégorie:", error);
        }
      }
      
      // Gérer les tags
      const tagsToConnect = [];
      for (const tagName of articleData.tags) {
        try {
          const existingTag = await prisma.tag.findFirst({
            where: { name: tagName }
          });
          
          if (existingTag) {
            tagsToConnect.push({ id: existingTag.id });
          } else {
            const tagSlug = `${slugify(tagName)}-${Math.random().toString(36).substring(2, 6)}`;
            const newTag = await prisma.tag.create({
              data: {
                name: tagName,
                slug: tagSlug
              }
            });
            tagsToConnect.push({ id: newTag.id });
          }
        } catch (error) {
          console.error(`Erreur lors de la gestion du tag "${tagName}":`, error);
        }
      }
      
      // Génération d'un slug unique et valide
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 10);
      
      // S'assurer que le titre existe et est une chaîne
      let baseSlug = '';
      if (articleData.title && typeof articleData.title === 'string') {
        baseSlug = slugify(articleData.title);
      } else {
        baseSlug = `article-${timestamp.toString().substring(0, 6)}`;
        console.warn("Titre d'article manquant ou invalide, utilisation d'un slug générique");
      }
      
      // S'assurer que le slug de base n'est pas vide
      if (!baseSlug || baseSlug.trim() === '' || baseSlug === '-') {
        baseSlug = `article-${timestamp.toString().substring(0, 6)}`;
      }
      
      const uniqueSlug = `${baseSlug}-${timestamp}-${randomId}`;
      
      console.log(`Tentative de création d'article avec slug: ${uniqueSlug}`);
      console.log(`Données article: title=${articleData.title}, categoryId=${categoryId || 'non défini'}, tags=${tagsToConnect.length}`);
      
      // Valider les données avant de créer l'article
      const validateArticleData = () => {
        // Vérifier les champs obligatoires
        const requiredFields = ['title', 'content', 'slug', 'metaTitle', 'metaDescription'];
        const missingFields = requiredFields.filter(field => !articleData[field]);
        
        if (missingFields.length > 0) {
          console.error(`Champs obligatoires manquants: ${missingFields.join(', ')}`);
          console.log('Données article reçues:', JSON.stringify({
            title: articleData.title,
            contentLength: articleData.content?.length || 0,
            excerptLength: articleData.excerpt?.length || 0,
            metaTitleLength: articleData.metaTitle?.length || 0,
            metaDescriptionLength: articleData.metaDescription?.length || 0,
            tags: articleData.tags?.length || 0
          }));
          return false;
        }
        
        // Vérifier les valeurs nulles ou undefined
        if (!userId) {
          console.error('userId est null ou undefined');
          return false;
        }
        
        // Vérifier la structure des tags
        if (!Array.isArray(articleData.tags)) {
          console.error('Tags n\'est pas un tableau');
          return false;
        }
        
        return true;
      };
      
      try {
        // Vérifier que les données de l'article sont valides
        if (!validateArticleData()) {
          console.error("Données d'article invalides, impossible de créer l'article");
          throw new Error("Données d'article invalides");
        }
        
        // Créer l'article
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
            userId,
            categoryId,
            tags: {
              connect: tagsToConnect
            }
          }
        });
        
        console.log(`Article publié avec succès: ${dbArticle.title} (ID: ${dbArticle.id})`);
      } catch (articleError) {
        console.error(`ERREUR lors de la création de l'article:`, articleError);
        console.error(`Détails de l'erreur:`, articleError.message);
        if (articleError.meta) {
          console.error(`Métadonnées de l'erreur:`, articleError.meta);
        }
        throw articleError;
      }
    } else {
      console.log(`Pas de création d'article car publishImmediately=false`);
    }
    
    // Mettre à jour le statut de la planification
    await prisma.articleSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunStatus: "SUCCESS"
      }
    });
    
    console.log("Traitement asynchrone terminé avec succès");
  } catch (error) {
    console.error("Erreur lors du traitement asynchrone:", error);
    
    // Essayer de mettre à jour le statut de la planification
    try {
      const { scheduleId } = payload;
      if (scheduleId) {
        await prisma.articleSchedule.update({
          where: { id: scheduleId },
          data: { lastRunStatus: "FAILED" }
        });
      }
    } catch (updateError) {
      console.error("Erreur lors de la mise à jour du statut d'échec:", updateError);
    }
  } finally {
    // S'assurer que la connexion Prisma est fermée
    await prisma.$disconnect();
  }
} 