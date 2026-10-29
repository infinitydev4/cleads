"use client"

import { useState, useCallback, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { ImageIcon, X, Upload, Sparkle, Wand2, PlusCircle, Loader2 } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { 
  huggingFaceImageModels, 
  replicateModels 
} from "@/config/ai-models"

interface ImageUploadProps {
  value: string | null
  onChange: (url: string) => void
  onRemove: () => void
  imageSuggestions?: string[] // Nouvelles suggestions d'images
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  imageSuggestions = []
}: ImageUploadProps) {
  const [loading, setLoading] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [promptLoading, setPromptLoading] = useState(false)
  const [imageProviders, setImageProviders] = useState<{
    provider: string;
    pexelsApiKey?: string;
    huggingFaceApiKey?: string;
    stableDiffusionApiKey?: string;
    replicateApiKey?: string;
    replicateModel?: string;
  } | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string>("") 
  const [aiModel, setAiModel] = useState("stabilityai/stable-diffusion-xl-base-1.0")
  const [imageMetadata, setImageMetadata] = useState<{
    source: string | null;
    modelName?: string | null;
    lastPrompt?: string;
  } | null>(null)

  // Chargement des fournisseurs d'images configurés
  useEffect(() => {
    async function loadImageProviders() {
      try {
        const response = await fetch("/api/settings/image")
        if (!response.ok) {
          throw new Error("Erreur lors du chargement des paramètres d'image")
        }
        const data = await response.json()
        setImageProviders(data)
        setSelectedProvider(data.provider || "picsum")
      } catch (error) {
        console.error("Erreur lors du chargement des fournisseurs d'images:", error)
        // Fallback vers Picsum
        setSelectedProvider("picsum")
      }
    }
    
    loadImageProviders()
  }, [])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.type.includes("image")) {
      toast.error("Le fichier doit être une image")
      return
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error("L'image ne doit pas dépasser 5MB")
      return
    }

    try {
      setLoading(true)
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", "article")

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Erreur lors de l'upload")
      }

      const data = await response.json()
      onChange(data.url)
      toast.success("Image uploadée avec succès")
    } catch (error) {
      toast.error("Erreur lors de l'upload de l'image")
    } finally {
      setLoading(false)
    }
  }, [onChange])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false
  })

  // Bouton régénérer
  const regenerateImage = async () => {
    if (!imageMetadata?.lastPrompt) {
      toast.error("Impossible de régénérer l'image, prompt précédent non disponible");
      return;
    }
    
    try {
      setLoading(true);
      toast.info(`Régénération avec ${getProviderName(imageMetadata.source || "huggingface")}...`);
      
      // Ajout d'un timestamp pour forcer une nouvelle génération
      const now = Date.now();
      const modifiedPrompt = `${imageMetadata.lastPrompt} [${now}]`;
      
      const response = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: modifiedPrompt,
          provider: imageMetadata.source || "huggingface",
          model: imageMetadata.modelName ? 
                 (imageMetadata.source === "huggingface" ? 
                  imageMetadata.source + "/" + imageMetadata.modelName : 
                  imageMetadata.modelName) : 
                 "stabilityai/stable-diffusion-xl-base-1.0"
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de la régénération de l'image");
      }

      const data = await response.json();
      
      if (data.url) {
        onChange(data.url);
        
        // Mettre à jour les métadonnées en conservant le prompt d'origine
        setImageMetadata({
          ...imageMetadata,
          source: data.provider,
          modelName: data.provider === 'huggingface' && data.model ? data.model.split('/').pop() : null
        });
        
        toast.success("Image régénérée avec succès");
      } else {
        throw new Error("Aucune URL d'image dans la réponse");
      }
    } catch (error: any) {
      console.error("Erreur de régénération d'image:", error);
      toast.error(error.message || "Erreur lors de la régénération de l'image");
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour générer une image avec l'IA
  const generateAiImage = async (prompt: string) => {
    if (!prompt) {
      toast.error("Veuillez entrer un texte pour générer une image")
      return
    }

    try {
      setAiLoading(true)
      setAiError(null)
      toast.info(`Génération de l'image avec ${getProviderName(selectedProvider)}... Cela peut prendre quelques instants`)

      // Appel à l'API pour générer l'image
      const response = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt,
          provider: selectedProvider,
          model: aiModel
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Erreur lors de la génération de l'image")
      }

      const data = await response.json()
      
      if (data.url) {
        onChange(data.url)
        setImageMetadata({
          source: data.provider,
          modelName: data.provider === 'huggingface' && data.model ? data.model.split('/').pop() : null,
          lastPrompt: prompt // Stocker le prompt pour la régénération
        })
        
        const providerName = getProviderName(data.provider)
        if (data.provider === 'huggingface' && data.model) {
          const modelShortName = data.model.split('/').pop() || data.model
          toast.success(`Image générée avec ${providerName} (${modelShortName})`)
        } else {
          toast.success(`Image générée avec ${providerName}`)
        }
        
        if (data.fallback) {
          toast.info("Le fournisseur d'images principal n'était pas disponible, nous avons utilisé une alternative")
        }
        
        setIsDialogOpen(false)
      } else {
        throw new Error("Aucune URL d'image dans la réponse")
      }
    } catch (error: any) {
      console.error("Erreur de génération d'image:", error)
      setAiError(error.message || "Erreur lors de la génération de l'image")
      toast.error(error.message || "Erreur lors de la génération de l'image")
    } finally {
      setAiLoading(false)
    }
  }

  // Fonction pour obtenir le nom convivial du fournisseur
  const getProviderName = (providerId: string): string => {
    switch (providerId) {
      case "picsum":
        return "Lorem Picsum";
      case "pexels":
        return "Pexels";
      case "huggingface":
        return "Hugging Face IA";
      case "sdapi":
        return "Stable Diffusion";
      case "replicate":
        return "Replicate (IA Ultra HD)";
      default:
        return providerId;
    }
  }

  // Fonction pour sélectionner une suggestion d'image
  const selectImageSuggestion = (suggestion: string) => {
    // Nettoyer la suggestion en enlevant les tirets en début de ligne et les numéros
    let cleanedSuggestion = suggestion
      .replace(/^[-\s]*/, '')       // Enlever les tirets et espaces au début
      .replace(/^\d+\.\s*/, '')     // Enlever les numéros au début s'il y en a
      .trim();
    
    // Enlever le préfixe "Prompt:" s'il existe
    if (cleanedSuggestion.startsWith("Prompt:")) {
      cleanedSuggestion = cleanedSuggestion.substring("Prompt:".length).trim();
    }
    
    setAiPrompt(cleanedSuggestion);
  }

  // Ajouter cette fonction pour obtenir les détails d'un modèle Replicate par son ID
  const getReplicateModelDetails = (modelId: string) => {
    return replicateModels.find(model => model.id === modelId);
  };

  // Ajouter cette fonction pour obtenir les détails d'un modèle Hugging Face par son ID
  const getHuggingFaceModelDetails = (modelId: string) => {
    return huggingFaceImageModels.find(model => model.id === modelId);
  };

  return (
    <div className="space-y-4 w-full">
      <Label htmlFor="image" className="mb-2 block text-gray-400">
        Image de couverture
      </Label>
      {!value ? (
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-xl p-8
              flex flex-col items-center justify-center gap-4
              cursor-pointer transition-colors
              ${isDragActive 
                ? 'border-[#BFFF00] bg-[#BFFF00]/5' 
                : 'border-gray-800 hover:border-[#BFFF00]/50'
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="p-4 rounded-full bg-gray-900">
              <ImageIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-white">
                {isDragActive 
                  ? "Déposez l'image ici" 
                  : "Glissez-déposez une image ici"
                }
              </p>
              <p className="text-sm text-gray-400 mt-1">
                ou cliquez pour sélectionner
              </p>
            </div>
            <p className="text-xs text-gray-500">
              PNG, JPG, GIF jusqu'à 5MB
            </p>
          </div>

          <div className="flex justify-center">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="mt-2 gap-2 bg-[#BFFF00] text-black"
                >
                  <Wand2 className="w-4 h-4 text-black" />
                  Générer avec IA
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Générer une image avec l'IA</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Sélecteur de fournisseur d'images */}
                  <div className="space-y-2">
                    <Label htmlFor="imageProvider">Fournisseur d'images</Label>
                    <Select 
                      value={selectedProvider} 
                      onValueChange={setSelectedProvider}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sélectionner un fournisseur" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="picsum">Lorem Picsum (Gratuit)</SelectItem>
                        {imageProviders?.pexelsApiKey && (
                          <SelectItem value="pexels">Pexels (Photos haute qualité)</SelectItem>
                        )}
                        {imageProviders?.huggingFaceApiKey && (
                          <SelectItem value="huggingface">Hugging Face (IA Génération)</SelectItem>
                        )}
                        {imageProviders?.stableDiffusionApiKey && (
                          <SelectItem value="sdapi">Stable Diffusion (IA Premium)</SelectItem>
                        )}
                        {imageProviders?.replicateApiKey && (
                          <SelectItem value="replicate">Replicate (IA Ultra HD)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400">
                      {selectedProvider === "huggingface" && "Hugging Face IA génère des images uniques et personnalisées"}
                      {selectedProvider === "pexels" && "Pexels fournit des photos professionnelles"}
                      {selectedProvider === "sdapi" && "Stable Diffusion offre une génération d'images haute qualité"}
                      {selectedProvider === "picsum" && "Lorem Picsum fournit des images aléatoires gratuites"}
                      {selectedProvider === "replicate" && "Replicate fournit des images Ultra HD"}
                    </p>
                  </div>

                  {/* Sélecteur de modèle pour Replicate */}
                  {selectedProvider === "replicate" && (
                    <div className="space-y-2">
                      <Label htmlFor="aiModel">Modèle</Label>
                      <Select
                        value={aiModel}
                        onValueChange={setAiModel}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un modèle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Modèles Premium (Haute Qualité)</SelectLabel>
                            {replicateModels
                              .filter(model => !model.id.includes('recraft') && !model.id.includes('proteus') && !model.id.includes('emoji'))
                              .map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{model.name}</span>
                                    <Badge variant="outline" className="ml-2 bg-[#BFFF00] text-black">{model.cost}</Badge>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Modèles Spécialisés</SelectLabel>
                            {replicateModels
                              .filter(model => model.id.includes('recraft') || model.id.includes('proteus') || model.id.includes('emoji'))
                              .map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{model.name}</span>
                                    <Badge variant="outline" className="ml-2 bg-[#BFFF00] text-black">{model.cost}</Badge>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400">
                        {aiModel && getReplicateModelDetails(aiModel)?.description}
                      </p>
                    </div>
                  )}

                  {/* Sélecteur de modèle pour Hugging Face */}
                  {selectedProvider === "huggingface" && (
                    <div className="space-y-2">
                      <Label htmlFor="aiModel">Modèle</Label>
                      <Select
                        value={aiModel}
                        onValueChange={setAiModel}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un modèle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Modèles Recommandés</SelectLabel>
                            {huggingFaceImageModels
                              .filter(model => model.recommended)
                              .map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{model.name}</span>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Autres Modèles</SelectLabel>
                            {huggingFaceImageModels
                              .filter(model => !model.recommended)
                              .map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{model.name}</span>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400">
                        {aiModel && getHuggingFaceModelDetails(aiModel)?.description}
                      </p>
                    </div>
                  )}

                  {imageSuggestions.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="suggestions">Suggestions pour cet article:</Label>
                      <div className="flex flex-col gap-2">
                        {imageSuggestions.map((suggestion, index) => (
                          <Button 
                            key={index} 
                            variant="outline" 
                            className="justify-start text-left overflow-hidden text-ellipsis whitespace-nowrap text-black"
                            onClick={() => selectImageSuggestion(suggestion)}
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="aiPrompt">Description de l'image</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs flex items-center gap-1 text-[#BFFF00]/80 hover:text-[#BFFF00] hover:bg-[#BFFF00]/10 rounded-full px-3 border border-[#BFFF00]/30"
                        onClick={async () => {
                          try {
                            setPromptLoading(true);
                            // Obtenir le titre depuis l'élément du DOM
                            const titleInput = document.querySelector('input.text-2xl.font-bold') as HTMLInputElement;
                            if (!titleInput || !titleInput.value.trim()) {
                              toast.error("Veuillez d'abord saisir un titre d'article");
                              setPromptLoading(false);
                              return;
                            }
                            
                            const title = titleInput.value.trim();
                            toast.info("Génération du prompt optimisé...");
                            
                            // Appel à l'API pour générer un prompt optimisé
                            const response = await fetch("/api/blog/generate-prompt", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ title })
                            });
                            
                            const data = await response.json();
                            
                            if (data.prompt) {
                              // Enlever le préfixe "Prompt: " s'il existe
                              let cleanedPrompt = data.prompt;
                              if (cleanedPrompt.startsWith("Prompt:")) {
                                cleanedPrompt = cleanedPrompt.substring("Prompt:".length).trim();
                              }
                              
                              setAiPrompt(cleanedPrompt);
                              
                              if (data.note) {
                                // Si c'est un prompt de secours, informer l'utilisateur
                                toast.warning("Prompt de secours utilisé. Vous pouvez le modifier si nécessaire.");
                              } else {
                                toast.success("Prompt optimisé généré");
                              }
                            } else if (data.error) {
                              throw new Error(data.error);
                            } else {
                              throw new Error("Réponse invalide du serveur");
                            }
                          } catch (error: any) {
                            console.error("Erreur lors de la génération du prompt:", error);
                            toast.error(error.message || "Erreur lors de la génération du prompt");
                            
                            // Génération d'un prompt simple en cas d'échec complet
                            const titleInput = document.querySelector('input.text-2xl.font-bold') as HTMLInputElement;
                            if (titleInput && titleInput.value.trim()) {
                              const simplePrompt = `Professional photo of ${titleInput.value.trim()}, high quality, detailed, 8k`;
                              setAiPrompt(simplePrompt);
                              toast.info("Un prompt simple a été généré. Vous pouvez le modifier.");
                            }
                          } finally {
                            setPromptLoading(false);
                          }
                        }}
                        disabled={promptLoading}
                      >
                        {promptLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkle className="h-3 w-3" />
                        )}
                        Générer à partir du titre
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input 
                        id="aiPrompt"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Décrivez l'image que vous souhaitez générer"
                        className="flex-1"
                      />
                      <Button 
                        onClick={() => generateAiImage(aiPrompt)}
                        disabled={aiLoading || !aiPrompt}
                      >
                        {aiLoading ? "Génération..." : "Générer"}
                      </Button>
                    </div>
                    {aiError && (
                      <p className="text-xs text-red-500 mt-1">{aiError}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {selectedProvider === "huggingface" && (
                        <>
                          <span className="block mb-1">
                            <strong>Astuce:</strong> Utilisez le bouton "Générer à partir du titre" pour créer automatiquement un prompt optimisé pour les modèles d'IA.
                          </span>
                          Pour de meilleurs résultats, soyez précis dans votre description. Exemple: 'Un paysage de montagne au coucher du soleil avec un lac reflétant le ciel'
                        </>
                      )}
                      {selectedProvider === "pexels" && "Utilisez des mots-clés simples pour trouver des photos. Exemple: 'bureau professionnel' ou 'nature montagne'"}
                      {selectedProvider === "sdapi" && "Soyez créatif et descriptif pour obtenir des images personnalisées. Vous pouvez inclure le style: 'portrait d'une femme d'affaires, style professionnel'"}
                      {selectedProvider === "picsum" && "Les images seront aléatoires, indépendamment de la description"}
                      {selectedProvider === "replicate" && "Replicate fournit des images Ultra HD"}
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      ) : (
        <div className="relative aspect-video rounded-xl overflow-hidden border border-gray-800 group">
          <div className="absolute top-4 right-4 z-10">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={onRemove}
              className="rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Bouton de régénération de l'image */}
          {imageMetadata?.source && imageMetadata?.lastPrompt && (
            <div className="absolute bottom-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="bg-black/80 hover:bg-black text-white gap-2 backdrop-blur-sm rounded-full"
                onClick={regenerateImage}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkle className="h-4 w-4 text-[#BFFF00]" />
                )}
                Régénérer
              </Button>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-black/80 hover:bg-[#BFFF00] text-white gap-2 backdrop-blur-sm rounded-full border-gray-700"
                  >
                    <Wand2 className="h-4 w-4" />
                    Variantes
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Générer une variante</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="aiModel">Changer de modèle</Label>
                      <Select
                        value={aiModel}
                        onValueChange={setAiModel}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un modèle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Modèles Premium (Haute Qualité)</SelectLabel>
                            {replicateModels
                              .filter(model => !model.id.includes('recraft') && !model.id.includes('proteus') && !model.id.includes('emoji'))
                              .map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{model.name}</span>
                                    <Badge variant="outline" className="ml-2 bg-[#BFFF00] text-black">{model.cost}</Badge>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Modèles Spécialisés</SelectLabel>
                            {replicateModels
                              .filter(model => model.id.includes('recraft') || model.id.includes('proteus') || model.id.includes('emoji'))
                              .map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{model.name}</span>
                                    <Badge variant="outline" className="ml-2 bg-[#BFFF00] text-black">{model.cost}</Badge>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="modifiedPrompt">Modifier le prompt</Label>
                      <Input 
                        id="modifiedPrompt" 
                        defaultValue={imageMetadata?.lastPrompt || ""}
                        className="h-20"
                      />
                    </div>
                    
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        const modifiedPrompt = document.getElementById("modifiedPrompt") as HTMLInputElement;
                        if (modifiedPrompt && modifiedPrompt.value) {
                          generateAiImage(modifiedPrompt.value);
                        }
                      }}
                    >
                      Générer la variante
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
          
          {/* Badge pour les images générées par IA */}
          {imageMetadata?.source === 'huggingface' && imageMetadata.modelName && (
            <div className="absolute top-4 left-4 z-10 bg-black/70 px-2 py-1 rounded-md text-xs backdrop-blur-sm">
              <span className="flex items-center gap-1">
                <Sparkle className="h-3 w-3 text-[#BFFF00]" />
                <span className="text-white">
                  IA: {imageMetadata.modelName}
                </span>
              </span>
            </div>
          )}
          
          {/* Afficher le prompt utilisé au survol */}
          {imageMetadata?.lastPrompt && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <p className="text-xs text-white/80 line-clamp-2 mb-10">
                Prompt: {imageMetadata.lastPrompt}
              </p>
            </div>
          )}
          
          <Image
            src={value}
            alt="Cover"
            fill
            className="object-cover"
          />
        </div>
      )}
    </div>
  )
} 