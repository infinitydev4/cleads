"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { 
  ArrowLeft,
  Palette,
  Layout,
  Type,
  Wand2,
  Check,
  Clock,
  User,
  Tag,
  ChevronRight,
  Eye,
  X
} from "lucide-react"
import { useRouter } from "next/navigation"

const theme = {
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
}

const ThemePreview = () => {
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
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20 hover:border-[#BFFF00] transition-colors">
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
          <div key={i} className="bg-gray-900/50 backdrop-blur-sm rounded-xl overflow-hidden border border-[#BFFF00]/20 hover:border-[#BFFF00] transition-colors">
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
}

export default function NeonGridThemePage() {
  const router = useRouter()
  const [preview, setPreview] = useState(false)

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">{theme.name}</h1>
          <p className="text-gray-400">{theme.description}</p>
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
            onClick={() => window.open(`/blog?theme=${theme.id}`, '_blank')}
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
          >
            <ChevronRight className="w-4 h-4 mr-2" />
            Voir en direct
          </Button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm">
          <div className="absolute top-4 right-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPreview(false)}
              className="text-white hover:text-white hover:bg-white/10"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
          <div className="container mx-auto h-full flex items-center justify-center p-4">
            <div className="w-full max-w-5xl">
              <ThemePreview />
            </div>
          </div>
        </div>
      )}

      {/* Theme Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Preview */}
        <div className="lg:col-span-2">
          <Card className="bg-gray-950 border-gray-800 overflow-hidden">
            <ThemePreview />
          </Card>
        </div>

        {/* Info */}
        <div className="space-y-6">
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
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                  <span className="text-sm text-gray-400">{theme.colors.primary}</span>
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
                    style={{ backgroundColor: theme.colors.background }}
                  />
                  <span className="text-sm text-gray-400">{theme.colors.background}</span>
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
                    style={{ backgroundColor: theme.colors.card }}
                  />
                  <span className="text-sm text-gray-400">{theme.colors.card}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Features */}
          <Card className="bg-gray-950 border-gray-800 p-6">
            <h3 className="text-lg font-semibold mb-4">Fonctionnalités</h3>
            <div className="space-y-2">
              {theme.features.map((feature) => (
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
                onClick={() => window.open(`/blog?theme=${theme.id}`, '_blank')}
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                Voir en direct
              </Button>
              <Button 
                variant="outline"
                className="w-full"
                onClick={() => router.push("/dashboard/themes")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour aux thèmes
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
} 