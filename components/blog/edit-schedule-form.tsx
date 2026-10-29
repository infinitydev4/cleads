"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { openAIModels, huggingFaceTextModels, replicateModels, huggingFaceImageModels } from "@/config/ai-models"
import { DialogClose } from "@/components/ui/dialog"
import { ArticleSchedule } from "@/types/blog"

// Liste des fréquences disponibles
const frequencies = [
  { id: "DAILY", label: "Quotidienne", maxPerMonth: 30 },
  { id: "WEEKLY", label: "Hebdomadaire", maxPerMonth: 4 },
  { id: "BIWEEKLY", label: "Bihebdomadaire", maxPerMonth: 8 },
  { id: "MONTHLY", label: "Mensuelle", maxPerMonth: 1 },
]

// Catégories d'actualités disponibles
const newsCategories = [
  { id: "business", label: "Business" },
  { id: "technology", label: "Technologie" },
  { id: "science", label: "Science" },
  { id: "health", label: "Santé" },
  { id: "general", label: "Général" },
]

// Catégories de contenu disponibles
const availableCategories = [
  "Marketing Digital", "Développement Web", "E-commerce", 
  "UX/UI Design", "Growth Hacking", "Réseaux Sociaux", 
  "SaaS", "Business", "Technologie"
]

// Interface locale pour le composant qui restreint les champs Date à string
interface Schedule extends Omit<ArticleSchedule, 'nextRunDate' | 'lastRunDate' | 'createdAt' | 'updatedAt'> {
  nextRunDate: string;
  lastRunDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface EditScheduleFormProps {
  schedule: Schedule;
  onSuccess: () => void;
}

export function EditScheduleForm({ schedule, onSuccess }: EditScheduleFormProps) {
  // État du formulaire
  const [name, setName] = useState(schedule.name)
  const [frequency, setFrequency] = useState(schedule.frequency)
  const [categories, setCategories] = useState<string[]>(schedule.categories)
  const [keywords, setKeywords] = useState<string[]>(schedule.keywords)
  const [currentKeyword, setCurrentKeyword] = useState("")
  const [newsQuery, setNewsQuery] = useState(schedule.newsQuery || "")
  const [newsCategory, setNewsCategory] = useState(schedule.category || "technology")
  const [provider, setProvider] = useState(schedule.textProvider || "openai")
  const [openaiModel, setOpenaiModel] = useState(schedule.openaiModel || "GPT35")
  const [huggingFaceModel, setHuggingFaceModel] = useState(schedule.huggingFaceModel || "mistralai/Mixtral-8x7B-Instruct-v0.1")
  const [tone, setTone] = useState(schedule.tone || "professionnel")
  const [language, setLanguage] = useState(schedule.language || "français")
  const [publishImmediately, setPublishImmediately] = useState(schedule.publishImmediately)
  const [maxArticlesPerMonth, setMaxArticlesPerMonth] = useState(schedule.maxArticlesPerMonth)
  const [generateImage, setGenerateImage] = useState(schedule.generateImage || false)
  const [imageProvider, setImageProvider] = useState(schedule.imageProvider || "openai")
  const [imageModel, setImageModel] = useState(schedule.imageModel || "DALLE3")
  
  // État de l'UI
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Ajouter une catégorie
  const handleAddCategory = (categoryName: string) => {
    if (!categories.includes(categoryName)) {
      setCategories([...categories, categoryName])
    }
  }
  
  // Supprimer une catégorie
  const handleRemoveCategory = (categoryName: string) => {
    setCategories(categories.filter(c => c !== categoryName))
  }
  
  // Ajouter un mot-clé
  const handleAddKeyword = () => {
    if (!currentKeyword.trim()) return
    
    if (keywords.length >= 10) {
      setError("Maximum 10 mots-clés autorisés")
      return
    }
    
    setKeywords([...keywords, currentKeyword.trim()])
    setCurrentKeyword("")
  }
  
  // Entrée de mot-clé
  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddKeyword()
    }
  }
  
  // Supprimer un mot-clé
  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword))
  }
  
  // Sauvegarder les modifications
  const handleSubmit = async () => {
    setError(null)
    
    if (!name.trim()) {
      setError("Le nom de la planification est requis")
      return
    }
    
    if (categories.length === 0) {
      setError("Sélectionnez au moins une catégorie")
      return
    }
    
    setLoading(true)
    
    try {
      const updatedSchedule = {
        name: name.trim(),
        frequency,
        categories,
        keywords,
        textProvider: provider,
        openaiModel: provider === "openai" ? openaiModel : undefined,
        huggingFaceModel: provider === "huggingface" ? huggingFaceModel : undefined,
        category: newsCategory,
        newsQuery: newsQuery.trim(),
        tone,
        language,
        publishImmediately,
        maxArticlesPerMonth,
        generateImage,
        imageProvider: generateImage ? imageProvider : undefined,
        imageModel: generateImage ? imageModel : undefined
      }
      
      const response = await fetch(`/api/blog/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updatedSchedule)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Erreur ${response.status}`)
      }
      
      onSuccess()
    } catch (error: any) {
      console.error("Erreur lors de la mise à jour:", error)
      setError(error.message || "Erreur lors de la mise à jour")
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <form className="py-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div className="space-y-3 mb-6">
        <div className="space-y-1">
          <Label className="text-gray-300">Nom de la planification</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Articles hebdomadaires marketing"
            className="bg-gray-900 border-gray-800 text-white"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-gray-300">Fréquence</Label>
            <Select 
              value={frequency} 
              onValueChange={(value) => {
                setFrequency(value as "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY")
                // Mettre à jour le nombre maximum d'articles par mois
                const freq = frequencies.find(f => f.id === value)
                if (freq) {
                  setMaxArticlesPerMonth(freq.maxPerMonth)
                }
              }}
            >
              <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                <SelectValue placeholder="Sélectionner une fréquence" />
              </SelectTrigger>
              <SelectContent className="bg-gray-950 border border-gray-800">
                {frequencies.map(freq => (
                  <SelectItem key={freq.id} value={freq.id} className="text-white hover:bg-[#BFFF00] hover:text-black">
                    {freq.label} ({freq.maxPerMonth} articles/mois max)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1">
            <Label className="text-gray-300">Max articles par mois</Label>
            <Input
              type="number"
              min="1"
              max="30"
              value={maxArticlesPerMonth}
              onChange={(e) => setMaxArticlesPerMonth(parseInt(e.target.value))}
              className="bg-gray-900 border-gray-800 text-white"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-gray-300">Catégories à cibler</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-400">Disponibles</label>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto p-2 border border-gray-800 rounded-md bg-gray-800">
                {availableCategories
                  .filter(c => !categories.includes(c))
                  .map(category => (
                    <div 
                      key={category}
                      className="flex items-center justify-between text-sm p-1 hover:bg-[#BFFF00] hover:text-black rounded cursor-pointer text-white bg-gray-900"
                      onClick={() => handleAddCategory(category)}
                    >
                      {category}
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 bg-[#BFFF00] text-black hover:bg-[#BFFF00]/80">+</Button>
                    </div>
                  ))
                }
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-400">Sélectionnées</label>
              <div className="flex flex-col gap-1 min-h-[6rem] max-h-24 overflow-y-auto p-2 border border-gray-800 rounded-md bg-gray-800">
                {categories.length === 0 ? (
                  <p className="text-xs text-gray-300 italic">Aucune catégorie sélectionnée</p>
                ) : (
                  categories.map(category => (
                    <div 
                      key={category}
                      className="flex items-center justify-between text-sm p-1 bg-[#BFFF00] text-black rounded"
                    >
                      {category}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 text-black hover:text-red-600"
                        onClick={() => handleRemoveCategory(category)}
                      >
                        ×
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-gray-300">Mots-clés à inclure</Label>
          <div className="flex gap-2 mb-2">
            <Input
              value={currentKeyword}
              onChange={(e) => setCurrentKeyword(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              placeholder="Appuyez sur Entrée pour ajouter"
              className="bg-gray-900 border-gray-800 text-white"
            />
            <Button 
              variant="outline"
              onClick={handleAddKeyword}
              className="bg-[#BFFF00] text-black border-none hover:bg-[#BFFF00]/80"
            >
              +
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <Badge
                key={keyword}
                variant="secondary"
                className="flex items-center gap-1 bg-[#BFFF00] text-black"
              >
                {keyword}
                <button
                  onClick={() => handleRemoveKeyword(keyword)}
                  className="ml-1 text-black hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-gray-300">Requête personnalisée (optionnelle)</Label>
          <Textarea
            value={newsQuery}
            onChange={(e) => setNewsQuery(e.target.value)}
            placeholder="Ex: innovations en marketing digital, tendances développement web"
            className="bg-gray-900 border-gray-800 text-white min-h-[60px] max-h-[80px]"
          />
          <p className="text-xs text-gray-400">
            Laissez vide pour que le système génère automatiquement des requêtes basées sur les catégories
          </p>
        </div>
        
        <div className="space-y-2">
          <Label className="text-gray-300">Catégorie d'actualités à surveiller</Label>
          <Select 
            value={newsCategory} 
            onValueChange={setNewsCategory}
          >
            <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
              <SelectValue placeholder="Sélectionner une catégorie" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border border-gray-800">
              {newsCategories.map(category => (
                <SelectItem key={category.id} value={category.id} className="text-white hover:bg-[#BFFF00] hover:text-black">
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="advanced" className="border-b-0">
            <AccordionTrigger className="py-2 text-white hover:text-[#BFFF00]">Options avancées</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-gray-300">Fournisseur d'IA</Label>
                  <Select 
                    value={provider} 
                    onValueChange={setProvider}
                  >
                    <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                      <SelectValue placeholder="Sélectionner un fournisseur" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border border-gray-800">
                      <SelectItem value="openai" className="text-white hover:bg-[#BFFF00] hover:text-black">OpenAI</SelectItem>
                      <SelectItem value="huggingface" className="text-white hover:bg-[#BFFF00] hover:text-black">Hugging Face</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {provider === "openai" ? (
                  <div className="space-y-1">
                    <Label className="text-gray-300">Modèle OpenAI</Label>
                    <Select 
                      value={openaiModel} 
                      onValueChange={setOpenaiModel}
                    >
                      <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                        <SelectValue placeholder="Sélectionner un modèle" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-950 border border-gray-800">
                        {openAIModels
                          .filter(m => !m.type || m.type === 'text')
                          .map(model => (
                            <SelectItem key={model.id} value={model.id} className="text-white hover:bg-[#BFFF00] hover:text-black">
                              {model.name}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-gray-300">Modèle Hugging Face</Label>
                    <Select 
                      value={huggingFaceModel} 
                      onValueChange={setHuggingFaceModel}
                    >
                      <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                        <SelectValue placeholder="Sélectionner un modèle" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-950 border border-gray-800">
                        {huggingFaceTextModels.map(model => (
                          <SelectItem key={model.id} value={model.id} className="text-white hover:bg-[#BFFF00] hover:text-black">
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-gray-300">Ton de l'article</Label>
                  <Select 
                    value={tone} 
                    onValueChange={setTone}
                  >
                    <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                      <SelectValue placeholder="Sélectionner un ton" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border border-gray-800">
                      <SelectItem value="professionnel" className="text-white hover:bg-[#BFFF00] hover:text-black">Professionnel</SelectItem>
                      <SelectItem value="décontracté" className="text-white hover:bg-[#BFFF00] hover:text-black">Décontracté</SelectItem>
                      <SelectItem value="expert" className="text-white hover:bg-[#BFFF00] hover:text-black">Expert</SelectItem>
                      <SelectItem value="pédagogique" className="text-white hover:bg-[#BFFF00] hover:text-black">Pédagogique</SelectItem>
                      <SelectItem value="informatif" className="text-white hover:bg-[#BFFF00] hover:text-black">Informatif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-gray-300">Langue de l'article</Label>
                  <Select 
                    value={language} 
                    onValueChange={setLanguage}
                  >
                    <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                      <SelectValue placeholder="Sélectionner une langue" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border border-gray-800">
                      <SelectItem value="français" className="text-white hover:bg-[#BFFF00] hover:text-black">Français</SelectItem>
                      <SelectItem value="anglais" className="text-white hover:bg-[#BFFF00] hover:text-black">Anglais</SelectItem>
                      <SelectItem value="espagnol" className="text-white hover:bg-[#BFFF00] hover:text-black">Espagnol</SelectItem>
                      <SelectItem value="allemand" className="text-white hover:bg-[#BFFF00] hover:text-black">Allemand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="publish"
                  checked={publishImmediately}
                  onCheckedChange={setPublishImmediately}
                  className="data-[state=checked]:bg-[#BFFF00]"
                />
                <Label htmlFor="publish" className="cursor-pointer text-gray-300">
                  Publier automatiquement les articles générés
                </Label>
              </div>
              
              {/* Ajout des options de génération d'images */}
              <div className="border-t border-gray-800 pt-3 mt-3">
                <h4 className="text-sm font-medium text-white mb-3">Génération d'images</h4>
                
                <div className="flex items-center space-x-2 mb-3">
                  <Switch
                    id="generateImage"
                    checked={generateImage}
                    onCheckedChange={setGenerateImage}
                    className="data-[state=checked]:bg-[#BFFF00]"
                  />
                  <Label htmlFor="generateImage" className="cursor-pointer text-gray-300">
                    Générer automatiquement une image pour chaque article
                  </Label>
                </div>
                
                {generateImage && (
                  <div className="space-y-3 pl-6 mt-2">
                    <div className="space-y-1">
                      <Label className="text-gray-300">Fournisseur d'images</Label>
                      <Select 
                        value={imageProvider} 
                        onValueChange={setImageProvider}
                      >
                        <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                          <SelectValue placeholder="Sélectionner un fournisseur" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-950 border border-gray-800">
                          <SelectItem value="openai" className="text-white hover:bg-[#BFFF00] hover:text-black">OpenAI DALL-E</SelectItem>
                          <SelectItem value="replicate" className="text-white hover:bg-[#BFFF00] hover:text-black">Replicate (Stability AI)</SelectItem>
                          <SelectItem value="sdapi" className="text-white hover:bg-[#BFFF00] hover:text-black">Stable Diffusion API</SelectItem>
                          <SelectItem value="huggingface" className="text-white hover:bg-[#BFFF00] hover:text-black">Hugging Face</SelectItem>
                          <SelectItem value="picsum" className="text-white hover:bg-[#BFFF00] hover:text-black">Lorem Picsum (aléatoire)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {imageProvider === 'openai' && (
                      <div className="space-y-1">
                        <Label className="text-gray-300">Modèle DALL-E</Label>
                        <Select 
                          value={imageModel} 
                          onValueChange={setImageModel}
                        >
                          <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                            <SelectValue placeholder="Sélectionner un modèle" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-950 border border-gray-800">
                            <SelectItem value="DALLE3" className="text-white hover:bg-[#BFFF00] hover:text-black">DALL-E 3</SelectItem>
                            <SelectItem value="DALLE2" className="text-white hover:bg-[#BFFF00] hover:text-black">DALL-E 2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    {imageProvider === 'replicate' && (
                      <div className="space-y-1">
                        <Label className="text-gray-300">Modèle Replicate</Label>
                        <Select 
                          value={imageModel} 
                          onValueChange={setImageModel}
                        >
                          <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                            <SelectValue placeholder="Sélectionner un modèle" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-950 border border-gray-800 max-h-[200px] overflow-y-auto">
                            {replicateModels.map(model => (
                              <SelectItem 
                                key={model.id} 
                                value={model.id}
                                className="text-white hover:bg-[#BFFF00] hover:text-black"
                              >
                                {model.name} ({model.cost})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    {imageProvider === 'huggingface' && (
                      <div className="space-y-1">
                        <Label className="text-gray-300">Modèle Hugging Face</Label>
                        <Select 
                          value={imageModel} 
                          onValueChange={setImageModel}
                        >
                          <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                            <SelectValue placeholder="Sélectionner un modèle" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-950 border border-gray-800 max-h-[200px] overflow-y-auto">
                            {huggingFaceImageModels.map(model => (
                              <SelectItem 
                                key={model.id} 
                                value={model.id}
                                className="text-white hover:bg-[#BFFF00] hover:text-black"
                              >
                                {model.name} {model.recommended ? '(recommandé)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-md text-red-200 text-sm">
            {error}
          </div>
        )}
      </div>
      
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-800">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="text-black">
            Annuler
          </Button>
        </DialogClose>
        <Button 
          type="submit"
          disabled={loading}
          className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Mise à jour...
            </>
          ) : (
            "Enregistrer les modifications"
          )}
        </Button>
      </div>
    </form>
  )
} 