import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/options"
import { prisma } from "@/lib/prisma"

// Route pour obtenir tous les thèmes
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const articleId = searchParams.get("articleId")

    // Si un articleId est fourni, retourner le thème de cet article
    if (articleId) {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return new NextResponse("Non autorisé", { status: 401 })
      }

      const article = await prisma.article.findUnique({
        where: {
          id: articleId,
          userId: session.user.id
        },
        select: {
          themeId: true
        }
      })

      return NextResponse.json(article)
    }

    // Sinon, retourner tous les thèmes
    const themes = await prisma.theme.findMany({
      orderBy: {
        createdAt: "desc"
      }
    })

    return NextResponse.json(themes)
  } catch (error) {
    console.error("[THEMES_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await req.json()
    const { name, description, type, colors, features, layout, isDefault } = body

    const theme = await prisma.theme.create({
      data: {
        name,
        description,
        type,
        colors,
        features,
        layout,
        isDefault
      }
    })

    return NextResponse.json(theme)
  } catch (error) {
    console.error("[THEME_CREATE]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await req.json()
    const { articleId, themeId, isDefault } = body
    console.log("[THEME_UPDATE] Données reçues:", body)

    if (!themeId) {
      return new NextResponse("ID de thème manquant", { status: 400 })
    }

    // Vérifier si le thème existe
    const theme = await prisma.theme.findUnique({
      where: {
        id: themeId
      }
    })

    if (!theme) {
      console.log("[THEME_UPDATE] Thème non trouvé:", themeId)
      return new NextResponse("Thème non trouvé", { status: 404 })
    }

    // Si isDefault est true, mettre à jour le thème par défaut
    if (isDefault) {
      // D'abord, retirer le statut par défaut de tous les thèmes
      await prisma.theme.updateMany({
        data: {
          isDefault: false
        }
      })

      // Ensuite, définir le nouveau thème par défaut
      const updatedTheme = await prisma.theme.update({
        where: {
          id: themeId
        },
        data: {
          isDefault: true
        }
      })

      console.log("[THEME_UPDATE] Thème par défaut mis à jour avec succès")
      return NextResponse.json(updatedTheme)
    }

    // Sinon, mettre à jour le thème d'un article spécifique
    if (!articleId) {
      return new NextResponse("ID d'article manquant", { status: 400 })
    }

    // Vérifier si l'article existe
    const article = await prisma.article.findUnique({
      where: {
        id: articleId,
        userId: session.user.id
      }
    })

    if (!article) {
      console.log("[THEME_UPDATE] Article non trouvé:", articleId)
      return new NextResponse("Article non trouvé", { status: 404 })
    }

    // Mettre à jour l'article avec le nouveau thème
    const updatedArticle = await prisma.article.update({
      where: {
        id: articleId
      },
      data: {
        themeId
      }
    })

    console.log("[THEME_UPDATE] Article mis à jour avec succès")
    return NextResponse.json(updatedArticle)
  } catch (error) {
    console.error("[THEME_UPDATE] Erreur:", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 