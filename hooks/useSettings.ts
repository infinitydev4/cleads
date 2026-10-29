import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { AdminSettings, CompanySettings } from "@/types/settings"

export function useSettings() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null)

  useEffect(() => {
    loadSettings()
  }, [session])

  const loadSettings = async () => {
    if (!session) return
    
    try {
      setLoading(true)
      const [settingsResponse, aiResponse, imageResponse, blogResponse] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/ai-providers"),
        fetch("/api/settings/image"),
        fetch("/api/settings/blog")
      ])
      
      if (!settingsResponse.ok || !aiResponse.ok || !imageResponse.ok || !blogResponse.ok) 
        throw new Error("Erreur lors du chargement des paramètres")
      
      const settingsData = await settingsResponse.json()
      const aiData = await aiResponse.json()
      const imageData = await imageResponse.json()
      const blogData = await blogResponse.json()
      
      setCompanySettings(settingsData.company)
      setAdminSettings({
        ...settingsData.admin,
        openaiApiKey: aiData.openaiApiKey,
        openaiModel: aiData.openaiModel,
        textProvider: aiData.textProvider,
        huggingFaceApiKey: aiData.huggingFaceApiKey || imageData.huggingFaceApiKey,
        huggingFaceTextModel: aiData.huggingFaceTextModel,
        autoGenerateTags: aiData.autoGenerateTags,
        autoOptimizeSEO: aiData.autoOptimizeSEO,
        imageProvider: imageData.provider || "picsum",
        huggingFaceModel: imageData.huggingFaceModel,
        pexelsApiKey: imageData.pexelsApiKey,
        stableDiffusionApiKey: imageData.stableDiffusionApiKey,
        replicateApiKey: imageData.replicateApiKey,
        replicateModel: imageData.replicateModel,
        rssSourceCount: blogData.rssSourceCount,
        rssArticleSelectionMode: blogData.rssArticleSelectionMode,
        defaultRssCategory: blogData.defaultRssCategory,
        highQualityGeneration: blogData.highQualityGeneration,
        allowRsslessGeneration: blogData.allowRsslessGeneration
      })
    } catch (error) {
      console.error("Erreur lors du chargement des paramètres:", error)
      toast.error("Erreur lors du chargement des paramètres")
    } finally {
      setLoading(false)
    }
  }

  const updateCompanySettings = async (settings: Partial<CompanySettings>) => {
    if (!session) return
    
    try {
      const response = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (!response.ok) throw new Error("Erreur lors de la mise à jour des paramètres")
      
      const updatedSettings = await response.json()
      setCompanySettings(updatedSettings)
      toast.success("Paramètres de l'entreprise mis à jour")
    } catch (error) {
      console.error("Erreur lors de la mise à jour des paramètres:", error)
      toast.error("Erreur lors de la mise à jour des paramètres")
    }
  }

  const updateAdminSettings = async (settings: Partial<AdminSettings>) => {
    if (!session) return
    
    try {
      const promises = [];
      
      // Mise à jour des paramètres généraux
      if (settings.name || settings.email || settings.phone || 
          settings.avatar || settings.language) {
        promises.push(
          fetch("/api/settings/admin", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: settings.name,
              email: settings.email,
              phone: settings.phone,
              avatar: settings.avatar,
              language: settings.language
            }),
          })
        );
      }
      
      // Mise à jour des paramètres IA
      if (settings.openaiApiKey !== undefined || 
          settings.openaiModel || 
          settings.autoGenerateTags !== undefined || 
          settings.autoOptimizeSEO !== undefined ||
          settings.textProvider ||
          settings.huggingFaceTextModel ||
          settings.huggingFaceApiKey) {
        promises.push(
          fetch("/api/settings/ai-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              openaiApiKey: settings.openaiApiKey,
              openaiModel: settings.openaiModel,
              autoGenerateTags: settings.autoGenerateTags,
              autoOptimizeSEO: settings.autoOptimizeSEO,
              textProvider: settings.textProvider,
              huggingFaceTextModel: settings.huggingFaceTextModel,
              huggingFaceApiKey: settings.huggingFaceApiKey
            }),
          })
        );
      }

      // Mise à jour des paramètres du blog
      if (settings.autoGenerateTags !== undefined || 
          settings.autoOptimizeSEO !== undefined ||
          settings.rssSourceCount !== undefined ||
          settings.rssArticleSelectionMode !== undefined ||
          settings.defaultRssCategory !== undefined ||
          settings.highQualityGeneration !== undefined ||
          settings.allowRsslessGeneration !== undefined) {
        promises.push(
          fetch("/api/settings/blog", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              autoGenerateTags: settings.autoGenerateTags,
              autoOptimizeSEO: settings.autoOptimizeSEO,
              rssSourceCount: settings.rssSourceCount,
              rssArticleSelectionMode: settings.rssArticleSelectionMode,
              defaultRssCategory: settings.defaultRssCategory,
              highQualityGeneration: settings.highQualityGeneration,
              allowRsslessGeneration: settings.allowRsslessGeneration
            }),
          })
        );
      }
      
      // Mise à jour des paramètres de génération d'images
      if (settings.imageProvider || 
          settings.pexelsApiKey !== undefined || 
          settings.huggingFaceApiKey !== undefined || 
          settings.huggingFaceModel !== undefined ||
          settings.stableDiffusionApiKey !== undefined ||
          settings.replicateApiKey !== undefined ||
          settings.replicateModel !== undefined) {
        promises.push(
          fetch("/api/settings/image", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: settings.imageProvider,
              pexelsApiKey: settings.pexelsApiKey,
              huggingFaceApiKey: settings.huggingFaceApiKey,
              huggingFaceModel: settings.huggingFaceModel,
              stableDiffusionApiKey: settings.stableDiffusionApiKey,
              replicateApiKey: settings.replicateApiKey,
              replicateModel: settings.replicateModel
            }),
          })
        );
      }
      
      const responses = await Promise.all(promises);
      
      // Vérifier que toutes les réponses sont OK
      if (responses.some(response => !response.ok)) 
        throw new Error("Erreur lors de la mise à jour des paramètres");
      
      // Charger les paramètres mis à jour
      loadSettings();
      toast.success("Paramètres mis à jour avec succès");
    } catch (error) {
      console.error("Erreur lors de la mise à jour des paramètres:", error)
      toast.error("Erreur lors de la mise à jour des paramètres")
    }
  }

  const updateAvatar = async (file: File) => {
    if (!session) return
    
    try {
      const formData = new FormData()
      formData.append("avatar", file)

      const response = await fetch("/api/settings/avatar", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) throw new Error("Erreur lors de la mise à jour de l'avatar")
      
      const { avatarUrl } = await response.json()
      setAdminSettings(prev => prev ? { ...prev, avatar: avatarUrl } : null)
      toast.success("Avatar mis à jour")
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'avatar:", error)
      toast.error("Erreur lors de la mise à jour de l'avatar")
    }
  }

  return {
    loading,
    companySettings,
    adminSettings,
    updateCompanySettings,
    updateAdminSettings,
    updateAvatar,
  }
} 