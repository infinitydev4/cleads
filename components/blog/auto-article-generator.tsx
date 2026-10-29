"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, Sparkles, Calendar, Newspaper } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { openAIModels, huggingFaceTextModels } from "@/config/ai-models"

interface AutoArticleGeneratorProps {
  onGenerated: (article: {
    title: string;
    content: string;
    excerpt: string;
    metaTitle: string;
    metaDescription: string;
    tags: string[];
    category: string;
    imageSuggestions?: string[];
    sources?: { title: string; source: string; url: string; date: string }[];
  }) => void;
}

// Fréquences disponibles pour la génération automatique
const frequencies = [
  { id: "DAILY", label: "Quotidienne", maxPerMonth: 30 },
  { id: "WEEKLY", label: "Hebdomadaire", maxPerMonth: 4 },
  { id: "BIWEEKLY", label: "Bihebdomadaire", maxPerMonth: 8 },
  { id: "MONTHLY", label: "Mensuelle", maxPerMonth: 1 },
]

// Catégories d'actualités disponibles via NewsAPI
const newsCategories = [
  { id: "business", label: "Business" },
  { id: "technology", label: "Technologie" },
  { id: "science", label: "Science" },
  { id: "health", label: "Santé" },
  { id: "general", label: "Général" },
]

export function AutoArticleGenerator({ onGenerated }: AutoArticleGeneratorProps) {
  // État pour les options de génération manuelle
  const [loading, setLoading] = useState(false)
  const [newsQuery, setNewsQuery] = useState("")
  const [newsCategory, setNewsCategory] = useState("technology")
  const [provider, setProvider] = useState("openai")
  const [openaiModel, setOpenaiModel] = useState("GPT35")
  const [huggingFaceModel, setHuggingFaceModel] = useState("mistralai/Mixtral-8x7B-Instruct-v0.1")
  const [language, setLanguage] = useState("français")
  const [tone, setTone] = useState("professionnel")
  const [error, setError] = useState<string | null>(null)
  
  // État pour la planification
  const [name, setName] = useState("")
  const [frequency, setFrequency] = useState("WEEKLY")
  const [categories, setCategories] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [currentKeyword, setCurrentKeyword] = useState("")
  const [publishImmediately, setPublishImmediately] = useState(false)
  const [maxArticlesPerMonth, setMaxArticlesPerMonth] = useState(4)
  const [generateImage, setGenerateImage] = useState(false)
  const [imageProvider, setImageProvider] = useState<string>("openai")
  const [imageModel, setImageModel] = useState<string>("dall-e-3")
  
  // Ajouter une catégorie à la rotation
  const handleAddCategory = (categoryName: string) => {
    if (!categories.includes(categoryName)) {
      setCategories([...categories, categoryName])
    }
  }
  
  // Supprimer une catégorie de la rotation
  const handleRemoveCategory = (categoryName: string) => {
    setCategories(categories.filter(c => c !== categoryName))
  }
  
  // Ajouter un mot-clé
  const handleAddKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && currentKeyword.trim()) {
      e.preventDefault()
      if (keywords.length >= 10) {
        toast.error("Maximum 10 mots-clés autorisés")
        return
      }
      setKeywords([...keywords, currentKeyword.trim()])
      setCurrentKeyword("")
    }
  }
  
  // Supprimer un mot-clé
  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword))
  }

  // Générer un article manuellement
  const handleManualGenerate = async () => {
    setError(null)
    
    if (!newsQuery.trim() && newsCategory === "") {
      toast.error("Veuillez entrer une requête ou sélectionner une catégorie")
      return
    }

    setLoading(true)
    try {
      const requestData = {
        newsQuery: newsQuery.trim(),
        newsCategory,
        provider,
        openaiModel,
        huggingFaceModel,
        tone,
        language
      }
      
      const response = await fetch("/api/blog/generate-trending", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData)
      })

      if (response.status === 400) {
        const errorData = await response.json()
        const errorMessage = errorData.error || "Erreur 400: Requête invalide"
        setError(errorMessage)
        toast.error(errorMessage)
        return
      }
      
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data || typeof data !== 'object') {
        throw new Error("Format de réponse invalide")
      }
      
      onGenerated(data)
      toast.success("Article généré avec succès à partir des tendances")
    } catch (error: any) {
      console.error("Erreur lors de la génération:", error)
      const errorMessage = error.message || "Erreur lors de la génération de l'article"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }
  
  // Planifier la génération d'articles
  const handleSchedule = async () => {
    setError(null)
    
    if (!name.trim()) {
      toast.error("Veuillez donner un nom à cette planification")
      return
    }
    
    if (categories.length === 0) {
      toast.error("Veuillez sélectionner au moins une catégorie")
      return
    }

    setLoading(true)
    try {
      const scheduleData = {
        name: name.trim(),
        frequency,
        categories,
        keywords,
        provider,
        openaiModel,
        huggingFaceModel,
        category: newsCategory,
        newsQuery: newsQuery.trim(),
        tone,
        language,
        publishImmediately,
        maxArticlesPerMonth,
        generateImage,
        imageProvider: generateImage ? imageProvider : null,
        imageModel: generateImage ? imageModel : null
      }
      
      const response = await fetch("/api/blog/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(scheduleData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Erreur ${response.status}`)
      }

      const data = await response.json()
      
      toast.success("Planification de génération d'articles créée avec succès")
      
      // Réinitialiser le formulaire
      setName("")
      setNewsQuery("")
      setCategories([])
      setKeywords([])
    } catch (error: any) {
      console.error("Erreur lors de la planification:", error)
      const errorMessage = error.message || "Erreur lors de la planification"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid grid-cols-2 mb-4 bg-gray-900 border border-gray-800">
          <TabsTrigger value="manual" className="flex items-center gap-2 data-[state=active]:bg-[#BFFF00] data-[state=active]:text-black">
            <Newspaper className="h-4 w-4" />
            Génération manuelle
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-2 data-[state=active]:bg-[#BFFF00] data-[state=active]:text-black">
            <Calendar className="h-4 w-4" />
            Planification
          </TabsTrigger>
        </TabsList>
        
        {/* Tab pour la génération manuelle */}
        <TabsContent value="manual" className="space-y-4">
          <Card className="bg-gray-950 border border-gray-800">
            <CardHeader className="border-b border-gray-800">
              <CardTitle>Générer un article basé sur les tendances</CardTitle>
              <CardDescription className="text-gray-400">
                Récupère automatiquement les actualités récentes pour générer un article SEO optimisé.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Requête d'actualités</Label>
                <Input
                  value={newsQuery}
                  onChange={(e) => setNewsQuery(e.target.value)}
                  placeholder="Ex: marketing digital, développement web, SEO"
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <p className="text-xs text-gray-400">
                  Entrez les termes que vous souhaitez rechercher dans les actualités récentes
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-gray-300">Catégorie d'actualités</Label>
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
                  <AccordionTrigger className="text-white hover:text-[#BFFF00]">Options avancées</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
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
                        <div className="space-y-2">
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
                        <div className="space-y-2">
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
                      <div className="space-y-2">
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
                      
                      <div className="space-y-2">
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              
              {error && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-md text-red-200 text-sm">
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleManualGenerate}
                disabled={loading}
                className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Recherche et génération...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Générer un article tendance
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Tab pour la planification */}
        <TabsContent value="schedule" className="space-y-4">
          <Card className="bg-gray-950 border border-gray-800">
            <CardHeader className="border-b border-gray-800">
              <CardTitle>Planifier la génération d'articles</CardTitle>
              <CardDescription className="text-gray-400">
                Configurez une génération automatique et périodique d'articles basés sur les actualités récentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Nom de la planification</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Articles hebdomadaires marketing"
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Fréquence</Label>
                  <Select 
                    value={frequency} 
                    onValueChange={(value) => {
                      setFrequency(value)
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
                
                <div className="space-y-2">
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
                <Label className="text-gray-300">Catégories à cibler (rotation)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400">Disponibles</label>
                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto p-2 border border-gray-800 rounded-md bg-gray-800">
                      {["Marketing Digital", "Développement Web", "E-commerce", "UX/UI Design", "Growth Hacking", "Réseaux Sociaux", "SaaS", "Business", "Technologie"]
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
                    <div className="flex flex-col gap-1 min-h-[8rem] max-h-32 overflow-y-auto p-2 border border-gray-800 rounded-md bg-gray-800">
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
                    onKeyDown={handleAddKeyword}
                    placeholder="Appuyez sur Entrée pour ajouter"
                    className="bg-gray-900 border-gray-800 text-white"
                  />
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
                  className="bg-gray-900 border-gray-800 text-white min-h-[80px]"
                />
                <p className="text-xs text-gray-400">
                  Laissez vide pour que le système génère automatiquement des requêtes basées sur les catégories sélectionnées
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
              
              <div className="flex items-center space-x-2 pt-2">
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
              
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="generateImage"
                  checked={generateImage}
                  onCheckedChange={setGenerateImage}
                  className="data-[state=checked]:bg-[#BFFF00]"
                />
                <Label htmlFor="generateImage" className="cursor-pointer text-gray-300">
                  Générer automatiquement une image de couverture
                </Label>
              </div>
              
              {generateImage && (
                <div className="space-y-4 pl-8 mt-2 pt-2 border-l-2 border-gray-800">
                  <div className="space-y-2">
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
                        <SelectItem value="stability" className="text-white hover:bg-[#BFFF00] hover:text-black">Stability AI</SelectItem>
                        <SelectItem value="replicate" className="text-white hover:bg-[#BFFF00] hover:text-black">Replicate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {imageProvider === "openai" && (
                    <div className="space-y-2">
                      <Label className="text-gray-300">Modèle DALL-E</Label>
                      <Select 
                        value={imageModel} 
                        onValueChange={setImageModel}
                      >
                        <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                          <SelectValue placeholder="Sélectionner un modèle" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-950 border border-gray-800">
                          <SelectItem value="dall-e-3" className="text-white hover:bg-[#BFFF00] hover:text-black">DALL-E 3</SelectItem>
                          <SelectItem value="dall-e-2" className="text-white hover:bg-[#BFFF00] hover:text-black">DALL-E 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {imageProvider === "stability" && (
                    <div className="space-y-2">
                      <Label className="text-gray-300">Modèle Stability AI</Label>
                      <Select 
                        value={imageModel} 
                        onValueChange={setImageModel}
                      >
                        <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                          <SelectValue placeholder="Sélectionner un modèle" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-950 border border-gray-800">
                          <SelectItem value="stable-diffusion-xl" className="text-white hover:bg-[#BFFF00] hover:text-black">Stable Diffusion XL</SelectItem>
                          <SelectItem value="stable-diffusion-3" className="text-white hover:bg-[#BFFF00] hover:text-black">Stable Diffusion 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {imageProvider === "replicate" && (
                    <div className="space-y-2">
                      <Label className="text-gray-300">Modèle Replicate</Label>
                      <Select 
                        value={imageModel} 
                        onValueChange={setImageModel}
                      >
                        <SelectTrigger className="bg-gray-900 border-gray-800 w-full text-white">
                          <SelectValue placeholder="Sélectionner un modèle" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-950 border border-gray-800">
                          <SelectItem value="midjourney" className="text-white hover:bg-[#BFFF00] hover:text-black">Midjourney</SelectItem>
                          <SelectItem value="sdxl" className="text-white hover:bg-[#BFFF00] hover:text-black">SDXL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="advanced" className="border-b-0">
                  <AccordionTrigger className="text-white hover:text-[#BFFF00]">Options avancées</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
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
                        <div className="space-y-2">
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
                        <div className="space-y-2">
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
                      <div className="space-y-2">
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
                      
                      <div className="space-y-2">
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleSchedule}
                disabled={loading || name.trim() === "" || categories.length === 0}
                className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Création de la planification...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Planifier la génération d'articles
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 