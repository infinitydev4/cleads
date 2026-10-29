// Utilitaires pour l'utilisation des modèles IA
import { 
  openAIModels, 
  huggingFaceImageModels,
  huggingFaceTextModels,
  replicateModels
} from '@/config/ai-models';

/**
 * Trouve un modèle OpenAI par son ID
 * @param id - L'identifiant du modèle (ex: "GPT35")
 * @returns Le modèle complet ou undefined si non trouvé
 */
export const getOpenAIModelById = (id: string) => {
  return openAIModels.find(model => model.id === id);
};

/**
 * Trouve un modèle OpenAI par son nom de modèle API
 * @param modelName - Le nom du modèle (ex: "gpt-3.5-turbo")
 * @returns Le modèle complet ou undefined si non trouvé
 */
export const getOpenAIModelByName = (modelName: string) => {
  return openAIModels.find(model => model.model === modelName);
};

/**
 * Renvoie les modèles OpenAI filtrés par type
 * @param type - Le type de modèle à récupérer (text, image, audio) ou undefined pour tous
 * @returns Liste des modèles correspondant au type
 */
export const getOpenAIModelsByType = (type?: string) => {
  if (!type) return openAIModels;
  return openAIModels.filter(model => 
    !model.type || model.type === type
  );
};

/**
 * Trouve un modèle Hugging Face Image par son ID
 * @param id - L'identifiant du modèle (ex: "stabilityai/stable-diffusion-xl-base-1.0")
 * @returns Le modèle complet ou undefined si non trouvé
 */
export const getHuggingFaceImageModel = (id: string) => {
  return huggingFaceImageModels.find(model => model.id === id);
};

/**
 * Trouve un modèle Hugging Face Texte par son ID
 * @param id - L'identifiant du modèle (ex: "mistralai/Mixtral-8x7B-Instruct-v0.1")
 * @returns Le modèle complet ou undefined si non trouvé
 */
export const getHuggingFaceTextModel = (id: string) => {
  return huggingFaceTextModels.find(model => model.id === id);
};

/**
 * Trouve un modèle Replicate par son ID
 * @param id - L'identifiant du modèle (ex: "black-forest-labs/flux-dev-lora")
 * @returns Le modèle complet ou undefined si non trouvé
 */
export const getReplicateModel = (id: string) => {
  return replicateModels.find(model => model.id === id);
};

/**
 * Renvoie tous les modèles textuels, tous fournisseurs confondus
 * @param onlyRecommended - Si true, renvoie uniquement les modèles recommandés
 * @returns Liste des modèles textuels
 */
export const getAllTextModels = (onlyRecommended = false) => {
  const openaiTextModels = openAIModels.filter(model => !model.type || model.type === 'text');
  const hfTextModels = huggingFaceTextModels;
  
  const allModels = [
    ...openaiTextModels.map(model => ({
      ...model,
      provider: 'openai'
    })),
    ...hfTextModels.map(model => ({
      ...model,
      provider: 'huggingface'
    }))
  ];
  
  return onlyRecommended ? allModels.filter(model => model.recommended) : allModels;
};

/**
 * Renvoie tous les modèles de génération d'images, tous fournisseurs confondus
 * @param onlyRecommended - Si true, renvoie uniquement les modèles recommandés
 * @returns Liste des modèles d'images
 */
export const getAllImageModels = (onlyRecommended = false) => {
  const openaiImageModels = openAIModels.filter(model => model.type === 'image');
  const hfImageModels = huggingFaceImageModels;
  const replicateImageModels = replicateModels;
  
  const allModels = [
    ...openaiImageModels.map(model => ({
      ...model,
      provider: 'openai'
    })),
    ...hfImageModels.map(model => ({
      ...model,
      provider: 'huggingface'
    })),
    ...replicateImageModels.map(model => ({
      ...model,
      provider: 'replicate'
    }))
  ];
  
  return onlyRecommended ? allModels.filter(model => model.recommended) : allModels;
}; 