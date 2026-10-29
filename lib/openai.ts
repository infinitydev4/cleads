import OpenAI from 'openai';
import { generateTextWithHuggingFace } from '@/lib/textProviders';
import { openAIModels } from '@/config/ai-models';

// Génération dynamique de l'objet models à partir de la configuration centralisée
export const models: Record<string, string> = openAIModels.reduce((acc, model) => {
  // Ne pas inclure les modèles de type image ou audio
  if (!model.type || model.type === 'text') {
    acc[model.id] = model.model;
  }
  return acc;
}, {} as Record<string, string>);

export type ModelType = keyof typeof models;

export const getOpenAIClient = (apiKey: string) => {
  return new OpenAI({
    apiKey: apiKey
  });
};

// Les options de génération d'images ont été déplacées vers lib/imageProviders.ts

// Fonction principale pour générer du contenu de blog 
// avec support multi-provider
export const generateBlogContent = async (
  client: any,
  model: string,
  prompt: {
    topic: string;
    keywords: string[];
    tone?: string;
    language?: string;
    provider?: string;
    huggingFaceApiKey?: string;
    huggingFaceModel?: string;
    highQuality?: boolean;
    temperature?: number;
  }
) => {
  try {
    // Validation des entrées
    if (!prompt.topic || typeof prompt.topic !== 'string') {
      throw new Error("Le sujet est requis");
    }
    
    if (!prompt.keywords || !Array.isArray(prompt.keywords) || prompt.keywords.length === 0) {
      throw new Error("Les mots-clés sont requis");
    }

    // Utiliser Hugging Face si spécifié
    if (prompt.provider === "huggingface" && prompt.huggingFaceApiKey) {
      console.log("Génération de contenu avec Hugging Face, modèle:", prompt.huggingFaceModel || model);
      return await generateTextWithHuggingFace(
        prompt.huggingFaceApiKey,
        prompt.huggingFaceModel || model,
        {
          topic: prompt.topic,
          keywords: prompt.keywords,
          tone: prompt.tone,
          language: prompt.language
        }
      );
    }

    // Utiliser OpenAI (par défaut)
    // Vérifier la clé API
    const apiKey = client.apiKey;
    if (!apiKey) {
      throw new Error("Clé API OpenAI manquante");
    }

    // Utilisation de OpenAI (chemin existant)
    console.log("Génération de contenu avec OpenAI, modèle:", models[model as ModelType] || model);

    // Déterminer la langue demandée
    const language = prompt.language || "français";
    
    // Ajustement de la longueur du contenu en fonction de la qualité demandée
    const contentLength = prompt.highQuality ? 
      "entre 1200 et 2000 mots" : "entre 800 et 1200 mots";
    
    // Définir une température par défaut (0.7) ou utiliser celle fournie 
    // La température contrôle la créativité/randomisation (0.1-1.0)
    const temperature = prompt.temperature !== undefined ? prompt.temperature : 0.7;

    // Création d'un prompt amélioré pour le SEO et les suggestions d'images
    const userContent = `Rédige un article de blog bien structuré, informatif et optimisé pour le SEO en ${prompt.language || "français"}, avec un ton ${prompt.tone || "professionnel"}, sur le sujet suivant : "${prompt.topic}". Utilise les mots-clés suivants de manière naturelle : ${prompt.keywords.join(", ")}.

    Respecte STRICTEMENT le format suivant (les balises HTML doivent être conservées dans le contenu) :
    
    TITRE: [Titre accrocheur de 60 caractères maximum, intégrant un mot-clé principal]
    META_DESCRIPTION: [Meta description optimisée SEO, entre 150 et 160 caractères, incluant des mots-clés]
    EXTRAIT: [Résumé percutant de 2 à 3 phrases contenant les mots-clés principaux]
    TAGS: [Liste de 5 à 7 tags pertinents, séparés par des virgules]
    CATEGORIE: [Catégorie principale de l'article]
    IMAGE_SUGGESTIONS:
    Suggestion 1: [Description claire et précise d'une image pertinente, sans puce ni tiret]
    Suggestion 2: [Description claire et précise d'une image pertinente, sans puce ni tiret]
    Suggestion 3: [Description claire et précise d'une image pertinente, sans puce ni tiret]
    CONTENU:
    <h1>[Titre principal reprenant le titre avec éventuelle variation]</h1>
    
    <p>[Introduction de 3 à 4 phrases présentant le sujet, intégrant les mots-clés principaux]</p>
    
    <h2>[Premier sous-titre intégrant un mot-clé si possible]</h2>
    <p>[Développement du premier point, bien structuré et informatif]</p>
    
    <h2>[Deuxième sous-titre intégrant un mot-clé si possible]</h2>
    <p>[Développement du deuxième point, de manière claire et engageante]</p>
    
    <h3>[Sous-section spécifique liée au deuxième point]</h3>
    <ul>
    <li>[Premier élément important à retenir]</li>
    <li>[Deuxième élément clé du sujet]</li>
    <li>[Troisième point pertinent ou astuce]</li>
    </ul>
    
    <h2>[Troisième sous-titre intégrant un mot-clé si possible]</h2>
    <p>[Développement du troisième point avec fluidité et clarté]</p>
    
    <p>[Conclusion synthétique qui résume les idées principales et propose un appel à l'action]</p>
    
    Le contenu doit être rédigé de façon naturelle, sans suroptimisation. Intègre les mots-clés avec fluidité, varie les formulations, respecte une densité de mots-clés autour de 1 à 2 %, et structure bien le texte avec des balises <h2>, <h3> et des listes à puces quand pertinent. Le ton doit rester utile, pertinent, et adapté à une lecture web. ${contentLength}`;
    
    console.log("Envoi de la requête à OpenAI avec le contenu:", userContent);

    // Appeler l'API OpenAI avec la configuration complète
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: models[model as ModelType] || model,
        messages: [
          {
            role: "user",
            content: userContent
          }
        ],
        temperature: temperature
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Erreur API OpenAI: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("Pas de contenu généré");
    }

    console.log("Contenu brut reçu:", content);

    // Extraction des parties du texte avec des regex améliorées
    // On recherche chaque section individuellement pour plus de robustesse
    const titleMatch = content.match(/TITRE:?\s*([\s\S]*?)(?=META_DESCRIPTION:|$)/i);
    const metaDescMatch = content.match(/META_DESCRIPTION:?\s*([\s\S]*?)(?=EXTRAIT:|$)/i);
    const excerptMatch = content.match(/EXTRAIT:?\s*([\s\S]*?)(?=TAGS:|$)/i);
    const tagsMatch = content.match(/TAGS:?\s*([\s\S]*?)(?=CATEGORIE:|$)/i);
    const categoryMatch = content.match(/CATEGORIE:?\s*([\s\S]*?)(?=IMAGE_SUGGESTIONS:|CONTENU:|$)/i);
    const imagePromptMatch = content.match(/IMAGE_SUGGESTIONS:?\s*([\s\S]*?)(?=CONTENU:|$)/i);
    const contentMatch = content.match(/CONTENU:?\s*([\s\S]*$)/i);

    console.log("Matches:", {
      titleMatch: !!titleMatch,
      metaDescMatch: !!metaDescMatch,
      excerptMatch: !!excerptMatch,
      tagsMatch: !!tagsMatch,
      categoryMatch: !!categoryMatch,
      imagePromptMatch: !!imagePromptMatch,
      contentMatch: !!contentMatch
    });

    // Si on ne peut pas extraire le contenu structuré, on retourne le texte brut
    if (!titleMatch) {
      console.log("Impossible d'extraire le titre, on utilise le contenu brut");
      
      // Division basique par paragraphes si aucun formatage n'est trouvé
      const paragraphs = content.split("\n\n");
      
      return {
        title: prompt.topic,
        metaTitle: prompt.topic,
        metaDescription: paragraphs[0]?.substring(0, 150) || `Article sur ${prompt.topic}`,
        excerpt: paragraphs[0]?.substring(0, 150) || `Article sur ${prompt.topic}`,
        tags: prompt.keywords,
        category: "Blog",
        content: content, // On retourne tout le contenu brut
        imageSuggestions: []
      };
    }

    // Extraire les suggestions d'image et les formater en tableau
    // Traiter le format basé sur "Suggestion X: "
    let imageSuggestions: string[] = [];
    
    if (imagePromptMatch?.[1]) {
      // Extraction des suggestions avec un format spécifique
      const suggestionLines = imagePromptMatch[1]
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
      
      // Extraire et nettoyer chaque suggestion
      imageSuggestions = suggestionLines.map((line: string) => {
        // Enlever "Suggestion X: " ou autres formats similaires
        return line.replace(/^(Suggestion \d+:|-)?\s*/, '').trim();
      });
    }

    // Construction de l'objet résultat avec fallbacks
    const result = {
      title: titleMatch[1]?.trim() || prompt.topic,
      metaTitle: titleMatch[1]?.trim() || prompt.topic,
      metaDescription: metaDescMatch?.[1]?.trim() || `Article sur ${prompt.topic}`,
      excerpt: excerptMatch?.[1]?.trim() || `Article sur ${prompt.topic}`,
      tags: tagsMatch?.[1]?.split(",")?.map((tag: string) => tag.trim())?.filter(Boolean) || prompt.keywords,
      category: categoryMatch?.[1]?.trim() || "Blog",
      // Assurer que seul le contenu après le marqueur CONTENU: est utilisé
      content: contentMatch?.[1]?.trim() || 
              // Si pas de correspondance, essayer d'extraire le contenu après "CONTENU:"
              (content.includes("CONTENU:") ? 
                content.split("CONTENU:")[1]?.trim() : 
                // Dernier recours: supprimer toutes les métadonnées connues
                content.replace(/TITRE:[\s\S]*?CONTENU:/i, "").trim()),
      imageSuggestions: imageSuggestions
    };

    // Corriger les problèmes courants dans la métadescription
    // Ce problème se produit quand OpenAI génère deux phrases dans la métadescription
    if (result.metaDescription && result.metaDescription.includes(". ")) {
      // Essayer de prendre seulement la première phrase pour éviter la concaténation des titres
      const firstSentence = result.metaDescription.split(". ")[0] + ".";
      // Si la première phrase est assez longue, l'utiliser
      if (firstSentence.length > 50) {
        result.metaDescription = firstSentence;
      }
    }

    // Nettoyage supplémentaire du contenu - supprimer tout texte avant la première balise HTML
    if (result.content) {
      const htmlTagMatch = result.content.match(/<([a-z][a-z0-9]*)\b[^>]*>/i);
      if (htmlTagMatch && htmlTagMatch.index) {
        result.content = result.content.substring(htmlTagMatch.index);
      }
    }

    console.log("Objet résultat généré:", { 
      ...result, 
      content: result.content.substring(0, 100) + "...",
      imageSuggestions 
    });
    
    return result;
  } catch (error) {
    console.error("Erreur lors de la génération du contenu:", error);
    throw error;
  }
};

export async function generateImageSuggestions(
  openai: any, 
  model: string, 
  content: string, 
  count: number = 3
): Promise<string[]> {
  try {
    // Créer un prompt pour obtenir des suggestions d'images basées sur le contenu
    const systemPrompt = `Tu es un expert en prompts de génération d'images IA. 
Pour les modèles de haute qualité comme ByteDance/InfiniteYou, black-forest-labs/FLUX.1-dev, stabilityai/stable-diffusion-3.5-large, et SDXL.
Ces modèles 2025 sont excellents pour générer des images très détaillées et photoréalistes.

Ton rôle est d'analyser le contenu fourni et de suggérer ${count} prompts détaillés pour générer des images pertinentes qui illustreraient parfaitement ce contenu. 
Favorise des images puissantes visuellement.

Exemples de bons prompts:
- "Photo professionnelle ultra-détaillée d'un [sujet], éclairage cinématographique, superbe composition, 8k, style réaliste"
- "Illustration hyperréaliste de [sujet], haute résolution, rendu 3D photoréaliste avec textures détaillées"
- "Image artistique saisissante de [sujet], style épique, couleurs vibrantes, perspective dramatique, photoréalisme"

Réponds uniquement avec les prompts, un par ligne, sans numérotation ni explications supplémentaires.`;

    // Utiliser l'API pour générer des suggestions d'images
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: content.substring(0, 8000) } // Limiter la taille du contenu
      ],
      temperature: 0.7, // Assez de créativité
      max_tokens: 500  // Limite raisonnable pour les suggestions
    });

    // Extraction des suggestions de la réponse
    const response = completion.choices[0]?.message?.content || "";
    
    // Diviser la réponse en lignes et filtrer les lignes vides
    const suggestions = response
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line && line.length > 0);
    
    // Limiter au nombre demandé
    return suggestions.slice(0, count);
  } catch (error) {
    console.error("Erreur lors de la génération des suggestions d'images:", error);
    throw error;
  }
}
