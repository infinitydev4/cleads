import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "../auth/options"
import { slugify } from "@/lib/utils"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === "ADMIN"

    const articles = await prisma.article.findMany({
      where: {
        // Si l'utilisateur n'est pas admin, ne montrer que les articles publiés
        ...(isAdmin ? {} : { status: "PUBLISHED" })
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        category: true,
        tags: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(articles)
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la récupération des articles" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { title, content, excerpt, coverImage, category, tags, metaTitle, metaDescription, status } = body

    const article = await prisma.article.create({
      data: {
        title,
        slug: slugify(title),
        content,
        excerpt,
        coverImage,
        categoryId: category,
        metaTitle,
        metaDescription,
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        userId: session.user.id,
        tags: {
          connect: tags.map((tagId: string) => ({ id: tagId }))
        }
      },
      include: {
        category: true,
        tags: true,
      }
    })

    return NextResponse.json(article)
  } catch (error) {
    console.error("Erreur lors de la création de l'article:", error)
    return NextResponse.json(
      { error: "Erreur lors de la création de l'article" },
      { status: 500 }
    )
  }
} 