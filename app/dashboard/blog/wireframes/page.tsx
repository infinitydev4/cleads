"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { ArrowRight, Clock, User, Tag } from "lucide-react"
import Image from "next/image"

const mockArticle = {
  id: "1",
  title: "Comment améliorer votre stratégie de contenu en 2024",
  excerpt: "Découvrez les meilleures pratiques pour créer une stratégie de contenu efficace qui engage votre audience et génère des résultats.",
  coverImage: "/placeholder.svg",
  publishedAt: "2024-03-15",
  author: "Sophie Dupont",
  category: "Marketing",
  tags: ["Stratégie", "Contenu", "SEO"],
  readTime: "5 min",
}

export default function BlogWireframesPage() {
  const [activeStyle, setActiveStyle] = useState("style1")

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Wireframes du Blog</h1>
        <p className="text-gray-400">Explorez différents styles de mise en page pour votre blog</p>
      </div>

      <Tabs defaultValue="style1" className="space-y-8">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="style1">Style 1</TabsTrigger>
          <TabsTrigger value="style2">Style 2</TabsTrigger>
          <TabsTrigger value="style3">Style 3</TabsTrigger>
          <TabsTrigger value="style4">Style 4</TabsTrigger>
        </TabsList>

        <TabsContent value="style1" className="space-y-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="group bg-gray-950 border-gray-800 overflow-hidden hover:border-lime-500 transition-all duration-300">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={mockArticle.coverImage}
                    alt={mockArticle.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute top-4 left-4 rounded-full bg-lime-500 px-3 py-1 text-xs font-bold text-black">
                    {mockArticle.category}
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {mockArticle.publishedAt}
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {mockArticle.author}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-3 group-hover:text-lime-500 transition-colors">
                    {mockArticle.title}
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {mockArticle.excerpt}
                  </p>
                  <Button variant="ghost" className="p-0 text-lime-500 hover:text-lime-400 group-hover:translate-x-2 transition-all">
                    Lire l'article
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="style2" className="space-y-8">
          <div className="grid gap-8 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="group bg-gray-950 border-gray-800 overflow-hidden hover:border-lime-500 transition-all duration-300">
                <div className="grid md:grid-cols-2">
                  <div className="relative aspect-square overflow-hidden">
                    <Image
                      src={mockArticle.coverImage}
                      alt={mockArticle.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute top-4 left-4 rounded-full bg-lime-500 px-3 py-1 text-xs font-bold text-black">
                      {mockArticle.category}
                    </div>
                  </div>
                  <div className="p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {mockArticle.publishedAt}
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {mockArticle.author}
                        </div>
                      </div>
                      <h3 className="text-xl font-bold mb-3 group-hover:text-lime-500 transition-colors">
                        {mockArticle.title}
                      </h3>
                      <p className="text-gray-400 text-sm mb-4 line-clamp-3">
                        {mockArticle.excerpt}
                      </p>
                    </div>
                    <Button variant="ghost" className="p-0 text-lime-500 hover:text-lime-400 group-hover:translate-x-2 transition-all">
                      Lire l'article
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="style3" className="space-y-8">
          <div className="grid gap-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="group bg-gray-950 border-gray-800 overflow-hidden hover:border-lime-500 transition-all duration-300">
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="relative aspect-square overflow-hidden">
                    <Image
                      src={mockArticle.coverImage}
                      alt={mockArticle.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute top-4 left-4 rounded-full bg-lime-500 px-3 py-1 text-xs font-bold text-black">
                      {mockArticle.category}
                    </div>
                  </div>
                  <div className="md:col-span-2 p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {mockArticle.publishedAt}
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {mockArticle.author}
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold mb-3 group-hover:text-lime-500 transition-colors">
                        {mockArticle.title}
                      </h3>
                      <p className="text-gray-400 mb-4">
                        {mockArticle.excerpt}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {mockArticle.tags.map((tag) => (
                          <div key={tag} className="flex items-center gap-1 text-sm text-gray-400">
                            <Tag className="w-3 h-3" />
                            {tag}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button variant="ghost" className="p-0 text-lime-500 hover:text-lime-400 group-hover:translate-x-2 transition-all">
                      Lire l'article
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="style4" className="space-y-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="group bg-gray-950 border-gray-800 overflow-hidden hover:border-lime-500 transition-all duration-300">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10" />
                  <Image
                    src={mockArticle.coverImage}
                    alt={mockArticle.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 z-20 flex flex-col justify-end p-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-4 text-sm text-white/80">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {mockArticle.publishedAt}
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {mockArticle.author}
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-white group-hover:text-lime-500 transition-colors">
                        {mockArticle.title}
                      </h3>
                      <p className="text-white/90 text-sm line-clamp-2">
                        {mockArticle.excerpt}
                      </p>
                      <Button variant="ghost" className="p-0 text-lime-500 hover:text-lime-400 group-hover:translate-x-2 transition-all">
                        Lire l'article
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 