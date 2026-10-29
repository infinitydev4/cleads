"use client"

import { useState, useEffect, use } from "react";
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
  Plus,
  Tag as TagIcon,
  X,
  Loader2,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ImageUpload } from "@/components/image-upload"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { Article, Category, Tag } from "@/types/blog"
import { RichTextEditor } from "@/components/rich-text-editor"
import { AIArticleGenerator } from "@/components/blog/ai-article-generator"
import { slugify } from "@/lib/utils"

export default function EditArticlePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [article, setArticle] = useState<Article | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)

  useEffect(() => {
    fetchArticle()
    fetchCategories()
    fetchTags()
  }, [])

  const fetchArticle = async () => {
    try {
      const response = await fetch(`/api/articles/${params.id}`)
      if (!response.ok) throw new Error("Article non trouvé")
      const data = await response.json()
      setArticle(data)
      setSelectedTags(data.tags.map((tag: Tag) => tag.id))
    } catch (error) {
      toast.error("Erreur lors du chargement de l'article")
      router.push("/dashboard/blog")
    } finally {
      setLoading(false)
    }
  }

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
    if (!article) return

    setSaving(true)
    try {
      const response = await fetch(`/api/articles/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...article,
          tags: selectedTags
        }),
      })

      if (!response.ok) throw new Error("Erreur lors de la mise à jour")

      toast.success("Article mis à jour avec succès")
      router.push("/dashboard/blog")
    } catch (error) {
      toast.error("Erreur lors de la mise à jour de l'article")
    } finally {
      setSaving(false)
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
      if (article) {
        setArticle({ ...article, categoryId: newCategory.id })
      }
      setNewCategoryName("")
      setIsCategoryDialogOpen(false)
      toast.success("Catégorie créée avec succès")
    } catch (error) {
      toast.error("Erreur lors de la création de la catégorie")
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <p>Chargement...</p>
      </div>
    )
  }

  if (!article) return null

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Modifier l'article</h1>
          <p className="text-gray-400">Modifiez et mettez à jour votre article</p>
        </div>

        <div className="flex items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-black">
                <Sparkles className="w-4 h-4 text-black" />
                Régénérer avec l'IA
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Régénérer l'article avec l'IA</DialogTitle>
              </DialogHeader>
              <AIArticleGenerator
                onGenerated={(generatedArticle) => {
                  if (!article) return

                  setArticle({
                    ...article,
                    title: generatedArticle.title,
                    content: generatedArticle.content,
                    excerpt: generatedArticle.excerpt,
                    metaTitle: generatedArticle.metaTitle,
                    metaDescription: generatedArticle.metaDescription,
                    slug: slugify(generatedArticle.title),
                    imageSuggestions: generatedArticle.imageSuggestions || []
                  })
                  
                  // Trouver ou créer la catégorie
                  const categoryName = generatedArticle.category
                  const existingCategory = categories.find(
                    c => c.name.toLowerCase() === categoryName.toLowerCase()
                  )
                  if (existingCategory) {
                    setArticle(prev => prev ? { ...prev, categoryId: existingCategory.id } : null)
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
                        setArticle(prev => prev ? { ...prev, categoryId: newCategory.id } : null)
                      })
                  }

                  // Gérer les tags
                  Promise.all(
                    generatedArticle.tags.map(tagName =>
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
            className="text-black hover:bg-lime-400"
          >
            <Eye className="w-4 h-4 mr-2 text-black" />
            Aperçu
          </Button>
          
          <Button 
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 lg:grid-cols-3 gap-8" noValidate>
        {/* Éditeur principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image de couverture */}
          <ImageUpload
            value={article.coverImage || null}
            onChange={(url: string) => setArticle({ ...article, coverImage: url })}
            onRemove={() => setArticle({ ...article, coverImage: null })}
          />

          {/* Titre */}
          <Input
            placeholder="Titre de l'article"
            className="text-2xl font-bold bg-transparent border-none focus-visible:ring-0 px-0"
            value={article.title}
            onChange={(e) => setArticle({ ...article, title: e.target.value })}
            required
          />

          {/* Slug */}
          <Input
            placeholder="Slug de l'article"
            className="bg-transparent border-none focus-visible:ring-0 px-0"
            value={article.slug}
            onChange={(e) => setArticle({ ...article, slug: e.target.value })}
          />

          {/* Éditeur */}
          <div onClick={(e) => e.stopPropagation()}>
            <RichTextEditor
              content={article.content || ""}
              onChange={(content) => {
                setArticle(prev => prev ? { ...prev, content } : null)
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
                    value={article.category?.id || ""}
                    onValueChange={(value) => setArticle({ ...article, categoryId: value })}
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
                <Label htmlFor="status">Statut</Label>
                <Select
                  value={article.status}
                  onValueChange={(value: "DRAFT" | "PUBLISHED") =>
                    setArticle({ ...article, status: value })
                  }
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
                <Label htmlFor="metaTitle">Meta titre</Label>
                <Input 
                  placeholder="Titre SEO..."
                  value={article.metaTitle || ""}
                  onChange={(e) => setArticle({ ...article, metaTitle: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="metaDescription">Meta description</Label>
                <Textarea 
                  placeholder="Description SEO..."
                  value={article.metaDescription || ""}
                  onChange={(e) => setArticle({ ...article, metaDescription: e.target.value })}
                  rows={3}
                  className="text-black"
                />
              </div>

              <div>
                <Label htmlFor="excerpt">Extrait</Label>
                <Textarea 
                  placeholder="Court résumé de l'article..."
                  value={article.excerpt || ""}
                  onChange={(e) => setArticle({ ...article, excerpt: e.target.value })}
                  rows={3}
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