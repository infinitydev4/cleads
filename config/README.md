# Configuration des modèles et providers IA

Ce dossier contient les fichiers de configuration centralisés pour tous les modèles et providers d'IA utilisés dans l'application.

## Structure des fichiers

- `ai-models.ts` : Configuration pour tous les modèles et providers d'IA (texte et image)

## Utilisation

### Importer les configurations

```typescript
import { 
  imageProviders,
  replicateModels,
  replicateModelConfigs,
  huggingFaceImageModels,
  huggingFaceTextModels,
  openAIModels,
  textProviders
} from '@/config/ai-models';

// Ou utiliser les utilitaires pour un accès simplifié
import { 
  getOpenAIModelById, 
  getAllTextModels, 
  getAllImageModels 
} from '@/lib/modelUtils';
```

### Accéder aux infos sur les providers d'images

```typescript
// Accéder aux providers d'images
const providers = imageProviders.providers;
const defaultProvider = imageProviders.defaultProvider;

// Trouver un provider spécifique
const pexelsProvider = providers.find(p => p.id === 'pexels');
```

### Accéder aux modèles OpenAI

```typescript
// Liste de tous les modèles OpenAI
const allOpenAIModels = openAIModels;

// Obtenir un modèle spécifique par ID
const gpt4Model = getOpenAIModelById('GPT4');

// Obtenir tous les modèles de texte
const textOpenAIModels = getOpenAIModelsByType('text');
```

### Accéder aux modèles Replicate

```typescript
// Liste des modèles Replicate
const models = replicateModels;

// Filtrer les modèles par caractéristique
const premiumModels = models.filter(m => !m.id.includes('recraft') && !m.id.includes('proteus'));
const specializedModels = models.filter(m => m.id.includes('recraft') || m.id.includes('proteus'));

// Obtenir la configuration pour un modèle spécifique
const fluxConfig = replicateModelConfigs['black-forest-labs/flux-dev-lora'];

// Utiliser l'utilitaire
const fluxModel = getReplicateModel('black-forest-labs/flux-dev-lora');
```

### Accéder aux modèles Hugging Face

```typescript
// Obtenir tous les modèles Hugging Face pour la génération d'images
const imageModels = huggingFaceImageModels;

// Filtrer par modèles recommandés
const recommendedModels = imageModels.filter(m => m.recommended);

// Obtenir les modèles de texte
const textModels = huggingFaceTextModels;

// Utiliser les utilitaires
const sdxlModel = getHuggingFaceImageModel('stabilityai/stable-diffusion-xl-base-1.0');
const mixtralModel = getHuggingFaceTextModel('mistralai/Mixtral-8x7B-Instruct-v0.1');
```

### Utilitaires avancés

```typescript
// Obtenir tous les modèles de texte, tous fournisseurs confondus
const allTextModels = getAllTextModels();
const recommendedTextModels = getAllTextModels(true); // Uniquement les recommandés

// Obtenir tous les modèles d'images, tous fournisseurs confondus
const allImageModels = getAllImageModels();
const recommendedImageModels = getAllImageModels(true); // Uniquement les recommandés
```

## Maintenance

### Ajouter un nouveau modèle OpenAI

Pour ajouter un nouveau modèle OpenAI, ajoutez-le au tableau `openAIModels` dans `ai-models.ts` :

```typescript
{
  id: "GPT5", // ID interne unique 
  name: "GPT-5", // Nom convivial
  description: "Description du modèle",
  model: "gpt-5", // Nom du modèle dans l'API OpenAI
  cost: "$X.XX par 1K tokens",
  recommended: true,
  type: "text" // "text", "image" ou "audio"
}
```

### Ajouter un nouveau modèle Replicate

Pour ajouter un nouveau modèle Replicate, ajoutez-le aux tableaux suivants dans `ai-models.ts` :

1. Ajouter au tableau `replicateModels` :
```typescript
{
  id: "owner/model-name",        // Identifiant du modèle (obligatoire)
  name: "Nom Convivial",         // Nom user-friendly
  description: "Description...",  // Description courte
  cost: "$0.XXX par image",      // Coût estimé
  width: 1024,                   // Largeur par défaut
  height: 1024,                  // Hauteur par défaut
  recommended: true              // Si c'est un modèle recommandé
}
```

2. Ajouter au tableau `replicateModelConfigs` :
```typescript
"owner/model-name": {
  num_inference_steps: 30,       // Nombre d'étapes d'inférence
  guidance_scale: 7.5            // Échelle de guidance
}
```

### Ajouter un nouveau modèle Hugging Face

Pour ajouter un nouveau modèle Hugging Face pour la génération d'images, ajoutez-le au tableau `huggingFaceImageModels` :

```typescript
{
  id: "owner/model-name",
  name: "Nom Convivial",
  description: "Description...",
  recommended: true,             // Si c'est un modèle recommandé
  config: {
    width: 768,
    height: 768,
    inference_steps: 30,
    guidance: 7.5,
    negative_prompt: "low quality, blurry...",
    use_standard_params: false,
    timeout: 120000              // Timeout en ms
  }
}
```

Pour ajouter un nouveau modèle de texte Hugging Face, ajoutez-le au tableau `huggingFaceTextModels` :

```typescript
{
  id: "owner/model-name",
  name: "Nom Convivial",
  description: "Description...",
  recommended: true              // Si c'est un modèle recommandé
}
``` 