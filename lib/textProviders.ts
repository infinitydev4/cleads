// Configuration des fournisseurs de génération de texte
import { models as openAIModels } from '@/lib/openai';

export const textProviders = {
  providers: [
    {
      name: "OpenAI",
      id: "openai",
      description: "Génération de texte via l'API OpenAI",
      apiUrl: "https://api.openai.com/v1/chat/completions",
      cost: "Payant selon le modèle utilisé",
      pros: "Haute qualité, modèles performants",
      cons: "Nécessite une clé API payante",
      setup: "Nécessite un compte OpenAI et une clé API",
      requiresApiKey: true,
      models: [
        { name: "GPT-3.5 Turbo", id: "GPT35", description: "Bon équilibre entre performance et coût" },
        { name: "GPT-4", id: "GPT4", description: "Modèle le plus avancé, meilleure compréhension" }
      ]
    },
    {
      name: "Hugging Face",
      id: "huggingface",
      description: "Génération de texte via l'API Hugging Face",
      apiUrl: "https://api-inference.huggingface.co/models/",
      cost: "Gratuit avec compte (limites d'utilisation)",
      pros: "Accès à de nombreux modèles open source",
      cons: "Qualité variable selon les modèles",
      setup: "Nécessite un compte Hugging Face et une clé API",
      requiresApiKey: true,
      models: [
        { name: "Mixtral 8x7B", id: "mistralai/Mixtral-8x7B-Instruct-v0.1", description: "Modèle performant et polyvalent, alternative gratuite à GPT-4" },
        { name: "Mistral 7B", id: "mistralai/Mistral-7B-Instruct-v0.2", description: "Modèle compact et rapide, bonne qualité de texte" },
        { name: "Llama 3 8B", id: "meta-llama/Meta-Llama-3-8B-Instruct", description: "Modèle récent de Meta, performant pour sa taille" },
        { name: "Llama 3 70B", id: "meta-llama/Meta-Llama-3-70B-Instruct", description: "Grand modèle avancé, comparable à GPT-4" },
        { name: "Falcon 40B", id: "tiiuae/falcon-40b-instruct", description: "Modèle multilingue puissant" },
        { name: "Gemma 7B", id: "google/gemma-7b-it", description: "Modèle compact de Google" }
      ]
    }
  ],
  defaultProvider: "openai"
};

// Fonction pour générer du texte avec Hugging Face
export const generateTextWithHuggingFace = async (
  apiKey: string,
  model: string,
  prompt: {
    topic: string;
    keywords: string[];
    tone?: string;
    language?: string;
  }
): Promise<any> => {
  try {
    // Construire le prompt dans le même format que celui d'OpenAI pour la cohérence
    const userContent = `Écris un article de blog bien structuré et optimisé pour le SEO en ${prompt.language || "français"} avec un ton ${prompt.tone || "professionnel"} sur le sujet: "${prompt.topic}" en utilisant les mots-clés suivants: ${prompt.keywords.join(", ")}.

Voici le FORMAT À SUIVRE:

TITRE: [Titre accrocheur incluant un des mots-clés principaux, 60 caractères max]
META_DESCRIPTION: [Meta description SEO de 150-160 caractères avec des mots-clés]
EXTRAIT: [Extrait concis de 2-3 phrases avec mots-clés principaux]
TAGS: [5-7 tags pertinents séparés par des virgules]
CATEGORIE: [Catégorie principale]
IMAGE_SUGGESTIONS: 
Suggestion 1: [Description précise d'une image pertinente sans tiret ni puce]
Suggestion 2: [Description précise d'une image pertinente sans tiret ni puce]
Suggestion 3: [Description précise d'une image pertinente sans tiret ni puce]
CONTENU:
<h1>[Titre principal qui reprend le titre avec éventuellement des variations]</h1>

<p>[Introduction de 3-4 phrases qui présente le sujet et inclut des mots-clés principaux]</p>

<h2>[Premier sous-titre avec mot-clé si possible]</h2>
<p>[Paragraphe détaillé qui développe ce point]</p>

<h2>[Deuxième sous-titre avec mot-clé si possible]</h2>
<p>[Paragraphe détaillé qui développe ce point]</p>

<h3>[Titre de section plus spécifique]</h3>
<ul>
<li>[Premier point important]</li>
<li>[Deuxième point important]</li>
<li>[Troisième point important]</li>
</ul>

<h2>[Troisième sous-titre avec mot-clé si possible]</h2>
<p>[Paragraphe détaillé qui développe ce point]</p>

<p>[Conclusion qui résume les points clés et incite à l'action]</p>

IMPORTANT: Ne garde pas les instructions entre crochets [] dans ton texte final. Remplace-les par du vrai contenu. Ne laisse pas les instructions et placeholders comme [Appel à l'action avec CTA] apparaître dans le texte final.`;

    // URL du modèle
    const apiUrl = `https://api-inference.huggingface.co/models/${model}`;
    
    console.log(`Envoi de requête à Hugging Face avec le modèle ${model}`);
    
    // Configuration de la requête
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        inputs: userContent,
        parameters: {
          max_new_tokens: 2048,
          temperature: 0.7,
          top_p: 0.9,
          return_full_text: false
        }
      })
    });
    
    if (!response.ok) {
      if (response.status === 503) {
        throw new Error("Le modèle est en cours de chargement, veuillez réessayer dans quelques instants");
      }
      const error = await response.json();
      throw new Error(`Erreur Hugging Face API: ${error.error || response.statusText}`);
    }
    
    const data = await response.json();
    let content = Array.isArray(data) ? data[0].generated_text : data.generated_text;
    
    // **AMÉLIORATION**: Nettoyage du contenu pour enlever les instructions visibles
    content = cleanHuggingFaceOutput(content);
    
    // Traitement similaire à celui de la fonction generateBlogContent dans openai.ts
    // Extraction des parties du texte avec des regex améliorées
    const titleMatch = content.match(/TITRE:?\s*([\s\S]*?)(?=META_DESCRIPTION:|$)/i);
    const metaDescMatch = content.match(/META_DESCRIPTION:?\s*([\s\S]*?)(?=EXTRAIT:|$)/i);
    const excerptMatch = content.match(/EXTRAIT:?\s*([\s\S]*?)(?=TAGS:|$)/i);
    const tagsMatch = content.match(/TAGS:?\s*([\s\S]*?)(?=CATEGORIE:|$)/i);
    const categoryMatch = content.match(/CATEGORIE:?\s*([\s\S]*?)(?=IMAGE_SUGGESTIONS:|CONTENU:|$)/i);
    const imagePromptMatch = content.match(/IMAGE_SUGGESTIONS:?\s*([\s\S]*?)(?=CONTENU:|$)/i);
    const contentMatch = content.match(/CONTENU:?\s*([\s\S]*$)/i);
    
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
        content: cleanHuggingFaceOutput(content), // Nettoyage supplémentaire
        imageSuggestions: []
      };
    }
    
    // Extraire les suggestions d'image
    let imageSuggestions: string[] = [];
    if (imagePromptMatch?.[1]) {
      const suggestionLines = imagePromptMatch[1]
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
      
      imageSuggestions = suggestionLines.map((line: string) => {
        return line.replace(/^(Suggestion \d+:|-)?\s*/, '').trim();
      });
    }
    
    // **AMÉLIORATION**: Nettoyage spécifique du contenu extrait
    let extractedContent = contentMatch?.[1]?.trim() || content;
    extractedContent = cleanHuggingFaceOutput(extractedContent);
    
    // Construction de l'objet résultat avec fallbacks
    return {
      title: titleMatch[1]?.trim() || prompt.topic,
      metaTitle: titleMatch[1]?.trim() || prompt.topic,
      metaDescription: metaDescMatch?.[1]?.trim() || `Article sur ${prompt.topic}`,
      excerpt: excerptMatch?.[1]?.trim() || `Article sur ${prompt.topic}`,
      tags: tagsMatch?.[1]?.split(",")?.map((tag: string) => tag.trim())?.filter(Boolean) || prompt.keywords,
      category: categoryMatch?.[1]?.trim() || "Blog",
      content: extractedContent,
      imageSuggestions: imageSuggestions
    };
  } catch (error) {
    console.error("Erreur lors de la génération de texte avec Hugging Face:", error);
    throw error;
  }
};

// **NOUVELLE FONCTION**: Nettoyage du texte généré par Hugging Face
function cleanHuggingFaceOutput(content: string): string {
  if (!content) return '';
  
  // Enlever les sections d'en-tête qui pourraient apparaître dans le contenu
  let cleanedContent = content
    .replace(/^TITRE:.*?(?=\n\n|\n[A-Z]|$)/i, '')
    .replace(/^META_DESCRIPTION:.*?(?=\n\n|\n[A-Z]|$)/i, '')
    .replace(/^EXTRAIT:.*?(?=\n\n|\n[A-Z]|$)/i, '')
    .replace(/^TAGS:.*?(?=\n\n|\n[A-Z]|$)/i, '')
    .replace(/^CATEGORIE:.*?(?=\n\n|\n[A-Z]|$)/i, '')
    .replace(/^IMAGE_SUGGESTIONS:.*?(?=\n\n|\n[A-Z]|$)/i, '')
    .replace(/^CONTENU:?\s*/i, '');
  
  // Enlever les instructions visibles et placeholders inutiles
  cleanedContent = cleanedContent
    .replace(/\[Appel à l'action avec CTA\]/g, '')
    .replace(/\[Texte incitant à cliquer sur le CTA\]/g, '')
    .replace(/\[\s*[A-Za-z0-9\s']+\s*\]\s*$/gm, '') // Enlève tout texte entre crochets à la fin d'une ligne
    .replace(/\n{3,}/g, '\n\n') // Réduire les espaces multiples à deux sauts de ligne max
    .trim();
  
  // Vérifier si le contenu contient des balises HTML
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(cleanedContent);
  
  // Si le contenu n'a pas de balises HTML, ajouter une structure minimale
  if (!hasHtmlTags) {
    const paragraphs = cleanedContent.split(/\n\n+/);
    
    // Transformer le premier paragraphe en h1 s'il est court
    if (paragraphs.length > 0 && paragraphs[0].length < 100) {
      const title = paragraphs.shift() || '';
      cleanedContent = `<h1>${title}</h1>\n\n` + paragraphs.map(p => {
        // Transformer les titres probables en h2
        if (p.length < 80 && !p.includes('.')) {
          return `<h2>${p}</h2>`;
        }
        // Transformer les listes
        else if (p.includes('\n- ')) {
          const listItems = p.split('\n- ');
          const intro = listItems.shift();
          const list = `<ul>\n${listItems.map(item => `<li>${item}</li>`).join('\n')}\n</ul>`;
          return `<p>${intro}</p>\n${list}`;
        }
        // Paragraphes normaux
        else {
          return `<p>${p}</p>`;
        }
      }).join('\n\n');
    }
  }
  
  return cleanedContent;
} 