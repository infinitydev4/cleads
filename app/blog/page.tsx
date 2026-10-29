"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { 
  Clock,
  User,
  Tag,
  ChevronRight,
  ArrowLeft,
  Menu,
  Search,
  Filter,
  X
} from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { toast } from "sonner"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import Link from "next/link"

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
  isDefault?: boolean
}

interface Article {
  id: string
  title: string
  excerpt: string
  content: string
  slug: string
  coverImage: string
  category: {
    name: string
  }
  publishedAt: string
  user: {
    name: string
  }
  tags: {
    name: string
  }[]
  views: number
}

function BlogContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null)
  const [loading, setLoading] = useState(true)
  const [articles, setArticles] = useState<Article[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Récupérer les articles
        const articlesResponse = await fetch("/api/articles")
        if (!articlesResponse.ok) throw new Error("Erreur lors de la récupération des articles")
        const articlesData = await articlesResponse.json()
        setArticles(articlesData)

        // Récupérer les thèmes
        const themesResponse = await fetch("/api/themes")
        if (!themesResponse.ok) throw new Error("Erreur lors de la récupération des thèmes")
        const themesData = await themesResponse.json()
        
        // Récupérer le thème depuis l'URL ou utiliser le thème par défaut
        const themeId = searchParams.get("theme")
        const theme = themeId 
          ? themesData.find((t: Theme) => t.id === themeId)
          : themesData.find((t: Theme) => t.isDefault) || themesData[0]
        
        setSelectedTheme(theme)
      } catch (error) {
        console.error("Erreur lors de la récupération des données:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [searchParams])

  const filteredArticles = articles.filter(article => {
    const matchesSearch = 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.category.name.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === "all" || article.category.name === selectedCategory

    return matchesSearch && matchesCategory
  })

  const categories = ["all", ...Array.from(new Set(articles.map(a => a.category.name)))]

  const renderLayout = () => {
    switch (selectedTheme?.layout) {
      case "grid":
  return (
          <div className="pt-[72px] md:pt-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredArticles.map((article) => (
                <Link href={`/blog/${article.slug}`} key={article.id}>
                  <Card 
                    className="bg-gray-900/50 backdrop-blur-sm overflow-hidden border border-[#BFFF00]/20 hover:border-[#BFFF00] transition-colors"
                  >
                    <div className="relative aspect-[16/9]">
                      <Image
                        src={article.coverImage || "/placeholder.svg"}
                        alt={article.title}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute top-4 left-4">
                        <div className="px-3 py-1 bg-[#BFFF00] text-black rounded-full text-sm font-medium">
                          {article.category.name}
                        </div>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {Math.ceil(article.content.split(' ').length / 200)} min
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3" />
                          {article.user.name}
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-white">{article.title}</h3>
                      <p className="text-gray-400">{article.excerpt}</p>
                      <div className="flex flex-wrap gap-2">
                        {article.tags.map((tag) => (
                          <span 
                            key={tag.name}
                            className="px-2 py-1 bg-gray-800 text-gray-400 rounded-full text-xs"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )

      case "masonry":
        return (
          <div className="pt-[72px] md:pt-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.map((article) => (
                <Link href={`/blog/${article.slug}`} key={article.id}>
                  <Card 
                    className="bg-gray-900/50 backdrop-blur-sm overflow-hidden border border-[#BFFF00]/20 hover:border-[#BFFF00] transition-colors"
                  >
                    <div className="relative aspect-[4/3]">
                      <Image
                        src={article.coverImage || "/placeholder.svg"}
                        alt={article.title}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute top-4 left-4">
                        <div className="px-3 py-1 bg-[#BFFF00] text-black rounded-full text-sm font-medium">
                          {article.category.name}
                        </div>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {Math.ceil(article.content.split(' ').length / 200)} min
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3" />
                          {article.user.name}
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-white">{article.title}</h3>
                      <p className="text-gray-400">{article.excerpt}</p>
                      <div className="flex flex-wrap gap-2">
                        {article.tags.map((tag) => (
                          <span 
                            key={tag.name}
                            className="px-2 py-1 bg-gray-800 text-gray-400 rounded-full text-xs"
                          >
                            {tag.name}
                          </span>
                        ))}
                </div>
              </div>
                </Card>
                </Link>
              ))}
            </div>
          </div>
        )

      case "split":
        return (
          <div className="flex min-h-screen pt-[72px] md:pt-20">
            {/* Sidebar Desktop */}
            <div className="hidden lg:block w-64 bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50 p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Catégories</h3>
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedCategory === category
                            ? "bg-[#BFFF00] text-black"
                            : "text-gray-400 hover:bg-gray-800"
                        }`}
                      >
                        {category === "all" ? "Toutes les catégories" : category}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Rechercher</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Rechercher..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#BFFF00]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Tags populaires</h3>
                  <div className="flex flex-wrap gap-2">
                    {["Design", "UI/UX", "Marketing", "Performance", "SEO"].map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-800 text-gray-400 rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredArticles.map((article) => (
                  <Link href={`/blog/${article.slug}`} key={article.id}>
                    <Card 
                      className="bg-gray-900/50 backdrop-blur-sm overflow-hidden border border-[#BFFF00]/20 hover:border-[#BFFF00] transition-colors"
                    >
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={article.coverImage || "/placeholder.svg"}
                          alt={article.title}
                          fill
                          className="object-cover"
                        />
                        <div className="absolute top-4 left-4">
                          <div className="px-3 py-1 bg-[#BFFF00] text-black rounded-full text-sm font-medium">
                            {article.category.name}
                          </div>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            {Math.ceil(article.content.split(' ').length / 200)} min
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3" />
                            {article.user.name}
                          </div>
                        </div>
                        <h3 className="text-lg font-semibold text-white">{article.title}</h3>
                        <p className="text-gray-400">{article.excerpt}</p>
                        <div className="flex flex-wrap gap-2">
                          {article.tags.map((tag) => (
                            <span 
                              key={tag.name}
                              className="px-2 py-1 bg-gray-800 text-gray-400 rounded-full text-xs"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>

            {/* Mobile Drawer */}
            <Drawer>
              <DrawerTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  className="fixed bottom-28 right-4 z-50 rounded-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90 lg:hidden"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Menu</DrawerTitle>
                </DrawerHeader>
                <div className="p-4 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Catégories</h3>
                    <div className="space-y-2">
                      {categories.map((category) => (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            selectedCategory === category
                              ? "bg-[#BFFF00] text-black"
                              : "text-gray-400 hover:bg-gray-800"
                          }`}
                        >
                          {category === "all" ? "Toutes les catégories" : category}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Rechercher</h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Rechercher..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#BFFF00]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Tags populaires</h3>
                    <div className="flex flex-wrap gap-2">
                      {["Design", "UI/UX", "Marketing", "Performance", "SEO"].map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-gray-800 text-gray-400 rounded-full text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        )

      case "full":
        return (
          <div className="pt-[72px] md:pt-20">
            <div className="space-y-8">
              {filteredArticles.map((article) => (
                <Link href={`/blog/${article.slug}`} key={article.id}>
                  <Card 
                    className="bg-gray-900/50 backdrop-blur-sm overflow-hidden border border-[#BFFF00]/20 hover:border-[#BFFF00] transition-colors"
                  >
                    <div className="relative aspect-[21/9]">
                      <Image
                        src={article.coverImage || "/placeholder.svg"}
                        alt={article.title}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute top-4 left-4">
                        <div className="px-3 py-1 bg-[#BFFF00] text-black rounded-full text-sm font-medium">
                          {article.category.name}
                        </div>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {Math.ceil(article.content.split(' ').length / 200)} min
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3" />
                          {article.user.name}
                        </div>
                      </div>
                      <h3 className="text-2xl font-semibold text-white">{article.title}</h3>
                      <p className="text-gray-400 text-lg">{article.excerpt}</p>
                      <div className="flex flex-wrap gap-2">
                        {article.tags.map((tag) => (
                          <span 
                            key={tag.name}
                            className="px-2 py-1 bg-gray-800 text-gray-400 rounded-full text-xs"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white">Chargement...</div>
      </div>
    )
  }

  if (!selectedTheme) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white">Aucun thème sélectionné</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: selectedTheme.colors.background }}>
      {renderLayout()}
    </div>
  )
}

export default function BlogPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <BlogContent />
    </Suspense>
  )
}

