// Configuration centralisée pour tous les modèles et providers d'IA

/**
 * FOURNISSEURS D'IMAGES
 * Configuration des différents fournisseurs d'images disponibles dans l'application
 */
export const imageProviders = {
  providers: [
    {
      name: "Replicate",
      id: "replicate",
      description: "Génération d'images haute qualité via l'API Replicate.com",
      apiUrl: "https://api.replicate.com/v1/predictions",
      cost: "Payant selon le modèle ($0.002 à $0.05 par image)",
      pros: "Modèles de pointe, haute qualité, personnalisable",
      cons: "Nécessite une clé API payante",
      setup: "Nécessite un compte Replicate et une clé API",
      requiresApiKey: true
    },
    {
      name: "Pexels",
      id: "pexels",
      description: "Banque d'images haute résolution avec API gratuite",
      apiUrl: "https://api.pexels.com/v1",
      cost: "Gratuit avec limites d'utilisation",
      pros: "Haute qualité, gratuit, images professionnelles",
      cons: "Limites d'API pour la version gratuite",
      setup: "Nécessite un compte Pexels et une clé API",
      requiresApiKey: true
    },
    {
      name: "Lorem Picsum",
      id: "picsum",
      description: "Service gratuit d'images aléatoires sans authentification",
      apiUrl: "https://picsum.photos",
      cost: "Gratuit et illimité",
      pros: "Aucune clé API requise, simple à utiliser",
      cons: "Images aléatoires non liées au contenu",
      setup: "Aucune configuration requise",
      requiresApiKey: false
    },
    {
      name: "Hugging Face (Stable Diffusion)",
      id: "huggingface",
      description: "Génération d'images par IA via l'API Hugging Face",
      apiUrl: "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      cost: "Gratuit avec compte",
      pros: "Génération par IA, haute qualité, open source",
      cons: "Quota limité pour comptes gratuits",
      setup: "Nécessite un compte Hugging Face et une clé API",
      requiresApiKey: true
    },
    {
      name: "Stable Diffusion API",
      id: "sdapi",
      description: "API commerciale de Stable Diffusion avec haute disponibilité",
      apiUrl: "https://stablediffusionapi.com/api/v3/text2img",
      cost: "$0.009 par image (plan à $27/mois pour 13000 images)",
      pros: "Fiable, haute disponibilité, SLA commercial",
      cons: "Payant, nécessite carte de crédit",
      setup: "Nécessite un compte et une clé API",
      requiresApiKey: true
    }
  ],
  defaultProvider: "picsum"
};

/**
 * MODÈLES REPLICATE
 * Liste des modèles disponibles sur Replicate avec leurs prix et caractéristiques
 */
export const replicateModels = [
  {
    id: "black-forest-labs/flux-1.1-pro",
    name: "FLUX 1.1 Pro",
    description: "Le meilleur modèle de FLUX, qualité exceptionnelle et rendu photoréaliste",
    cost: "$0.055 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "black-forest-labs/flux-dev",
    name: "FLUX Dev",
    description: "Version développeur de FLUX, excellent rapport qualité/prix",
    cost: "$0.030 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "black-forest-labs/flux-dev-lora",
    name: "FLUX Dev LoRA (2025)",
    description: "Modèle ultra-performant avec qualité exceptionnelle et rendu photoréaliste",
    cost: "$0.025 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "black-forest-labs/flux-schnell",
    name: "FLUX Schnell",
    description: "Version ultra-rapide de FLUX, génération en 1 seconde",
    cost: "$0.003 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "ideogram-ai/ideogram-v2a",
    name: "Ideogram v2a",
    description: "Modèle idéal pour des créations artistiques, rapide et abordable",
    cost: "$0.004 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "ideogram-ai/ideogram-v2a-turbo",
    name: "Ideogram v2a Turbo",
    description: "Version accélérée d'Ideogram v2a, plus rapide et moins cher",
    cost: "$0.002 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "recraft-ai/recraft-v3-svg",
    name: "Recraft v3 SVG",
    description: "Génération de SVG vectoriels de haute qualité pour logos et icônes",
    cost: "$0.005 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "ideogram-ai/ideogram-v2-turbo",
    name: "Ideogram v2 Turbo",
    description: "Modèle rapide pour l'idéation avec excellent rendu de texte",
    cost: "$0.005 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "datacte/proteus-v0.3",
    name: "Proteus v0.3 Anime",
    description: "Modèle spécialisé pour anime avec effets de lumière améliorés",
    cost: "$0.022 par image",
    width: 1024,
    height: 1024,
    recommended: true
  },
  {
    id: "fofr/sdxl-emoji",
    name: "SDXL Emoji",
    description: "Spécialisé dans la génération d'émojis style Apple",
    cost: "$0.008 par image",
    width: 1024,
    height: 1024,
    recommended: true
  }
];

/**
 * CONFIGURATIONS REPLICATE
 * Configuration spécifique pour chaque modèle Replicate
 */
export const replicateModelConfigs: { [key: string]: any } = {
  "black-forest-labs/flux-1.1-pro": {
    num_inference_steps: 30,
    guidance_scale: 7.5
  },
  "black-forest-labs/flux-dev": {
    num_inference_steps: 30,
    guidance_scale: 7.5
  },
  "black-forest-labs/flux-dev-lora": {
    num_inference_steps: 30,
    guidance_scale: 7.5
  },
  "black-forest-labs/flux-schnell": {
    num_inference_steps: 4,
    guidance_scale: 7.5
  },
  "ideogram-ai/ideogram-v2a": {
    num_inference_steps: 30,
    guidance_scale: 7.5
  },
  "ideogram-ai/ideogram-v2a-turbo": {
    num_inference_steps: 1,
    guidance_scale: 7.5
  },
  "recraft-ai/recraft-v3-svg": {
    num_inference_steps: 30,
    guidance_scale: 7.5
  },
  "ideogram-ai/ideogram-v2-turbo": {
    num_inference_steps: 1,
    guidance_scale: 7.5
  },
  "datacte/proteus-v0.3": {
    num_inference_steps: 20,
    guidance_scale: 7.5
  },
  "fofr/sdxl-emoji": {
    num_inference_steps: 25,
    guidance_scale: 7.5
  },
  "stability-ai/sdxl": {
    num_inference_steps: 30,
    guidance_scale: 7.5
  },
  "stability-ai/stable-diffusion": {
    num_inference_steps: 30,
    guidance_scale: 7.5
  }
};

/**
 * MODÈLES HUGGING FACE IMAGES
 * Liste des modèles Hugging Face disponibles pour la génération d'images
 */
export const huggingFaceImageModels = [
  {
    id: "ByteDance/InfiniteYou",
    name: "ByteDance/InfiniteYou (2025)",
    description: "Modèle ultramoderne de génération d'images avec qualité exceptionnelle",
    recommended: true,
    config: {
      width: 1024,
      height: 1024,
      inference_steps: 35,
      guidance: 8.0,
      negative_prompt: "low quality, blurry, distorted, deformed, disfigured, bad anatomy, unrealistic, artificial, fake looking, pixelated",
      use_standard_params: true,
      timeout: 300000
    }
  },
  {
    id: "black-forest-labs/FLUX.1-dev",
    name: "black-forest-labs/FLUX.1-dev (2025)",
    description: "Modèle haute qualité avec plus de 2,81M téléchargements, excellent pour le photorealisme",
    recommended: true,
    config: {
      width: 1024,
      height: 1024,
      inference_steps: 32,
      guidance: 7.5,
      negative_prompt: "ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, blurry, bad art, bad anatomy",
      use_standard_params: true,
      timeout: 300000
    }
  },
  {
    id: "stabilityai/stable-diffusion-3.5-large",
    name: "stabilityai/stable-diffusion-3.5-large (2025)",
    description: "Version avancée de Stable Diffusion avec qualité supérieure, mise à jour récente",
    recommended: true,
    config: {
      width: 1024,
      height: 1024,
      inference_steps: 28,
      guidance: 3.5,
      negative_prompt: "low quality, blurry, distorted, deformed, disfigured, bad anatomy, unrealistic",
      use_standard_params: true,
      timeout: 300000
    }
  },
  {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "black-forest-labs/FLUX.1-schnell (2025)",
    description: "Version optimisée pour la vitesse du modèle FLUX.1, haute qualité avec génération rapide",
    recommended: true,
    config: {
      width: 1024,
      height: 1024,
      inference_steps: 16,
      guidance: 7.0,
      negative_prompt: "ugly, poorly drawn hands, poorly drawn face, disfigured, deformed, blurry, bad art, bad anatomy",
      use_standard_params: true,
      timeout: 240000
    }
  },
  {
    id: "stabilityai/stable-diffusion-xl-base-1.0",
    name: "stabilityai/stable-diffusion-xl-base-1.0",
    description: "Version XL de Stable Diffusion, bonne qualité et stabilité",
    recommended: true,
    config: {
      width: 768,
      height: 768,
      inference_steps: 30,
      guidance: 7.5,
      negative_prompt: "low quality, blurry, distorted, deformed, disfigured, bad anatomy"
    }
  },
  {
    id: "runwayml/stable-diffusion-v1-5",
    name: "runwayml/stable-diffusion-v1-5",
    description: "Version stable et éprouvée, compatible avec la plupart des systèmes",
    recommended: false,
    config: {
      width: 512,
      height: 512,
      inference_steps: 30,
      guidance: 7.5,
      negative_prompt: "low quality, blurry, distorted, text"
    }
  },
  {
    id: "CompVis/stable-diffusion-v1-4",
    name: "CompVis/stable-diffusion-v1-4",
    description: "Version plus ancienne, bonne pour systèmes avec ressources limitées",
    recommended: false,
    config: {
      width: 512,
      height: 512,
      inference_steps: 25,
      guidance: 7.0,
      negative_prompt: "low quality, blurry"
    }
  },
  {
    id: "dreamlike-art/dreamlike-photoreal-2.0",
    name: "dreamlike-art/dreamlike-photoreal-2.0",
    description: "Spécialisé dans les images photoréalistes",
    recommended: false,
    config: {
      width: 768,
      height: 768,
      inference_steps: 30,
      guidance: 8.0,
      negative_prompt: "ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, mutation, mutated, extra limbs, extra legs, extra arms, disfigured, deformed, cross-eye, body out of frame, blurry, bad art, bad anatomy, blurred, grainy"
    }
  },
  {
    id: "prompthero/openjourney-v4",
    name: "prompthero/openjourney-v4",
    description: "Style artistique de type Midjourney",
    recommended: false,
    config: {
      width: 512,
      height: 512,
      inference_steps: 25,
      guidance: 7.0,
      negative_prompt: "badly drawn"
    }
  },
  {
    id: "stabilityai/sdxl-turbo",
    name: "stabilityai/sdxl-turbo",
    description: "Génération ultra-rapide, qualité légèrement réduite",
    recommended: false,
    config: {
      width: 512,
      height: 512,
      inference_steps: 1,
      guidance: 0.0
    }
  },
  {
    id: "cagliostrolab/animagine-xl-3.0",
    name: "cagliostrolab/animagine-xl-3.0",
    description: "Spécialisé dans le style anime/manga",
    recommended: false,
    config: {
      width: 768,
      height: 768,
      inference_steps: 28,
      guidance: 7.0,
      negative_prompt: "bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, worst quality, low quality, normal quality, jpeg artifacts, watermark, signature, username, blurry"
    }
  }
];

/**
 * MODÈLES TEXTE HUGGING FACE
 * Liste des modèles de texte disponibles sur Hugging Face
 */
export const huggingFaceTextModels = [
  {
    id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    name: "Mixtral 8x7B",
    description: "Alternative gratuite à GPT-4, excellente pour le français",
    recommended: true
  },
  {
    id: "mistralai/Mistral-7B-Instruct-v0.2",
    name: "Mistral 7B",
    description: "Modèle compact avec d'excellentes performances",
    recommended: true
  },
  {
    id: "meta-llama/Meta-Llama-3-8B-Instruct",
    name: "Llama 3 8B",
    description: "Version compacte de Llama 3 avec d'excellentes performances",
    recommended: true
  },
  {
    id: "meta-llama/Meta-Llama-3-70B-Instruct",
    name: "Llama 3 70B",
    description: "Modèle premium de Meta comparable à GPT-4",
    recommended: true
  },
  {
    id: "tiiuae/falcon-40b-instruct",
    name: "Falcon 40B",
    description: "Grand modèle avec d'excellentes capacités de raisonnement",
    recommended: false
  },
  {
    id: "google/gemma-7b-it",
    name: "Gemma 7B",
    description: "Modèle de Google conçu pour être léger et efficace",
    recommended: false
  }
];

/**
 * MODÈLES OPENAI
 * Liste des modèles OpenAI disponibles pour la génération de texte
 */
export const openAIModels = [
  {
    id: "GPT35",
    name: "GPT-3.5 Turbo",
    description: "Modèle rapide et économique avec de bonnes performances",
    model: "gpt-3.5-turbo",
    cost: "$0.0015 par 1K tokens (entrée) / $0.002 par 1K tokens (sortie)",
    recommended: true
  },
  {
    id: "GPT4",
    name: "GPT-4 Turbo",
    description: "Le modèle le plus puissant d'OpenAI avec d'excellentes capacités de raisonnement",
    model: "gpt-4-turbo",
    cost: "$0.01 par 1K tokens (entrée) / $0.03 par 1K tokens (sortie)",
    recommended: true
  },
  {
    id: "GPT4Vision",
    name: "GPT-4 Vision",
    description: "Modèle capable d'analyser des images et du texte",
    model: "gpt-4-vision-preview",
    cost: "$0.01 par 1K tokens (entrée) / $0.03 par 1K tokens (sortie)",
    recommended: false
  },
  {
    id: "GPT432K",
    name: "GPT-4 32K",
    description: "Version étendue de GPT-4 avec contexte de 32K tokens",
    model: "gpt-4-32k",
    cost: "$0.06 par 1K tokens (entrée) / $0.12 par 1K tokens (sortie)",
    recommended: false
  },
  {
    id: "GPT35_16K",
    name: "GPT-3.5 Turbo 16K",
    description: "Version étendue de GPT-3.5 avec contexte de 16K tokens",
    model: "gpt-3.5-turbo-16k",
    cost: "$0.003 par 1K tokens (entrée) / $0.004 par 1K tokens (sortie)",
    recommended: false
  },
  {
    id: "DALLE3",
    name: "DALL-E 3",
    description: "Modèle de génération d'images haute qualité",
    model: "dall-e-3",
    cost: "$0.02 par image (1024x1024), $0.04 (HD)",
    recommended: false,
    type: "image"
  },
  {
    id: "DALLE2",
    name: "DALL-E 2",
    description: "Version antérieure du modèle de génération d'images",
    model: "dall-e-2",
    cost: "$0.016 par image (1024x1024)",
    recommended: false,
    type: "image"
  },
  {
    id: "Whisper",
    name: "Whisper",
    description: "Modèle de transcription et traduction audio",
    model: "whisper-1",
    cost: "$0.006 par minute",
    recommended: false,
    type: "audio"
  }
];

/**
 * PROVIDERS DE TEXTE
 * Liste des providers disponibles pour la génération de texte
 */
export const textProviders = [
  {
    id: "openai",
    name: "OpenAI",
    description: "API OpenAI pour la génération de texte avec GPT",
    requiresApiKey: true,
    cost: "Payant ($0.002 à $0.03 par 1000 tokens)",
    pros: "Haute qualité, excellent raisonnement, puissant",
    cons: "Nécessite une clé API payante"
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "Modèles open source via l'API Hugging Face",
    requiresApiKey: true,
    cost: "Gratuit avec compte (quota limité)",
    pros: "Open source, gratuit, grande variété de modèles",
    cons: "Quota limité, qualité variable selon les modèles"
  }
]; 