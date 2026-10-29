import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    return NextResponse.json({
      textProvider: user.settings?.textProvider || "openai",
      openaiApiKey: user.settings?.openaiApiKey || "",
      openaiModel: user.settings?.openaiModel || "GPT35",
      huggingFaceApiKey: user.settings?.huggingFaceApiKey || "",
      huggingFaceTextModel: user.settings?.huggingFaceTextModel || "mistralai/Mixtral-8x7B-Instruct-v0.1",
      autoGenerateTags: user.settings?.autoGenerateTags || false,
      autoOptimizeSEO: user.settings?.autoOptimizeSEO || false,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des paramètres IA:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des paramètres" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      textProvider,
      openaiApiKey, 
      openaiModel, 
      huggingFaceApiKey,
      huggingFaceTextModel,
      autoGenerateTags, 
      autoOptimizeSEO 
    } = body;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    const updatedSettings = await prisma.settings.upsert({
      where: {
        userId: user.id
      },
      create: {
        userId: user.id,
        textProvider: textProvider || "openai",
        openaiApiKey: openaiApiKey,
        openaiModel: openaiModel || "GPT35",
        huggingFaceApiKey: huggingFaceApiKey,
        huggingFaceTextModel: huggingFaceTextModel,
        autoGenerateTags: autoGenerateTags || false,
        autoOptimizeSEO: autoOptimizeSEO || false,
      },
      update: {
        textProvider: textProvider || user.settings?.textProvider || "openai",
        openaiApiKey: openaiApiKey !== undefined ? openaiApiKey : user.settings?.openaiApiKey,
        openaiModel: openaiModel || user.settings?.openaiModel || "GPT35",
        huggingFaceApiKey: huggingFaceApiKey !== undefined ? huggingFaceApiKey : user.settings?.huggingFaceApiKey,
        huggingFaceTextModel: huggingFaceTextModel || user.settings?.huggingFaceTextModel,
        autoGenerateTags: autoGenerateTags !== undefined ? autoGenerateTags : user.settings?.autoGenerateTags,
        autoOptimizeSEO: autoOptimizeSEO !== undefined ? autoOptimizeSEO : user.settings?.autoOptimizeSEO,
      }
    });

    return NextResponse.json({
      textProvider: updatedSettings.textProvider,
      openaiApiKey: updatedSettings.openaiApiKey || "",
      openaiModel: updatedSettings.openaiModel,
      huggingFaceApiKey: updatedSettings.huggingFaceApiKey || "",
      huggingFaceTextModel: updatedSettings.huggingFaceTextModel,
      autoGenerateTags: updatedSettings.autoGenerateTags,
      autoOptimizeSEO: updatedSettings.autoOptimizeSEO,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des paramètres IA:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour des paramètres" },
      { status: 500 }
    );
  }
} 