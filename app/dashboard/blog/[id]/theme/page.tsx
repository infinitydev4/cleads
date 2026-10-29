"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { 
  ArrowLeft,
  Palette,
  Layout,
  Type,
  Wand2,
  Check,
  Eye,
  X,
  ChevronRight
} from "lucide-react"

interface Theme {
  id: string
  name: string
  description: string
  colors: {
    primary: string
    background: string
    card: string
    text: string
    muted: string
  }
  features: string[]
  layout: string
}

interface Article {
  id: string
  title: string
  themeId: string | null
}

export default function ArticleThemePage() {
  const params = useParams()
  const router = useRouter()
  const [article, setArticle] = useState<Article | null>(null)
  const [themes, setThemes] = useState<Theme[]>([])
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Récupérer l'article
        const articleResponse = await fetch(`/api/articles/${params.id}`)
        if (!articleResponse.ok) throw new Error("Erreur lors de la récupération de l'article")
        const articleData = await articleResponse.json()
        setArticle(articleData)

        // Récupérer les thèmes
        const themesResponse = await fetch("/api/themes")
        if (!themesResponse.ok) throw new Error("Erreur lors de la récupération des thèmes")
        const themesData = await themesResponse.json()
        setThemes(themesData)

        // Définir le thème sélectionné
        const theme = themesData.find((t: Theme) => t.id === articleData.themeId) || themesData[0]
        setSelectedTheme(theme)
      } catch (error) {
        console.error("Erreur lors de la récupération des données:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const handleThemeChange = async (themeId: string) => {
    try {
      const response = await fetch("/api/themes", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          articleId: params.id,
          themeId
        }),
      })

      if (!response.ok) throw new Error("Erreur lors de la mise à jour du thème")

      const theme = themes.find(t => t.id === themeId)
      if (theme) {
        setSelectedTheme(theme)
      }
    } catch (error) {
      console.error("Erreur lors du changement de thème:", error)
    }
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  if (!article) {
    return <div>Article non trouvé</div>
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Thème de l'article</h1>
          <p className="text-gray-400">{article.title}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setPreview(!preview)}
          >
            <Eye className="w-4 h-4 mr-2" />
            {preview ? "Fermer la prévisualisation" : "Prévisualiser"}
          </Button>
          
          <Button 
            onClick={() => router.push(`/blog/${article.id}?theme=${selectedTheme?.id}`)}
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
          >
            <ChevronRight className="w-4 h-4 mr-2" />
            Voir en direct
          </Button>
        </div>
      </div>

      {/* Theme Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card className="bg-gray-950 border-gray-800 p-6">
            <h3 className="text-lg font-semibold mb-4">Choisir un thème</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {themes.map((theme) => (
                <Card
                  key={theme.id}
                  className={`bg-gray-900 border ${
                    theme.id === selectedTheme?.id
                      ? "border-[#BFFF00]"
                      : "border-gray-800 hover:border-gray-700"
                  } cursor-pointer transition-colors`}
                  onClick={() => handleThemeChange(theme.id)}
                >
                  <div className="p-4">
                    <h4 className="font-semibold mb-2">{theme.name}</h4>
                    <p className="text-sm text-gray-400 mb-4">{theme.description}</p>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: theme.colors.primary }}
                      />
                      <span className="text-sm text-gray-400">{theme.layout}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </div>

        {/* Theme Info */}
        <div className="space-y-6">
          {selectedTheme && (
            <>
              {/* Colors */}
              <Card className="bg-gray-950 border-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Palette de couleurs</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">Couleur principale</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-full" 
                        style={{ backgroundColor: selectedTheme.colors.primary }}
                      />
                      <span className="text-sm text-gray-400">{selectedTheme.colors.primary}</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">Arrière-plan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-full" 
                        style={{ backgroundColor: selectedTheme.colors.background }}
                      />
                      <span className="text-sm text-gray-400">{selectedTheme.colors.background}</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">Cartes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-full" 
                        style={{ backgroundColor: selectedTheme.colors.card }}
                      />
                      <span className="text-sm text-gray-400">{selectedTheme.colors.card}</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Features */}
              <Card className="bg-gray-950 border-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Fonctionnalités</h3>
                <div className="space-y-2">
                  {selectedTheme.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-gray-400">
                      <Check className="w-4 h-4 text-lime-500" />
                      {feature}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Actions */}
              <Card className="bg-gray-950 border-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Actions</h3>
                <div className="space-y-3">
                  <Button 
                    className="w-full"
                    onClick={() => router.push(`/blog/${article.id}?theme=${selectedTheme.id}`)}
                  >
                    <ChevronRight className="w-4 h-4 mr-2" />
                    Voir en direct
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push("/dashboard/blog")}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour aux articles
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
} 