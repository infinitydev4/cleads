"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit3,
  Eye,
  Trash2,
  ArrowUpRight,
  Calendar,
  Tag,
  MessageCircle,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  FileText,
  Bookmark,
  X,
  Sparkles,
  Rss
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FilterDialog, type Filters } from "@/components/blog/filter-dialog"

interface Article {
  id: string
  title: string
  excerpt: string
  content: string
  slug: string
  coverImage: string
  category: {
    id: string
    name: string
    slug: string
  }
  publishedAt: string
  user: {
    id: string
    name: string
  }
  tags: {
    id: string
    name: string
    slug: string
  }[]
  views: number
  status: "DRAFT" | "PUBLISHED"
  createdAt: string
  updatedAt: string
}

export default function BlogDashboard() {
  const [view, setView] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({
    category: "",
    status: "",
    dateRange: {
      from: "",
      to: ""
    }
  })
  const router = useRouter()

  useEffect(() => {
    fetchArticles()
  }, [])

  const fetchArticles = async () => {
    try {
      const response = await fetch("/api/articles")
      if (!response.ok) throw new Error("Erreur lors de la récupération des articles")
      const data = await response.json()
      setArticles(data)
    } catch (error) {
      toast.error("Erreur lors du chargement des articles")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet article ?")) return

    try {
      const response = await fetch(`/api/articles/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Erreur lors de la suppression")

      toast.success("Article supprimé avec succès")
      fetchArticles()
    } catch (error) {
      toast.error("Erreur lors de la suppression de l'article")
    }
  }

  const handleFilterChange = (key: keyof Filters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const filteredArticles = articles.filter(article => {
    const matchesSearch = 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.category.name.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = !filters.category || filters.category === "all" || article.category.name === filters.category
    const matchesStatus = !filters.status || filters.status === "all" || article.status === filters.status
    const matchesDateRange = 
      (!filters.dateRange.from || new Date(article.publishedAt || "") >= new Date(filters.dateRange.from)) &&
      (!filters.dateRange.to || new Date(article.publishedAt || "") <= new Date(filters.dateRange.to))

    return matchesSearch && matchesCategory && matchesStatus && matchesDateRange
  })

  const categories = ["all", ...Array.from(new Set(articles.map(a => a.category.name)))]

  if (loading) {
    return <div className="p-6">Chargement...</div>
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-950 rounded-xl p-6 border border-gray-800 cursor-pointer hover:border-[#BFFF00] transition-colors"
          onClick={() => setFilters({
            category: "",
            status: "",
            dateRange: {
              from: "",
              to: ""
            }
          })}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400">Total articles</h3>
            <FileText className="h-5 w-5 text-[#BFFF00]" />
          </div>
          <p className="text-2xl font-bold text-white">{articles.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`bg-gray-950 rounded-xl p-6 border cursor-pointer hover:border-[#BFFF00] transition-colors ${
            filters.status === "PUBLISHED" ? "border-[#BFFF00]" : "border-gray-800"
          }`}
          onClick={() => handleFilterChange("status", filters.status === "PUBLISHED" ? "" : "PUBLISHED")}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400">Articles publiés</h3>
            <Eye className="h-5 w-5 text-[#BFFF00]" />
          </div>
          <p className="text-2xl font-bold text-white">
            {articles.filter(a => a.status === "PUBLISHED").length}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-950 rounded-xl p-6 border border-gray-800"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400">Vues totales</h3>
            <ArrowUpRight className="h-5 w-5 text-[#BFFF00]" />
          </div>
          <p className="text-2xl font-bold text-white">
            {articles.reduce((acc, article) => acc + article.views, 0)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`bg-gray-950 rounded-xl p-6 border cursor-pointer hover:border-[#BFFF00] transition-colors ${
            filters.status === "DRAFT" ? "border-[#BFFF00]" : "border-gray-800"
          }`}
          onClick={() => handleFilterChange("status", filters.status === "DRAFT" ? "" : "DRAFT")}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400">Brouillons</h3>
            <Bookmark className="h-5 w-5 text-[#BFFF00]" />
          </div>
          <p className="text-2xl font-bold text-white">
            {articles.filter(a => a.status === "DRAFT").length}
          </p>
        </motion.div>
      </div>

      {/* Header avec actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Blog</h1>
          <p className="text-gray-400">
            Gérez vos articles et votre stratégie de contenu
            {(filters.status || filters.category || filters.dateRange.from || filters.dateRange.to) && (
              <span className="ml-2 text-[#BFFF00]">
                (Filtres actifs: {filters.status === "DRAFT" ? "Brouillons" : filters.status === "PUBLISHED" ? "Publiés" : ""}
                {filters.category && filters.status ? ", " : ""}
                {filters.category && filters.category !== "all" ? `Catégorie: ${filters.category}` : ""})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-950 rounded-lg border border-gray-800 p-1">
            <Button
              variant="ghost"
              size="icon"
              className={view === "grid" ? "bg-gray-900" : ""}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={view === "list" ? "bg-gray-900" : ""}
              onClick={() => setView("list")}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
          
          <Button 
            variant="outline"
            onClick={() => router.push("/dashboard/blog/auto-generate")}
            className="border-[#BFFF00] text-black hover:bg-[#BFFF00]"
          >
            <Sparkles className="w-4 h-4 mr-2 text-black" />
            Génération auto
          </Button>

          <Button 
            onClick={() => router.push("/dashboard/blog/new")}
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvel article
          </Button>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="flex items-center gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Rechercher un article..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <FilterDialog
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={() => setFilters({
            category: "",
            status: "",
            dateRange: {
              from: "",
              to: ""
            }
          })}
        />
      </div>

      {/* Liste des articles */}
      {filteredArticles.length === 0 ? (
        <div className="bg-gray-950 rounded-xl border border-gray-800 p-8 text-center">
          <div className="flex flex-col items-center justify-center">
            <FileText className="w-12 h-12 text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Aucun article trouvé</h3>
            <p className="text-gray-400 mb-6">Aucun article ne correspond à vos critères de recherche ou filtres.</p>
            <Button 
              variant="outline" 
              onClick={() => setFilters({
                category: "",
                status: "",
                dateRange: {
                  from: "",
                  to: ""
                }
              })}
              className="border-[#BFFF00] text-black hover:bg-[#BFFF00]"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        </div>
      ) : view === "list" ? (
        <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-4 text-gray-400 font-medium">Article</th>
                <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                <th className="text-left p-4 text-gray-400 font-medium">Date</th>
                <th className="text-left p-4 text-gray-400 font-medium">Vues</th>
                <th className="text-right p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article) => (
                <tr key={article.id} className="border-b border-gray-800 hover:bg-gray-900/50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden">
                        <Image
                          src={article.coverImage || "/placeholder.svg"}
                          alt={article.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{article.title}</h4>
                        <p className="text-sm text-gray-400">{article.category.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`
                      px-2 py-1 rounded-full text-xs font-medium
                      ${article.status === "PUBLISHED" 
                        ? "bg-green-500/10 text-green-500" 
                        : "bg-yellow-500/10 text-yellow-500"}
                    `}>
                      {article.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400">
                    {article.publishedAt && new Date(article.publishedAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-gray-400">
                    {article.views.toLocaleString()}
                  </td>
                  <td className="p-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/blog/edit/${article.id}`)}>
                          <Edit3 className="w-4 h-4 mr-2" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/blog/${article.slug}`)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Aperçu
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-500"
                          onClick={() => handleDelete(article.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArticles.map((article) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-gray-950 rounded-xl overflow-hidden border border-gray-800 hover:border-[#BFFF00] transition-colors"
            >
              {/* Image de couverture */}
              <div className="relative aspect-video">
                <Image
                  src={article.coverImage || "/placeholder.svg"}
                  alt={article.title}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:text-[#BFFF00]"
                    onClick={() => router.push(`/dashboard/blog/edit/${article.id}`)}
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:text-[#BFFF00]"
                    onClick={() => router.push(`/blog/${article.slug}`)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Contenu */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`
                    px-2 py-1 rounded-full text-xs font-medium
                    ${article.status === "PUBLISHED" 
                      ? "bg-green-500/10 text-green-500" 
                      : "bg-yellow-500/10 text-yellow-500"}
                  `}>
                    {article.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {article.publishedAt && new Date(article.publishedAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-lg font-semibold mb-2 line-clamp-2 group-hover:text-[#BFFF00] transition-colors">
                  {article.title}
                </h3>

                <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                  {article.excerpt}
                </p>

                <div className="flex items-center justify-between text-sm text-gray-400">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {article.views}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/dashboard/blog/edit/${article.id}`)}>
                        <Edit3 className="w-4 h-4 mr-2" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/blog/${article.slug}`)}>
                        <Eye className="w-4 h-4 mr-2" />
                        Aperçu
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-500"
                        onClick={() => handleDelete(article.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
} 