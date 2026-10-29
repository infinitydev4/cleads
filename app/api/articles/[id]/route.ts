import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "../../auth/options"

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const article = await prisma.article.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      include: {
        category: true,
        tags: true,
        user: {
          select: {
            name: true
          }
        }
      }
    })

    if (!article) {
      return new NextResponse("Article non trouvé", { status: 404 })
    }

    return NextResponse.json(article)
  } catch (error) {
    console.error("[ARTICLE_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { title, content, excerpt, coverImage, categoryId, tags, metaTitle, metaDescription, status } = body

    const article = await prisma.article.update({
      where: {
        id: params.id,
      },
      data: {
        title,
        content,
        excerpt,
        coverImage,
        categoryId,
        metaTitle,
        metaDescription,
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        tags: {
          set: [], // Désassocier tous les tags existants
          connect: tags.map((tagId: string) => ({ id: tagId })) // Connecter les nouveaux tags
        }
      },
      include: {
        category: true,
        tags: true,
      }
    })

    return NextResponse.json(article)
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'article:", error)
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'article" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    await prisma.article.delete({
      where: {
        id: params.id,
      },
    })

    return NextResponse.json({ message: "Article supprimé avec succès" })
  } catch (error) {
    console.error("Erreur lors de la suppression de l'article:", error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression de l'article" },
      { status: 500 }
    )
  }
} 