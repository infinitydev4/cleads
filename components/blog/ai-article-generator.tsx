"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, Wand2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface AIArticleGeneratorProps {
  onGenerated: (article: {
    title: string;
    content: string;
    excerpt: string;
    metaTitle: string;
    metaDescription: string;
    tags: string[];
    category: string;
    imageSuggestions?: string[];
  }) => void;
}

export function AIArticleGenerator({ onGenerated }: AIArticleGeneratorProps) {
  const [loading, setLoading] = useState(false)
  const [topic, setTopic] = useState("")
  const [keywords, setKeywords] = useState<string[]>([])
  const [currentKeyword, setCurrentKeyword] = useState("")
  const [tone, setTone] = useState("professionnel")
  const [language, setLanguage] = useState("français")
  const [error, setError] = useState<string | null>(null)

  const handleAddKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && currentKeyword.trim()) {
      e.preventDefault()
      if (keywords.length >= 5) {
        toast.error("Maximum 5 mots-clés autorisés")
        return
      }
      setKeywords([...keywords, currentKeyword.trim()])
      setCurrentKeyword("")
    }
  }

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword))
  }

  const handleGenerate = async () => {
    setError(null)
    
    if (!topic.trim()) {
      toast.error("Veuillez entrer un sujet")
      return
    }

    if (keywords.length === 0) {
      toast.error("Veuillez ajouter au moins un mot-clé")
      return
    }

    setLoading(true)
    try {
      const requestData = {
        topic: topic.trim(),
        keywords: keywords,
        tone,
        language
      }
      
      const response = await fetch("/api/blog/generate", {
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
      toast.success("Article généré avec succès")
    } catch (error: any) {
      console.error("Erreur lors de la génération:", error)
      const errorMessage = error.message || "Erreur lors de la génération de l'article"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Sujet de l'article</label>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Ex: Les avantages du marketing digital pour les PME"
          className="bg-gray-900 border-gray-800"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-gray-400">Mots-clés (max 5)</label>
        <div className="flex gap-2 mb-2">
          <Input
            value={currentKeyword}
            onChange={(e) => setCurrentKeyword(e.target.value)}
            onKeyDown={handleAddKeyword}
            placeholder="Appuyez sur Entrée pour ajouter"
            className="bg-gray-900 border-gray-800"
            disabled={keywords.length >= 5}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <Badge
              key={keyword}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {keyword}
              <button
                onClick={() => handleRemoveKeyword(keyword)}
                className="ml-1 hover:text-red-500"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-gray-400">Ton de l'article</label>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-md p-2 text-white"
        >
          <option value="professionnel">Professionnel</option>
          <option value="décontracté">Décontracté</option>
          <option value="expert">Expert</option>
          <option value="pédagogique">Pédagogique</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-gray-400">Langue de l'article</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-md p-2 text-white"
        >
          <option value="français">Français</option>
          <option value="anglais">Anglais</option>
          <option value="espagnol">Espagnol</option>
          <option value="allemand">Allemand</option>
          <option value="italien">Italien</option>
        </select>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-md text-red-200 text-sm">
          {error}
        </div>
      )}

      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Génération en cours...
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4 mr-2" />
            Générer l'article
          </>
        )}
      </Button>
    </div>
  )
} 