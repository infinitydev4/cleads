"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  User,
  Bell,
  Globe,
  Palette,
  CreditCard,
  Building2,
  Save,
  Calendar,
  MessageSquare,
  BellRing,
  BellOff,
  Moon,
  Sun,
  Upload,
  Loader2,
  Sparkles,
  ImageIcon,
  BookOpen,
  Newspaper,
  Rss,
  CheckCircle2,
  XCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettings } from "@/hooks/useSettings"
import { useNotificationSettings } from "@/hooks/useNotificationSettings"
import { toast } from "sonner"
import { AdminSettings, CompanySettings } from "@/types/settings"
import { 
  replicateModels, 
  huggingFaceImageModels, 
  huggingFaceTextModels,
  openAIModels,
  textProviders,
  imageProviders
} from "@/config/ai-models"
import { useRouter } from "next/navigation"

const settingsSections = [
  { id: "profile", label: "Profil", icon: User },
  { id: "company", label: "Entreprise", icon: Building2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Apparence", icon: Palette },
  { id: "ai", label: "Intelligence Artificielle", icon: Sparkles },
  { id: "images", label: "Génération d'images", icon: ImageIcon },
  { id: "blog", label: "Blog & SEO", icon: BookOpen },
  { id: "billing", label: "Facturation", icon: CreditCard },
]

export default function SettingsPage() {
  const {
    loading,
    companySettings,
    adminSettings,
    updateCompanySettings,
    updateAdminSettings,
    updateAvatar,
  } = useSettings()

  const { settings: notificationSettings, updateNotificationSettings } = useNotificationSettings()
  const [activeSection, setActiveSection] = useState("profile")
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark")
  const [isSaving, setIsSaving] = useState(false)
  const [localAdminSettings, setLocalAdminSettings] = useState<AdminSettings | null>(adminSettings)
  const [localCompanySettings, setLocalCompanySettings] = useState(companySettings)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [isTestingRss, setIsTestingRss] = useState(false)
  const [rssTestProgress, setRssTestProgress] = useState({ current: 0, total: 0, valid: 0 })
  const [rssTestResults, setRssTestResults] = useState<{ name: string; url: string; valid: boolean; category?: string }[]>([])

  useEffect(() => {
    setLocalAdminSettings(adminSettings)
    setLocalCompanySettings(companySettings)
  }, [adminSettings, companySettings])

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      await updateAvatar(file)
    } catch (error) {
      console.error("Erreur lors du changement d'avatar:", error)
    }
  }

  const handleSaveProfile = async () => {
    if (!localAdminSettings) return
    setIsSaving(true)
    try {
      await updateAdminSettings({
        name: localAdminSettings.name,
        email: localAdminSettings.email,
        phone: localAdminSettings.phone,
        avatar: localAdminSettings.avatar,
        language: localAdminSettings.language
      })
      toast.success("Profil mis à jour avec succès")
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du profil:", error)
      toast.error("Erreur lors de la sauvegarde du profil")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAI = async () => {
    if (!localAdminSettings) return
    setIsSaving(true)
    try {
      // Préparation des paramètres IA
      const aiSettings: Partial<AdminSettings> = {
        textProvider: localAdminSettings.textProvider,
        autoGenerateTags: localAdminSettings.autoGenerateTags,
        autoOptimizeSEO: localAdminSettings.autoOptimizeSEO
      };
      
      // Ajout des paramètres spécifiques au provider
      if (localAdminSettings.textProvider === "huggingface") {
        aiSettings.huggingFaceApiKey = localAdminSettings.huggingFaceApiKey;
        aiSettings.huggingFaceTextModel = localAdminSettings.huggingFaceTextModel;
      } else {
        // OpenAI
        aiSettings.openaiApiKey = localAdminSettings.openaiApiKey;
        aiSettings.openaiModel = localAdminSettings.openaiModel;
      }
      
      await updateAdminSettings(aiSettings);
      toast.success("Paramètres IA mis à jour avec succès");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des paramètres IA:", error);
      toast.error("Erreur lors de la sauvegarde des paramètres IA");
    } finally {
      setIsSaving(false);
    }
  }

  const handleSaveImages = async () => {
    if (!localAdminSettings) return
    setIsSaving(true)
    try {
      await updateAdminSettings({
        imageProvider: localAdminSettings.imageProvider || "picsum",
        pexelsApiKey: localAdminSettings.pexelsApiKey,
        huggingFaceApiKey: localAdminSettings.huggingFaceApiKey,
        huggingFaceModel: localAdminSettings.huggingFaceModel || "stabilityai/stable-diffusion-xl-base-1.0",
        stableDiffusionApiKey: localAdminSettings.stableDiffusionApiKey,
        replicateApiKey: localAdminSettings.replicateApiKey,
        replicateModel: localAdminSettings.replicateModel || "black-forest-labs/flux-dev-lora"
      })
      toast.success("Paramètres de génération d'images mis à jour avec succès")
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des paramètres d'images:", error)
      toast.error("Erreur lors de la sauvegarde des paramètres d'images")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveCompany = async () => {
    if (!localCompanySettings) return
    setIsSaving(true)
    try {
      await updateCompanySettings(localCompanySettings)
      toast.success("Informations de l'entreprise mises à jour avec succès")
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des informations de l'entreprise:", error)
      toast.error("Erreur lors de la sauvegarde des informations de l'entreprise")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveBlog = async () => {
    if (!localAdminSettings) return;
    setIsSaving(true);
    try {
      await updateAdminSettings({
        autoGenerateTags: localAdminSettings.autoGenerateTags,
        autoOptimizeSEO: localAdminSettings.autoOptimizeSEO,
        rssSourceCount: localAdminSettings.rssSourceCount,
        rssArticleSelectionMode: localAdminSettings.rssArticleSelectionMode,
        defaultRssCategory: localAdminSettings.defaultRssCategory,
        highQualityGeneration: localAdminSettings.highQualityGeneration,
        allowRsslessGeneration: localAdminSettings.allowRsslessGeneration
      });
      toast.success("Paramètres du blog mis à jour avec succès");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des paramètres du blog:", error);
      toast.error("Erreur lors de la sauvegarde des paramètres du blog");
    } finally {
      setIsSaving(false);
    }
  };

  const testRssFeeds = async (category?: string) => {
    if (!category) return;
    
    try {
      setRssTestResults([]);
      setRssTestProgress({ current: 0, total: 0, valid: 0 });
      
      const response = await fetch('/api/blog/rss-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category }),
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors du test des flux RSS');
      }
      
      const data = await response.json();
      
      // Simuler une progression pour une meilleure expérience utilisateur
      const results = data.results;
      const total = results.length;
      let valid = 0;
      
      for (let i = 0; i < total; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        valid += results[i].valid ? 1 : 0;
        
        setRssTestProgress({
          current: i + 1,
          total,
          valid
        });
        
        // Ajouter le résultat progressivement
        setRssTestResults(prev => [...prev, results[i]]);
      }
      
      toast.success(`Test terminé : ${valid}/${total} flux RSS valides`);
    } catch (error) {
      console.error('Erreur lors du test des flux RSS :', error);
      toast.error('Erreur lors du test des flux RSS');
    } finally {
      setIsTestingRss(false);
    }
  };

  const testAllRssFeeds = async () => {
    try {
      setRssTestResults([]);
      setRssTestProgress({ current: 0, total: 0, valid: 0 });
      
      const response = await fetch('/api/blog/rss-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ testAll: true }),
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors du test des flux RSS');
      }
      
      const data = await response.json();
      
      // Simuler une progression pour une meilleure expérience utilisateur
      const results = data.results;
      const total = results.length;
      let valid = 0;
      
      // Afficher les premiers résultats rapidement
      const batch1 = results.slice(0, Math.min(5, total));
      for (let i = 0; i < batch1.length; i++) {
        valid += batch1[i].valid ? 1 : 0;
        
        setRssTestProgress({
          current: i + 1,
          total,
          valid
        });
        
        // Ajouter le résultat progressivement
        setRssTestResults(prev => [...prev, batch1[i]]);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Traiter les autres résultats plus rapidement
      const remaining = results.slice(batch1.length);
      for (let i = 0; i < remaining.length; i++) {
        valid += remaining[i].valid ? 1 : 0;
        
        setRssTestProgress({
          current: batch1.length + i + 1,
          total,
          valid
        });
        
        // Mettre à jour par lots pour plus d'efficacité
        if (i % 3 === 0 || i === remaining.length - 1) {
          const currentBatch = remaining.slice(0, i + 1);
          setRssTestResults([...batch1, ...currentBatch]);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      toast.success(`Test terminé : ${valid}/${total} flux RSS valides`);
    } catch (error) {
      console.error('Erreur lors du test des flux RSS :', error);
      toast.error('Erreur lors du test des flux RSS');
    } finally {
      setIsTestingRss(false);
    }
  };

  const getCategoryName = (category?: string) => {
    if (!category) return 'Défaut';
    
    const categoryMap: Record<string, string> = {
      technology: 'Technologie',
      marketing: 'Marketing Digital',
      ia: 'Intelligence Artificielle',
      developpement_web: 'Développement Web',
      mobile: 'Applications Mobiles',
      programmation: 'Programmation',
      business: 'Business',
      seo: 'SEO',
      ux_design: 'UX Design'
    };
    
    return categoryMap[category] || category;
  };

  const saveValidFeeds = async () => {
    try {
      // Récupérer uniquement les flux valides
      const validFeeds = rssTestResults.filter(r => r.valid);
      
      if (validFeeds.length === 0) {
        toast.error("Aucun flux RSS valide à sauvegarder");
        return;
      }
      
      const response = await fetch('/api/blog/rss-test/save-valid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ validFeeds }),
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde des flux RSS');
      }
      
      // Mettre à jour les paramètres locaux pour afficher les changements immédiatement
      if (localAdminSettings) {
        setLocalAdminSettings({
          ...localAdminSettings,
          // Ajouter une liste de flux RSS validés qui pourra être utilisée dans d'autres endroits de l'application
          validatedRssFeeds: validFeeds
        });
      }
      
      toast.success(`${validFeeds.length} flux RSS valides ont été sauvegardés`);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des flux RSS:', error);
      toast.error('Erreur lors de la sauvegarde des flux RSS');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#BFFF00]" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Paramètres</h1>
          <p className="text-gray-400">Gérez vos préférences et votre compte</p>
        </div>

        <Button 
          onClick={
            activeSection === "profile" ? handleSaveProfile :
            activeSection === "company" ? handleSaveCompany :
            activeSection === "ai" ? handleSaveAI :
            activeSection === "images" ? handleSaveImages :
            activeSection === "blog" ? handleSaveBlog :
            activeSection === "billing" ? undefined :
            undefined
          }
          disabled={isSaving || !["profile", "company", "ai", "images", "blog", "billing"].includes(activeSection)}
          className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Enregistrer
        </Button>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-8">
        {/* Sidebar */}
        <nav className="space-y-2">
          {settingsSections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                activeSection === id
                  ? "bg-[#BFFF00] text-black"
                  : "text-gray-400 hover:bg-gray-900"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="space-y-6">
          {activeSection === "profile" && localAdminSettings && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Profile Photo */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Photo de profil</h2>
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={localAdminSettings.avatar} />
                    <AvatarFallback>
                      {localAdminSettings.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAvatarChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button 
                      variant="outline" 
                      className="border-gray-800 bg-[#BFFF00] text-black"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Changer
                    </Button>
                  </div>
                </div>
              </div>

              {/* Personal Info */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Informations personnelles</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Nom complet</label>
                    <Input
                      value={localAdminSettings.name}
                      onChange={(e) => setLocalAdminSettings({ ...localAdminSettings, name: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Email</label>
                    <Input
                      type="email"
                      value={localAdminSettings.email}
                      onChange={(e) => setLocalAdminSettings({ ...localAdminSettings, email: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Téléphone</label>
                    <Input
                      type="tel"
                      value={localAdminSettings.phone}
                      onChange={(e) => setLocalAdminSettings({ ...localAdminSettings, phone: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Langue</label>
                    <Select 
                      value={localAdminSettings.language}
                      onValueChange={(value) => setLocalAdminSettings({ ...localAdminSettings, language: value })}
                    >
                      <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                        <SelectValue placeholder="Sélectionnez une langue" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "company" && localCompanySettings && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Company Info */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Informations de l'entreprise</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Nom de l'entreprise</label>
                    <Input
                      value={localCompanySettings.name || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, name: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Email</label>
                    <Input
                      type="email"
                      value={localCompanySettings.email || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, email: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Téléphone</label>
                    <Input
                      type="tel"
                      value={localCompanySettings.phone || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, phone: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Site web</label>
                    <Input
                      type="url"
                      value={localCompanySettings.website || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, website: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Adresse</label>
                    <Input
                      value={localCompanySettings.address || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, address: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Ville</label>
                    <Input
                      value={localCompanySettings.city || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, city: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Code postal</label>
                    <Input
                      value={localCompanySettings.postalCode || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, postalCode: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Pays</label>
                    <Input
                      value={localCompanySettings.country || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, country: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Legal Info */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Informations légales</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">SIRET</label>
                    <Input
                      value={localCompanySettings.siret || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, siret: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Numéro de TVA</label>
                    <Input
                      value={localCompanySettings.tva || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, tva: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Banking Info */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Informations bancaires</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Banque</label>
                    <Input
                      value={localCompanySettings.bank || ""}
                      onChange={(e) => setLocalCompanySettings({
                        ...localCompanySettings,
                        bank: e.target.value
                      })}
                      placeholder="Nom de la banque"
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">IBAN</label>
                    <Input
                      value={localCompanySettings.iban || ""}
                      onChange={(e) => setLocalCompanySettings({
                        ...localCompanySettings,
                        iban: e.target.value
                      })}
                      placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">BIC</label>
                    <Input
                      value={localCompanySettings.bic || ""}
                      onChange={(e) => setLocalCompanySettings({
                        ...localCompanySettings,
                        bic: e.target.value
                      })}
                      placeholder="XXXXXXFF"
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "notifications" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Notifications générales */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Notifications générales</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Notifications par email</p>
                      <p className="text-sm text-gray-400">Recevez des notifications par email</p>
                    </div>
                    <Switch
                      checked={notificationSettings.email}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ email: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Notifications push</p>
                      <p className="text-sm text-gray-400">Recevez des notifications push</p>
                    </div>
                    <Switch
                      checked={notificationSettings.push}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ push: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                </div>
              </div>

              {/* Notifications des rendez-vous */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Rendez-vous</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Nouveau rendez-vous</p>
                      <p className="text-sm text-gray-400">Recevez une notification lorsqu'un client prend rendez-vous</p>
                    </div>
                    <Switch
                      checked={notificationSettings.appointments}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ appointments: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Rappel de rendez-vous</p>
                      <p className="text-sm text-gray-400">Recevez un rappel avant chaque rendez-vous</p>
                    </div>
                    <Switch
                      checked={notificationSettings.appointmentReminders}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ appointmentReminders: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Modification de rendez-vous</p>
                      <p className="text-sm text-gray-400">Soyez notifié des modifications de rendez-vous</p>
                    </div>
                    <Switch
                      checked={notificationSettings.appointmentChanges}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ appointmentChanges: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Annulation de rendez-vous</p>
                      <p className="text-sm text-gray-400">Soyez notifié des annulations de rendez-vous</p>
                    </div>
                    <Switch
                      checked={notificationSettings.appointmentCancellations}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ appointmentCancellations: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                </div>
              </div>

              {/* Notifications des messages */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Messages</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Nouveau message</p>
                      <p className="text-sm text-gray-400">Recevez une notification pour chaque nouveau message</p>
                    </div>
                    <Switch
                      checked={notificationSettings.newMessages}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ newMessages: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Formulaire de contact</p>
                      <p className="text-sm text-gray-400">Soyez notifié des nouveaux messages du formulaire de contact</p>
                    </div>
                    <Switch
                      checked={notificationSettings.contactForm}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ contactForm: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                </div>
              </div>

              {/* Notifications système */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Système</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Mises à jour système</p>
                      <p className="text-sm text-gray-400">Recevez des notifications sur les mises à jour importantes</p>
                    </div>
                    <Switch
                      checked={notificationSettings.systemUpdates}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ systemUpdates: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Alertes de sécurité</p>
                      <p className="text-sm text-gray-400">Recevez des notifications sur les alertes de sécurité</p>
                    </div>
                    <Switch
                      checked={notificationSettings.securityAlerts}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ securityAlerts: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                </div>
              </div>

              {/* Notifications marketing */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Marketing</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Newsletters</p>
                      <p className="text-sm text-gray-400">Recevez nos newsletters et actualités</p>
                    </div>
                    <Switch
                      checked={notificationSettings.newsletters}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ newsletters: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Offres spéciales</p>
                      <p className="text-sm text-gray-400">Recevez des notifications sur les offres spéciales</p>
                    </div>
                    <Switch
                      checked={notificationSettings.specialOffers}
                      onCheckedChange={(checked) =>
                        updateNotificationSettings({ specialOffers: checked })
                      }
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "appearance" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Thème</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Mode sombre</p>
                      <p className="text-sm text-gray-400">Basculer entre le mode clair et sombre</p>
                    </div>
                    <Select value={theme} onValueChange={(value: "light" | "dark" | "system") => setTheme(value)}>
                      <SelectTrigger className="w-32 bg-gray-900 border-gray-800 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">
                          <div className="flex items-center">
                            <Sun className="h-4 w-4 mr-2" />
                            Clair
                          </div>
                        </SelectItem>
                        <SelectItem value="dark">
                          <div className="flex items-center">
                            <Moon className="h-4 w-4 mr-2" />
                            Sombre
                          </div>
                        </SelectItem>
                        <SelectItem value="system">
                          <div className="flex items-center">
                            <Globe className="h-4 w-4 mr-2" />
                            Système
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "ai" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Paramètres de génération de texte</h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Fournisseur d'IA par défaut</label>
                    <Select
                      value={localAdminSettings?.textProvider || "openai"}
                      onValueChange={(value) => setLocalAdminSettings(prev => ({
                        ...prev!,
                        textProvider: value
                      }))}
                    >
                      <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {textProviders.map(provider => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name} ({provider.cost})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Choisissez le fournisseur d'IA à utiliser par défaut pour la génération de texte.
                    </p>
                  </div>

                  {/* OpenAI settings */}
                  {(localAdminSettings?.textProvider === "openai" || !localAdminSettings?.textProvider) && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">Clé API OpenAI</label>
                        <Input
                          type="password"
                          value={localAdminSettings?.openaiApiKey || ""}
                          onChange={(e) => setLocalAdminSettings(prev => ({
                            ...prev!,
                            openaiApiKey: e.target.value
                          }))}
                          className="bg-gray-900 border-gray-800 text-white"
                          placeholder="sk-..."
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">Modèle</label>
                        <Select
                          value={localAdminSettings?.openaiModel || "GPT35"}
                          onValueChange={(value) => setLocalAdminSettings(prev => ({
                            ...prev!,
                            openaiModel: value
                          }))}
                        >
                          <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {openAIModels.map(model => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} <span className="text-xs text-gray-400">({model.cost})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Hugging Face settings */}
                  {localAdminSettings?.textProvider === "huggingface" && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">Clé API Hugging Face</label>
                        <Input
                          type="password"
                          value={localAdminSettings?.huggingFaceApiKey || ""}
                          onChange={(e) => setLocalAdminSettings(prev => ({
                            ...prev!,
                            huggingFaceApiKey: e.target.value
                          }))}
                          className="bg-gray-900 border-gray-800 text-white"
                          placeholder="Votre clé API Hugging Face"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Obtenez votre clé API sur <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-[#BFFF00] hover:underline">huggingface.co</a>
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">Modèle de texte Hugging Face</label>
                        <Select
                          value={localAdminSettings?.huggingFaceTextModel || "mistralai/Mixtral-8x7B-Instruct-v0.1"}
                          onValueChange={(value) => setLocalAdminSettings(prev => ({
                            ...prev!,
                            huggingFaceTextModel: value
                          }))}
                        >
                          <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {huggingFaceTextModels.map(model => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} {model.recommended && "(Recommandé)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                          Choisissez le modèle Hugging Face à utiliser pour la génération de texte
                        </p>
                      </div>

                      <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 mt-4">
                        <h4 className="text-sm font-medium text-[#BFFF00] mb-2">Modèles d'IA open source</h4>
                        <p className="text-xs text-gray-400 mb-3">
                          Hugging Face propose plusieurs modèles d'IA open source de haute qualité pour la génération de texte:
                        </p>
                        <ul className="space-y-2 text-xs text-gray-400">
                          {huggingFaceTextModels
                            .filter(model => model.recommended)
                            .map(model => (
                              <li key={model.id} className="flex items-start gap-2">
                                <span className="text-[#BFFF00] font-bold">•</span>
                                <div>
                                  <span className="text-white">{model.name}</span> - {model.description}
                                </div>
                              </li>
                            ))
                          }
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4">
                    <div>
                      <p className="text-white">Génération automatique des tags</p>
                      <p className="text-sm text-gray-400">Générer automatiquement les tags pour les articles</p>
                    </div>
                    <Switch
                      checked={localAdminSettings?.autoGenerateTags || false}
                      onCheckedChange={(checked) => setLocalAdminSettings(prev => ({
                        ...prev!,
                        autoGenerateTags: checked
                      }))}
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Optimisation SEO automatique</p>
                      <p className="text-sm text-gray-400">Optimiser automatiquement le SEO des articles</p>
                    </div>
                    <Switch
                      checked={localAdminSettings?.autoOptimizeSEO || false}
                      onCheckedChange={(checked) => setLocalAdminSettings(prev => ({
                        ...prev!,
                        autoOptimizeSEO: checked
                      }))}
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "images" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Génération d'Images</h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Fournisseur d'images par défaut</label>
                    <Select
                      value={localAdminSettings?.imageProvider || "picsum"}
                      onValueChange={(value) => setLocalAdminSettings(prev => ({
                        ...prev!,
                        imageProvider: value
                      }))}
                    >
                      <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageProviders.providers.map(provider => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name} {provider.cost && `(${provider.cost})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Ce fournisseur sera utilisé par défaut pour générer des images dans vos articles de blog.
                    </p>
                  </div>

                  {/* Dans la section des fournisseurs d'images, ajouter Replicate */}
                  {localAdminSettings?.imageProvider === "replicate" && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">Clé API Replicate</label>
                        <Input
                          type="password"
                          value={localAdminSettings?.replicateApiKey || ""}
                          onChange={(e) => setLocalAdminSettings(prev => ({
                            ...prev!,
                            replicateApiKey: e.target.value
                          }))}
                          className="bg-gray-900 border-gray-800 text-white"
                          placeholder="r8_..."
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Obtenez votre clé API sur <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" className="text-[#BFFF00] hover:underline">replicate.com</a>
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">Modèle Replicate</label>
                        <Select
                          value={localAdminSettings?.replicateModel || "black-forest-labs/flux-dev-lora"}
                          onValueChange={(value) => setLocalAdminSettings(prev => ({
                            ...prev!,
                            replicateModel: value
                          }))}
                        >
                          <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {replicateModels.map(model => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} <span className="text-xs text-gray-400">({model.cost})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                          Choisissez le modèle de génération d'images (les prix sont indiqués par image)
                        </p>
                      </div>

                      <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 mt-4">
                        <h4 className="text-sm font-medium text-[#BFFF00] mb-2">Modèles premium Replicate</h4>
                        <p className="text-xs text-gray-400 mb-3">
                          Replicate propose des modèles de pointe pour générer des images ultra-réalistes et artistiques:
                        </p>
                        <ul className="space-y-2 text-xs text-gray-400">
                          {replicateModels
                            .filter(model => model.recommended)
                            .slice(0, 3)
                            .map(model => (
                              <li key={model.id} className="flex items-start gap-2">
                                <span className="text-[#BFFF00] font-bold">•</span>
                                <div>
                                  <span className="text-white">{model.name}</span> - {model.description} ({model.cost})
                                </div>
                              </li>
                            ))
                          }
                        </ul>
                      </div>
                    </>
                  )}

                  <div className="space-y-6 pt-4 border-t border-gray-800">
                    <h3 className="text-md font-medium text-white mt-4">Configuration des API</h3>
                    
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Clé API Pexels</label>
                      <Input
                        type="password"
                        value={localAdminSettings?.pexelsApiKey || ""}
                        onChange={(e) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          pexelsApiKey: e.target.value
                        }))}
                        className="bg-gray-900 border-gray-800 text-white"
                        placeholder="Votre clé API Pexels"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Obtenez votre clé API gratuite sur <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="text-[#BFFF00] hover:underline">pexels.com/api</a>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Clé API Hugging Face</label>
                      <Input
                        type="password"
                        value={localAdminSettings?.huggingFaceApiKey || ""}
                        onChange={(e) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          huggingFaceApiKey: e.target.value
                        }))}
                        className="bg-gray-900 border-gray-800 text-white"
                        placeholder="Votre clé API Hugging Face"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Obtenez votre clé API sur <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-[#BFFF00] hover:underline">huggingface.co</a>
                      </p>
                    </div>

                    <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 mt-4">
                      <h4 className="text-sm font-medium text-[#BFFF00] mb-2">Génération d'images avec IA avancée</h4>
                      <p className="text-xs text-gray-400 mb-3">
                        Hugging Face propose des modèles d'IA de pointe pour générer des images ultra-réalistes et artistiques. Une fois votre clé API configurée, vous pouvez choisir parmi ces modèles:
                      </p>
                      <ul className="space-y-2 text-xs text-gray-400">
                        {huggingFaceImageModels
                          .filter(model => model.recommended)
                          .slice(0, 5)
                          .map(model => (
                            <li key={model.id} className="flex items-start gap-2">
                              <span className="text-[#BFFF00] font-bold">•</span>
                              <div>
                                <span className="text-white">{model.name.split('/').pop() || model.name}</span> - {model.description}
                              </div>
                            </li>
                          ))
                        }
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Modèle Hugging Face</label>
                      <Select
                        value={localAdminSettings?.huggingFaceModel || "stabilityai/stable-diffusion-xl-base-1.0"}
                        onValueChange={(value) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          huggingFaceModel: value
                        }))}
                      >
                        <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {huggingFaceImageModels.map(model => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name} {model.recommended && "(Recommandé)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        Choisissez le modèle d'IA avancé pour générer des images de haute qualité
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Clé API Stable Diffusion</label>
                      <Input
                        type="password"
                        value={localAdminSettings?.stableDiffusionApiKey || ""}
                        onChange={(e) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          stableDiffusionApiKey: e.target.value
                        }))}
                        className="bg-gray-900 border-gray-800 text-white"
                        placeholder="Votre clé API Stable Diffusion"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Obtenez votre clé API sur <a href="https://stablediffusionapi.com/" target="_blank" rel="noopener noreferrer" className="text-[#BFFF00] hover:underline">stablediffusionapi.com</a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Paramètres d'image avancés</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Génération d'images par défaut</p>
                      <p className="text-sm text-gray-400">Générer automatiquement des images pour les nouveaux articles</p>
                    </div>
                    <Switch
                      checked={true}
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Mode sécurisé</p>
                      <p className="text-sm text-gray-400">Filtrer le contenu inapproprié</p>
                    </div>
                    <Switch
                      checked={true}
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "blog" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                  <Newspaper className="h-5 w-5 text-[#BFFF00]" />
                  Génération automatique d'articles
                </h2>
                <div className="space-y-6">
                  <p className="text-gray-400 text-sm">
                    Configurez la génération automatique d'articles optimisés pour le référencement, basés sur les flux RSS et actualités récentes dans votre domaine.
                  </p>
                  
                  <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 mt-4">
                    <h4 className="text-sm font-medium text-[#BFFF00] mb-2">Génération d'articles basés sur les flux RSS</h4>
                    <p className="text-xs text-gray-400 mb-3">
                      Cette fonctionnalité permet de générer des articles de blog optimisés pour le SEO en utilisant exclusivement des flux RSS comme source d'actualités. Avantages:
                    </p>
                    <ul className="space-y-2 text-xs text-gray-400">
                      <li className="flex items-start gap-2">
                        <span className="text-[#BFFF00] font-bold">•</span>
                        <div>
                          <span className="text-white">Contenu toujours à jour</span> - Articles basés sur les dernières actualités du secteur
                        </div>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#BFFF00] font-bold">•</span>
                        <div>
                          <span className="text-white">Optimisation SEO automatique</span> - Mots-clés et structure adaptés au référencement
                        </div>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#BFFF00] font-bold">•</span>
                        <div>
                          <span className="text-white">Aucune dépendance à des API payantes</span> - Utilise exclusivement des flux RSS gratuits
                        </div>
                      </li>
                    </ul>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-gray-800">
                    <h3 className="text-md font-medium text-white mt-4">Configuration des sources RSS</h3>
                    
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400 flex items-center justify-between">
                        <span>Nombre de sources RSS à utiliser</span>
                        <span className="text-[#BFFF00]">{localAdminSettings?.rssSourceCount || 3}</span>
                      </label>
                      <div className="px-2">
                        <input 
                          type="range" 
                          min="1" 
                          max="8" 
                          step="1" 
                          value={localAdminSettings?.rssSourceCount || 3}
                          onChange={(e) => setLocalAdminSettings(prev => ({
                            ...prev!,
                            rssSourceCount: Number(e.target.value)
                          }))}
                          className="w-full accent-[#BFFF00] bg-gray-800"
                        />
                        <div className="flex justify-between text-xs text-gray-500 px-1 mt-1">
                          <span>Minimal</span>
                          <span>Recommandé</span>
                          <span>Extensif</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Plus vous utilisez de sources, plus votre contenu sera diversifié, mais le temps de génération sera plus long.
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Thématiques par défaut</label>
                      <Select
                        value={localAdminSettings?.defaultRssCategory || "technology"}
                        onValueChange={(value) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          defaultRssCategory: value
                        }))}
                      >
                        <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technology">Technologie</SelectItem>
                          <SelectItem value="marketing">Marketing Digital</SelectItem>
                          <SelectItem value="ia">Intelligence Artificielle</SelectItem>
                          <SelectItem value="developpement_web">Développement Web</SelectItem>
                          <SelectItem value="mobile">Applications Mobiles</SelectItem>
                          <SelectItem value="programmation">Programmation</SelectItem>
                          <SelectItem value="business">Business</SelectItem>
                          <SelectItem value="seo">SEO</SelectItem>
                          <SelectItem value="ux_design">UX Design</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        Choisissez la thématique par défaut pour la génération d'articles.
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Mode de sélection des articles</label>
                      <Select
                        value={localAdminSettings?.rssArticleSelectionMode || "recent"}
                        onValueChange={(value) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          rssArticleSelectionMode: value
                        }))}
                      >
                        <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recent">Les plus récents</SelectItem>
                          <SelectItem value="random">Aléatoire</SelectItem>
                          <SelectItem value="mixed">Mixte (récents + aléatoires)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        Détermine comment les articles sont sélectionnés à partir des flux RSS.
                      </p>
                    </div>

                    {/* Nouveau sélecteur de sources RSS */}
                    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 mt-4">
                      <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                        <Rss className="h-4 w-4 mr-2 text-[#BFFF00]" />
                        Test des flux RSS
                      </h4>

                      <div className="mb-4">
                        <p className="text-xs text-gray-400 mb-2">
                          Vérifiez l'état des flux RSS pour vous assurer qu'ils sont accessibles et fonctionnels.
                        </p>
                        
                        <div className="flex flex-wrap gap-2 mb-4">
                      <Button
                        variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsTestingRss(true);
                              testRssFeeds(localAdminSettings?.defaultRssCategory || "technology");
                            }}
                            disabled={isTestingRss}
                            className="border-gray-700 bg-gray-800 hover:bg-gray-700"
                          >
                            {isTestingRss ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-2 animate-spin text-[#BFFF00]" />
                                <span>Test en cours...</span>
                              </>
                            ) : (
                              <>
                                <Rss className="h-3 w-3 mr-2 text-[#BFFF00]" />
                                <span>Tester les flux de {getCategoryName(localAdminSettings?.defaultRssCategory || "technology")}</span>
                              </>
                            )}
                      </Button>
                      
                      <Button
                        variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsTestingRss(true);
                              testAllRssFeeds();
                            }}
                            disabled={isTestingRss}
                            className="border-gray-700 bg-gray-800 hover:bg-gray-700"
                          >
                            {isTestingRss ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-2 animate-spin text-[#BFFF00]" />
                                <span>Test en cours...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-2 text-[#BFFF00]" />
                                <span>Tester tous les flux</span>
                              </>
                            )}
                      </Button>
                    </div>
                        
                        {isTestingRss && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-gray-400">
                              <span>Progression: {rssTestProgress.current}/{rssTestProgress.total} flux testés</span>
                              <span>{rssTestProgress.valid} valides</span>
                  </div>
                            <div className="w-full bg-gray-800 rounded-full h-2.5">
                              <div 
                                className="bg-[#BFFF00] h-2.5 rounded-full transition-all duration-300" 
                                style={{ width: `${(rssTestProgress.current / Math.max(rssTestProgress.total, 1)) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                        
                        {rssTestResults.length > 0 && !isTestingRss && (
                          <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-white">Résultats du test</h5>
                              <span className="bg-gray-800 text-[#BFFF00] text-xs px-2 py-1 rounded-full">
                                {rssTestResults.filter(r => r.valid).length}/{rssTestResults.length} valides
                              </span>
                            </div>
                            
                            <div className="max-h-48 overflow-y-auto pr-1 space-y-2 bg-gray-950 rounded-md p-2">
                              {/* Regrouper les résultats par catégorie */}
                              {Object.entries(
                                rssTestResults.reduce((acc, result) => {
                                  const category = result.category || 'Autre';
                                  if (!acc[category]) acc[category] = [];
                                  acc[category].push(result);
                                  return acc;
                                }, {} as Record<string, typeof rssTestResults>)
                              ).map(([category, results]) => (
                                <div key={category} className="mb-2">
                                  <div className="text-xs font-medium text-[#BFFF00] mb-1 px-1">
                                    {getCategoryName(category)}: {results.filter(r => r.valid).length}/{results.length}
                                  </div>
                                  <div className="space-y-1.5">
                                    {results.map((result, index) => (
                                      <div 
                                        key={index}
                                        className="flex items-center justify-between text-xs p-1.5 rounded bg-gray-900"
                                      >
                                        <div className="flex items-start gap-1.5 truncate max-w-[85%]">
                                          {result.valid ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                                          ) : (
                                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                          )}
                                          <div className="truncate">
                                            <span className="truncate block">{result.name}</span>
                                            <span className="text-gray-500 truncate block">{result.url}</span>
                                          </div>
                                        </div>
                                        <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${result.valid ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}>
                                          {result.valid ? 'OK' : 'ERREUR'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            <div className="pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => saveValidFeeds()}
                                className="w-full bg-gray-900 hover:bg-[#BFFF00] hover:text-black border-gray-800 text-[#BFFF00]"
                              >
                                <Save className="h-3.5 w-3.5 mr-2" />
                                <span>Utiliser les flux valides ({rssTestResults.filter(r => r.valid).length})</span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-gray-800">
                    <h3 className="text-md font-medium text-white">Options de génération avancées</h3>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white">Génération sans source RSS</p>
                        <p className="text-sm text-gray-400">Utiliser l'IA pour générer des idées d'articles sans flux RSS</p>
                      </div>
                      <Switch
                        checked={localAdminSettings?.allowRsslessGeneration || false}
                        onCheckedChange={(checked) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          allowRsslessGeneration: checked
                        }))}
                        className="data-[state=checked]:bg-[#BFFF00]"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Génération automatique des tags</p>
                      <p className="text-sm text-gray-400">Générer automatiquement les tags pour les articles</p>
                    </div>
                    <Switch
                      checked={localAdminSettings?.autoGenerateTags || false}
                      onCheckedChange={(checked) => setLocalAdminSettings(prev => ({
                        ...prev!,
                        autoGenerateTags: checked
                      }))}
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white">Optimisation SEO automatique</p>
                      <p className="text-sm text-gray-400">Optimiser automatiquement le SEO des articles</p>
                    </div>
                    <Switch
                      checked={localAdminSettings?.autoOptimizeSEO || false}
                      onCheckedChange={(checked) => setLocalAdminSettings(prev => ({
                        ...prev!,
                        autoOptimizeSEO: checked
                      }))}
                      className="data-[state=checked]:bg-[#BFFF00]"
                    />
                  </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white">Mode haute qualité</p>
                        <p className="text-sm text-gray-400">Produire des articles plus longs et détaillés (consomme plus de tokens)</p>
                      </div>
                      <Switch
                        checked={localAdminSettings?.highQualityGeneration || false}
                        onCheckedChange={(checked) => setLocalAdminSettings(prev => ({
                          ...prev!,
                          highQualityGeneration: checked
                        }))}
                        className="data-[state=checked]:bg-[#BFFF00]"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-4 pt-4 border-t border-gray-800">
                    <p className="text-sm text-gray-400">
                      Accédez au tableau de bord du blog pour configurer et gérer vos planifications d'articles automatiques.
                    </p>
                    
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        className="border-[#BFFF00] text-black hover:bg-[#BFFF00]"
                        onClick={() => router.push("/dashboard/blog/auto-generate")}
                      >
                        <Rss className="w-4 h-4 mr-2 text-black" />
                        Génération d'articles automatique
                      </Button>
                      
                      <Button
                        variant="outline"
                        className="border-[#BFFF00] text-black hover:bg-[#BFFF00]"
                        onClick={() => router.push("/dashboard/blog")}
                      >
                        <BookOpen className="w-4 h-4 mr-2 text-black" />
                        Gérer le blog
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "billing" && localCompanySettings && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Company Info */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Informations de l'entreprise</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Nom de l'entreprise</label>
                    <Input
                      value={localCompanySettings.name || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, name: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Email</label>
                    <Input
                      type="email"
                      value={localCompanySettings.email || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, email: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Téléphone</label>
                    <Input
                      type="tel"
                      value={localCompanySettings.phone || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, phone: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Site web</label>
                    <Input
                      type="url"
                      value={localCompanySettings.website || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, website: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Adresse</label>
                    <Input
                      value={localCompanySettings.address || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, address: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Ville</label>
                    <Input
                      value={localCompanySettings.city || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, city: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Code postal</label>
                    <Input
                      value={localCompanySettings.postalCode || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, postalCode: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Pays</label>
                    <Input
                      value={localCompanySettings.country || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, country: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Legal Info */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Informations légales</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">SIRET</label>
                    <Input
                      value={localCompanySettings.siret || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, siret: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Numéro de TVA</label>
                    <Input
                      value={localCompanySettings.tva || ""}
                      onChange={(e) => setLocalCompanySettings({ ...localCompanySettings, tva: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Banking Info */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-6">Informations bancaires</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Banque</label>
                    <Input
                      value={localCompanySettings.bank || ""}
                      onChange={(e) => setLocalCompanySettings({
                        ...localCompanySettings,
                        bank: e.target.value
                      })}
                      placeholder="Nom de la banque"
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">IBAN</label>
                    <Input
                      value={localCompanySettings.iban || ""}
                      onChange={(e) => setLocalCompanySettings({
                        ...localCompanySettings,
                        iban: e.target.value
                      })}
                      placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">BIC</label>
                    <Input
                      value={localCompanySettings.bic || ""}
                      onChange={(e) => setLocalCompanySettings({
                        ...localCompanySettings,
                        bic: e.target.value
                      })}
                      placeholder="XXXXXXFF"
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
} 