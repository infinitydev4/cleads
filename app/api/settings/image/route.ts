import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

// GET - Récupérer les paramètres d'image de l'utilisateur
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
      provider: user.settings?.imageProvider || "picsum",
      pexelsApiKey: user.settings?.pexelsApiKey || "",
      huggingFaceApiKey: user.settings?.huggingFaceApiKey || "",
      huggingFaceModel: user.settings?.huggingFaceModel || "",
      stableDiffusionApiKey: user.settings?.stableDiffusionApiKey || "",
      replicateApiKey: user.settings?.replicateApiKey || "",
      replicateModel: user.settings?.replicateModel || "black-forest-labs/flux-dev-lora"
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des paramètres d'image:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des paramètres" },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour les paramètres d'image de l'utilisateur
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const { provider, pexelsApiKey, huggingFaceApiKey, huggingFaceModel, stableDiffusionApiKey, replicateApiKey, replicateModel } = body;

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
        imageProvider: provider || "picsum",
        pexelsApiKey: pexelsApiKey,
        huggingFaceApiKey: huggingFaceApiKey,
        huggingFaceModel: huggingFaceModel,
        stableDiffusionApiKey: stableDiffusionApiKey,
        replicateApiKey: replicateApiKey,
        replicateModel: replicateModel
      },
      update: {
        imageProvider: provider || user.settings?.imageProvider,
        pexelsApiKey: pexelsApiKey !== undefined ? pexelsApiKey : user.settings?.pexelsApiKey,
        huggingFaceApiKey: huggingFaceApiKey !== undefined ? huggingFaceApiKey : user.settings?.huggingFaceApiKey,
        huggingFaceModel: huggingFaceModel || user.settings?.huggingFaceModel,
        stableDiffusionApiKey: stableDiffusionApiKey !== undefined ? stableDiffusionApiKey : user.settings?.stableDiffusionApiKey,
        replicateApiKey: replicateApiKey !== undefined ? replicateApiKey : user.settings?.replicateApiKey,
        replicateModel: replicateModel || user.settings?.replicateModel
      }
    });

    return NextResponse.json({
      provider: updatedSettings.imageProvider,
      pexelsApiKey: updatedSettings.pexelsApiKey || "",
      huggingFaceApiKey: updatedSettings.huggingFaceApiKey || "",
      huggingFaceModel: updatedSettings.huggingFaceModel || "",
      stableDiffusionApiKey: updatedSettings.stableDiffusionApiKey || "",
      replicateApiKey: updatedSettings.replicateApiKey || "",
      replicateModel: updatedSettings.replicateModel || "black-forest-labs/flux-dev-lora"
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des paramètres d'image:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour des paramètres" },
      { status: 500 }
    );
  }
} 