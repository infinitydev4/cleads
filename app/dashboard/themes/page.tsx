"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Palette,
  Layout,
  Type,
  Wand2,
  Check,
  ArrowRight,
  Clock,
  User,
  Tag,
  ChevronRight,
  Eye,
  Loader2
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const ThemePreview = ({ theme }: { theme: typeof blogThemes[0] }) => {
  const { colors, layout } = theme

  const renderLayout = () => {
    switch (layout) {
      case "grid":
        return (
          <div className="relative aspect-video overflow-hidden bg-gray-950">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800/50 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-800" />
                <div className="h-4 w-24 bg-gray-800 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded bg-gray-800" />
                <div className="h-8 w-8 rounded bg-gray-800" />
              </div>
            </div>

            {/* Hero Section */}
            <div className="absolute top-12 left-0 right-0 h-32 bg-gradient-to-b from-gray-900/50 to-transparent backdrop-blur-sm">
              <div className="container mx-auto px-4 h-full flex items-center">
                <div className="space-y-2">
                  <div className="h-6 w-48 bg-gray-800 rounded" />
                  <div className="h-4 w-64 bg-gray-800 rounded" />
                </div>
              </div>
            </div>

            {/* Featured Article */}
            <div className="absolute top-44 left-4 right-4">
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                <div className="aspect-[16/9] bg-gray-800 relative">
                  <div className="absolute top-4 left-4">
                    <div className="h-6 w-20 bg-[#BFFF00] rounded-full" />
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      <div className="h-3 w-16 bg-gray-800 rounded" />
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3" />
                      <div className="h-3 w-20 bg-gray-800 rounded" />
                    </div>
                  </div>
                  <div className="h-5 w-3/4 bg-gray-800 rounded" />
                  <div className="h-4 w-full bg-gray-800 rounded" />
                  <div className="h-4 w-2/3 bg-gray-800 rounded" />
                </div>
              </div>
            </div>

            {/* Article Grid */}
            <div className="absolute top-[280px] left-4 right-4 grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[4/3] bg-gray-800 relative">
                    <div className="absolute top-2 left-2">
                      <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-800 rounded" />
                    <div className="h-3 w-full bg-gray-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case "masonry":
        return (
          <div className="relative aspect-video overflow-hidden bg-gray-950">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800/50 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-800" />
                <div className="h-4 w-24 bg-gray-800 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded bg-gray-800" />
                <div className="h-8 w-8 rounded bg-gray-800" />
              </div>
            </div>

            {/* Masonry Grid */}
            <div className="absolute top-12 left-4 right-4 grid grid-cols-3 gap-4">
              {/* Column 1 */}
              <div className="space-y-4">
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[3/4] bg-gray-800 relative">
                    <div className="absolute top-2 left-2">
                      <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-800 rounded" />
                    <div className="h-3 w-full bg-gray-800 rounded" />
                  </div>
                </div>
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[4/3] bg-gray-800 relative">
                    <div className="absolute top-2 left-2">
                      <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-800 rounded" />
                    <div className="h-3 w-full bg-gray-800 rounded" />
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-4">
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[4/3] bg-gray-800 relative">
                    <div className="absolute top-2 left-2">
                      <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-800 rounded" />
                    <div className="h-3 w-full bg-gray-800 rounded" />
                  </div>
                </div>
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[3/4] bg-gray-800 relative">
                    <div className="absolute top-2 left-2">
                      <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-800 rounded" />
                    <div className="h-3 w-full bg-gray-800 rounded" />
                  </div>
                </div>
              </div>

              {/* Column 3 */}
              <div className="space-y-4">
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[3/4] bg-gray-800 relative">
                    <div className="absolute top-2 left-2">
                      <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-800 rounded" />
                    <div className="h-3 w-full bg-gray-800 rounded" />
                  </div>
                </div>
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[4/3] bg-gray-800 relative">
                    <div className="absolute top-2 left-2">
                      <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-800 rounded" />
                    <div className="h-3 w-full bg-gray-800 rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case "split":
        return (
          <div className="relative aspect-video overflow-hidden bg-gray-950">
            {/* Sidebar */}
            <div className="absolute top-0 left-0 bottom-0 w-64 bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50">
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-800" />
                  <div className="h-4 w-24 bg-gray-800 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-8 w-full bg-gray-800 rounded" />
                  <div className="h-8 w-full bg-gray-800 rounded" />
                  <div className="h-8 w-full bg-gray-800 rounded" />
                  <div className="h-8 w-full bg-gray-800 rounded" />
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="absolute top-0 left-64 right-0 bottom-0">
              {/* Header */}
              <div className="h-12 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800/50 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-24 bg-gray-800 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded bg-gray-800" />
                  <div className="h-8 w-8 rounded bg-gray-800" />
                </div>
              </div>

              {/* Content */}
              <div className="p-4 grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                    <div className="aspect-[4/3] bg-gray-800 relative">
                      <div className="absolute top-2 left-2">
                        <div className="h-5 w-16 bg-[#BFFF00] rounded-full" />
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="h-4 w-3/4 bg-gray-800 rounded" />
                      <div className="h-3 w-full bg-gray-800 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      case "full":
        return (
          <div className="relative aspect-video overflow-hidden bg-gray-950">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800/50 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-800" />
                <div className="h-4 w-24 bg-gray-800 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded bg-gray-800" />
                <div className="h-8 w-8 rounded bg-gray-800" />
              </div>
            </div>

            {/* Full Width Articles */}
            <div className="absolute top-12 left-0 right-0 space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20">
                  <div className="aspect-[21/9] bg-gray-800 relative">
                    <div className="absolute top-4 left-4">
                      <div className="h-6 w-20 bg-[#BFFF00] rounded-full" />
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        <div className="h-3 w-16 bg-gray-800 rounded" />
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3" />
                        <div className="h-3 w-20 bg-gray-800 rounded" />
                      </div>
                    </div>
                    <div className="h-5 w-3/4 bg-gray-800 rounded" />
                    <div className="h-4 w-full bg-gray-800 rounded" />
                    <div className="h-4 w-2/3 bg-gray-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return renderLayout()
}

const blogThemes = [
  {
    id: "neon-grid",
    name: "Grille Néon",
    description: "Un design futuriste avec des cartes néon et une disposition en grille asymétrique",
    colors: {
      primary: "#BFFF00",
      background: "#0A0A0A",
      card: "#1A1A1A",
      text: "#FFFFFF",
      muted: "#888888"
    },
    features: [
      "Grille asymétrique",
      "Effets néon",
      "Cartes avec bordures lumineuses",
      "Animations fluides",
      "Design futuriste"
    ],
    layout: "grid"
  },
  {
    id: "masonry-dark",
    name: "Masonry Sombre",
    description: "Une disposition en masonry avec des cartes minimalistes et élégantes",
    colors: {
      primary: "#BFFF00",
      background: "#111111",
      card: "#1E1E1E",
      text: "#FFFFFF",
      muted: "#666666"
    },
    features: [
      "Layout Masonry",
      "Cartes minimalistes",
      "Accent jaune fluo",
      "Espacement dynamique",
      "Design épuré"
    ],
    layout: "masonry"
  },
  {
    id: "split-sidebar",
    name: "Split Sidebar",
    description: "Un design avec une sidebar fixe et des cartes modernes",
    colors: {
      primary: "#BFFF00",
      background: "#000000",
      card: "#111111",
      text: "#FFFFFF",
      muted: "#777777"
    },
    features: [
      "Sidebar fixe",
      "Cartes avec dégradés",
      "Accent jaune fluo",
      "Navigation fluide",
      "Design moderne"
    ],
    layout: "split"
  },
  {
    id: "full-width",
    name: "Full Width",
    description: "Un design en pleine largeur avec des cartes immersives",
    colors: {
      primary: "#BFFF00",
      background: "#0D0D0D",
      card: "#1A1A1A",
      text: "#FFFFFF",
      muted: "#888888"
    },
    features: [
      "Design immersif",
      "Cartes pleine largeur",
      "Accent jaune fluo",
      "Transitions fluides",
      "Layout dynamique"
    ],
    layout: "full"
  }
]

export default function ThemesPage() {
  const [activeTab, setActiveTab] = useState("blog")
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleThemeSelect = async (themeId: string) => {
    try {
      const response = await fetch('/api/themes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeId,
          isDefault: true
        }),
      })

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour du thème')
      }

      const updatedTheme = await response.json()
      setSelectedTheme(updatedTheme)
      toast.success('Thème par défaut mis à jour avec succès')
    } catch (error) {
      console.error('Erreur:', error)
      toast.error('Erreur lors de la mise à jour du thème')
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Thèmes</h1>
        <p className="text-gray-400">Personnalisez l'apparence de votre site</p>
      </div>

      <Tabs defaultValue="blog" className="space-y-8">
        <TabsList className="grid w-full grid-cols-3 lg:w-[300px]">
          <TabsTrigger value="blog">Blog</TabsTrigger>
          <TabsTrigger value="landing">Landing</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="blog" className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            {blogThemes.map((theme) => (
              <Card 
                key={theme.id}
                className={`group bg-gray-950 border-2 overflow-hidden transition-all duration-300 ${
                  selectedTheme === theme.id 
                    ? "border-lime-500" 
                    : "border-gray-800 hover:border-gray-700"
                }`}
              >
                <ThemePreview theme={theme} />

                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Palette className="w-4 h-4" />
                        Couleurs
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Layout className="w-4 h-4" />
                        Layout
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Type className="w-4 h-4" />
                        Typographie
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800"
                        onClick={() => router.push(`/dashboard/themes/${theme.id}`)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800"
                        onClick={() => window.open(`/blog?theme=${theme.id}`, '_blank')}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    {theme.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm text-gray-400">
                        <Check className="w-4 h-4 text-lime-500" />
                        {feature}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <Button
                      variant={selectedTheme === theme.id ? "default" : "outline"}
                      onClick={() => handleThemeSelect(theme.id)}
                      className="w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : selectedTheme === theme.id ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Thème sélectionné
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4 mr-2" />
                          Appliquer ce thème
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="landing" className="space-y-8">
          <div className="text-center py-12">
            <h3 className="text-xl font-bold text-white mb-2">Thèmes Landing Page</h3>
            <p className="text-gray-400">Bientôt disponible</p>
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-8">
          <div className="text-center py-12">
            <h3 className="text-xl font-bold text-white mb-2">Thèmes Dashboard</h3>
            <p className="text-gray-400">Bientôt disponible</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 