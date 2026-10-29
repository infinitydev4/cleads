import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";
import { 
  generateImageWithPexels, 
  generateImageWithPicsum,
  generateImageWithHuggingFace,
  generateImageWithStableDiffusion,
  generateImageWithReplicate 
} from "@/lib/imageProviders";
import { imageProviders } from "@/config/ai-models";

export async function POST(request: Request) {
  try {
    // Authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération de l'utilisateur et ses paramètres
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    // Récupération et validation du corps de la requête
    const body = await request.json();
    const { prompt, provider: requestedProvider, model: requestedModel } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: "Un prompt valide est requis" },
        { status: 400 }
      );
    }

    try {
      // Nettoyer le prompt pour qu'il soit compatible avec l'URL
      // Enlever les tirets, apostrophes et autres caractères spéciaux
      let cleanedPrompt = prompt
        .replace(/^[-\s]+/, '')          // Enlever les tirets et espaces au début
        .replace(/[-]+/g, ' ')           // Remplacer les tirets par des espaces
        .replace(/['']/g, '')            // Supprimer les apostrophes
        .replace(/[^\w\s]/g, ' ')        // Remplacer les autres caractères spéciaux par des espaces
        .trim();                          // Enlever les espaces superflus
        
      // Limiter la longueur du prompt à 250 caractères pour éviter les timeouts
      if (cleanedPrompt.length > 250) {
        cleanedPrompt = cleanedPrompt.substring(0, 250);
        console.log("Prompt tronqué à 250 caractères pour éviter les timeouts");
      }
      
      // Extraction des catégories génériques à partir du prompt
      const categories = {
        'coach': 'fitness',
        'sportif': 'fitness',
        'fitness': 'fitness',
        'sport': 'fitness',
        'exercice': 'fitness',
        'landing': 'business',
        'page': 'business',
        'marketing': 'business',
        'site': 'business',
        'web': 'business',
        'design': 'design',
        'création': 'design',
        'entreprise': 'business',
        'professionnel': 'business',
        'digital': 'technology',
        'numérique': 'technology',
        'technologie': 'technology',
        'ordinateur': 'technology',
        'santé': 'health',
        'bien-être': 'health',
        'méditation': 'health',
        'yoga': 'health',
        'bureau': 'office',
        'travail': 'office',
        'réunion': 'office',
        'équipe': 'office',
      };
      
      // Chercher les catégories correspondantes dans le prompt
      const matchedCategories = new Set<string>();
      
      // Diviser le prompt en mots et chercher des correspondances
      const words = cleanedPrompt.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (categories[word as keyof typeof categories]) {
          matchedCategories.add(categories[word as keyof typeof categories]);
        }
      });
      
      // S'il n'y a pas de correspondance, utiliser des catégories génériques
      if (matchedCategories.size === 0) {
        matchedCategories.add('business');
      }
      
      // Utiliser le provider par défaut configuré si l'utilisateur n'en a pas demandé un spécifique
      // ou utiliser le provider par défaut du système s'il n'a pas de préférences
      const imageProvider = requestedProvider || 
                            user.settings?.imageProvider || 
                            imageProviders.defaultProvider;
                            
      const searchTerms = Array.from(matchedCategories).slice(0, 2).join(' ');
      
      let imageUrl: string;
      let fallback = false;
      
      // Génération d'image selon le fournisseur choisi
      switch (imageProvider) {
        case "replicate":
          if (!user.settings?.replicateApiKey) {
            console.log("Clé API Replicate non configurée. Utilisation de Picsum comme fallback");
            imageUrl = await generateImageWithPicsum();
            fallback = true;
          } else {
            try {
              // Utiliser le modèle spécifié ou celui des paramètres
              const model = requestedModel || user.settings?.replicateModel || "black-forest-labs/flux-dev-lora";
              console.log("Utilisation du modèle Replicate:", model);
              
              // Utiliser un AbortController pour limiter le temps d'attente
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 secondes maximum
              
              try {
                // Promesse de génération d'image
                const imagePromise = generateImageWithReplicate(
                  user.settings.replicateApiKey,
                  cleanedPrompt,
                  { model }
                );
                
                // Si la promesse prend trop de temps, on utilise le fallback
                imageUrl = await Promise.race([
                  imagePromise,
                  new Promise<string>((_, reject) => {
                    setTimeout(() => reject(new Error("Timeout lors de la génération d'image")), 25000);
                  })
                ]);
                
                clearTimeout(timeoutId);
              } catch (timeoutError) {
                console.error("Timeout dépassé lors de la génération avec Replicate:", timeoutError);
                imageUrl = await generateImageWithPicsum();
                fallback = true;
              }
            } catch (error) {
              console.error("Erreur avec l'API Replicate, utilisation de Picsum comme fallback:", error);
              imageUrl = await generateImageWithPicsum();
              fallback = true;
            }
          }
          break;

        case "pexels":
          if (!user.settings?.pexelsApiKey) {
            // Fallback si la clé API n'est pas configurée
            console.log("Clé API Pexels non configurée. Utilisation de Picsum comme fallback");
            imageUrl = await generateImageWithPicsum();
            fallback = true;
          } else {
            try {
              imageUrl = await generateImageWithPexels(user.settings.pexelsApiKey, searchTerms);
            } catch (error) {
              console.error("Erreur avec l'API Pexels, utilisation de Picsum comme fallback:", error);
              imageUrl = await generateImageWithPicsum();
              fallback = true;
            }
          }
          break;
          
        case "huggingface":
          if (!user.settings?.huggingFaceApiKey) {
            console.log("Clé API Hugging Face non configurée. Utilisation de Picsum comme fallback");
            imageUrl = await generateImageWithPicsum();
            fallback = true;
          } else {
            // Pour Hugging Face, utiliser le prompt complet pour une meilleure génération
            // et le modèle spécifié dans la requête ou dans les paramètres
            const model = requestedModel || user.settings?.huggingFaceModel || "stabilityai/stable-diffusion-xl-base-1.0";
            console.log("Utilisation du modèle Hugging Face:", model);
            
            try {
              imageUrl = await generateImageWithHuggingFace(
                user.settings.huggingFaceApiKey,
                cleanedPrompt,
                { model }
              );
            } catch (error) {
              console.error("Erreur avec Hugging Face, utilisation de Picsum:", error);
              imageUrl = await generateImageWithPicsum();
              fallback = true;
            }
          }
          break;
          
        case "sdapi":
          if (!user.settings?.stableDiffusionApiKey) {
            console.log("Clé API Stable Diffusion non configurée. Utilisation de Picsum comme fallback");
            imageUrl = await generateImageWithPicsum();
            fallback = true;
          } else {
            try {
              imageUrl = await generateImageWithStableDiffusion(user.settings.stableDiffusionApiKey, cleanedPrompt);
            } catch (error) {
              console.error("Erreur avec l'API Stable Diffusion, utilisation de Picsum comme fallback:", error);
              imageUrl = await generateImageWithPicsum();
              fallback = true;
            }
          }
          break;
          
        case "picsum":
        default:
          imageUrl = await generateImageWithPicsum();
          break;
      }
      
      return NextResponse.json({ 
        url: imageUrl,
        prompt: cleanedPrompt,
        searchTerms,
        provider: fallback ? "picsum" : imageProvider,
        model: imageProvider === "huggingface" 
               ? (requestedModel || user.settings?.huggingFaceModel || "stabilityai/stable-diffusion-xl-base-1.0") 
               : imageProvider === "replicate"
               ? (requestedModel || user.settings?.replicateModel || "black-forest-labs/flux-dev-lora")
               : null,
        fallback
      });
    } catch (error: any) {
      console.error("Erreur lors de la génération de l'image:", error);
      return NextResponse.json(
        { error: error.message || "Erreur lors de la génération de l'image" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Erreur de traitement:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors du traitement de la requête" },
      { status: 500 }
    );
  }
} 