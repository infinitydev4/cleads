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
      autoGenerateTags: user.settings?.autoGenerateTags || false,
      autoOptimizeSEO: user.settings?.autoOptimizeSEO || false,
      rssSourceCount: user.settings?.rssSourceCount || 3,
      rssArticleSelectionMode: user.settings?.rssArticleSelectionMode || "recent",
      defaultRssCategory: user.settings?.defaultRssCategory || "technology",
      highQualityGeneration: user.settings?.highQualityGeneration || false,
      allowRsslessGeneration: user.settings?.allowRsslessGeneration || false
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des paramètres du blog:", error);
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
      autoGenerateTags, 
      autoOptimizeSEO,
      rssSourceCount,
      rssArticleSelectionMode,
      defaultRssCategory,
      highQualityGeneration,
      allowRsslessGeneration
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
        autoGenerateTags: autoGenerateTags || false,
        autoOptimizeSEO: autoOptimizeSEO || false,
        rssSourceCount: rssSourceCount || 3,
        rssArticleSelectionMode: rssArticleSelectionMode || "recent",
        defaultRssCategory: defaultRssCategory || "technology",
        highQualityGeneration: highQualityGeneration || false,
        allowRsslessGeneration: allowRsslessGeneration || false
      },
      update: {
        autoGenerateTags: autoGenerateTags !== undefined ? autoGenerateTags : user.settings?.autoGenerateTags,
        autoOptimizeSEO: autoOptimizeSEO !== undefined ? autoOptimizeSEO : user.settings?.autoOptimizeSEO,
        rssSourceCount: rssSourceCount !== undefined ? rssSourceCount : user.settings?.rssSourceCount,
        rssArticleSelectionMode: rssArticleSelectionMode !== undefined ? rssArticleSelectionMode : user.settings?.rssArticleSelectionMode,
        defaultRssCategory: defaultRssCategory !== undefined ? defaultRssCategory : user.settings?.defaultRssCategory,
        highQualityGeneration: highQualityGeneration !== undefined ? highQualityGeneration : user.settings?.highQualityGeneration,
        allowRsslessGeneration: allowRsslessGeneration !== undefined ? allowRsslessGeneration : user.settings?.allowRsslessGeneration
      }
    });

    return NextResponse.json({
      autoGenerateTags: updatedSettings.autoGenerateTags,
      autoOptimizeSEO: updatedSettings.autoOptimizeSEO,
      rssSourceCount: updatedSettings.rssSourceCount,
      rssArticleSelectionMode: updatedSettings.rssArticleSelectionMode,
      defaultRssCategory: updatedSettings.defaultRssCategory,
      highQualityGeneration: updatedSettings.highQualityGeneration,
      allowRsslessGeneration: updatedSettings.allowRsslessGeneration
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des paramètres du blog:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour des paramètres" },
      { status: 500 }
    );
  }
} 