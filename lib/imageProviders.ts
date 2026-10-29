// Configuration des fournisseurs d'images
import { uploadToS3 } from '@/lib/s3';
import Replicate from "replicate";
import {
  imageProviders as imageProvidersConfig,
  replicateModels as replicateModelsConfig,
  replicateModelConfigs,
  huggingFaceImageModels
} from '@/config/ai-models';

// Exporter les configurations pour la rétrocompatibilité
export const imageProviders = imageProvidersConfig;
export const replicateModels = replicateModelsConfig;

// Fonction pour générer une image avec Replicate
export async function generateImageWithReplicate(
  apiKey: string,
  prompt: string,
  options: {
    model?: string;
    width?: number;
    height?: number;
  } = {}
) {
  try {
    const replicate = new Replicate({
      auth: apiKey,
    });

    // Modèle par défaut si non spécifié
    const modelId = options.model || "ideogram-ai/ideogram-v2a";

    // Vérifier et formater l'ID du modèle
    const formattedModelId = modelId.includes(":") ? 
      modelId as `${string}/${string}:${string}` : 
      modelId as `${string}/${string}`;

    // Extraire le modèle de base sans le hash de version (s'il y a un ":")
    const baseModelId = modelId.includes(':') ? modelId.split(':')[0] : modelId;
    
    // Utiliser la configuration pour le modèle de base
    const config = replicateModelConfigs[baseModelId] || {
      num_inference_steps: 30,
      guidance_scale: 7.5
    };

    const input = {
      prompt,
      width: options.width || 1024,
      height: options.height || 1024,
        num_outputs: 1,
      guidance_scale: config.guidance_scale,
      negative_prompt: "ugly, blurry, poor quality, deformed",
      num_inference_steps: config.num_inference_steps
    };

    console.log("Appel de l'API Replicate avec:", {
      modelId,
      input
    });

    // Utiliser un timeout global pour la promesse complète - augmenté à 90 secondes pour Netlify
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Replicate API Timeout')), 90000); // 90 secondes
    });
    
    // Envelopper le tout dans une race promise pour avoir un timeout global
    const predictionPromise = Promise.race([
      (async () => {
        try {
          // Ajout d'un mécanisme de retry pour gérer les erreurs transitoires
          let attempts = 0;
          const maxAttempts = 3;
          let lastError = null;
          
          while (attempts < maxAttempts) {
            try {
              attempts++;
              console.log(`Tentative ${attempts}/${maxAttempts} de création de prédiction Replicate`);
              
              const prediction = await replicate.predictions.create({
                version: formattedModelId,
                input
              });
              
              console.log("Prédiction créée, en attente du résultat...");
              const finalPrediction = await replicate.wait(prediction);
              return finalPrediction;
            } catch (e) {
              lastError = e;
              console.error(`Erreur lors de la tentative ${attempts}:`, e);
              
              // Si c'est la dernière tentative, ne pas attendre
              if (attempts < maxAttempts) {
                // Attendre avant la prochaine tentative (backoff exponentiel)
                await wait(1000 * Math.pow(2, attempts - 1));
              }
            }
          }
          
          // Si on arrive ici, toutes les tentatives ont échoué
          throw lastError || new Error("Échec des tentatives de prédiction Replicate");
        } catch (e) {
          console.error("Erreur lors de la création ou de l'attente de la prédiction:", e);
          throw e;
        }
      })(),
      timeoutPromise
    ]);
    
    // Attendre le résultat avec un timeout
    const finalPrediction = await predictionPromise;
    console.log("Réponse de l'API Replicate:", finalPrediction);

    if (!finalPrediction.output) {
      throw new Error("Aucune sortie générée par le modèle");
    }

    // Gérer différents formats de sortie
    const imageUrl = Array.isArray(finalPrediction.output) 
      ? finalPrediction.output[0] 
      : finalPrediction.output;

    if (!imageUrl || typeof imageUrl !== "string") {
      throw new Error("Format de sortie invalide");
    }

    // Valider que l'URL est accessible
    try {
      // Ajouter des paramètres de cache pour éviter les problèmes avec les CDN
      const urlWithCacheBuster = imageUrl.includes('?') 
        ? `${imageUrl}&cb=${Date.now()}` 
        : `${imageUrl}?cb=${Date.now()}`;
        
      const testResponse = await fetch(urlWithCacheBuster, { 
        method: 'HEAD',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!testResponse.ok) {
        throw new Error(`L'URL de l'image n'est pas accessible: ${testResponse.status}`);
      }
    } catch (validationError) {
      console.error("Erreur de validation de l'URL de l'image:", validationError);
      throw new Error("L'URL générée n'est pas accessible");
    }

    return imageUrl;
  } catch (error: any) {
    console.error("Erreur Replicate:", error);
    
    // En cas d'erreur, utiliser Picsum comme fallback
    console.log("Utilisation de Picsum comme fallback après échec de Replicate");
    try {
      const width = options?.width || 1024;
      const height = options?.height || 1024;
      return await generateImageWithPicsum({ width, height });
    } catch (fallbackError) {
      console.error("Erreur lors du fallback vers Picsum:", fallbackError);
      throw new Error(`Erreur lors de la génération d'image: ${error.message}`);
    }
  }
}

// Fonction pour générer une image avec Pexels
export const generateImageWithPexels = async (
  apiKey: string,
  query: string,
  options?: {
    perPage?: number;
    orientation?: string;
  }
) => {
  try {
    const perPage = options?.perPage || 15;
    const orientation = options?.orientation || "landscape";
    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientation}`;
    
    const response = await fetch(pexelsUrl, {
      headers: {
        "Authorization": apiKey
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erreur Pexels API:", response.status, errorText);
      throw new Error(`Erreur API Pexels: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.photos || data.photos.length === 0) {
      throw new Error("Aucune image trouvée");
    }
    
    // Sélectionner une image aléatoire parmi les résultats
    const randomIndex = Math.floor(Math.random() * Math.min(data.photos.length, perPage));
    return data.photos[randomIndex].src.large;
  } catch (error) {
    console.error("Erreur lors de la génération d'image avec Pexels:", error);
    throw error;
  }
};

// Fonction pour générer une image avec Lorem Picsum
export const generateImageWithPicsum = async (
  options?: {
    width?: number;
    height?: number;
  }
) => {
  try {
    const width = options?.width || 1024;
    const height = options?.height || 768;
    // Générer un ID aléatoire pour avoir une image différente à chaque fois
    const randomId = Math.floor(Math.random() * 1000) + 1;
    return `https://picsum.photos/seed/${randomId}/${width}/${height}`;
  } catch (error) {
    console.error("Erreur lors de la génération d'image avec Picsum:", error);
    throw error;
  }
};

// Fonction pour attendre un délai spécifié
const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Fonction pour générer une image avec Hugging Face
export const generateImageWithHuggingFace = async (
  apiKey: string,
  prompt: string,
  options?: {
    width?: number;
    height?: number;
    model?: string;
  }
): Promise<string> => {
  try {
    // Obtenir le modèle demandé
    const model = options?.model || "stabilityai/stable-diffusion-xl-base-1.0";
    
    // Trouver la configuration du modèle dans notre liste
    const modelData = huggingFaceImageModels.find(m => m.id === model);
    
    // Utiliser la configuration du modèle ou une configuration par défaut
    const modelConfig = modelData?.config || {
      width: 512,
      height: 512,
      inference_steps: 25,
      guidance: 7.0
    };
    
    // Dimensions finales (prendre les dimensions demandées si spécifiées, sinon celles du modèle)
    const width = options?.width || modelConfig.width;
    const height = options?.height || modelConfig.height;
    
    // URL du modèle
    const apiUrl = `https://api-inference.huggingface.co/models/${model}`;
    
    // Améliorer le prompt avec des éléments de qualité
    let enhancedPrompt = prompt;
    
    // N'ajouter des améliorateurs que si le prompt ne les a pas déjà
    if (!prompt.toLowerCase().includes("high quality") && 
        !prompt.toLowerCase().includes("detailed") &&
        !prompt.toLowerCase().includes("sharp") &&
        !prompt.toLowerCase().includes("4k") &&
        !prompt.toLowerCase().includes("8k")) {
      
      enhancedPrompt = `high quality, detailed, ${prompt}`;
    }
    
    // Ajouter un seed aléatoire pour assurer que chaque image est différente
    // (même si le prompt est le même)
    const randomSeed = Math.floor(Math.random() * 2147483647); // Nombre entier 32 bits max
    
    // Si le prompt contient déjà un paramètre [seed:XXX], le remplacer par notre nouvelle valeur
    if (enhancedPrompt.match(/\[seed:\d+\]/)) {
      enhancedPrompt = enhancedPrompt.replace(/\[seed:\d+\]/, `[seed:${randomSeed}]`);
    } else {
      // Pour les modèles qui refusent les paramètres, on peut ajouter un timestamp caché dans le prompt
      if (modelConfig.use_standard_params) {
        enhancedPrompt = `${enhancedPrompt} [seed:${randomSeed}]`;
      }
    }
    
    console.log(`Envoi de requête à Hugging Face avec le modèle ${model} et le prompt amélioré:`, enhancedPrompt);
    
    // Construire les paramètres adaptés au modèle
    const requestBody: any = {
      inputs: enhancedPrompt,
    };
    
    // Certains modèles ne supportent pas les paramètres de personnalisation
    // ou ont besoin de paramètres différents
    if (!modelConfig.use_standard_params && model !== "stabilityai/sdxl-turbo") {
      requestBody.parameters = {
        width: width,
        height: height,
        num_inference_steps: modelConfig.inference_steps,
        guidance_scale: modelConfig.guidance,
        seed: randomSeed, // Utiliser une valeur aléatoire pour le seed
      };
      
      // Ajouter le negative prompt si présent dans la configuration du modèle
      if (modelConfig.negative_prompt) {
        requestBody.parameters.negative_prompt = modelConfig.negative_prompt;
      }
    } else if (modelConfig.use_standard_params) {
      // Pour les modèles qui ont besoin de paramètres standards
      // Ne rien faire ici car on a déjà ajouté le seed dans le prompt
      console.log(`Utilisation de paramètres standards pour le modèle ${model} avec seed incorporé dans le prompt`);
    }
    
    // Envoyer la requête avec un timeout adapté
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), modelConfig.timeout || 120000); // 120 secondes (2 minutes)
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Gestion des erreurs
    if (!response.ok) {
      if (response.status === 503) {
        const retryAfter = response.headers.get("Retry-After") || "30";
        console.log(`Le modèle ${model} est en cours de chargement (attente: ${retryAfter}s)`);
        
        // Si c'est un nouveau modèle qui se charge, passer directement à SDXL
        if (model.includes("ByteDance") || 
            model.includes("FLUX") || 
            model.includes("stable-diffusion-3")) {
          console.log("Passage direct à Stable Diffusion XL pour éviter l'attente");
          
          // Attendre un court délai avant de réessayer avec un autre modèle
          await wait(2000);
          
          return generateImageWithHuggingFace(apiKey, prompt, {
            model: "stabilityai/stable-diffusion-xl-base-1.0",
            width: 768,
            height: 768
          });
        }
        
        throw new Error(`Modèle en cours de chargement, réessayez dans ${retryAfter} secondes`);
      }
      
      // Si erreur avec un modèle, essayer avec un modèle plus simple
      if (response.status === 500 || response.status === 404 || response.status === 400) {
        console.error(`Erreur ${response.status} avec le modèle ${model}. Essai avec un modèle alternatif...`);
        
        // Si le modèle actuel est un nouveau modèle, essayer avec SDXL
        if (model.includes("ByteDance") || 
            model.includes("FLUX") || 
            model.includes("stable-diffusion-3")) {
          console.log("Tentative avec SDXL comme modèle de fallback");
          
          // Attendre un court délai avant de réessayer avec un autre modèle
          await wait(2000);
          
          return generateImageWithHuggingFace(apiKey, prompt, {
            model: "stabilityai/stable-diffusion-xl-base-1.0",
            width: 768,
            height: 768
          });
        }
        
        // Si le modèle actuel n'est pas déjà SD 1.5, essayer avec lui
        if (model !== "runwayml/stable-diffusion-v1-5") {
          console.log("Tentative avec le modèle de fallback: runwayml/stable-diffusion-v1-5");
          return generateImageWithHuggingFace(apiKey, prompt, {
            model: "runwayml/stable-diffusion-v1-5",
            width: 512,
            height: 512
          });
        }
      }
      
      try {
        const error = await response.json();
        throw new Error(`Erreur Hugging Face API: ${error.error || response.statusText}`);
      } catch (jsonError) {
        throw new Error(`Erreur Hugging Face API: ${response.statusText || "Erreur inconnue"}`);
      }
    }
    
    // Traitement de l'image générée
    const isServer = typeof window === 'undefined';
    
    if (isServer) {
      console.log(`Génération de l'image côté serveur avec le modèle ${model}...`);
      
      // Convertir la réponse en buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Générer un nom de fichier descriptif
      const timestamp = Date.now();
      const modelIdentifier = model.split('/').pop() || 'sd-model';
      const fileName = `ai-generated-${modelIdentifier}-${timestamp}.png`;
      
      // Utiliser le service S3 existant
      const s3Key = `article/${fileName}`;
      const contentType = 'image/png';
      
      try {
        // Upload vers S3
        const imageUrl = await uploadToS3(buffer, s3Key, contentType);
        console.log(`Image haute qualité générée et enregistrée à: ${imageUrl}`);
        
        return imageUrl;
      } catch (s3Error) {
        console.error("Erreur lors de l'upload S3:", s3Error);
        throw new Error("Erreur lors de l'enregistrement de l'image générée");
      }
    } else {
      console.log(`Génération de l'image côté client avec le modèle ${model}...`);
      const imageBlob = await response.blob();
      const formData = new FormData();
      formData.append("file", imageBlob, `ai-generated-${model.split('/').pop()}.png`);
      formData.append("type", "article");
      formData.append("source", `huggingface-${model}`);
      
      // URL absolue pour l'upload
      const uploadUrl = new URL("/api/upload", window.location.origin).href;
      
      // Upload de l'image
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData
      });
      
      if (!uploadResponse.ok) {
        throw new Error("Erreur lors de l'upload de l'image générée");
      }
      
      const uploadData = await uploadResponse.json();
      return uploadData.url;
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("La requête a été interrompue car elle a dépassé le délai d'attente");
      throw new Error("La génération d'image a pris trop de temps");
    }
    
    console.error("Erreur lors de la génération d'image avec Hugging Face:", error);
    
    // Permettre à l'appelant de gérer les erreurs spécifiques
    if (error instanceof Error && error.message.includes("Bad Request")) {
      error.name = "BadRequestError";
    }
    
    throw error;
  }
};

// Fonction pour générer une image avec Stable Diffusion API
export const generateImageWithStableDiffusion = async (
  apiKey: string,
  prompt: string,
  options?: {
    width?: number;
    height?: number;
  }
) => {
  try {
    const width = options?.width || 1024;
    const height = options?.height || 768;
    const apiUrl = `https://stablediffusionapi.com/api/v3/text2img`;
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        key: apiKey,
        prompt: prompt,
        width: width,
        height: height,
        samples: 1,
        num_inference_steps: 30,
        guidance_scale: 7.5
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Erreur Stable Diffusion API: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (data.status !== "success" || !data.output || data.output.length === 0) {
      throw new Error(data.message || "Erreur lors de la génération d'image");
    }

    return data.output[0];
  } catch (error) {
    console.error("Erreur lors de la génération d'image avec Stable Diffusion:", error);
    throw error;
  }
};

// Fonction pour générer une image avec OpenAI (DALL-E)
export const generateImageWithOpenAI = async (
  apiKey: string,
  prompt: string,
  options?: {
    model?: string;
    width?: number;
    height?: number;
  }
): Promise<string> => {
  try {
    const model = options?.model || "dall-e-3";
    const width = options?.width || 1024;
    const height = options?.height || 1024;
    
    // Paramètres selon le modèle
    const size = model === "dall-e-3" 
      ? "1024x1024" // DALL-E 3 supporte 1024x1024, 1792x1024 ou 1024x1792
      : "1024x1024"; // DALL-E 2 supporte 256x256, 512x512 ou 1024x1024
    
    console.log(`Génération d'image avec OpenAI (${model}): "${prompt}"`);
    
    const isServer = typeof window === 'undefined';
    const baseUrl = "https://api.openai.com/v1/images/generations";
    
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        quality: model === "dall-e-3" ? "standard" : undefined,
        response_format: "url"
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error("Erreur OpenAI:", error);
      throw new Error(`Erreur OpenAI: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !data.data[0] || !data.data[0].url) {
      throw new Error("Format de réponse OpenAI invalide");
    }
    
    const imageUrl = data.data[0].url;
    
    // Si on est côté serveur, télécharger l'image et la stocker sur S3
    if (isServer) {
      console.log("Traitement de l'image côté serveur...");
      
      try {
        // Télécharger l'image
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error("Impossible de télécharger l'image");
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Générer un nom de fichier descriptif
        const timestamp = Date.now();
        const modelShort = model.replace(/dall-e-/, "dalle");
        const fileName = `ai-generated-${modelShort}-${timestamp}.png`;
        
        // Utiliser le service S3
        const s3Key = `article/${fileName}`;
        const contentType = 'image/png';
        
        // Upload vers S3
        const uploadedUrl = await uploadToS3(buffer, s3Key, contentType);
        console.log(`Image haute qualité téléchargée et enregistrée à: ${uploadedUrl}`);
        
        return uploadedUrl;
      } catch (uploadError) {
        console.error("Erreur lors du traitement de l'image:", uploadError);
        // Fallback à l'URL directe de OpenAI
        return imageUrl;
      }
    }
    
    return imageUrl;
  } catch (error: any) {
    console.error("Erreur lors de la génération d'image avec OpenAI:", error);
    throw new Error(`Erreur OpenAI: ${error.message}`);
  }
};