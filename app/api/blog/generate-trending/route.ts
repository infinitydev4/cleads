import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";
import { generateTrendingSEOArticle } from "@/lib/seo/generateTrendingSEOArticle";

export async function POST(request: Request) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    // Récupération des paramètres de la requête
    const body = await request.json();
    
    // Configuration pour la génération d'article
    const config = {
      userId: user.id,
      newsQuery: body.newsQuery || undefined,
      newsCategory: body.newsCategory || undefined,
      provider: body.provider || user.settings?.textProvider || "openai",
      openaiModel: body.openaiModel || user.settings?.openaiModel || "GPT35",
      huggingFaceModel: body.huggingFaceModel || user.settings?.huggingFaceTextModel,
      tone: body.tone || "professionnel",
      language: body.language || "français",
      allowRsslessGeneration: user.settings?.allowRsslessGeneration || false
    };

    console.log("Génération d'article avec config:", config);

    // Génération de l'article basé sur les tendances
    const article = await generateTrendingSEOArticle(config);

    // Retourner l'article généré
    return NextResponse.json(article);
  } catch (error: any) {
    console.error("Erreur lors de la génération d'article basé sur les tendances:", error);
    
    return NextResponse.json(
      { error: error.message || "Erreur lors de la génération de l'article" },
      { status: 500 }
    );
  }
} 