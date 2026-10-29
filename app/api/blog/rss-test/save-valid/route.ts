import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

// Endpoint pour sauvegarder les flux RSS valides
export async function POST(req: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer les données de la requête
    const { validFeeds } = await req.json();

    if (!validFeeds || !Array.isArray(validFeeds)) {
      return NextResponse.json(
        { error: "Format de données invalide" },
        { status: 400 }
      );
    }

    // Chercher l'utilisateur actuel
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { settings: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    // Sauvegarder les flux valides dans les paramètres utilisateur
    await prisma.settings.update({
      where: { userId: user.id },
      data: {
        validatedRssFeeds: JSON.stringify(validFeeds)
      }
    });

    return NextResponse.json({
      success: true,
      message: `${validFeeds.length} flux RSS valides ont été sauvegardés`
    });
  } catch (error) {
    console.error("Erreur lors de la sauvegarde des flux RSS:", error);
    return NextResponse.json(
      { error: "Erreur lors de la sauvegarde des flux RSS" },
      { status: 500 }
    );
  }
} 