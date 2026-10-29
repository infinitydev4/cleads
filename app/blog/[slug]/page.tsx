import Link from "next/link"
import Image from "next/image"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Facebook, Linkedin, Twitter } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"

async function getArticle(slug: string) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role === "ADMIN"

  const article = await prisma.article.findUnique({
    where: {
      slug,
      // Si l'utilisateur n'est pas admin, ne montrer que les articles publiés
      ...(isAdmin ? {} : { status: "PUBLISHED" })
    },
    include: {
      user: {
        select: {
          name: true,
          image: true,
        },
      },
      category: true,
      tags: true,
    },
  })

  if (!article) {
    notFound()
  }

  return article
}

export default async function BlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const article = await getArticle(params.slug)

  return (
    <div className="flex min-h-screen flex-col bg-black text-white pt-24">
      <main className="flex-1">
        <article className="container px-4 py-12">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8">
              <Link href="/blog" className="text-[#BFFF00] hover:text-[#BFFF00]/80">
                ← Retour au blog
              </Link>
            </div>

            <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
              {article.title}
            </h1>

            <div className="mb-8 flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-[#BFFF00]">
                {article.user.image && (
                  <Image
                    src={article.user.image}
                    alt={article.user.name || ""}
                    width={48}
                    height={48}
                    className="rounded-full"
                  />
                )}
                <AvatarFallback>{article.user.name?.slice(0, 2).toUpperCase() || ""}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{article.user.name}</p>
                <p className="text-sm text-gray-400">
                  {article.publishedAt && format(new Date(article.publishedAt), "d MMMM yyyy", { locale: fr })} • {article.views} vues
                </p>
              </div>
            </div>

            {article.coverImage && (
              <div className="mb-8 overflow-hidden rounded-xl">
                <Image
                  src={article.coverImage}
                  alt={article.title}
                  width={1200}
                  height={600}
                  className="w-full object-cover"
                />
              </div>
            )}

            <div className="max-w-4xl mx-auto px-4 py-8">
              <div 
                className="prose prose-invert max-w-none whitespace-pre-line [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-6 [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-4 [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:text-white [&_h3]:mb-3 [&_p]:text-base [&_p]:text-gray-300 [&_p]:mb-4 [&_ul]:text-base [&_ol]:text-base [&_li]:text-base [&_blockquote]:text-base"
                dangerouslySetInnerHTML={{ 
                  __html: article.content
                    .replace(/\n/g, '<br />')
                    .replace(/\s{2,}/g, match => '&nbsp;'.repeat(match.length))
                }} 
              />
            </div>

            {article.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full bg-gray-800 px-3 py-1 text-sm text-gray-300"
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-8 border-t border-gray-800 pt-8">
              <h3 className="mb-4 text-xl font-bold">Partager cet article</h3>
              <div className="flex space-x-4">
                <Button variant="outline" size="icon" className="rounded-full">
                  <Facebook className="h-5 w-5" />
                  <span className="sr-only">Partager sur Facebook</span>
                </Button>
                <Button variant="outline" size="icon" className="rounded-full">
                  <Twitter className="h-5 w-5" />
                  <span className="sr-only">Partager sur Twitter</span>
                </Button>
                <Button variant="outline" size="icon" className="rounded-full">
                  <Linkedin className="h-5 w-5" />
                  <span className="sr-only">Partager sur LinkedIn</span>
                </Button>
              </div>
            </div>

            <div className="mt-12 rounded-xl border border-[#BFFF00] bg-gray-950 p-8">
              <h3 className="mb-4 text-2xl font-bold">Vous souhaitez améliorer vos conversions ?</h3>
              <p className="mb-6 text-gray-300">
                Nos experts peuvent vous aider à créer des landing pages qui convertissent. Réservez un
                appel gratuit pour discuter de votre projet.
              </p>
              <Button className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90">Réserver un appel</Button>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
} 