"use client"

import { useState, useEffect } from "react"
import { 
  Save,
  Image as ImageIcon,
  Link2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Eye,
  Upload,
  X,
  Plus,
  Tag,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { slugify } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ImageUpload } from "@/components/image-upload"
import { RichTextEditor } from "@/components/rich-text-editor"
import { AIArticleGenerator } from "@/components/blog/ai-article-generator"

interface Category {
  id: string
  name: string
  slug: string
}

interface Tag {
  id: string
  name: string
  slug: string
}

export default function NewArticle() {
  const router = useRouter()
  const [preview, setPreview] = useState(false)
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    excerpt: "",
    category: "",
    metaTitle: "",
    metaDescription: "",
    status: "DRAFT",
    slug: "",
    imageSuggestions: [] as string[]
  })

  useEffect(() => {
    fetchCategories()
    fetchTags()
  }, [])

  useEffect(() => {
    if (formData.title) {
      setFormData(prev => ({
        ...prev,
        slug: slugify(formData.title)
      }))
    }
  }, [formData.title])

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories")
      if (!response.ok) throw new Error("Erreur lors de la récupération des catégories")
      const data = await response.json()
      setCategories(data)
    } catch (error) {
      toast.error("Erreur lors du chargement des catégories")
    }
  }

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/tags")
      if (!response.ok) throw new Error("Erreur lors de la récupération des tags")
      const data = await response.json()
      setTags(data)
    } catch (error) {
      toast.error("Erreur lors du chargement des tags")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          coverImage,
          tags: selectedTags,
          slug: formData.slug || slugify(formData.title),
        }),
      })

      if (!response.ok) throw new Error("Erreur lors de la création de l'article")

      const article = await response.json()
      toast.success("Article créé avec succès")
      router.push("/dashboard/blog")
    } catch (error) {
      toast.error("Erreur lors de la création de l'article")
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", "article")

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) throw new Error("Erreur lors de l'upload")

      const data = await response.json()
      setCoverImage(data.url)
      toast.success("Image uploadée avec succès")
    } catch (error) {
      toast.error("Erreur lors de l'upload de l'image")
    } finally {
      setUploading(false)
    }
  }

  const handleAddTag = async () => {
    if (!newTag.trim()) return

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newTag.trim() }),
      })

      if (!response.ok) throw new Error("Erreur lors de la création du tag")

      const tag = await response.json()
      setTags(prev => [...prev, tag])
      setSelectedTags(prev => [...prev, tag.id])
      setNewTag("")
      toast.success("Tag ajouté avec succès")
    } catch (error) {
      toast.error("Erreur lors de l'ajout du tag")
    }
  }

  const handleRemoveTag = (tagId: string) => {
    setSelectedTags(prev => prev.filter(id => id !== tagId))
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      })

      if (!response.ok) throw new Error("Erreur lors de la création de la catégorie")

      const newCategory = await response.json()
      setCategories(prev => [...prev, newCategory])
      setFormData(prev => ({ ...prev, category: newCategory.id }))
      setNewCategoryName("")
      setIsCategoryDialogOpen(false)
      toast.success("Catégorie créée avec succès")
    } catch (error) {
      toast.error("Erreur lors de la création de la catégorie")
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Nouvel article</h1>
          <p className="text-gray-400">Créez et publiez un nouvel article</p>
        </div>

        <div className="flex items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-black">
                <Sparkles className="w-4 h-4 text-black" />
                Générer avec l'IA
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Générer un article avec l'IA</DialogTitle>
              </DialogHeader>
              <AIArticleGenerator
                onGenerated={(article) => {
                  console.log("Article généré reçu:", { 
                    title: article.title,
                    contentLength: article.content?.length || 0,
                    content: article.content?.substring(0, 100) + "..." 
                  });

                  setFormData({
                    ...formData,
                    title: article.title || "",
                    content: article.content || "",
                    excerpt: article.excerpt || "",
                    metaTitle: article.metaTitle || "",
                    metaDescription: article.metaDescription || "",
                    slug: slugify(article.title || ""),
                    imageSuggestions: article.imageSuggestions || []
                  });
                  
                  // Trouver ou créer la catégorie
                  const categoryName = article.category
                  const existingCategory = categories.find(
                    c => c.name.toLowerCase() === categoryName.toLowerCase()
                  )
                  if (existingCategory) {
                    setFormData(prev => ({ ...prev, category: existingCategory.id }))
                  } else {
                    // Créer la nouvelle catégorie
                    fetch("/api/categories", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: categoryName }),
                    })
                      .then(res => res.json())
                      .then(newCategory => {
                        setCategories(prev => [...prev, newCategory])
                        setFormData(prev => ({ ...prev, category: newCategory.id }))
                      })
                  }

                  // Gérer les tags
                  Promise.all(
                    article.tags.map(tagName =>
                      fetch("/api/tags", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: tagName }),
                      }).then(res => res.json())
                    )
                  ).then(newTags => {
                    const newTagIds = newTags.map(tag => tag.id)
                    setTags(prev => [...prev, ...newTags])
                    setSelectedTags(prev => [...prev, ...newTagIds])
                  })
                }}
              />
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            onClick={() => setPreview(!preview)}
            className="text-black"
          >
            <Eye className="w-4 h-4 mr-2 text-black" />
            Aperçu
          </Button>
          
          <Button 
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Publication..." : "Publier"}
          </Button>
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 lg:grid-cols-3 gap-8" noValidate>
        {/* Éditeur principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image de couverture */}
          <ImageUpload
            value={coverImage}
            onChange={(url) => setCoverImage(url)}
            onRemove={() => setCoverImage(null)}
            imageSuggestions={formData.imageSuggestions || []}
          />

          {/* Titre */}
          <Input
            placeholder="Titre de l'article"
            className="text-2xl font-bold bg-transparent border-none focus-visible:ring-0 px-0"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />

          {/* Slug */}
          <Input
            placeholder="Slug de l'article"
            className="bg-transparent border-none focus-visible:ring-0 px-0"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
          />

          {/* Éditeur */}
          <div onClick={(e) => e.stopPropagation()}>
            <RichTextEditor
              content={formData.content}
              onChange={(content) => {
                setFormData(prev => ({ ...prev, content }))
              }}
              placeholder="Commencez à écrire votre article..."
            />
          </div>
        </div>

        {/* Panneau latéral */}
        <div className="space-y-6">
          <div className="bg-gray-950 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-4">Paramètres de publication</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="category">Catégorie</Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="icon">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Nouvelle catégorie</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="newCategory">Nom de la catégorie</Label>
                          <Input
                            id="newCategory"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Entrez le nom de la catégorie"
                          />
                        </div>
                        <Button 
                          onClick={handleCreateCategory}
                          disabled={!newCategoryName.trim()}
                          className="w-full"
                        >
                          Créer la catégorie
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">Tags</label>
                <div className="flex gap-2 mb-2">
                  <Input 
                    placeholder="Ajouter un tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  />
                  <Button 
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleAddTag}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tagId) => {
                    const tag = tags.find(t => t.id === tagId)
                    if (!tag) return null
                    return (
                      <Badge 
                        key={tag.id}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {tag.name}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 hover:bg-transparent"
                          onClick={() => handleRemoveTag(tag.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </Badge>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">Status</label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="PUBLISHED">Publié</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="bg-gray-950 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-4">SEO</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Meta titre</label>
                <Input 
                  placeholder="Titre SEO..."
                  value={formData.metaTitle}
                  onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">Meta description</label>
                <Textarea 
                  placeholder="Description SEO..."
                  value={formData.metaDescription}
                  onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                  className="text-black"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">Extrait</label>
                <Textarea 
                  placeholder="Court résumé de l'article..."
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  className="text-black"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
} 