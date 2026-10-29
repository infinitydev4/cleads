import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";
import { getOpenAIClient, generateBlogContent } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    // Authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération de l'utilisateur et ses paramètres
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: {
          select: {
            openaiApiKey: true,
            openaiModel: true,
            textProvider: true,
            huggingFaceApiKey: true,
            huggingFaceTextModel: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    // Vérification des clés API selon le fournisseur sélectionné
    const textProvider = user.settings?.textProvider || "openai";
    
    if (textProvider === "openai" && !user.settings?.openaiApiKey) {
      return NextResponse.json(
        { error: "Clé API OpenAI non configurée dans les paramètres" },
        { status: 400 }
      );
    }
    
    if (textProvider === "huggingface" && !user.settings?.huggingFaceApiKey) {
      return NextResponse.json(
        { error: "Clé API Hugging Face non configurée dans les paramètres" },
        { status: 400 }
      );
    }

    // Récupération et validation du corps de la requête
    const body = await request.json();
    const { topic, keywords, tone, language } = body;

    console.log("Requête reçue:", { topic, keywords, tone, language });

    if (!topic || !keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { error: "Le sujet et les mots-clés sont requis" },
        { status: 400 }
      );
    }

    try {
      console.log("Début de la génération de contenu...");
      console.log("Fournisseur de texte sélectionné:", textProvider);
      
      // Création du client OpenAI ou préparation pour Hugging Face
      const openai = textProvider === "openai" && user.settings?.openaiApiKey 
                   ? getOpenAIClient(user.settings.openaiApiKey) 
                   : null;
      
      // Génération du contenu avec le provider sélectionné
      const content = await generateBlogContent(
        openai, 
        user.settings?.openaiModel || "GPT35", 
        {
          topic: topic.trim(),
          keywords: keywords.filter(k => typeof k === 'string' && k.trim().length > 0),
          tone: typeof tone === 'string' ? tone.trim() : 'professionnel',
          language: typeof language === 'string' ? language.trim() : 'français',
          provider: textProvider,
          huggingFaceApiKey: textProvider === "huggingface" && user.settings?.huggingFaceApiKey 
                           ? user.settings.huggingFaceApiKey 
                           : undefined,
          huggingFaceModel: textProvider === "huggingface" && user.settings?.huggingFaceTextModel 
                          ? user.settings.huggingFaceTextModel 
                          : undefined
        }
      );
      
      console.log("Contenu généré avec succès:", { 
        title: content.title, 
        contentLength: content.content?.length || 0
      });
      
      return NextResponse.json(content);
    } catch (error: any) {
      console.error("Erreur lors de la génération de l'article:", error);
      return NextResponse.json(
        { error: error.message || "Erreur lors de la génération de l'article" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Erreur de traitement:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors du traitement de la requête" },
      { status: 500 }
    );
  }
} 