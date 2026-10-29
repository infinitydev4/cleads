import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let title = "";
  
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
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    if (!user.settings?.openaiApiKey) {
      return NextResponse.json(
        { error: "Clé API OpenAI non configurée dans les paramètres" },
        { status: 400 }
      );
    }

    // Récupération et validation du corps de la requête
    const body = await request.json();
    title = body.title || "";

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: "Le titre est requis" },
        { status: 400 }
      );
    }
    
    // Échapper les caractères spéciaux dans le titre
    const escapedTitle = title.replace(/[\\"\n\r\t\b\f]/g, " ");
    
    console.log("Génération d'un prompt optimisé pour le titre:", escapedTitle);
    
    // Utilisation de fetch directement comme dans openai.ts au lieu du SDK
    const apiKey = user.settings.openaiApiKey;
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Crée un prompt pour générer une image qui illustre cet article: "${escapedTitle}". 
                     Inclus des détails visuels. Termine par "8k, photorealistic". Sois bref.`
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Erreur API OpenAI: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const prompt = data.choices?.[0]?.message?.content?.trim();
    
    console.log("Prompt optimisé généré:", prompt);
    
    return NextResponse.json({ prompt });
  } catch (error: any) {
    console.error("Erreur de génération de prompt:", error);
    
    // Toujours fournir un prompt de secours, quelle que soit l'erreur
    const safeTitle = title.replace(/[\\"\n\r\t\b\f]/g, " ");
    const fallbackPrompt = `Professional photo related to ${safeTitle || "article topic"}, 8k resolution, high quality`;
    
    console.log("Utilisation du prompt de secours:", fallbackPrompt);
    
    return NextResponse.json({ 
      prompt: fallbackPrompt,
      note: "Prompt généré automatiquement (fallback)" 
    });
  }
} 